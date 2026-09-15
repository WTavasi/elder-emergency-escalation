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

export function formatClock(iso: string): string {
  const at = new Date(iso);
  const sameDay = at.toDateString() === new Date().toDateString();
  return sameDay ? clock.format(at) : dateAndClock.format(at);
}

export function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Turns SEVERITY_EVALUATED into "severity evaluated", for the timeline. */
export function humanise(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase();
}

/** Seconds as a signed offset from the trigger, for the timeline gutter. */
export function formatOffset(seconds: number): string {
  if (seconds <= 0) return '0s';
  return `+${formatDuration(seconds)}`;
}
