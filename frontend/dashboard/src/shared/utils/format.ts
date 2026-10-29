/**
 * Formatting for an operations screen.
 *
 * Durations are written in the units an operator thinks in, and clock times are shown
 * in the browser's own timezone with the timezone named, because a dashboard that
 * silently renders Nairobi time to someone in another country is worse than one that
 * says which clock it is using.
 */

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));

  if (total < 60) return `${total}s`;
  if (total < 3600) {
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
  }

  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

const clock = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const dateAndClock = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "about 9 minutes" or "about 1 hour 15 minutes", for a time to arrival. */
export function timeAway(seconds: number): string {
  if (seconds < 60) return 'less than a minute';
  const minutes = Math.round(seconds / 60);
  const count = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (minutes < 60) return `about ${count(minutes, 'minute')}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `about ${count(hours, 'hour')}`
    : `about ${count(hours, 'hour')} ${count(rest, 'minute')}`;
}

/** "4.2 km" or "650 m". */
export function distance(metres: number): string {
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;
}

export function formatClock(iso: string): string {
  const at = new Date(iso);
  const sameDay = at.toDateString() === new Date().toDateString();
  return sameDay ? clock.format(at) : dateAndClock.format(at);
}

const dayAndMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

/**
 * How long ago, as a person says it: "just now", "4 min ago", "2 h ago", and the date once
 * it is older than a day. For a live screen, where how long something has waited matters
 * more than the time on the clock; the exact time goes on a tooltip beside it.
 */
export function formatAgo(atMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - atMs) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return dayAndMonth.format(new Date(atMs));
}

/** The exact time, with its zone, for a tooltip. */
export function formatExact(iso: string): string {
  return `${new Date(iso).toLocaleString()} (${localTimezone()})`;
}

export function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Turns SEVERITY_EVALUATED into "severity evaluated", for the timeline. */
export function humanise(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase();
}
