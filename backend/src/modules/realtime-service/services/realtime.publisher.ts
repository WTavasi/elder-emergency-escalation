import type { EmergencyEvent } from '@prisma/client';

/**
 * What a live emergency looks like to a connected screen.
 *
 * A summary rather than the database row: the audit trail and the severity breakdown
 * are fetched over HTTP when someone opens an event. A socket message should be small
 * enough to be cheap to send to every responder screen on every change.
 */
/**
 * What a live update says: which emergency changed, and how. Never where it is or who
 * the elder is beyond an id. A screen that needs more reloads the emergency over HTTP,
 * where consent and visibility rules apply; the socket carries changes, not records,
 * so a withdrawn consent has nothing here to leak.
 */
export interface EmergencySnapshot {
  eventId: string;
  elderlyId: string;
  state: string;
  severity: string;
  /** PANIC for a press of the button, MISSED_CHECK_IN for a daily check-in nobody answered. */
  trigger: string;
  currentTier: number;
  acknowledgedBy: string | null;
  triggeredAt: string;
  deadlineAt: string | null;
  arrivedAt: string | null;
}

export interface RealtimePublisher {
  emergencyUpdated(event: EmergencyEvent): void;
  /** Closes every live connection these accounts hold, when they are deactivated. */
  disconnectUsers(userIds: string[]): void;
}

export const REALTIME_PUBLISHER = Symbol('REALTIME_PUBLISHER');

export function toSnapshot(event: EmergencyEvent): EmergencySnapshot {
  return {
    eventId: event.id,
    elderlyId: event.elderlyId,
    state: event.state,
    severity: event.severity,
    trigger: event.trigger,
    currentTier: event.currentTier,
    acknowledgedBy: event.acknowledgedBy,
    triggeredAt: event.triggeredAt.toISOString(),
    deadlineAt: event.currentTierDeadlineAt?.toISOString() ?? null,
    arrivedAt: event.arrivedAt?.toISOString() ?? null,
  };
}

/**
 * Used when no transport is attached, for example in tests.
 *
 * Publishing is deliberately fire and forget: a screen that misses a message refreshes
 * over HTTP, whereas an escalation that fails because a socket was unavailable would be
 * a real emergency lost to a cosmetic feature.
 */
export class NoopRealtimePublisher implements RealtimePublisher {
  emergencyUpdated(): void {
    // Nothing is listening.
  }

  disconnectUsers(): void {
    // Nobody is connected.
  }
}
