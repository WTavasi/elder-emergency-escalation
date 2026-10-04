import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useRealtime } from '../api/realtime';
import { useLoader } from '../useLoader';
import { Countdown, Empty, ErrorNotice, SeverityLabel, StatePill } from '../components/parts';
import { formatClock, formatDuration, formatOffset, humanise } from '../format';

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
  if (loading || !alert) return <Empty>Loading</Empty>;

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
        <div className="row">
          <StatePill state={alert.state} />
          <SeverityLabel severity={alert.severity} score={alert.severityScore} />
        </div>
      </div>

      <div className="metrics">
        <div className="card">
          <div className="metric__value">
            {alert.responseSeconds === null ? 'none' : formatDuration(alert.responseSeconds)}
          </div>
          <div className="metric__label">Time to acknowledgement</div>
        </div>
        <div className="card">
          <div className="metric__value">{alert.currentTier}</div>
          <div className="metric__label">Tier reached</div>
        </div>
        <div className="card">
          <div className="metric__value" style={{ fontSize: 'var(--font-size-h2)' }}>
            <Countdown deadlineAt={alert.deadlineAt} />
          </div>
          <div className="metric__label">Time left on this tier</div>
        </div>
        <div className="card">
          <div className="metric__value" style={{ fontSize: 'var(--font-size-h2)' }}>
            {alert.acknowledgedBy ? alert.acknowledgedBy.name : 'nobody yet'}
          </div>
          <div className="metric__label">Owner</div>
        </div>
      </div>

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
            <p className="muted micro">The order this elder&apos;s contacts would be tried in.</p>
            <ol className="stack" style={{ margin: 0, paddingLeft: 'var(--space-24)' }}>
              {alert.chain.map((member) => (
                <li key={member.responderId}>
                  {member.name}
                  <span className="muted"> {humanise(member.role)}</span>
                </li>
              ))}
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
