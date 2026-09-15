/**
 * The shapes the API returns.
 *
 * Declared by hand rather than imported from the API workspace on purpose: importing
 * the server's Prisma types would let a database column reach the browser bundle
 * simply by existing. Writing the contract out means adding a field to a table is a
 * deliberate act here too, and it keeps the dashboard buildable without the API's
 * generated client.
 */

export type EventState =
  'TRIGGERED' | 'NOTIFIED' | 'ACKNOWLEDGED' | 'ESCALATED' | 'RESOLVED' | 'CANCELLED';

export type Severity = 'STANDARD' | 'ELEVATED' | 'CRITICAL';

export type Role =
  'ELDER' | 'CAREGIVER' | 'FAMILY_MEMBER' | 'EMERGENCY_RESPONDER' | 'ADMINISTRATOR';

export const OPEN_STATES: EventState[] = ['TRIGGERED', 'NOTIFIED', 'ACKNOWLEDGED', 'ESCALATED'];

export interface Person {
  id: string;
  name: string;
  role: Role;
}

export interface AlertSummary {
  eventId: string;
  state: EventState;
  severity: Severity;
  severityScore: number;
  currentTier: number;
  outcome: string | null;
  elder: { id: string; name: string; addressLabel: string | null };
  acknowledgedBy: Person | null;
  latitude: number;
  longitude: number;
  addressLabel: string | null;
  triggeredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  deadlineAt: string | null;
  responderRequestedAt: string | null;
  responseSeconds: number | null;
}

export interface SeverityFactor {
  key: string;
  weight: number;
  value: number;
  contribution: number;
  detail?: string;
}

export interface SeverityBreakdown {
  score: number;
  band: Severity;
  factors: SeverityFactor[];
}

export interface AuditEntry {
  id: string;
  action: string;
  previousState: EventState | null;
  newState: EventState | null;
  actor: Person | null;
  detail: unknown;
  occurredAt: string;
  secondsFromTrigger: number;
}

export interface DeliveryAttempt {
  id: string;
  channel: string;
  status: string;
  tier: number;
  recipient: Person | null;
  failureReason: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  acknowledgedAt: string | null;
}

export interface ChainMember {
  responderId: string;
  name: string;
  role: Role;
  priorityOrder: number;
}

export interface AlertDetail extends AlertSummary {
  severityFactors: SeverityBreakdown | null;
  chain: ChainMember[];
  timeline: AuditEntry[];
  deliveries: DeliveryAttempt[];
}

/** The small message the socket pushes on every change. */
export interface EmergencySnapshot {
  eventId: string;
  elderlyId: string;
  state: EventState;
  severity: Severity;
  currentTier: number;
  latitude: number;
  longitude: number;
  addressLabel: string | null;
  acknowledgedBy: string | null;
  triggeredAt: string;
  deadlineAt: string | null;
}

export interface DashboardOverview {
  generatedAt: string;
  windowDays: number;
  live: {
    open: number;
    unacknowledged: number;
    byState: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  responseTimes: {
    sampleSize: number;
    medianSeconds: number | null;
    meanSeconds: number | null;
    withinTargetPercent: number | null;
    targetSeconds: number;
  };
  escalation: {
    total: number;
    answeredAtTier: Record<string, number>;
    escalatedCount: number;
    escalationRatePercent: number | null;
  };
  channels: {
    channel: string;
    attempted: number;
    delivered: number;
    failed: number;
    successRatePercent: number | null;
  }[];
}

export interface UserSummary {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: Role;
}

export interface Session {
  user: UserSummary;
  accessToken: string;
  refreshToken: string;
}
