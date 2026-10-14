/** Counts of live emergencies, broken down the two ways an operator scans them. */
export interface LiveCounts {
  open: number;
  unacknowledged: number;
  byState: Record<string, number>;
  bySeverity: Record<string, number>;
}

/**
 * Response time, reported as a median as well as a mean.
 *
 * The mean alone is misleading for this measure: one emergency that sat unanswered
 * overnight moves it a long way, while the median describes what usually happens.
 * Chapter 5 quotes both for that reason, and the sample size is returned so a figure
 * drawn from three events is not presented as though it were drawn from three hundred.
 */
export interface ResponseTimes {
  sampleSize: number;
  medianSeconds: number | null;
  meanSeconds: number | null;
  withinTargetPercent: number | null;
  targetSeconds: number;
}

/** How far emergencies travelled down the chain before somebody answered. */
export interface EscalationProfile {
  total: number;
  answeredAtTier: Record<string, number>;
  escalatedCount: number;
  escalationRatePercent: number | null;
}

/** Delivery outcomes per channel, which is what justifies the SMS fallback. */
export interface ChannelReliability {
  channel: string;
  attempted: number;
  delivered: number;
  failed: number;
  successRatePercent: number | null;
}

/**
 * How long records are kept, as the server enforces it, so the console can state the
 * real figures rather than a promise written into its own text.
 */
export interface DataPolicy {
  retention: {
    /** False when the sweep is switched off, in which case nothing is deleted. */
    enabled: boolean;
    closedEmergencyDays: number;
    auditLogDays: number;
  };
}

/** One day of the window, in the deployment's own time zone. */
export interface DailyPoint {
  /** YYYY-MM-DD. */
  date: string;
  raised: number;
  acknowledged: number;
  /** Median seconds to acknowledgement for that day's emergencies, null when none were. */
  medianSeconds: number | null;
}

/**
 * The same figures for the window before this one, of the same length, so each can be
 * shown with how it moved. Only the ones where a change means something: the live counts
 * are a snapshot and have no "before".
 */
export interface PreviousWindow {
  raised: number;
  responseTimes: ResponseTimes;
  escalationRatePercent: number | null;
}

export interface DashboardOverview {
  generatedAt: string;
  windowDays: number;
  live: LiveCounts;
  responseTimes: ResponseTimes;
  escalation: EscalationProfile;
  channels: ChannelReliability[];
  /** Emergencies raised in the window. */
  raised: number;
  previous: PreviousWindow;
  daily: DailyPoint[];
}
