import { useEffect, useRef, useState, type FocusEvent } from 'react';
import type { AlertSummary } from '../../shared/api/types';
import { useOpenAlerts } from '../../shared/state/OpenAlerts';
import { PageHeader } from '../../shared/components/PageHeader';
import {
  AlertRow,
  moveBetweenRows,
  Empty,
  ErrorNotice,
  Skeleton,
} from '../../shared/components/parts';

/**
 * The rows as shown. While the pointer is over the list, or focus is in it, the order is
 * held as it was: a row the hand is moving to stays where it is, the rows already there
 * keep updating in place, and a new emergency waits, counted in the caption, until the
 * pointer or focus leaves. A row closed meanwhile stays, faded, until then.
 *
 * A board is often left with the pointer resting on it, and a new emergency must never be
 * kept out of sight for long, so the hold also ends after a few seconds without the
 * pointer moving.
 */
export function heldRows(
  alerts: AlertSummary[],
  held: string[] | null,
  last: ReadonlyMap<string, AlertSummary>,
): { rows: { alert: AlertSummary; gone: boolean }[]; waiting: number } {
  if (!held) return { rows: alerts.map((alert) => ({ alert, gone: false })), waiting: 0 };
  const latest = new Map(alerts.map((alert) => [alert.eventId, alert]));
  const known = new Set(held);
  const rows = held.flatMap((id) => {
    const alert = latest.get(id) ?? last.get(id);
    return alert ? [{ alert, gone: !latest.has(id) }] : [];
  });
  return { rows, waiting: alerts.filter((alert) => !known.has(alert.eventId)).length };
}

/** How long the order is held once the pointer stops moving over the list. */
const HOLD_WHILE_STILL_MS = 4000;

export function Board() {
  const { alerts, error, loading, connection, arrived, reload } = useOpenAlerts();
  // The order frozen while the list is being pointed at, and every row as it was then,
  // so one closed meanwhile can still be drawn where it was.
  const [held, setHeld] = useState<{ ids: string[]; seen: Map<string, AlertSummary> } | null>(null);
  const { rows, waiting } = heldRows(alerts ?? [], held?.ids ?? null, held?.seen ?? new Map());

  const still = useRef<number | undefined>(undefined);
  const release = () => {
    window.clearTimeout(still.current);
    setHeld(null);
  };
  const hold = () => {
    window.clearTimeout(still.current);
    still.current = window.setTimeout(() => setHeld(null), HOLD_WHILE_STILL_MS);
    if (held || !alerts) return;
    setHeld({
      ids: alerts.map((alert) => alert.eventId),
      seen: new Map(alerts.map((alert) => [alert.eventId, alert])),
    });
  };
  useEffect(() => () => window.clearTimeout(still.current), []);
  const releaseIfLeaving = (focusEvent: FocusEvent<HTMLTableSectionElement>) => {
    if (!focusEvent.currentTarget.contains(focusEvent.relatedTarget as Node | null)) release();
  };
  const open = rows.filter((row) => !row.gone).length + waiting;

  return (
    <>
      <PageHeader title="Open emergencies" />

      {connection === 'offline' ? (
        <div className="notice" role="status">
          This screen has lost its live connection, so what you see may be out of date. It is
          reconnecting by itself; sign in again if this does not clear.
        </div>
      ) : null}

      {error ? <ErrorNotice message={error} onRetry={reload} /> : null}

      <div className="card grid">
        {loading ? (
          <Skeleton />
        ) : !alerts || (alerts.length === 0 && rows.length === 0) ? (
          <Empty icon="allClear" title="All clear">
            No emergency is open right now. This is the state the system should usually be in.
          </Empty>
        ) : (
          <div className="grid__body">
            <table className="list">
              <caption className="list__caption">
                {open} open, ordered by whoever has been waiting longest without an answer.
                {/* Always in the caption's line, so the count appearing moves nothing. */}
                <span className="list__waiting" aria-live="polite">
                  {waiting > 0 ? ` ${waiting} new, shown when you move away from the list.` : ''}
                </span>
              </caption>
              <thead>
                <tr>
                  <th scope="col">Elder</th>
                  <th scope="col">State</th>
                  <th scope="col">Severity</th>
                  <th scope="col" className="num">
                    Tier
                  </th>
                  <th scope="col">Answered by</th>
                  <th scope="col" className="num">
                    Time left
                  </th>
                  {/* How long ago, which is what matters on a live board; each time gives the
                    exact clock time, with its zone, on hover. */}
                  <th scope="col" className="num">
                    Raised
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody
                onKeyDown={moveBetweenRows}
                onPointerEnter={hold}
                onPointerMove={hold}
                onPointerLeave={release}
                onFocus={hold}
                onBlur={releaseIfLeaving}
              >
                {rows.map(({ alert, gone }) => (
                  <AlertRow
                    key={alert.eventId}
                    alert={alert}
                    live
                    gone={gone}
                    arrived={arrived.has(alert.eventId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
