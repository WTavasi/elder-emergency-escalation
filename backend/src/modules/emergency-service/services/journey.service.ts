import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, EventState, Prisma, type EmergencyEvent } from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { RedisService } from '../../../shared/redis/redis.service';
import { RoutingService, type RouteEstimate } from '../../../shared/routing/routing.service';
import { OPEN_STATES, transitionEvent } from '../../../shared/utils/event-lifecycle';
import { distanceInMetres, type Coordinates } from '../../../shared/utils/geo';
import { VolunteerCallsService } from '../../community-service/services/volunteer-calls.service';
import {
  REALTIME_PUBLISHER,
  type RealtimePublisher,
} from '../../realtime-service/services/realtime.publisher';

/**
 * Who is on their way: the person who took the emergency on, or the community volunteer
 * who said they would go. Both can share; nobody else is on their way to share.
 */
export type Traveller = 'owner' | 'volunteer';

/** Someone on their way, as a screen shows it. */
export interface JourneyView {
  userId: string;
  traveller: Traveller;
  etaSeconds: number;
  distanceMetres: number;
  /** "osrm" when a router worked out the route, "estimate" for the straight-line guess. */
  source: RouteEstimate['source'];
  /** When the phone last reported. A screen says "updated 20 s ago" from this. */
  updatedAt: string;
  /** Where they are. Null for the elder, whose screen shows the time and not a map. */
  latitude: number | null;
  longitude: number | null;
  /**
   * The road from where they were last routed to the elder, as [latitude, longitude]
   * points, for the map. Null for the elder, and when the time is a straight-line guess.
   */
  path: Array<[number, number]> | null;
}

/** What the phone on the way is told after each report. */
export interface PositionResult {
  /** True once they have arrived, by this report or an earlier one. The phone stops sharing. */
  arrived: boolean;
  journey: JourneyView | null;
}

/** Everybody on their way to one emergency, as one viewer may see them. */
export interface Journeys {
  /** The person who took it on, kept on its own for screens that show only them. */
  owner: JourneyView | null;
  /** Everybody sharing, soonest first. */
  all: JourneyView[];
}

export type ArrivalMethod = 'manual' | 'geofence';

/** The stored form, with what it needs to decide when to ask the router again. */
interface StoredJourney extends RouteEstimate {
  latitude: number;
  longitude: number;
  updatedAt: string;
  routedAt: string;
  /** The straight line at the last routing, to scale the route between routings. */
  straightMetres: number;
}

/** One key per person on their way, so two people's positions never overwrite each other. */
export const journeyKey = (eventId: string, userId: string): string =>
  `journey:${eventId}:${userId}`;

/**
 * A position older than this is not somebody on their way any more: their phone lost
 * signal, or they stopped sharing. The key expires and the screens stop showing it.
 */
export const JOURNEY_TTL_SECONDS = 180;

/** Ask the router at most this often per person; scale the last route in between. */
const ROUTE_EVERY_MS = 30_000;

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

/**
 * Somebody on their way to the elder, and their arrival.
 *
 * Positions are opt-in, shared only by somebody on their way (the person who took the
 * emergency on, or the volunteer going), only while it is open and they have not
 * arrived, and only with the elder's care circle. They are kept in Redis for three
 * minutes and never written to the database: what is kept is the time they arrived,
 * which is the number the evaluation needs, not the route they took to get there.
 */
