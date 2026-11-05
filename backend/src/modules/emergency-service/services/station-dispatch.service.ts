import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditAction,
  NotificationChannel,
  NotificationStatus,
  Prisma,
  ResponderService,
  Role,
  type EmergencyEvent,
} from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { RedisService } from '../../../shared/redis/redis.service';
import { RoutingService } from '../../../shared/routing/routing.service';
import { OPEN_STATES } from '../../../shared/utils/event-lifecycle';
import { isWithinMetres, type Coordinates } from '../../../shared/utils/geo';
import { NotificationsService } from '../../notification-service/services/notifications.service';
import {
  REALTIME_PUBLISHER,
  type RealtimePublisher,
} from '../../realtime-service/services/realtime.publisher';
import { stationKey } from './escalation.keys';

/**
 * Who to ask, in order, when an emergency needs a service: the service itself, then a
 * responder who takes any call. With no type, a general responder first, then an
 * ambulance, because most emergencies for an older person at home are medical. Anybody
 * else covering the place comes after these, because the wrong service beats nobody.
 */
export const SERVICE_PREFERENCE: Record<ResponderService, ResponderService[]> = {
  [ResponderService.AMBULANCE]: [ResponderService.AMBULANCE, ResponderService.GENERAL],
  [ResponderService.FIRE]: [ResponderService.FIRE, ResponderService.GENERAL],
  [ResponderService.POLICE]: [ResponderService.POLICE, ResponderService.GENERAL],
  [ResponderService.GENERAL]: [ResponderService.GENERAL, ResponderService.AMBULANCE],
};

/** Why a station was asked: the nearest, or the next after the one before said no or was silent. */
export type StationReason = 'nearest' | 'declined' | 'no-answer';

/** One station that covers the alert, with its time there by road. */
export interface RankedStation {
  id: string;
  name: string;
  service: ResponderService;
  /** Where it is based, as its address reads. Null for a unit made before stations. */
  station: string | null;
  etaSeconds: number;
  byRoad: boolean;
}

/** One station asked about an emergency, as the care circle sees it. */
export interface StationOnAlert {
  name: string;
  service: ResponderService;
  station: string | null;
  askedAt: string;
  /** The station's own distance by road: where the unit is based, not where it is now. */
  etaSeconds: number | null;
  byRoad: boolean;
  reason: StationReason;
  /** Asked and still able to answer; said it cannot; or the one coming. */
  status: 'asked' | 'declined' | 'coming';
}

/** How long a station has to answer before the next nearest is asked too. */
const DEFAULT_WAIT_SECONDS = 180;

/**
 * Responder units as stations, asked one at a time, nearest by road first.
 *
 * A dispatcher does not send every police station in the city to one call: they send
 * the nearest, and the next if it cannot go. So when an emergency needs a service, the
 * stations covering the place are ranked, by service and then by road time from where
 * each is based, and only the first is asked. A station that says it cannot come is
 * passed over at once; one that has not answered in STATION_WAIT_SECONDS is passed over
 * too, and stays able to answer. Anybody already asked is never asked again.
 */
@Injectable()
export class StationDispatchService {
  private readonly logger = new Logger(StationDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly routing: RoutingService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
  ) {}

  /** Seconds a station has to answer. */
  get waitSeconds(): number {
    return Number(this.config.get<number>('STATION_WAIT_SECONDS', DEFAULT_WAIT_SECONDS));
  }

  /**
   * Every unit covering the alert, in the order they would be asked: the service the
   * emergency needs, then the ones that take any call, then anybody else, each group by
   * road time from its station.
   */
  async ranked(event: EmergencyEvent, service: ResponderService): Promise<RankedStation[]> {
    return this.rankedAt(
      { latitude: Number(event.alertLatitude), longitude: Number(event.alertLongitude) },
      service,
    );
  }

  /**
   * The nearest station of each service covering a place, by road: the responder who
   * takes any call (asked by default), then an ambulance, the police and the fire
   * service. A service nobody covers there is left out.
   */
  async nearestEach(place: Coordinates): Promise<RankedStation[]> {
    const all = await this.rankedAt(place, ResponderService.GENERAL);
    const order = [
      ResponderService.GENERAL,
      ResponderService.AMBULANCE,
      ResponderService.POLICE,
      ResponderService.FIRE,
    ];
    return order.flatMap((service) => {
      const nearest = all
        .filter((station) => station.service === service)
        .sort((a, b) => a.etaSeconds - b.etaSeconds)[0];
      return nearest ? [nearest] : [];
    });
  }

