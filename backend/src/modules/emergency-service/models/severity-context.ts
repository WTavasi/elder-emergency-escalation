import type { Prisma, User } from '@prisma/client';
import { OPEN_STATES } from '../../../shared/utils/event-lifecycle';
import type { Coordinates } from '../../../shared/utils/geo';
import type { SeverityAssessment, SeverityContext } from './severity.types';

/** The parts of an elder's account the severity policy reads. */
export type ElderSeverityFacts = Pick<
  User,
  'careLevel' | 'homeLatitude' | 'homeLongitude' | 'timezone'
>;

/**
 * Everything the policy needs, built the same way wherever an emergency is scored: when
 * it is raised, when its cancel window closes, and when it is reopened.
 */
export function severityContextFor(
  elder: ElderSeverityFacts,
  alertLocation: Coordinates,
  at: Date,
  recentEventCount: number,
  cancelWindowElapsed: boolean,
): SeverityContext {
  return {
    careLevel: elder.careLevel,
    alertLocation,
    homeLocation:
      elder.homeLatitude !== null && elder.homeLongitude !== null
        ? { latitude: Number(elder.homeLatitude), longitude: Number(elder.homeLongitude) }
        : null,
    timezone: elder.timezone,
    at,
    recentEventCount,
    cancelWindowElapsed,
  };
}

/**
 * The elder's other emergencies that count as recent activity: raised inside the
 * window, or still open. `excludeEventId` keeps an emergency from counting as its own
 * history when it is scored a second time.
 */
export function recentEventsWhere(
  elderId: string,
  at: Date,
  hours: number,
  excludeEventId?: string,
): Prisma.EmergencyEventWhereInput {
  const since = new Date(at.getTime() - hours * 60 * 60 * 1000);
  return {
    elderlyId: elderId,
    ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
    OR: [{ triggeredAt: { gte: since } }, { state: { in: OPEN_STATES } }],
  };
}

/** How an assessment is written to the audit trail. */
export function severityAuditDetail(assessment: SeverityAssessment): Record<string, unknown> {
  return {
    score: assessment.score,
    band: assessment.band,
    factors: assessment.factors.map((factor) => ({
      key: factor.key,
      weight: factor.weight,
      value: factor.value,
      contribution: factor.contribution,
      detail: factor.detail,
    })),
  };
}