@Injectable()
export class JourneyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly routing: RoutingService,
    private readonly config: ConfigService,
    private readonly volunteers: VolunteerCallsService,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
  ) {}

  /** One position from the phone of somebody on their way. */
  async report(
    eventId: string,
    userId: string,
    position: Coordinates & { accuracyMetres?: number },
  ): Promise<PositionResult> {
    const event = await this.requireEvent(eventId);
    const traveller = JourneyService.travellerOf(event, userId);
    if (!traveller) {
      throw new ForbiddenException('Only somebody on their way shares where they are');
    }
    // Already there. Said plainly rather than refused, so a report that crossed the
    // arrival in flight stops the phone sharing instead of showing an error.
    if (JourneyService.hasArrived(event, traveller)) return { arrived: true, journey: null };
    if (!OPEN_STATES.includes(event.state)) {
      throw new ConflictException('This emergency is already closed');
    }

    const preferences = await this.prisma.userPreference.findUnique({ where: { userId } });
    if (!preferences?.shareWayThere) {
      throw new ForbiddenException('Turn on "Share live location" to share where you are');
    }

    const here = { latitude: round6(position.latitude), longitude: round6(position.longitude) };
    const destination = {
      latitude: Number(event.alertLatitude),
      longitude: Number(event.alertLongitude),
    };
    const straightMetres = distanceInMetres(here, destination);
    const radius = this.config.get<number>('ARRIVAL_RADIUS_METRES', 100);

    // A fix looser than the radius cannot say they are inside it.
    const precise = position.accuracyMetres === undefined || position.accuracyMetres <= radius;
    if (precise && straightMetres <= radius) {
      if (traveller === 'owner') {
        await this.arrive(eventId, userId, 'geofence');
      } else {
        await this.volunteers.arrived(eventId, userId, 'geofence');
        await this.redis.client.del(journeyKey(eventId, userId));
      }
      return { arrived: true, journey: null };
    }

    const now = new Date();
    const previous = await this.stored(eventId, userId);
    const route = await this.routeFrom(previous, here, destination, straightMetres, now);

    const journey: StoredJourney = {
      ...route.estimate,
      latitude: here.latitude,
      longitude: here.longitude,
      updatedAt: now.toISOString(),
      routedAt: route.routedAt,
      straightMetres: route.straightMetres,
    };
    await this.redis.client.set(
      journeyKey(eventId, userId),
      JSON.stringify(journey),
      'EX',
      JOURNEY_TTL_SECONDS,
    );

    // The care circle re-reads; the message itself carries no position.
    this.realtime.emergencyUpdated(event);
    return { arrived: false, journey: JourneyService.view(journey, userId, traveller, true) };
  }

  /**
   * The person who took the emergency on is with the elder. By "I'm here", or by their
   * shared position coming within the arrival radius. Saying it twice is not an error.
   */
  async arrive(eventId: string, userId: string, method: ArrivalMethod): Promise<EmergencyEvent> {
    const event = await this.requireEvent(eventId);
    if (event.acknowledgedBy !== userId) {
      throw new ForbiddenException('Only the person who took this on can say they have arrived');
    }
    if (event.arrivedAt) return event;
    if (!OPEN_STATES.includes(event.state)) {
      throw new ConflictException('This emergency is already closed');
    }

    const now = new Date();
    const arrived = await this.prisma.$transaction(async (tx) => {
      // Still theirs and not yet arrived, checked again in the write itself, so an
      // arrival racing a resolve or a second arrival cannot both land.
      const updated = await transitionEvent(
        tx,
        event,
        EventState.ON_SCENE,
        { arrivedAt: now },
        { acknowledgedBy: userId, arrivedAt: null },
      );

      await tx.auditLog.create({
        data: {
          eventId,
          actorId: userId,
          action: AuditAction.ARRIVED,
          previousState: event.state,
          newState: EventState.ON_SCENE,
          detail: {
            method,
            secondsFromTrigger: Math.round((now.getTime() - event.triggeredAt.getTime()) / 1000),
            secondsFromAcknowledgement: event.acknowledgedAt
              ? Math.round((now.getTime() - event.acknowledgedAt.getTime()) / 1000)
              : null,
          } as unknown as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });

      return updated;
    });

    // Nobody needs the way there once they are here.
    await this.redis.client.del(journeyKey(eventId, userId));
    this.realtime.emergencyUpdated(arrived);
    return arrived;
  }

  /**
   * Everybody on their way now, as [viewerIsElder] may see them. A stored position counts
   * only while its person is still on their way: the volunteer who withdrew, or the owner
   * who arrived, drops off at once rather than after three minutes.
   */
  async current(event: EmergencyEvent, viewerIsElder: boolean): Promise<Journeys> {
    if (!OPEN_STATES.includes(event.state)) return { owner: null, all: [] };

    const travelling: Array<[string, Traveller]> = [];
    if (event.acknowledgedBy && !event.arrivedAt) {
      travelling.push([event.acknowledgedBy, 'owner']);
    }
    if (
      event.volunteerId &&
      !event.volunteerArrivedAt &&
      event.volunteerId !== event.acknowledgedBy
    ) {
      travelling.push([event.volunteerId, 'volunteer']);
    }

    const views = await Promise.all(
      travelling.map(async ([userId, traveller]) => {
        const stored = await this.stored(event.id, userId);
        return stored ? JourneyService.view(stored, userId, traveller, !viewerIsElder) : null;
      }),
    );
    const all = views
      .filter((view): view is JourneyView => view !== null)
      .sort((a, b) => a.etaSeconds - b.etaSeconds);
    return { owner: all.find((view) => view.traveller === 'owner') ?? null, all };
  }

  private async stored(eventId: string, userId: string): Promise<StoredJourney | null> {
    const raw = await this.redis.client.get(journeyKey(eventId, userId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredJourney;
    } catch {
      return null;
    }
  }

  /**
   * The router at most every 30 seconds per person. In between, the last route is
   * scaled by how much of the straight line is left, which follows a car closely enough
   * for "about 9 minutes" and keeps every responder well inside a public router's limit.
   * The drawn road stays the last routed one until the next routing.
   */
  private async routeFrom(
    previous: StoredJourney | null,
    here: Coordinates,
    destination: Coordinates,
    straightMetres: number,
    now: Date,
  ): Promise<{ estimate: RouteEstimate; routedAt: string; straightMetres: number }> {
    const fresh =
      previous !== null && now.getTime() - Date.parse(previous.routedAt) < ROUTE_EVERY_MS;

    if (fresh && previous.straightMetres > 0) {
      const share = straightMetres / previous.straightMetres;
      return {
        estimate: {
          durationSeconds: Math.max(0, Math.round(previous.durationSeconds * share)),
          distanceMetres: Math.max(0, Math.round(previous.distanceMetres * share)),
          source: previous.source,
          ...(previous.path ? { path: previous.path } : {}),
        },
        routedAt: previous.routedAt,
        straightMetres: previous.straightMetres,
      };
    }

    return {
      estimate: await this.routing.route(here, destination, { path: true }),
      routedAt: now.toISOString(),
      straightMetres,
    };
  }

  private async requireEvent(eventId: string): Promise<EmergencyEvent> {
    const event = await this.prisma.emergencyEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Emergency not found');
    return event;
  }

  /** The owner first: somebody who took it on and also volunteered is its owner. */
  private static travellerOf(event: EmergencyEvent, userId: string): Traveller | null {
    if (event.acknowledgedBy === userId) return 'owner';
    if (event.volunteerId === userId) return 'volunteer';
    return null;
  }

  private static hasArrived(event: EmergencyEvent, traveller: Traveller): boolean {
    return traveller === 'owner' ? event.arrivedAt !== null : event.volunteerArrivedAt !== null;
  }

  private static view(
    journey: StoredJourney,
    userId: string,
    traveller: Traveller,
    withPosition: boolean,
  ): JourneyView {
    return {
      userId,
      traveller,
      etaSeconds: journey.durationSeconds,
      distanceMetres: journey.distanceMetres,
      source: journey.source,
      updatedAt: journey.updatedAt,
      latitude: withPosition ? journey.latitude : null,
      longitude: withPosition ? journey.longitude : null,
      path: withPosition && journey.path ? journey.path : null,
    };
  }
}
