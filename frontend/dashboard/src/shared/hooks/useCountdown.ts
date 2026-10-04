import { useEffect, useState } from 'react';

/**
 * Seconds remaining until a deadline, recomputed once a second.
 *
 * The remaining time is derived during render from a ticking clock rather than held
 * in state of its own. Holding it would mean writing state every time the deadline
 * prop changed, which is a second render for a value that can simply be calculated,
 * and the rendered number could briefly disagree with the deadline it came from.
 * Null is returned rather than zero, so a screen can tell "no timer" apart from
 * "out of time".
 */
export function useCountdown(deadlineAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadlineAt) return;

    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [deadlineAt]);

  if (!deadlineAt) return null;
  return Math.round((new Date(deadlineAt).getTime() - now) / 1000);
}
