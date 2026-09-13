/**
 * Local time for a person, in their own timezone.
 *
 * Two severity factors depend on it: whether an alert was raised at night, and whether
 * a caregiver had declared cover at that moment. Both are meaningless in UTC when the
 * people involved are in Nairobi.
 *
 * An unrecognised timezone falls back to UTC rather than throwing. A malformed timezone
 * string on one profile must never be the reason an emergency alert fails to be created.
 */

export interface LocalParts {
  /** 0 to 23 in the given timezone. */
  hour: number;
  /** Minutes since local midnight, 0 to 1439. */
  minutesOfDay: number;
  /** 0 for Sunday through 6 for Saturday, matching care_assignments.cover_days_of_week. */
  dayOfWeek: number;
}

const DAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function localParts(at: Date, timeZone: string): LocalParts {
  let parts: Intl.DateTimeFormatPart[];

  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
  }

  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '0';

  const hour = Number(value('hour')) % 24;
  const minute = Number(value('minute'));

  return {
    hour,
    minutesOfDay: hour * 60 + minute,
    dayOfWeek: DAY_INDEX[value('weekday')] ?? 0,
  };
}

/**
 * Night spans midnight, so the comparison wraps: 22:00 to 06:00 means hour >= 22 or
 * hour < 6, not the empty range a naive between would produce.
 */
export function isNight(hour: number, startHour: number, endHour: number): boolean {
  return startHour <= endHour
    ? hour >= startHour && hour < endHour
    : hour >= startHour || hour < endHour;
}

export interface CoverWindow {
  daysOfWeek: number[];
  startMinute: number | null;
  endMinute: number | null;
}

/** True when the moment falls inside a declared cover window. Wraps past midnight. */
export function isInsideCoverWindow(window: CoverWindow, local: LocalParts): boolean {
  const { startMinute, endMinute } = window;
  if (startMinute === null || endMinute === null) return false;
  if (window.daysOfWeek.length > 0 && !window.daysOfWeek.includes(local.dayOfWeek)) return false;

  return startMinute <= endMinute
    ? local.minutesOfDay >= startMinute && local.minutesOfDay < endMinute
    : local.minutesOfDay >= startMinute || local.minutesOfDay < endMinute;
}
