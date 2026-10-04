import { useCallback, useEffect, useState } from 'react';

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  /** True until the first attempt settles, so a screen can say "loading" once. */
  loading: boolean;
  reload: () => void;
  /** For a screen that patches its own data from a socket message. */
  setData: (update: (present: T | null) => T | null) => void;
}

/**
 * Loads something over HTTP and keeps it.
 *
 * Two things this gets right that a bare effect does not. A result from a request
 * that has already been superseded is discarded, so changing a filter twice quickly
 * cannot leave the first answer on screen. And no state is written while the effect
 * is running, only when a request settles, which keeps one load to one render rather
 * than a cascade.
 */
export function useLoader<T>(fetcher: () => Promise<T>, message: string): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;

    fetcher().then(
      (result) => {
        if (!live) return;
        setData(result);
        setError(null);
        setLoading(false);
      },
      () => {
        if (!live) return;
        setError(message);
        setLoading(false);
      },
    );

    return () => {
      live = false;
    };
    // attempt is a dependency so that reload() re-runs this effect. fetcher is
    // expected to be memoised by the caller, which is what makes that safe.
  }, [fetcher, message, attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);

  const patch = useCallback(
    (update: (present: T | null) => T | null) => setData((present) => update(present)),
    [],
  );

  return { data, error, loading, reload, setData: patch };
}
