import { Injectable } from '@nestjs/common';
import { EmergencyType, Role, Severity, TypeDispatch } from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { RoutingService, type RouteEstimate } from '../../../shared/routing/routing.service';
import type { Coordinates } from '../../../shared/utils/geo';
import type { AlertSummary } from '../views/alert-views';
import { AlertsService } from './alerts.service';
import { JourneyService } from './journey.service';

/** One open emergency in the order to go to it, and why it sits where it does. */
export interface RankedAlert {
  alert: AlertSummary;
  /** Short sentences, most important first: "Nobody has taken this on yet." */
  reasons: string[];
  /**
   * The one reason a list row cannot show by itself: how far, or how much sooner this
   * person would be there. The row already shows the state, the severity and the type.
   * Null when there is nothing more to say.
   */
  why: string | null;
  /** From where this person is to the alert, when that is known. */
  travelSeconds: number | null;
  byRoad: boolean;
}

export interface RankedAlerts {
  alerts: RankedAlert[];
  /** Where times were measured from: this phone now, the person's station, or nowhere. */
  measuredFrom: 'here' | 'station' | null;
}

const SEVERITY_ORDER: Record<Severity, number> = {
  [Severity.CRITICAL]: 0,
  [Severity.ELEVATED]: 1,
  [Severity.STANDARD]: 2,
};

const SEVERITY_WORD: Partial<Record<Severity, string>> = {
  [Severity.CRITICAL]: 'Critical.',
  [Severity.ELEVATED]: 'High.',
};

const TYPE_WORD: Record<EmergencyType, string> = {
  [EmergencyType.FALL]: 'a fall',
  [EmergencyType.BREATHING]: 'chest pain or breathing',
  [EmergencyType.UNWELL]: 'feeling unwell',
  [EmergencyType.FIRE]: 'fire',
  [EmergencyType.UNSAFE]: 'not safe',
};

/** Being sooner by less than this is not worth saying, nor worth reordering for. */
const MEANINGFUL_SECONDS = 120;