  private async rankedAt(alert: Coordinates, service: ResponderService): Promise<RankedStation[]> {
    const units = await this.prisma.user.findMany({
      where: {
        role: Role.EMERGENCY_RESPONDER,
        deactivatedAt: null,
        coverageLatitude: { not: null },
        coverageLongitude: { not: null },
        coverageRadiusKm: { not: null },
      },
      select: {
        id: true,
        name: true,
        responderService: true,
        coverageLatitude: true,
        coverageLongitude: true,
        coverageRadiusKm: true,
        stationLabel: true,
        stationLatitude: true,
        stationLongitude: true,
      },
    });

    const covering = units.filter((unit) =>
      isWithinMetres(
        { latitude: Number(unit.coverageLatitude), longitude: Number(unit.coverageLongitude) },
        alert,
        Number(unit.coverageRadiusKm) * 1000,
      ),
    );
    if (covering.length === 0) return [];

    // From the station where there is one; the middle of the area for an older unit.
    const origins: Coordinates[] = covering.map((unit) =>
      unit.stationLatitude !== null && unit.stationLongitude !== null
        ? { latitude: Number(unit.stationLatitude), longitude: Number(unit.stationLongitude) }
        : { latitude: Number(unit.coverageLatitude), longitude: Number(unit.coverageLongitude) },
    );
    const times = await this.routing.travelTimes(origins, alert);

    const order = SERVICE_PREFERENCE[service];
    const group = (unit: ResponderService): number => {
      const at = order.indexOf(unit);
      return at === -1 ? order.length : at;
    };

    return covering
      .map((unit, index) => ({
        id: unit.id,
        name: unit.name,
        service: unit.responderService ?? ResponderService.GENERAL,
        station: unit.stationLabel,
        etaSeconds: times[index].durationSeconds,
        byRoad: times[index].source === 'osrm',
      }))
      .sort((a, b) => group(a.service) - group(b.service) || a.etaSeconds - b.etaSeconds);
  }

  /**
   * The first station not yet asked about this emergency, and whether any station
   * covers the place at all, so "everybody has been asked" and "nobody covers it" can
   * be told apart.
   */
  async pick(
    event: EmergencyEvent,
    service: ResponderService,
  ): Promise<{ next: RankedStation | null; covered: boolean }> {
    const [ranked, asked] = await Promise.all([
      this.ranked(event, service),
      this.prisma.notification.findMany({
        where: { eventId: event.id },
        select: { recipientId: true },
        distinct: ['recipientId'],
      }),
    ]);
    const already = new Set(asked.map((row) => row.recipientId));
    return {
      next: ranked.find((station) => !already.has(station.id)) ?? null,
      covered: ranked.length > 0,
    };
  }

  /**
   * Asks the next station now, by push and text, and starts its wait. Used after a
   * decline and after a wait runs out; the first station of an emergency is asked by
   * the dispatch that reached the responder step, which then calls [recordAsked].
   * Returns the station asked, or null when there is nobody left to ask.
   */
  async askNext(
    event: EmergencyEvent,
    service: ResponderService,
    tier: number,
    reason: StationReason,
  ): Promise<RankedStation | null> {
    const { next } = await this.pick(event, service);
    if (!next) {
      await this.stop(event.id);
      this.logger.warn(`Event ${event.id}: no station left to ask`);
      return null;
    }

    const now = new Date();
    const channels = [NotificationChannel.PUSH, NotificationChannel.SMS];
    const rows = await this.prisma.$transaction(async (tx) => {
      const created = await Promise.all(
        channels.map((channel) =>
          tx.notification.create({
            data: {
              eventId: event.id,
              recipientId: next.id,
              channel,
              status: NotificationStatus.QUEUED,
              tier,
              createdAt: now,
            },
            select: { id: true },
          }),
        ),
      );
      await this.record(tx, event, next, reason, now);
      return created;
    });

    await this.notifications.enqueue(rows.map((row) => row.id));
    await this.arm(event.id);
    const latest = await this.prisma.emergencyEvent.findUniqueOrThrow({ where: { id: event.id } });
    this.realtime.emergencyUpdated(latest);
    this.logger.log(`Event ${event.id}: asked ${next.name} (${reason})`);
    return next;
  }

  /**
   * Records a station asked by a dispatch that wrote its notification rows itself, and
   * starts its wait.
   */
  async recordAsked(
    event: EmergencyEvent,
    station: RankedStation,
    reason: StationReason,
  ): Promise<void> {
    await this.prisma.$transaction((tx) => this.record(tx, event, station, reason, new Date()));
    await this.arm(event.id);
  }

