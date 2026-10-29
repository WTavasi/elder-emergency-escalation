import { useCallback, useState } from 'react';
import { api } from '../../shared/api/client';
import { Icon } from '../../shared/components/Icon';
import { PageHeader } from '../../shared/components/PageHeader';
import { Empty, ErrorNotice, Skeleton } from '../../shared/components/parts';
import { useLoader } from '../../shared/hooks/useLoader';
import { formatDuration, humanise } from '../../shared/utils/format';
import { TrendChart, type Series } from './TrendChart';

const WINDOWS = [7, 30, 90];

/** Which way is good for a figure: fewer minutes waiting is, more emergencies is neither. */
type Better = 'higher' | 'lower' | 'neither';

/**
 * How a figure moved against the window before, as an arrow and a few words.
 *
 * Counts and durations move by a percentage of what they were; figures that are already
 * percentages move by points, because "+50%" on a rate that went from 2% to 3% says
 * something quite different from what happened. Green when it moved the right way, the
 * warning red when it moved the wrong way, ink when neither way is better. With nothing
 * to compare against, it says so rather than inventing a change from zero.
 */
function Trend({
  now,
  before,
  better,
  points = false,
  windowDays,
}: {
  now: number | null;
  before: number | null;
  better: Better;
  points?: boolean;
  windowDays: number;
}) {
  const versus = `vs previous ${windowDays} days`;
  if (now === null || before === null || (!points && before === 0)) {
    return <span className="trend trend--none">No earlier figure to compare</span>;
  }

  const change = points ? now - before : ((now - before) / before) * 100;
  const rounded = Math.round(change * 10) / 10;
  if (rounded === 0) return <span className="trend trend--flat">No change {versus}</span>;

  const up = rounded > 0;
  const tone = better === 'neither' ? 'flat' : (better === 'higher') === up ? 'good' : 'bad';
  const amount = points
    ? `${up ? '+' : ''}${rounded} ${Math.abs(rounded) === 1 ? 'point' : 'points'}`
    : `${up ? '+' : ''}${rounded}%`;

  return (
    <span className={`trend trend--${tone}`}>
      <Icon name={up ? 'trendingUp' : 'trendingDown'} size={16} />
      <span>
        <span className="figures">{amount}</span> {versus}
      </span>
    </span>
  );
}

/**
 * The evaluation figures, computed from the record rather than from a counter.
 *
 * Sample sizes are shown next to every derived number. A median response time drawn
 * from four emergencies is a different claim from one drawn from four hundred, and a
 * screen that hides the difference invites the reader to make the stronger one.
 */
export function Reporting() {
  const [days, setDays] = useState(30);
  const [series, setSeries] = useState<Series>('raised');

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
      <PageHeader
        title="Reporting"
        actions={
          // One segmented control rather than three buttons, with aria-pressed saying
          // which window is chosen.
          <div className="segmented" role="group" aria-label="Reporting window">
            {WINDOWS.map((window) => (
              <button
                key={window}
                type="button"
                aria-pressed={days === window}
                onClick={() => setDays(window)}
              >
                {window} days
              </button>
            ))}
          </div>
        }
      />

      {loading || !overview ? (
        <Skeleton rows={3} />
      ) : (
        <>
          <section aria-labelledby="live-heading" className="stack">
            <h2 id="live-heading">Right now</h2>
            <div className="metrics">
              <div className="card metric">
                <div className="metric__label">Emergencies open</div>
                <div className="metric__value">{overview.live.open}</div>
              </div>
              <div className="card metric">
                <div className="metric__label">Not answered yet</div>
                <div className="metric__value">{overview.live.unacknowledged}</div>
              </div>
              {Object.entries(overview.live.bySeverity).map(([band, count]) => (
                <div className="card metric" key={band}>
                  <div className="metric__label">Open and {band.toLowerCase()}</div>
                  <div className="metric__value">{count}</div>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="window-heading" className="stack">
            <h2 id="window-heading">The last {days} days</h2>
            <div className="metrics">
              <div className="card metric">
                <div className="metric__label">Emergencies raised</div>
                <div className="metric__value">{overview.raised}</div>
                <Trend
                  now={overview.raised}
                  before={overview.previous.raised}
                  better="neither"
                  windowDays={days}
                />
              </div>
              <div className="card metric">
                <div className="metric__label">Median time to an answer</div>
                <div className="metric__value">
                  {overview.responseTimes.medianSeconds === null
                    ? 'none'
                    : formatDuration(overview.responseTimes.medianSeconds)}
                </div>
                <Trend
                  now={overview.responseTimes.medianSeconds}
                  before={overview.previous.responseTimes.medianSeconds}
                  better="lower"
                  windowDays={days}
                />
                <div className="metric__note">
                  From <span className="figures">{overview.responseTimes.sampleSize}</span>{' '}
                  answered. Mean{' '}
                  {overview.responseTimes.meanSeconds === null
                    ? 'none'
                    : formatDuration(overview.responseTimes.meanSeconds)}
                  , which one long wait distorts.
                </div>
              </div>
              <div className="card metric">
                <div className="metric__label">
                  Answered within {formatDuration(overview.responseTimes.targetSeconds)}
                </div>
                <div className="metric__value">
                  {overview.responseTimes.withinTargetPercent === null
                    ? 'none'
                    : `${overview.responseTimes.withinTargetPercent}%`}
                </div>
                <Trend
                  now={overview.responseTimes.withinTargetPercent}
                  before={overview.previous.responseTimes.withinTargetPercent}
                  better="higher"
                  points
                  windowDays={days}
                />
              </div>
              <div className="card metric">
                <div className="metric__label">Climbed past tier one</div>
                <div className="metric__value">
                  {overview.escalation.escalationRatePercent === null
                    ? 'none'
                    : `${overview.escalation.escalationRatePercent}%`}
                </div>
                <Trend
                  now={overview.escalation.escalationRatePercent}
                  before={overview.previous.escalationRatePercent}
                  better="lower"
                  points
                  windowDays={days}
                />
                <div className="metric__note">
                  <span className="figures">{overview.escalation.escalatedCount}</span> of{' '}
                  <span className="figures">{overview.escalation.total}</span> closed.
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="daily-heading" className="card stack">
            <div className="section-head">
              <h2 id="daily-heading">Day by day</h2>
              <div className="segmented" role="group" aria-label="What the chart shows">
                <button
                  type="button"
                  aria-pressed={series === 'raised'}
                  onClick={() => setSeries('raised')}
                >
                  Emergencies raised
                </button>
                <button
                  type="button"
                  aria-pressed={series === 'median'}
                  onClick={() => setSeries('median')}
                >
                  Median time to an answer
                </button>
              </div>
            </div>
            {overview.daily.every((day) => day.raised === 0) ? (
              <Empty icon="reporting" title="Nothing to draw">
                No emergency was raised in the last {days} days.
              </Empty>
            ) : (
              <TrendChart points={overview.daily} series={series} />
            )}
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
                        <td className="figures">{count}</td>
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
                    <td className="figures">
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
                        <td className="figures">{row.attempted}</td>
                        <td className="figures">{row.delivered}</td>
                        <td className="figures">{row.failed}</td>
                        <td className="figures">
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
