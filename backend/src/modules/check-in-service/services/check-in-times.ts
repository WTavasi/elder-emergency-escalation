/**
 * Times of day for check-ins, in the elder's own time zone.
 *
 * Stored as minutes after local midnight, so "9:00" means nine in the morning wherever
 * the elder is, and turned into instants only when a day's check-ins are worked out. The
 * zone comes from the elder's account (users.timezone), Africa/Nairobi by default.
 */

/** "09:00" to 540, or null for anything that is not a time of day. */
export function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 540 to "09:00". */
export function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Whether the platform knows this IANA time zone. */
export function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return true;
  } catch {
    return false;
  }
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** What a clock on the wall in [timeZone] shows at [instant]. */
export function wallClock(instant: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const read = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

/** How far ahead of UTC [timeZone] is at [instant], in milliseconds. */
function offsetAt(instant: Date, timeZone: string): number {
  const wall = wallClock(instant, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  return asUtc - Math.floor(instant.getTime() / 60_000) * 60_000;
}

/**
 * The instant a wall-clock time happens in [timeZone]. Checked twice, so a day on which
 * the clocks change lands on the right side of the change.
 */
export function zonedInstant(
  year: number,
  month: number,
  day: number,
  minutes: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  const first = offsetAt(new Date(guess), timeZone);
  let instant = guess - first;
  const second = offsetAt(new Date(instant), timeZone);
  if (second !== first) instant = guess - second;
  return new Date(instant);
}

/** The day's check-in instants, for the local day [now] falls in. */
export function dueTimesOn(now: Date, times: number[], timeZone: string): Date[] {
  const today = wallClock(now, timeZone);
  return times.map((minutes) =>
    zonedInstant(today.year, today.month, today.day, minutes, timeZone),
  );
}

/** "morning", "afternoon" or "evening", for a greeting in the elder's own time. */
export function partOfDay(instant: Date, timeZone: string): 'morning' | 'afternoon' | 'evening' {
  const hour = wallClock(instant, timeZone).hour;
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
