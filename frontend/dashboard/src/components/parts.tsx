import { Link } from 'react-router-dom';
import type { AlertSummary, EventState, Severity } from '../api/types';
import { useCountdown } from '../useCountdown';
import { formatClock, formatDuration } from '../format';

/** The state, spelled out. Colour is a second channel, never the only one. */
export function StatePill({ state }: { state: EventState }) {
  return <span className={`pill pill--${state.toLowerCase()}`}>{state.toLowerCase()}</span>;
}

export function SeverityLabel({ severity, score }: { severity: Severity; score?: number }) {
  return (
    <span className={`severity severity--${severity}`}>
      {severity.toLowerCase()}
      {score === undefined ? null : <span className="mono muted"> {score}</span>}
    </span>
  );
}

/**
 * Time left on the current tier.
 *
 * Counts down in the browser from the deadline the API supplied rather than being
 * pushed once a second by the server: the server already sends a message when the
 * tier actually changes, and a per-second socket message per open emergency would be
 * a lot of traffic to tell an operator something their own clock can work out.
 */
export function Countdown({ deadlineAt }: { deadlineAt: string | null }) {
  const remaining = useCountdown(deadlineAt);

  if (remaining === null) return <span className="muted">not timing</span>;

  const overdue = remaining <= 0;
  return (
    <span className={`countdown${overdue ? ' countdown--overdue' : ''}`}>
      {overdue ? 'overdue' : formatDuration(remaining)}
    </span>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice notice--error" role="alert">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span>{message}</span>
        {onRetry ? (
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="muted" style={{ padding: 'var(--space-24)', textAlign: 'center', margin: 0 }}>
      {children}
    </p>
  );
}

/** One row of the emergency table, shared by the live board and the history view. */
export function AlertRow({ alert, live }: { alert: AlertSummary; live: boolean }) {
  return (
    <tr>
      <td className={`urgency${live && !alert.acknowledgedBy ? ' urgency--live' : ''}`} />
      <td>
        <Link to={`/emergencies/${alert.eventId}`}>{alert.elder.name}</Link>
        <div className="micro">{alert.addressLabel ?? 'Location captured, no address'}</div>
      </td>
      <td>
        <StatePill state={alert.state} />
      </td>
      <td>
        <SeverityLabel severity={alert.severity} score={alert.severityScore} />
      </td>
      <td className="mono">{alert.currentTier}</td>
      <td>
        {alert.acknowledgedBy ? (
          <>
            {alert.acknowledgedBy.name}
            <div className="micro">
              {alert.acknowledgedBy.role.replace(/_/g, ' ').toLowerCase()}
            </div>
          </>
        ) : (
          <span className="muted">nobody yet</span>
        )}
      </td>
      <td>
        {live ? (
          <Countdown deadlineAt={alert.deadlineAt} />
        ) : (
          <span className="mono">
            {alert.responseSeconds === null
              ? 'not answered'
              : formatDuration(alert.responseSeconds)}
          </span>
        )}
      </td>
      <td className="mono">{formatClock(alert.triggeredAt)}</td>
    </tr>
  );
}
