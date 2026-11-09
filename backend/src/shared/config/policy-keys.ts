/**
 * The keys of the single policy numbers kept in policy_settings, and where each falls back
 * to when no administrator has set it. Shared by the scoring, which reads them for every
 * alert, and the editor, which changes them.
 */
export const BAND_SETTINGS = {
  elevatedFrom: { key: 'severity_elevated_from', env: 'SEVERITY_ELEVATED_FROM', fallback: 35 },
  criticalFrom: { key: 'severity_critical_from', env: 'SEVERITY_CRITICAL_FROM', fallback: 60 },
} as const;

/** The severity factors this build knows how to measure, and so the only ones worth editing. */
export const MEASURED_FACTORS = [
  'care_level',
  'no_cancel_in_grace_window',
  'time_of_day',
  'away_from_home',
  'recent_activity',
] as const;
