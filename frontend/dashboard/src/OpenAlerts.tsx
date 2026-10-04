import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { api } from './api/client';
import type { AlertSummary, EmergencySnapshot, Severity } from './api/types';
import { useRealtime, type ConnectionState } from './api/realtime';
import { useAuth } from './auth/AuthContext';
import { useLoader } from './useLoader';

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
  reload: () => void;
}

const OpenAlertsContext = createContext<OpenAlertsValue | null>(null);

/**
 * The open board, loaded once and held for the whole console.
 *
 * The navigation shows how many emergencies are open and the board shows which ones,
 * and both read this. Fetching in the board and reporting the number upwards would
 * mean the count only existed while the board was on screen, and it would make every
 * refresh of the table a second render of the shell around it.
 */
export function OpenAlertsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();

  const fetcher = useCallback(async () => order(await api.alerts({ open: true, limit: 200 })), []);
  const { data, error, loading, reload, setData } = useLoader(
    fetcher,
    'Could not load open emergencies.',
  );

  /**
   * A snapshot is a change to an emergency, not the whole emergency. A row already on
   * the board is patched in place. Anything else, a new emergency or one that has just
   * been taken by somebody, needs fields the snapshot deliberately does not carry, so
   * the board is reloaded instead.
   */
  const apply = useCallback(
    (snapshot: EmergencySnapshot) => {
      let refetch = false;

      setData((present) => {
        if (!present) return present;

        const index = present.findIndex((alert) => alert.eventId === snapshot.eventId);
        if (index === -1) {
          refetch = true;
          return present;
        }

        if (snapshot.state === 'RESOLVED' || snapshot.state === 'CANCELLED') {
          return present.filter((alert) => alert.eventId !== snapshot.eventId);
        }

        const existing = present[index]!;
        if (snapshot.acknowledgedBy && !existing.acknowledgedBy) {
          refetch = true;
          return present;
        }

        const next = [...present];
        next[index] = {
          ...existing,
          state: snapshot.state,
          severity: snapshot.severity,
          currentTier: snapshot.currentTier,
          deadlineAt: snapshot.deadlineAt,
        };
        return order(next);
      });

      if (refetch) reload();
    },
    [setData, reload],
  );

  const connection = useRealtime(session?.accessToken ?? null, apply);

  const value = useMemo(
    () => ({ alerts: data, error, loading, connection, reload }),
    [data, error, loading, connection, reload],
  );

  return <OpenAlertsContext.Provider value={value}>{children}</OpenAlertsContext.Provider>;
}

export function useOpenAlerts(): OpenAlertsValue {
  const value = useContext(OpenAlertsContext);
  if (!value) throw new Error('useOpenAlerts must be used inside OpenAlertsProvider');
  return value;
}
