import type { AuditAction, EventOutcome, EventState, Role, Severity } from '@prisma/client';

/**
 * What a list of emergencies looks like to a screen.
 *
 * The database row is not the right shape for a dashboard: it carries foreign keys
 * where an operator needs names, decimals where a browser needs numbers, and Date
 * objects that would be serialised inconsistently. Projecting once here means the
 * dashboard and the mobile app read the same fields, and it means adding a column to
 * the table does not silently widen what the API discloses.
 */
export interface AlertSummary {
  eventId: string;
  state: EventState;
  severity: Severity;
  severityScore: number;
  currentTier: number;
  outcome: EventOutcome | null;
  elder: { id: string; name: string; addressLabel: string | null };
  acknowledgedBy: { id: string; name: string; role: Role } | null;
  latitude: number;
  longitude: number;
  addressLabel: string | null;
  triggeredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  deadlineAt: string | null;
  responderRequestedAt: string | null;
  /** Seconds between the alert and its acknowledgement. Null while unacknowledged. */
  responseSeconds: number | null;
}

/**
 * One line of the audit trail.
 *
 * actor is null for everything the system did on its own, which is what makes an
 * automatic escalation distinguishable from a human decision when the trail is read
 * back. That distinction is the point of the trail, so it is modelled explicitly
 * rather than left to the reader to infer from the action name.
 */
export interface AuditEntry {
  id: string;
  action: AuditAction;
  previousState: EventState | null;
  newState: EventState | null;
  actor: { id: string; name: string; role: Role } | null;
  detail: unknown;
  occurredAt: string;
  /** Seconds since the alert was raised, so the trail reads as a relative timeline. */
  secondsFromTrigger: number;
}

/** A delivery attempt, as shown beneath the timeline. */
export interface DeliveryAttempt {
  id: string;
  channel: string;
  status: string;
  tier: number;
  recipient: { id: string; name: string; role: Role } | null;
  failureReason: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  acknowledgedAt: string | null;
}

/** One rung of the escalation chain, in the order it would be dispatched. */
export interface ChainMember {
  responderId: string;
  name: string;
  role: Role;
  priorityOrder: number;
}

/** Everything the detail screen needs, in one request. */
export interface AlertDetail extends AlertSummary {
  severityFactors: unknown;
  chain: ChainMember[];
  timeline: AuditEntry[];
  deliveries: DeliveryAttempt[];
}
