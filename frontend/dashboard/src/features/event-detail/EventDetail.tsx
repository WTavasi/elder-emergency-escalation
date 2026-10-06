import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { useAuth } from '../../shared/state/AuthContext';
import { useRealtime } from '../../shared/api/realtime';
import { useLoader } from '../../shared/hooks/useLoader';
import type { AlertDetail, ChainMember } from '../../shared/api/types';
import { OPEN_STATES } from '../../shared/api/types';
import { Icon } from '../../shared/components/Icon';
import {
  Countdown,
  ErrorNotice,
  SeverityLabel,
  Skeleton,
  StatePill,
} from '../../shared/components/parts';
import { formatClock, formatDuration, formatOffset, humanise } from '../../shared/utils/format';

/**
 * Where one person on the chain stands. Worked out from the tier the emergency has
 * reached and who took it on, because that is everything the record says about them;
 * whether a message actually reached them is in the delivery table below.
 */
function stepFor(
  member: ChainMember,
  alert: AlertDetail,
): { status: 'done' | 'current' | 'asked' | 'later'; text: string } {
  const open = OPEN_STATES.includes(alert.state);
  if (alert.acknowledgedBy?.id === member.responderId) {
    return { status: 'done', text: 'Took it on' };
  }
  if (member.priorityOrder < alert.currentTier) return { status: 'asked', text: 'Asked earlier' };
  if (member.priorityOrder === alert.currentTier) {
    return open && !alert.acknowledgedBy
      ? { status: 'current', text: 'Being asked now' }
      : { status: 'asked', text: 'Asked' };
  }
  return open && !alert.acknowledgedBy
    ? { status: 'later', text: 'Next if nobody answers' }
    : { status: 'later', text: 'Not needed' };
}

/**
 * One banner in place of four equal cards. The four were the same size, so nothing on
 * the page said which mattered; the banner leads with what an operator acts on (state,
 * severity, who owns it, time left) and the rest becomes a line of detail beneath it.
 */
function StatusBanner({ alert }: { alert: AlertDetail }) {
  const open = OPEN_STATES.includes(alert.state);
  const waiting = open && !alert.acknowledgedBy;
  const tone = waiting ? 'waiting' : open ? 'owned' : 'closed';

  return (
    <section className={`banner banner--${tone}`} aria-label="Status">
      <div className="banner__main">
        <div className="row">
          <StatePill state={alert.state} />
          <SeverityLabel severity={alert.severity} score={alert.severityScore} />
          <span className="muted">Tier {alert.currentTier}</span>
        </div>
        <p className="banner__owner">
          <Icon name="person" />
          {alert.acknowledgedBy
            ? `${alert.acknowledgedBy.name}, ${humanise(alert.acknowledgedBy.role)}, has taken it on`
            : open
              ? 'Nobody has taken it on yet'
              : 'Nobody took it on'}
        </p>
      </div>
      {open ? (
        <div className="banner__timer">
          <Icon name="timer" />
          <span>
            <span className="banner__countdown">
              <Countdown deadlineAt={alert.deadlineAt} />
            </span>
            <span className="micro">left on this tier</span>
          </span>
        </div>
      ) : null}
    </section>
  );
}

