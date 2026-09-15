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

export interface DashboardOverview {
  generatedAt: string;
  windowDays: number;
  live: LiveCounts;
  responseTimes: ResponseTimes;
  escalation: EscalationProfile;
  channels: ChannelReliability[];
}
