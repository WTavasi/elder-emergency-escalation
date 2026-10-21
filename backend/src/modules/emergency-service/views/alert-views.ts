import type { AuditAction, EventOutcome, EventState, Role, Severity } from '@prisma/client';
import type { JourneyView } from '../services/journey.service';
import type { VoiceView } from '../services/voice.service';

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
  /** What happened, in the closer's own words. Always set when outcome is OTHER. */
  outcomeNote: string | null;
  /**
   * The elder's phone number is included so a caregiver can call before deciding whether
   * to set off, which is the most natural first action on receiving an alert. It widens
   * nothing: every caller who can see this projection is already in the care circle, was
   * notified about this emergency, or is an administrator, and the care circle has the
   * number anyway. What it avoids is somebody scrolling through their contacts while an
   * emergency is open.
   */
  /**
   * Null where the elder has withdrawn consent to share it and the emergency is over.
   * See `withheld`.
   */
  elder: { id: string; name: string; phone: string | null; addressLabel: string | null };
  acknowledgedBy: { id: string; name: string; role: Role } | null;
  latitude: number | null;
  longitude: number | null;
  addressLabel: string | null;
  /**
   * What is left out because the elder withdrew consent to share it, so a screen can say
   * why rather than show a blank. Always empty while the emergency is open: responding to
   * it is processing in the elder's vital interests, whatever was withdrawn.
   */
  withheld: Array<'phone' | 'location'>;
  triggeredAt: string;
  acknowledgedAt: string | null;
  /** When the person who took it on reached the elder. Kept if the emergency moves on. */
  arrivedAt: string | null;
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
  /**
   * The person who took it on, on their way, when they chose to share it. Null when
   * nobody is sharing, they have arrived, or their last position is over three minutes
   * old. The elder sees the time and the distance; their care circle also sees where.
   */
  journey: JourneyView | null;
  /** Whether talking in the app is possible on this emergency, and who started it. */
  voice: VoiceView;
}