  /** The services already asked about this emergency, by the stations asked. */
  async servicesAsked(eventId: string): Promise<Set<ResponderService>> {
    const entries = await this.prisma.auditLog.findMany({
      where: { eventId, action: AuditAction.STATION_ASKED },
      select: { detail: true },
    });
    return new Set(
      entries
        .map((entry) => (entry.detail as { service?: ResponderService } | null)?.service)
        .filter((service): service is ResponderService => service !== undefined),
    );
  }

  /** Nobody is waiting on a station any more: somebody took it on, or it is over. */
  async stop(eventId: string): Promise<void> {
    await this.redis.client.del(stationKey(eventId));
    await this.prisma.emergencyEvent.updateMany({
      where: { id: eventId, stationDeadlineAt: { not: null } },
      data: { stationDeadlineAt: null },
    });
  }

  /**
   * Waits that were running when the API stopped: overdue ones fire now, the rest are
   * armed again for the time they have left.
   */
  async recover(
    fire: (eventId: string) => Promise<void>,
  ): Promise<{ fired: number; rearmed: number }> {
    const waiting = await this.prisma.emergencyEvent.findMany({
      where: { stationDeadlineAt: { not: null }, state: { in: OPEN_STATES } },
      select: { id: true, stationDeadlineAt: true },
    });
    let fired = 0;
    let rearmed = 0;
    for (const event of waiting) {
      const left = Math.ceil(((event.stationDeadlineAt?.getTime() ?? 0) - Date.now()) / 1000);
      try {
        if (left <= 0) {
          await fire(event.id);
          fired += 1;
        } else {
          await this.redis.client.set(stationKey(event.id), '1', 'EX', left);
          rearmed += 1;
        }
      } catch (error) {
        this.logger.error(
          `Station recovery failed for event ${event.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
    return { fired, rearmed };
  }

  /** The stations asked about one emergency, first asked first, for the care circle. */
  async onAlert(event: EmergencyEvent): Promise<StationOnAlert[]> {
    const [entries, declined] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { eventId: event.id, action: AuditAction.STATION_ASKED },
        orderBy: { occurredAt: 'asc' },
        select: { detail: true, occurredAt: true },
      }),
      this.prisma.notification.findMany({
        where: { eventId: event.id, declinedAt: { not: null } },
        select: { recipientId: true },
        distinct: ['recipientId'],
      }),
    ]);
    const said = new Set(declined.map((row) => row.recipientId));

    return entries.flatMap((entry) => {
      const detail = (entry.detail ?? {}) as Partial<{
        responderId: string;
        name: string;
        service: ResponderService;
        station: string | null;
        seconds: number;
        byRoad: boolean;
        reason: StationReason;
      }>;
      if (!detail.responderId || !detail.name) return [];
      return [
        {
          name: detail.name,
          service: detail.service ?? ResponderService.GENERAL,
          station: detail.station ?? null,
          askedAt: entry.occurredAt.toISOString(),
          etaSeconds: typeof detail.seconds === 'number' ? detail.seconds : null,
          byRoad: detail.byRoad === true,
          reason: detail.reason ?? 'nearest',
          status:
            event.acknowledgedBy === detail.responderId
              ? 'coming'
              : said.has(detail.responderId)
                ? 'declined'
                : 'asked',
        },
      ];
    });
  }

  private record(
    tx: Prisma.TransactionClient,
    event: EmergencyEvent,
    station: RankedStation,
    reason: StationReason,
    now: Date,
  ) {
    const deadline = new Date(now.getTime() + this.waitSeconds * 1000);
    return Promise.all([
      tx.emergencyEvent.update({
        where: { id: event.id },
        data: { stationDeadlineAt: deadline },
      }),
      tx.auditLog.create({
        data: {
          eventId: event.id,
          actorId: null,
          action: AuditAction.STATION_ASKED,
          detail: {
            responderId: station.id,
            name: station.name,
            service: station.service,
            station: station.station,
            seconds: station.etaSeconds,
            byRoad: station.byRoad,
            reason,
          } as unknown as Prisma.InputJsonValue,
          occurredAt: now,
        },
      }),
    ]);
  }

  private async arm(eventId: string): Promise<void> {
    await this.redis.client.set(stationKey(eventId), '1', 'EX', Math.max(1, this.waitSeconds));
  }
}
