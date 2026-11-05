/**
 * Each elder's rhythm: how soon they usually answer "are you OK?", learned from their own
 * answers, inside fixed limits.
 *
 * Two uses, and neither can make anything later or quieter than the rules already make it:
 *
 * - An early nudge. The reminder normally goes half way through the time to answer. For an
 *   elder who always answers within two minutes, ten minutes of silence is already unusual,
 *   so the reminder goes then. Never later than half way.
 * - A weekly note. When this week's answers came much later than the four weeks before, or
 *   more were missed, their caregivers are told, so somebody can call before it is an
 *   emergency.
 */

/** Answers needed before the rhythm is trusted. Fewer, and the fixed rule applies. */
export const RHYTHM_MIN_ANSWERS = 5;

/** The earliest a reminder ever goes, however quick the elder usually is. */
export const EARLIEST_NUDGE_MINUTES = 5;

/** How many of the latest answers the rhythm is read from. */
export const RHYTHM_WINDOW = 20;

export interface Rhythm {
  /** Answers it was read from. */
  answers: number;
  /** Half their answers come within this many minutes. */
  usualMinutes: number;
  /** Nine in ten of their answers come within this many minutes. */
  slowMinutes: number;
}

function percentile(sorted: number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}

/** The rhythm in [delays], minutes from asking to answer, or null with too few answers. */
export function rhythmOf(delays: number[]): Rhythm | null {
  const sorted = delays.filter((delay) => delay >= 0).sort((a, b) => a - b);
  if (sorted.length < RHYTHM_MIN_ANSWERS) return null;
  return {
    answers: sorted.length,
    usualMinutes: Math.round(percentile(sorted, 0.5)),
    slowMinutes: Math.round(percentile(sorted, 0.9)),
  };
}

/**
 * When to remind, in minutes after asking: twice as long as this elder's slow answers,
 * so only an answer that is unusually late for them is nudged, but never later than half
 * the time to answer and never sooner than [EARLIEST_NUDGE_MINUTES].
 */
export function nudgeAfterMinutes(rhythm: Rhythm | null, graceMinutes: number): number {
  const half = graceMinutes / 2;
  if (!rhythm) return half;
  const unusual = Math.max(EARLIEST_NUDGE_MINUTES, Math.ceil(rhythm.slowMinutes * 2));
  return Math.min(half, unusual);
}

/** One stretch of check-ins: how long each answer took, and how many were missed. */
export interface Stretch {
  delays: number[];
  missed: number;
  asked: number;
}

export interface Drift {
  /** Answers came later than before. */
  later: boolean;
  /** More were missed than before. */
  moreMissed: boolean;
  usualBefore: number;
  usualNow: number;
  missedNow: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, 0.5);
}

/**
 * Whether [week] is out of step with [before], the four weeks before it. Later: the usual
 * answer took at least ten minutes longer, and at least twice as long. More missed: two or
 * more missed, and at least twice the share missed before. Null when there is too little
 * to compare, or nothing changed.
 */
export function driftOf(week: Stretch, before: Stretch): Drift | null {
  if (before.delays.length < RHYTHM_MIN_ANSWERS || week.asked < 3) return null;
  const usualBefore = median(before.delays);
  const usualNow = week.delays.length > 0 ? median(week.delays) : usualBefore;
  const later = week.delays.length >= 3 && usualNow - usualBefore >= Math.max(10, usualBefore);
  const shareBefore = before.asked > 0 ? before.missed / before.asked : 0;
  const shareNow = week.missed / week.asked;
  const moreMissed = week.missed >= 2 && shareNow >= Math.max(2 * shareBefore, 0.2);
  if (!later && !moreMissed) return null;
  return {
    later,
    moreMissed,
    usualBefore: Math.round(usualBefore),
    usualNow: Math.round(usualNow),
    missedNow: week.missed,
  };
}
