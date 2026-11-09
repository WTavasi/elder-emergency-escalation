import { useEffect, useState } from 'react';

export type ServiceHealth = 'unknown' | 'ok' | 'problem';

/** How often the server's own health check is asked, while the console is open. */
const EVERY_MS = 30_000;

/** A health check that takes longer than this is a problem in itself. */
const WAIT_MS = 8_000;

/**
 * Whether the server says it is working: its database and Redis both up.
 *
 * The live connection alone cannot say this. A server whose database has gone keeps its
 * sockets open and simply stops sending anything, which looks exactly like a quiet night.
 * Asking `/health` every half minute tells the two apart.
 */
export function useServiceHealth(): { health: ServiceHealth; down: string[] } {
  const [state, setState] = useState<{ health: ServiceHealth; down: string[] }>({
    health: 'unknown',
    down: [],
  });

  useEffect(() => {
    let live = true;
    const base = import.meta.env.VITE_API_BASE_URL ?? '';

    async function ask() {
      const abort = new AbortController();
      const timer = window.setTimeout(() => abort.abort(), WAIT_MS);
      try {
        const response = await fetch(`${base}/health`, {
          headers: { Accept: 'application/json' },
          signal: abort.signal,
        });
        const body = (await response.json().catch(() => null)) as {
          status?: string;
          checks?: Record<string, { status?: string }>;
        } | null;
        const down = Object.entries(body?.checks ?? {})
          .filter(([, check]) => check.status !== 'up')
          .map(([name]) => name);
        if (live) {
          setState({
            health: response.ok && body?.status === 'ok' && down.length === 0 ? 'ok' : 'problem',
            down,
          });
        }
      } catch (error) {
        // Too slow is a problem with the server. No answer at all is left to the live
        // connection, which will say offline, the truer word.
        const slow = error instanceof DOMException && error.name === 'AbortError';
        if (live) setState({ health: slow ? 'problem' : 'unknown', down: [] });
      } finally {
        window.clearTimeout(timer);
      }
    }

    void ask();
    const timer = window.setInterval(() => void ask(), EVERY_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  return state;
}
