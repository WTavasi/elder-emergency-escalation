import { Link } from 'react-router-dom';
import type { AlertSummary, EventState, Severity } from '../api/types';
import type { ConnectionState } from '../api/realtime';
import { useCountdown } from '../hooks/useCountdown';
import { formatClock, formatDuration } from '../utils/format';
import { Icon, type IconName } from './Icon';

/**
 * The glyph for each state, the same ones the mobile app's pills carry, so a running
 * figure means somebody is on the way on either screen.
 */
const STATE_GLYPH: Record<EventState, IconName> = {
  TRIGGERED: 'waiting',
  NOTIFIED: 'waiting',
  ACKNOWLEDGED: 'handled',
  ESCALATED: 'escalated',
  RESOLVED: 'closed',
  CANCELLED: 'withdrawn',
};

/**
 * A shape per severity, after Carbon's status-indicator pattern: an octagon, a triangle
 * and a dot are told apart by outline alone, so the band survives a reader who cannot
 * see the colour and a page printed in grey.
 */
const SEVERITY_GLYPH: Record<Severity, IconName> = {
  CRITICAL: 'critical',
  ELEVATED: 'elevated',
  STANDARD: 'standard',
};

/**
 * The words the app's pills use, so a caregiver and an administrator call the same
 * emergency the same thing. 'Triggered' and 'notified' are database words.
 */
export const STATE_LABEL: Record<EventState, string> = {
  TRIGGERED: 'Waiting',
  NOTIFIED: 'Waiting',
  ACKNOWLEDGED: 'Being handled',
  ESCALATED: 'Escalated',
  RESOLVED: 'Closed',
  CANCELLED: 'Withdrawn',
};

/** The state, spelled out, with a glyph. Colour is a third channel, never the only one. */
export function StatePill({ state }: { state: EventState }) {
  return (
    <span className={`pill pill--${state.toLowerCase()}`}>
      <Icon name={STATE_GLYPH[state]} size={14} />
      {STATE_LABEL[state]}
    </span>
  );
}

export function SeverityLabel({ severity, score }: { severity: Severity; score?: number }) {
  return (
    <span className={`severity severity--${severity}`}>
      <Icon name={SEVERITY_GLYPH[severity]} size={16} />
      {severity.charAt(0) + severity.slice(1).toLowerCase()}
      {score === undefined ? null : <span className="mono muted"> {score}</span>}
    </span>
  );
}

/**
 * Whether the live connection is up, as a dot and a word. It used to borrow the red
 * critical style when the socket dropped, which made a network blip look like an
 * emergency; red is kept for emergencies alone.
 */
export function ConnectionStatus({ state }: { state: ConnectionState }) {
  if (state === 'offline') {
    return (
      <span className="connection connection--offline">
        <Icon name="offline" size={16} />
        Not receiving updates
      </span>
    );
  }
  return (
    <span className={`connection connection--${state}`}>
      <span className="connection__dot" aria-hidden="true" />
      {state === 'live' ? 'Live' : 'Connecting'}
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

/**
 * Nothing to show, said plainly: an icon, a short title and one line, after Carbon's
 * empty-state anatomy. The title is optional so a one-line message still works.
 */
export function Empty({
  children,
  title,
  icon,
}: {
  children: React.ReactNode;
  title?: string;
  icon?: IconName;
}) {
  return (
    <div className="empty">
      {icon ? (
        <span className="empty__icon">
          <Icon name={icon} size={32} />
        </span>
      ) : null}
      {title ? <p className="empty__title">{title}</p> : null}
      <p className="empty__body">{children}</p>
    </div>
  );
}

/**
 * Grey placeholder lines while something loads, so the page keeps its shape instead of
 * showing one word and then jumping. Static rather than shimmering: nothing on this
 * console moves unless it means something. A screen reader hears "Loading" once.
 */
export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton" role="status" aria-busy="true">
      <span className="visually-hidden">Loading</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton__row" aria-hidden="true">
          <span className="skeleton__bar" style={{ width: '28%' }} />
          <span className="skeleton__bar" style={{ width: '14%' }} />
          <span className="skeleton__bar" style={{ width: '18%' }} />
          <span className="skeleton__bar" style={{ width: '22%' }} />
        </div>
      ))}
    </div>
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