/** "about 6 minutes", "about 1 hour 10 minutes". */
function minutes(seconds: number): string {
  const total = Math.max(1, Math.round(seconds / 60));
  if (total < 60) return `about ${total} ${total === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const h = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return rest === 0 ? `about ${h}` : `about ${h} ${rest} ${rest === 1 ? 'minute' : 'minutes'}`;
}

/**
 * Who to go to first, for somebody with several open emergencies.
 *
 * First what nobody has taken on, then the person's own, then those somebody else is
 * handling. Within each: how severe, then whether what was reported is urgent (a fire,
 * chest pain or breathing, not being safe), then time. For one nobody has taken on,
 * the nearer the sooner; for one somebody else is on the way to, where this person
 * would get there first by the most. Every alert says why it sits where it does.
 *
 * Times are measured from where this phone is, when the person chose to send it, or
 * else from their station. The position is used for this one answer and never kept.
 */
@Injectable()
export class AlertRankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
    private readonly journeys: JourneyService,
    private readonly routing: RoutingService,
  ) {}

  async rank(userId: string, role: Role, here?: Coordinates): Promise<RankedAlerts> {
    const open = await this.alerts.findForUser(userId, role, { onlyOpen: true, limit: 50 });
    if (open.length === 0) return { alerts: [], measuredFrom: null };

    const [origin, urgentTypes, events] = await Promise.all([
      this.originFor(userId, here),
      this.urgentTypes(),
      this.prisma.emergencyEvent.findMany({
        where: { id: { in: open.map((alert) => alert.eventId) } },
      }),
    ]);

    // How soon whoever is already going will get there, where they share it.
    const byId = new Map(events.map((event) => [event.id, event]));
    const theirs = await Promise.all(
      open.map(async (alert) => {
        const event = byId.get(alert.eventId);
        if (!event || !alert.acknowledgedBy || alert.acknowledgedBy.id === userId) return null;
        const { all } = await this.journeys.current(event, false);
        return all[0]?.etaSeconds ?? null;
      }),
    );

    // From here to every alert that has a place, in one request.
    const placed = open
      .map((alert, index) => ({ alert, index }))
      .filter(({ alert }) => alert.latitude !== null && alert.longitude !== null);
    const times: Array<RouteEstimate | null> = open.map(() => null);
    if (origin) {
      const measured = await this.routing.travelTimesFrom(
        origin.at,
        placed.map(({ alert }) => ({
          latitude: alert.latitude as number,
          longitude: alert.longitude as number,
        })),
      );
      placed.forEach(({ index }, at) => (times[index] = measured[at]));
    }

    const ranked = open.map((alert, index) => {
      const travel = times[index];
      const otherEta = theirs[index];
      const group = !alert.acknowledgedBy ? 0 : alert.acknowledgedBy.id === userId ? 1 : 2;
      const urgency = alert.reportedType ? (urgentTypes.has(alert.reportedType) ? 0 : 1) : 2;
      // Lower is sooner: the travel time for one nobody has, minus the time saved
      // against whoever is going for one somebody has.
      const saved = travel && otherEta !== null ? otherEta - travel.durationSeconds : null;
      const timeKey =
        group === 0
          ? (travel?.durationSeconds ?? Number.MAX_SAFE_INTEGER)
          : group === 2 && saved !== null && saved >= MEANINGFUL_SECONDS
            ? -saved
            : Number.MAX_SAFE_INTEGER;

      return {
        sort: [
          group,
          SEVERITY_ORDER[alert.severity],
          urgency,
          timeKey,
          Date.parse(alert.triggeredAt),
        ],
        result: {
          alert,
          ...this.explain(alert, userId, travel, otherEta, urgentTypes),
          travelSeconds: travel?.durationSeconds ?? null,
          byRoad: travel?.source === 'osrm',
        } satisfies RankedAlert,
      };
    });

    ranked.sort((a, b) => {
      for (let at = 0; at < a.sort.length; at += 1) {
        if (a.sort[at] !== b.sort[at]) return a.sort[at] - b.sort[at];
      }
      return 0;
    });

    return { alerts: ranked.map((entry) => entry.result), measuredFrom: origin?.from ?? null };
  }

  /** The reasons, and the one a list row cannot show by itself. */
  private explain(
    alert: AlertSummary,
    userId: string,
    travel: RouteEstimate | null,
    otherEta: number | null,
    urgentTypes: Set<EmergencyType>,
  ): { reasons: string[]; why: string | null } {
    const reasons = this.reasons(alert, userId, travel, otherEta, urgentTypes);
    const last = reasons[reasons.length - 1];
    const timed = last?.includes(' from you') || last?.startsWith('You could be there');
    return { reasons, why: timed ? last : null };
  }

  /** "Nobody has taken this on yet. Critical. Fire reported. About 6 minutes from you by road." */
  private reasons(
    alert: AlertSummary,
    userId: string,
    travel: RouteEstimate | null,
    otherEta: number | null,
    urgentTypes: Set<EmergencyType>,
  ): string[] {
    const reasons: string[] = [];
    const owner = alert.acknowledgedBy;
    if (!owner) reasons.push('Nobody has taken this on yet.');
    else if (owner.id === userId) reasons.push("You're on your way.");
    else reasons.push(`${owner.name.split(/\s+/)[0]} is on the way.`);

    const severity = SEVERITY_WORD[alert.severity];
    if (severity) reasons.push(severity);

    if (alert.reportedType) {
      const what = TYPE_WORD[alert.reportedType];
      reasons.push(
        urgentTypes.has(alert.reportedType)
          ? `${what[0].toUpperCase()}${what.slice(1)} reported.`
          : `Reported: ${what}.`,
      );
    }

    if (travel && owner?.id !== userId) {
      const how = travel.source === 'osrm' ? ' by road' : '';
      const sooner = otherEta !== null ? otherEta - travel.durationSeconds : null;
      if (owner && sooner !== null && sooner >= MEANINGFUL_SECONDS) {
        reasons.push(
          `You could be there ${minutes(sooner)} sooner than ${owner.name.split(/\s+/)[0]}.`,
        );
      } else if (!owner) {
        const away = minutes(travel.durationSeconds);
        reasons.push(`${away[0].toUpperCase()}${away.slice(1)} from you${how}.`);
      }
    }
    return reasons;
  }

  /** This phone, when it said where it is; else the person's station; else nowhere. */
  private async originFor(
    userId: string,
    here?: Coordinates,
  ): Promise<{ at: Coordinates; from: 'here' | 'station' } | null> {
    if (here) return { at: here, from: 'here' };
    const person = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stationLatitude: true, stationLongitude: true },
    });
    if (person?.stationLatitude == null || person.stationLongitude == null) return null;
    return {
      at: { latitude: Number(person.stationLatitude), longitude: Number(person.stationLongitude) },
      from: 'station',
    };
  }

  /** The types a service is asked for at once: the ones where minutes matter most. */
  private async urgentTypes(): Promise<Set<EmergencyType>> {
    const rules = await this.prisma.emergencyTypeRule.findMany({
      where: { dispatch: TypeDispatch.IMMEDIATE },
      select: { type: true },
    });
    return new Set(rules.map((rule) => rule.type));
  }
}
