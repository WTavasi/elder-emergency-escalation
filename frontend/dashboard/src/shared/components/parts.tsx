import { useId } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { OPEN_STATES } from '../api/types';
import type { AlertSummary, AlertTrigger, EventState, Severity } from '../api/types';
import type { ConnectionState } from '../api/realtime';
import { useCountdown } from '../hooks/useCountdown';
import { useNow } from '../hooks/useNow';
import { formatAgo, formatClock, formatDuration, formatExact } from '../utils/format';
import { Icon, type IconName } from './Icon';

/**
 * The glyph for each state, the same ones the mobile app's pills carry, so a running
 * figure means somebody is on the way on either screen.
 */
const STATE_GLYPH: Record<EventState, IconName> = {
  TRIGGERED: 'waiting',
  NOTIFIED: 'waiting',
  ACKNOWLEDGED: 'handled',
  ON_SCENE: 'arrived',
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
  ON_SCENE: 'Help arrived',
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
      {score === undefined ? null : <span className="figures muted"> {score}</span>}
    </span>
  );
}

/**
 * Marks an emergency nobody pressed for: a daily check-in that went unanswered. Nothing
 * for a press of the button, which is what every other row is, so the tag only appears
 * where it changes what the reader should do (call first).
 */
export function TriggerTag({ trigger }: { trigger?: AlertTrigger }) {
  const tipId = useId();
  if (trigger !== 'MISSED_CHECK_IN') return null;
  return (
    <span className="tag" tabIndex={0} aria-describedby={tipId}>
      Missed check-in
      <span role="tooltip" id={tipId} className="tip">
        Nobody pressed for help. The elder did not answer a daily check-in, so their care chain was
        asked to call and check. It stays at the standard band.
      </span>
    </span>
  );
}

/**
 * How fresh the board is, as Mail says it at the foot of a mailbox: "Updated just now",
 * and a small button to fetch again. A dropped connection says so in words, in amber, never
 * in the red kept for emergencies.
 */
export function UpdatedStatus({
  state,
  updatedAt,
  onRefresh,
}: {
  state: ConnectionState;
  updatedAt: number | null;
  onRefresh: () => void;
}) {
  const now = useNow();
  return (
    <span className="updated">
      {state === 'offline' ? (
        <span className="connection connection--offline">
          <Icon name="offline" size={16} />
          Not receiving updates
        </span>
      ) : (
        <span className="connection" aria-live="polite">
          {state === 'connecting' || updatedAt === null
            ? 'Connecting'
            : `Updated ${formatAgo(updatedAt, now)}`}
        </span>
      )}
      <button type="button" className="icon-button button--quiet" onClick={onRefresh}>
        <Icon name="refresh" size={18} label="Refresh" />
      </button>
    </span>
  );
}

