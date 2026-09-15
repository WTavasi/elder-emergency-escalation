import { useCallback, useState } from 'react';
import { api } from '../api/client';
import { Empty, ErrorNotice } from '../components/parts';
import { useLoader } from '../useLoader';
import { formatDuration, humanise } from '../format';

const WINDOWS = [7, 30, 90];

/**
 * The evaluation figures, computed from the record rather than from a counter.
 *
 * Sample sizes are shown next to every derived number. A median response time drawn
 * from four emergencies is a different claim from one drawn from four hundred, and a
 * screen that hides the difference invites the reader to make the stronger one.
 */
export function Reporting() {
  const [days, setDays] = useState(30);

  const fetcher = useCallback(() => api.overview(days), [days]);
  const {
    data: overview,
    error,
    loading,
    reload,
  } = useLoader(fetcher, 'Could not load the reporting figures.');

  if (error) return <ErrorNotice message={error} onRetry={reload} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reporting</h1>
          <p>Measured from the audit trail and the delivery log.</p>
        </div>
        <div className="row" role="group" aria-label="Reporting window">
          {WINDOWS.map((window) => (
            <button
              key={window}
              type="button"
              aria-pressed={days === window}
              className={days === window ? 'button--emergency' : undefined}
              onClick={() => setDays(window)}
            >
              Last {window} days
            </button>
          ))}
        </div>
      </div>

      {loading || !overview ? (
        <Empty>Loading</Empty>
      ) : (
        <>
          <section aria-labelledby="live-heading" className="stack">
            <h2 id="live-heading">Right now</h2>
            <div className="metrics">
              <div className="card">
                <div className="metric__value">{overview.live.open}</div>
                <div className="metric__label">Emergencies open</div>
              </div>
              <div className="card">
                <div className="metric__value">{overview.live.unacknowledged}</div>
                <div className="metric__label">Waiting for somebody to answer</div>
              </div>
              {Object.entries(overview.live.bySeverity).map(([band, count]) => (
                <div className="card" key={band}>
                  <div className="metric__value">{count}</div>
                  <div className="metric__label">Open and {band.toLowerCase()}</div>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="response-heading" className="stack">
            <h2 id="response-heading">Response time</h2>
            <div className="metrics">
              <div className="card">
                <div className="metric__value">
                  {overview.responseTimes.medianSeconds === null
                    ? 'none'
                    : formatDuration(overview.responseTimes.medianSeconds)}
                </div>
                <div className="metric__label">Median time to acknowledgement</div>
              </div>
              <div className="card">
                <div className="metric__value">
                  {overview.responseTimes.meanSeconds === null
                    ? 'none'
                    : formatDuration(overview.responseTimes.meanSeconds)}
                </div>
                <div className="metric__label">Mean, which one long wait distorts</div>
              </div>
              <div className="card">
                <div className="metric__value">
                  {overview.responseTimes.withinTargetPercent === null
                    ? 'none'
                    : `${overview.responseTimes.withinTargetPercent}%`}
                </div>
                <div className="metric__label">
                  Answered within {formatDuration(overview.responseTimes.targetSeconds)}
                </div>
              </div>
              <div className="card">
                <div className="metric__value">{overview.responseTimes.sampleSize}</div>
                <div className="metric__label">Acknowledged emergencies in this window</div>
              </div>
            </div>
          </section>

          <section aria-labelledby="chain-heading" className="stack">
            <h2 id="chain-heading">How far emergencies travelled</h2>
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Answered at tier</th>
                    <th scope="col">Emergencies</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(overview.escalation.answeredAtTier).length === 0 ? (
                    <tr>
                      <td colSpan={2} className="muted">
                        Nothing was acknowledged in this window.
                      </td>
                    </tr>
                  ) : (
                    Object.entries(overview.escalation.answeredAtTier).map(([tier, count]) => (
                      <tr key={tier}>
                        <td>Tier {tier}</td>
                        <td className="mono">{count}</td>
                      </tr>
                    ))
                  )}
                  <tr>
                    <td>
                      <strong>Climbed past tier one</strong>
                      <div className="micro">
                        Counted once per emergency, however many tiers it climbed.
                      </div>
                    </td>
                    <td className="mono">
                      <strong>{overview.escalation.escalatedCount}</strong>
                      {overview.escalation.escalationRatePercent === null ? null : (
                        <div className="micro">
                          {overview.escalation.escalationRatePercent}% of{' '}
                          {overview.escalation.total} closed
                        </div>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="channel-heading" className="stack">
            <h2 id="channel-heading">Delivery reliability</h2>
            <p className="muted micro">
              The case for the SMS fallback is whatever the push column says here.
            </p>
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Channel</th>
                    <th scope="col">Attempted</th>
                    <th scope="col">Delivered</th>
                    <th scope="col">Failed</th>
                    <th scope="col">Success</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.channels.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        Nothing was dispatched in this window.
                      </td>
                    </tr>
                  ) : (
                    overview.channels.map((row) => (
                      <tr key={row.channel}>
                        <td>{humanise(row.channel)}</td>
                        <td className="mono">{row.attempted}</td>
                        <td className="mono">{row.delivered}</td>
                        <td className="mono">{row.failed}</td>
                        <td className="mono">
                          {row.successRatePercent === null ? 'none' : `${row.successRatePercent}%`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
