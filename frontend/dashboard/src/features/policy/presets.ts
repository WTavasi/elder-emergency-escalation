import type { DispatchMode, Severity } from '../../shared/api/types';

/** One tier of a chain in a preset: how long it is given, how it is asked, text at once. */
export interface PresetTier {
  /** Seconds before the next tier is asked. Ignored for the last tier, which has none. */
  timeoutSeconds: number | null;
  dispatchMode: DispatchMode;
  smsFallbackImmediate: boolean;
}

export interface Preset {
  id: string;
  name: string;
  /** One line on what it does and when to use it. */
  summary: string;
  /** Each severity's chain, tier 1 first. */
  rules: Record<Severity, PresetTier[]>;
  bands: { elevatedFrom: number; criticalFrom: number };
}

const tier = (
  timeoutSeconds: number | null,
  dispatchMode: DispatchMode = 'SEQUENTIAL',
  smsFallbackImmediate = false,
): PresetTier => ({ timeoutSeconds, dispatchMode, smsFallbackImmediate });

/** The policy the system ships with, as the database seed sets it. */
const RECOMMENDED: Preset['rules'] = {
  STANDARD: [tier(120), tier(180), tier(null)],
  ELEVATED: [tier(60), tier(120), tier(null)],
  CRITICAL: [tier(60, 'SEQUENTIAL', true), tier(60, 'PARALLEL', true), tier(null)],
};

/** Every tier of every chain changed the same way. */
function everyTier(
  rules: Preset['rules'],
  change: (tier: PresetTier, index: number, severity: Severity) => PresetTier,
): Preset['rules'] {
  return Object.fromEntries(
    Object.entries(rules).map(([severity, tiers]) => [
      severity,
      tiers.map((step, index) => change(step, index, severity as Severity)),
    ]),
  ) as Preset['rules'];
}

/**
 * The built-in presets. Each sets every chain and where High and Critical start, and is
 * checked by the server like any other change when it is saved. The weights of the
 * severity factors are left as they are; they have a reset of their own.
 *
 * Every time limit here is within the server's limits (15 seconds to an hour), the last
 * tier never has one, and tier 1 is never asked "with the tier before".
 */
export const PRESETS: Preset[] = [
  {
    id: 'recommended',
    name: 'Recommended',
    summary:
      'What the system ships with: caregivers first, then family, then emergency services, quicker as an alert gets more severe.',
    rules: RECOMMENDED,
    bands: { elevatedFrom: 35, criticalFrom: 60 },
  },
  {
    id: 'faster',
    name: 'Faster response',
    summary:
      'Every time limit halved, so the next group is asked sooner. For areas where help is far away.',
    rules: everyTier(RECOMMENDED, (step) => ({
      ...step,
      timeoutSeconds:
        step.timeoutSeconds === null ? null : Math.max(30, Math.round(step.timeoutSeconds / 2)),
    })),
    bands: { elevatedFrom: 35, criticalFrom: 60 },
  },
  {
    id: 'patient',
    name: 'More time for family',
    summary:
      'Caregivers and family are given longer before the next group is asked. Critical alerts stay quick.',
    rules: {
      STANDARD: [tier(300), tier(300), tier(null)],
      ELEVATED: [tier(180), tier(180), tier(null)],
      CRITICAL: RECOMMENDED.CRITICAL,
    },
    bands: { elevatedFrom: 35, criticalFrom: 60 },
  },
  {
    id: 'together',
    name: 'Everyone together',
    summary:
      'Caregivers and family are asked at the same time for every alert, then emergency services.',
    rules: everyTier(RECOMMENDED, (step, index) =>
      index === 1 ? { ...step, dispatchMode: 'PARALLEL' } : step,
    ),
    bands: { elevatedFrom: 35, criticalFrom: 60 },
  },
  {
    id: 'texts',
    name: 'Texts straight away',
    summary:
      'Caregivers and family get a text at once as well as the app notification, for every alert. For places where data is patchy.',
    rules: everyTier(RECOMMENDED, (step, index, severity) =>
      index < RECOMMENDED[severity].length - 1 ? { ...step, smsFallbackImmediate: true } : step,
    ),
    bands: { elevatedFrom: 35, criticalFrom: 60 },
  },
  {
    id: 'cautious',
    name: 'Cautious scoring',
    summary: 'More alerts count as High or Critical, so they climb faster. Chains as recommended.',
    rules: RECOMMENDED,
    bands: { elevatedFrom: 25, criticalFrom: 50 },
  },
];

/** The severity factors' weights the system ships with, by key. */
export const RECOMMENDED_WEIGHTS: Record<string, number> = {
  care_level: 30,
  no_cancel_in_grace_window: 30,
  time_of_day: 20,
  away_from_home: 15,
  recent_activity: 5,
};

/** The time limits offered, within the server's limits. */
export const TIME_CHOICES = [15, 30, 45, 60, 90, 120, 180, 240, 300, 600, 900, 1800, 3600];

/** "45 s", "1 min", "1 min 30 s", "1 h". */
export function durationWord(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} h`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}
