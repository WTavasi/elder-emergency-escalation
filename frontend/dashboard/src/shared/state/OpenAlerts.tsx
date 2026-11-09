import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { api } from '../api/client';
import type { AlertSummary, EmergencySnapshot, Severity } from '../api/types';
import { useRealtime, type ConnectionState } from '../api/realtime';
import { useAuth } from './AuthContext';
import { useLoader } from '../hooks/useLoader';
import { useServiceHealth, type ServiceHealth } from '../hooks/useServiceHealth';

/** Critical first, then the longest wait, because that is the order to work them in. */
const RANK: Record<Severity, number> = { CRITICAL: 0, ELEVATED: 1, STANDARD: 2 };

export function order(alerts: AlertSummary[]): AlertSummary[] {
  return [...alerts].sort((left, right) => {
    const unansweredFirst =
      Number(Boolean(left.acknowledgedBy)) - Number(Boolean(right.acknowledgedBy));
    if (unansweredFirst !== 0) return unansweredFirst;

    const bySeverity = RANK[left.severity] - RANK[right.severity];
    if (bySeverity !== 0) return bySeverity;

    return new Date(left.triggeredAt).getTime() - new Date(right.triggeredAt).getTime();
  });
}

interface OpenAlertsValue {
  alerts: AlertSummary[] | null;
  error: string | null;
  loading: boolean;
  connection: ConnectionState;
  /** Whether the server says its database and Redis are working, and which are not. */
  health: ServiceHealth;
  down: string[];
  /** When the board last heard anything, loaded or pushed. Null before the first load. */
  updatedAt: number | null;
  /** Emergencies that appeared while the board was open, for a moment, to draw the eye. */
  arrived: ReadonlySet<string>;
  reload: () => void;
}

const OpenAlertsContext = createContext<OpenAlertsValue | null>(null);

/** How long a newly arrived emergency is marked, matching the row's highlight. */
const ARRIVED_MS = 3_000;

/**
 * The open board, loaded once and held for the whole console, and kept live.
 *
 * The navigation shows how many emergencies are open and the board shows which ones,
 * and both read this. Every change arrives over the live connection: a new emergency
 * appears at once, a closed one goes at once, and anything else is patched in place.
 * When the connection comes back after dropping, the board is fetched again, because
 * whatever happened in between was never sent.
 */
export function OpenAlertsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());

  const fetcher = useCallback(async () => {
    const alerts = order(await api.alerts({ open: true, limit: 200 }));
    setUpdatedAt(Date.now());
    return alerts;
  }, []);
  const { data, error, loading, reload, setData } = useLoader(
    fetcher,
    'Could not load open emergencies.',
  );

  // What is on the board now, read when a message arrives. Kept in a ref because the
  // decision to fetch again has to be made now, and a state updater runs later: deciding
  // inside one is why a new emergency used to wait for a manual refresh.
  const present = useRef<AlertSummary[] | null>(null);
  useEffect(() => {
    present.current = data;
  }, [data]);

  // Ids on the board before the latest load, so an emergency that was not there is marked.
  // Each mark is taken off by its own timer, which a later change to the board must not
  // cancel, so the timers are only cleared when the console closes.
  const known = useRef<Set<string> | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.map((alert) => alert.eventId));
    const before = known.current;
    known.current = ids;
    if (!before) return;
    const fresh = [...ids].filter((id) => !before.has(id));
    if (fresh.length === 0) return;
    setArrived((current) => new Set([...current, ...fresh]));
    timers.current.push(
      window.setTimeout(
        () =>
          setArrived((current) => {
            const next = new Set(current);
            for (const id of fresh) next.delete(id);
            return next;
          }),
        ARRIVED_MS,
      ),
    );
  }, [data]);

  /**
   * A snapshot is a change to an emergency, not the whole emergency. A row already on
   * the board is patched in place, or taken off once it is over. A new emergency, or one
   * just taken by somebody, needs fields the snapshot deliberately does not carry, so the
   * board is fetched again at once.
   */
  const apply = useCallback(
    (snapshot: EmergencySnapshot) => {
      setUpdatedAt(Date.now());
      const over = snapshot.state === 'RESOLVED' || snapshot.state === 'CANCELLED';
      const board = present.current;
      const existing = board?.find((alert) => alert.eventId === snapshot.eventId);

      if (!existing) {
        // Not on the board: a new emergency, unless it is one already over.
        if (!over) reload();
        return;
      }
      if (over) {
        setData((rows) => rows?.filter((alert) => alert.eventId !== snapshot.eventId) ?? rows);
        return;
      }
      if (snapshot.acknowledgedBy && !existing.acknowledgedBy) {
        reload();
        return;
      }
      setData(
        (rows) =>
          rows &&
          order(
            rows.map((alert) =>
              alert.eventId === snapshot.eventId
                ? {
                    ...alert,
                    state: snapshot.state,
                    severity: snapshot.severity,
                    currentTier: snapshot.currentTier,
                    deadlineAt: snapshot.deadlineAt,
                  }
                : alert,
            ),
          ),
      );
    },
    [setData, reload],
  );

  const connection = useRealtime(session?.accessToken ?? null, apply, reload);
  const { health, down } = useServiceHealth();

  const value = useMemo(
    () => ({ alerts: data, error, loading, connection, health, down, updatedAt, arrived, reload }),
    [data, error, loading, connection, health, down, updatedAt, arrived, reload],
  );

  return <OpenAlertsContext.Provider value={value}>{children}</OpenAlertsContext.Provider>;
}

export function useOpenAlerts(): OpenAlertsValue {
  const value = useContext(OpenAlertsContext);
  if (!value) throw new Error('useOpenAlerts must be used inside OpenAlertsProvider');
  return value;
}

/** The board when there is one: null for a page rendered on its own, as in a test. */
export function useOpenAlertsIfAny(): OpenAlertsValue | null {
  return useContext(OpenAlertsContext);
}