/** When something was raised, as long ago as it was, with the exact time on hover. */
export function Ago({ iso }: { iso: string }) {
  const now = useNow();
  return (
    <time dateTime={iso} title={formatExact(iso)}>
      {formatAgo(Date.parse(iso), now)}
    </time>
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
          <Icon name={icon} size={44} />
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

/**
 * Whether a click landed on something with its own job, such as a link, a button or a
 * box to tick, rather than on the row around it.
 */
export function onControl(clickEvent: MouseEvent): boolean {
  return (clickEvent.target as HTMLElement).closest('a, button, input, label, [tabindex]') !== null;
}

/**
 * Up and down arrows move between the rows of a list, as they do in Mail and Finder, and
 * Return then opens the row reached, because what they move to is the row's own link or
 * button. Goes on the list's tbody. A menu open in a row keeps its arrows for itself.
 */
export function moveBetweenRows(keyEvent: KeyboardEvent<HTMLElement>) {
  if (keyEvent.key !== 'ArrowDown' && keyEvent.key !== 'ArrowUp') return;
  if (keyEvent.altKey || keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.shiftKey) return;
  const target = keyEvent.target as HTMLElement;
  if (target.closest('[role="menu"]')) return;
  const row = target.closest('tr');
  const next = keyEvent.key === 'ArrowDown' ? row?.nextElementSibling : row?.previousElementSibling;
  const name = next?.querySelector<HTMLElement>('.row-link__name');
  if (!name) return;
  keyEvent.preventDefault();
  name.focus();
}

/**
 * The mark for an emergency nobody has answered: a red dot at the start of the row, as an
 * unread message is marked in Mail, and as the app's list marks it. The words are there
 * for a screen reader.
 */
export function UnansweredDot({ shown }: { shown: boolean }) {
  return (
    <span className={`dot${shown ? ' dot--unanswered' : ''}`} aria-hidden={!shown}>
      {shown ? <span className="visually-hidden">Nobody has answered. </span> : null}
    </span>
  );
}

/**
 * One row of the emergency list, shared by the live board and the history view. The whole
 * row opens the emergency, as a row in an Apple list does, with a chevron to say so; the
 * name is the link, for the keyboard and for opening it in a new tab.
 */
export function AlertRow({ alert, live }: { alert: AlertSummary; live: boolean }) {
  const navigate = useNavigate();
  const to = `/emergencies/${alert.eventId}`;
  const unanswered = OPEN_STATES.includes(alert.state) && !alert.acknowledgedBy;

  return (
    <tr
      className="row-link"
      onClick={(clickEvent) => {
        if (!onControl(clickEvent)) void navigate(to);
      }}
    >
      <td>
        <span className="row-inline">
          <UnansweredDot shown={unanswered} />
          <Link className="row-link__name" to={to}>
            {alert.elder.name}
          </Link>
          <TriggerTag trigger={alert.trigger} />
        </span>
        <div className="micro row-indent">
          {alert.addressLabel ??
            (alert.withheld?.includes('location')
              ? 'Location withheld at the elder\u2019s request'
              : 'Location captured, no address')}
        </div>
      </td>
      <td>
        <StatePill state={alert.state} />
      </td>
      <td>
        <SeverityLabel severity={alert.severity} score={alert.severityScore} />
      </td>
      <td className="figures num" data-label="Tier">
        {alert.currentTier}
      </td>
      <td data-label="Answered by">
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
      <td className="num" data-label={live ? 'Time left' : 'Response time'}>
        {live ? (
          <Countdown deadlineAt={alert.deadlineAt} />
        ) : alert.responseSeconds === null ? (
          <span className="muted">not answered</span>
        ) : (
          <span className="figures">{formatDuration(alert.responseSeconds)}</span>
        )}
      </td>
      <td className="figures num" data-label="Raised">
        {live ? <Ago iso={alert.triggeredAt} /> : formatClock(alert.triggeredAt)}
      </td>
      <td className="chevron" aria-hidden="true">
        <Icon name="chevronRight" size={18} />
      </td>
    </tr>
  );
}

/**
 * The foot of a table: how much of the whole is on screen, and the way to the rest.
 * Announced politely when it changes, so a screen reader hears the new range after
 * Next without having to go looking for it.
 */
export function Pager({
  first,
  last,
  total,
  page,
  pages,
  onPage,
  noun,
  note,
}: {
  first: number;
  last: number;
  total: number;
  page: number;
  pages: number;
  onPage: (page: number) => void;
  noun: string;
  /** One more fact about the whole table, such as how long its records are kept. */
  note?: string;
}) {
  const count = new Intl.NumberFormat();
  return (
    <div className="pager">
      <p className="pager__range" aria-live="polite">
        {total === 0 ? (
          `No ${noun}`
        ) : (
          <>
            Showing <span className="figures">{count.format(first)}</span>&ndash;
            <span className="figures">{count.format(last)}</span> of{' '}
            <span className="figures">{count.format(total)}</span> {noun}
          </>
        )}
        {note ? <span className="pager__note">{note}</span> : null}
      </p>
      <div className="pager__controls">
        <span className="micro">
          Page {page} of {pages}
        </span>
        <button
          type="button"
          className="button--with-icon"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
        >
          <Icon name="chevronLeft" size={18} />
          Previous
        </button>
        <button
          type="button"
          className="button--with-icon"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
        >
          Next
          <Icon name="chevronRight" size={18} />
        </button>
      </div>
    </div>
  );
}