export function EventDetail() {
  const { id = '' } = useParams();
  const { session } = useAuth();

  const fetcher = useCallback(() => api.alert(id), [id]);
  const {
    data: alert,
    error,
    loading,
    reload,
  } = useLoader(
    fetcher,
    'Could not load this emergency. It may have been removed, or you may not have access to it.',
  );

  // Any change to this emergency reloads the record rather than patching it: the
  // timeline and the delivery log both change with it and neither is in the snapshot.
  // A detail screen is one request, and correctness is worth more than the saving.
  const onUpdate = useCallback(
    (snapshot: { eventId: string }) => {
      if (snapshot.eventId === id) reload();
    },
    [id, reload],
  );
  useRealtime(session?.accessToken ?? null, onUpdate);

  if (error) return <ErrorNotice message={error} onRetry={reload} />;
  if (loading || !alert) return <Skeleton rows={5} />;

  const factors = alert.severityFactors?.factors ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <p className="micro">
            <Link to="/">Open emergencies</Link>
          </p>
          <h1>{alert.elder.name}</h1>
          <p>
            Raised {formatClock(alert.triggeredAt)}
            {alert.addressLabel ? ` at ${alert.addressLabel}` : ''}
          </p>
        </div>
      </div>

      <StatusBanner alert={alert} />
      <p className="micro muted" style={{ marginTop: 'calc(var(--space-12) * -1)' }}>
        {alert.responseSeconds === null
          ? 'Not answered yet'
          : `Answered in ${formatDuration(alert.responseSeconds)}`}
        {alert.resolvedAt ? `, closed ${formatClock(alert.resolvedAt)}` : ''}
      </p>

      <div className="detail-grid">
        <section className="card stack" aria-labelledby="timeline-heading">
          <h2 id="timeline-heading">What happened</h2>
          <p className="muted micro">
            Times are offsets from the moment the alert was raised. An entry with no person against
            it was the system acting on its own.
          </p>
          <ol className="timeline">
            {alert.timeline.map((entry) => (
              <li key={entry.id}>
                <span className="timeline__at">{formatOffset(entry.secondsFromTrigger)}</span>
                <span>
                  <strong>{humanise(entry.action)}</strong>
                  {entry.previousState && entry.newState ? (
                    <span className="muted">
                      {' '}
                      {humanise(entry.previousState)} to {humanise(entry.newState)}
                    </span>
                  ) : null}
                  <div className="timeline__actor">
                    {entry.actor ? `${entry.actor.name}, ${humanise(entry.actor.role)}` : 'system'}
                    {' at '}
                    {formatClock(entry.occurredAt)}
                  </div>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div className="stack">
          {/*
            Closed by default. An operator opening an emergency wants the timeline and
            who was told, not a weights table. The breakdown is kept one click away
            rather than removed, because the severity policy is a weighted rule
            precisely so that an escalation can be explained afterwards, and an
            explanation nobody can reach is not one. A native details element is used
            rather than a toggle built by hand: it is keyboard operable and announces
            its own expanded state without any of that having to be written or tested.
          */}
          <section className="card" aria-labelledby="severity-heading">
            {factors.length === 0 ? (
              <div className="stack">
                <h2 id="severity-heading">Why this severity</h2>
                <p className="muted">No severity breakdown was recorded for this emergency.</p>
              </div>
            ) : (
              <details className="disclosure">
                <summary className="disclosure__summary">
                  <h2 id="severity-heading">Why this severity</h2>
                  <span className="micro">
                    {factors.length} factors, scoring {alert.severityScore}
                  </span>
                </summary>
                <div className="disclosure__body">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Factor</th>
                        <th scope="col">Weight</th>
                        <th scope="col">Value</th>
                        <th scope="col">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {factors.map((factor) => (
                        <tr key={factor.key}>
                          <td>
                            {humanise(factor.key)}
                            {factor.detail ? <div className="micro">{factor.detail}</div> : null}
                          </td>
                          <td className="mono">{factor.weight}</td>
                          <td className="mono">{factor.value}</td>
                          <td className="mono">{factor.contribution}</td>
                        </tr>
                      ))}
                      <tr>
                        <td>
                          <strong>Score</strong>
                        </td>
                        <td />
                        <td />
                        <td className="mono">
                          <strong>{alert.severityScore}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </section>

          <section className="card stack" aria-labelledby="chain-heading">
            <h2 id="chain-heading">Escalation chain</h2>
            <p className="muted micro">The order this elder&apos;s contacts are tried in.</p>
            <ol className="steps">
              {alert.chain.map((member) => {
                const step = stepFor(member, alert);
                return (
                  <li
                    key={member.responderId}
                    className={`step step--${step.status}`}
                    aria-current={step.status === 'current' ? 'step' : undefined}
                  >
                    <span className="step__marker" aria-hidden="true">
                      {step.status === 'done' ? (
                        <Icon name="check" size={16} />
                      ) : (
                        member.priorityOrder
                      )}
                    </span>
                    <span>
                      <span className="step__name">{member.name}</span>
                      <span className="micro muted"> {humanise(member.role)}</span>
                      <span className="step__status">
                        <span className="visually-hidden">Tier {member.priorityOrder}, </span>
                        {step.text}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>

      <section className="card stack" aria-labelledby="delivery-heading">
        <h2 id="delivery-heading">Every delivery attempt</h2>
        <p className="muted micro">
          A failed push followed by an SMS to the same person is the fallback working, not two
          separate faults.
        </p>
        {alert.deliveries.length === 0 ? (
          <p className="muted">Nothing has been dispatched for this emergency.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Recipient</th>
                  <th scope="col">Tier</th>
                  <th scope="col">Channel</th>
                  <th scope="col">Status</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Sent</th>
                </tr>
              </thead>
              <tbody>
                {alert.deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td>{delivery.recipient?.name ?? 'unknown'}</td>
                    <td className="mono">{delivery.tier}</td>
                    <td>{delivery.channel.toLowerCase()}</td>
                    <td>{humanise(delivery.status)}</td>
                    <td className="micro">{delivery.failureReason ?? ''}</td>
                    <td className="mono">
                      {delivery.sentAt ? formatClock(delivery.sentAt) : 'not sent'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
