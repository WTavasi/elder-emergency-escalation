import type { EmergencyEvent } from '@prisma/client';

/**
 * What a live emergency looks like to a connected screen.
 *
 * A summary rather than the database row: the audit trail and the severity breakdown
 * are fetched over HTTP when someone opens an event. A socket message should be small
 * enough to be cheap to send to every responder screen on every change.
 */
export interface EmergencySnapshot {
  eventId: string;
  elderlyId: string;
  state: string;
  severity: string;
  currentTier: number;
  latitude: number;
  longitude: number;
  addressLabel: string | null;
  acknowledgedBy: string | null;
  triggeredAt: string;
  deadlineAt: string | null;
}

export interface RealtimePublisher {
  emergencyUpdated(event: EmergencyEvent): void;
}

export const REALTIME_PUBLISHER = Symbol('REALTIME_PUBLISHER');

export function toSnapshot(event: EmergencyEvent): EmergencySnapshot {
  return {
    eventId: event.id,
    elderlyId: event.elderlyId,
    state: event.state,
    severity: event.severity,
    currentTier: event.currentTier,
    latitude: Number(event.alertLatitude),
    longitude: Number(event.alertLongitude),
    addressLabel: event.alertAddressLabel,
    acknowledgedBy: event.acknowledgedBy,
    triggeredAt: event.triggeredAt.toISOString(),
    deadlineAt: event.currentTierDeadlineAt?.toISOString() ?? null,
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
}
