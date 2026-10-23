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
  'TRIGGERED' | 'NOTIFIED' | 'ACKNOWLEDGED' | 'ON_SCENE' | 'ESCALATED' | 'RESOLVED' | 'CANCELLED';

export type Severity = 'STANDARD' | 'ELEVATED' | 'CRITICAL';

/** A press of the help button, or a daily check-in the elder did not answer. */
export type AlertTrigger = 'PANIC' | 'MISSED_CHECK_IN';

export type Role =
  | 'ELDER'
  | 'CAREGIVER'
  | 'FAMILY_MEMBER'
  | 'EMERGENCY_RESPONDER'
  | 'ADMINISTRATOR'
  | 'COMMUNITY_RESPONDER';

export const OPEN_STATES: EventState[] = [
  'TRIGGERED',
  'NOTIFIED',
  'ACKNOWLEDGED',
  'ON_SCENE',
  'ESCALATED',
];

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
  /** Optional, so a console a release ahead of the API still reads the page. */
  trigger?: AlertTrigger;
  currentTier: number;
  outcome: string | null;
  /** What the person who closed it wrote. Always set when outcome is OTHER. */
  outcomeNote: string | null;
  /** Null where the elder withdrew consent to share it and the emergency is over. */
  elder: { id: string; name: string; phone: string | null; addressLabel: string | null };
  acknowledgedBy: Person | null;
  latitude: number | null;
  longitude: number | null;
  addressLabel: string | null;
  /** What is left out because the elder withdrew consent. Empty while the emergency is open. */
  withheld?: Array<'phone' | 'location'>;
  triggeredAt: string;
  acknowledgedAt: string | null;
  /** When the person who took it on reached the elder. Kept if it later moves on. */
  arrivedAt?: string | null;
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

/** The person who took it on, on their way, while they share it. Never stored. */
export interface Journey {
  etaSeconds: number;
  distanceMetres: number;
  /** "osrm" for a route by road, "estimate" for the straight-line guess. */
  source: 'osrm' | 'estimate';
  updatedAt: string;
  latitude: number | null;
  longitude: number | null;
}

/** Talking through the app: whether it is set up, and who started a call. */
export interface VoiceState {
  available: boolean;
  startedBy: string | null;
  startedAt: string | null;
}

/** Community volunteers on one emergency: how many were asked, and the one going. */
export interface VolunteerOnAlert {
  askedAt: string;
  asked: number;
  name: string | null;
  phone: string | null;
  distanceMetres: number | null;
  acceptedAt: string | null;
  arrivedAt: string | null;
}

export type VolunteerStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export type VolunteerTraining =
  'FIRST_AID' | 'CPR' | 'COMMUNITY_HEALTH_PROMOTER' | 'HEALTH_PROFESSIONAL' | 'OTHER';

/** One application in the vetting queue. */
export interface VolunteerApplication {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: VolunteerStatus;
  training: VolunteerTraining[];
  note: string | null;
  area: { label: string; latitude: number; longitude: number } | null;
  radiusKm: number | null;
  available: boolean;
  appliedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  accepted: number;
  arrived: number;
  deactivated: boolean;
}

export interface AlertDetail extends AlertSummary {
  severityFactors: SeverityBreakdown | null;
  chain: ChainMember[];
  timeline: AuditEntry[];
  deliveries: DeliveryAttempt[];
  /** Optional, so a console a release ahead of the API still reads the page. */
  journey?: Journey | null;
  voice?: VoiceState;
  volunteer?: VolunteerOnAlert | null;
}

/** The small message the socket pushes on every change. */
export interface EmergencySnapshot {
  eventId: string;
  elderlyId: string;
  state: EventState;
  severity: Severity;
  trigger?: AlertTrigger;
  currentTier: number;
  acknowledgedBy: string | null;
  triggeredAt: string;
  deadlineAt: string | null;
}

export interface DataPolicy {
  retention: { enabled: boolean; closedEmergencyDays: number; auditLogDays: number };
}

/** The public parts of the privacy notice that depend on the server's settings. */
export interface LegalFacts extends DataPolicy {
  privacyVersion: string;
  termsVersion: string;
  /** Null until the deployment names one. */
  contact: { name: string | null; email: string | null; address: string | null } | null;
}

export interface DailyPoint {
  date: string;
  raised: number;
  acknowledged: number;
  medianSeconds: number | null;
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
  raised: number;
  previous: {
    raised: number;
    responseTimes: DashboardOverview['responseTimes'];
    escalationRatePercent: number | null;
  };
  daily: DailyPoint[];
}

/** One account in the Users table, from GET /admin/users. */
export interface UserRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: Role;
  createdAt: string;
  deactivatedAt: string | null;
  coverage: Coverage | null;
  chainPlaces: number;
}

export interface Coverage {
  areaName: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
}

export interface UserPage {
  items: UserRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UserQuery {
  q?: string;
  role?: Role;
  status?: 'active' | 'deactivated';
  page?: number;
  pageSize?: number;
}

export interface NewUser {
  name: string;
  phone: string;
  email?: string;
  role: 'EMERGENCY_RESPONDER' | 'ADMINISTRATOR';
  password: string;
  coverage?: Coverage;
}

/** One match from the address search, used for a responder's area. */
export interface AddressMatch {
  label: string;
  latitude: number;
  longitude: number;
}

/** A page of the history, with how many match in all. */
export interface AlertPage {
  items: AlertSummary[];
  total: number;
}

export interface UserSummary {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: Role;
}

/** From GET /auth/providers. Google is null when the server has no client ID. */
export interface SignInProviders {
  google: { clientId: string } | null;
}

export interface Session {
  user: UserSummary;
  accessToken: string;
  refreshToken: string;
}
