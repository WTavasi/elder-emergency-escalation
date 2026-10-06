import { useOpenAlerts } from '../../shared/state/OpenAlerts';
import { Icon } from '../../shared/components/Icon';
import {
  AlertRow,
  ConnectionStatus,
  Empty,
  ErrorNotice,
  Skeleton,
} from '../../shared/components/parts';
import { localTimezone } from '../../shared/utils/format';

export function Board() {
  const { alerts, error, loading, connection, reload } = useOpenAlerts();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Open emergencies</h1>
          <p>Every elder on the platform. Times are shown in {localTimezone()}.</p>
        </div>
        <div className="row">
          <ConnectionStatus state={connection} />
          <button type="button" className="button--with-icon" onClick={reload}>
            <Icon name="refresh" size={18} />
            Refresh
          </button>
        </div>
      </div>

      {connection === 'offline' ? (
        <div className="notice" role="status">
          This screen is not receiving live updates, so what you see may be out of date. Use
          Refresh, or sign in again if the problem continues.
        </div>
      ) : null}

      {error ? <ErrorNotice message={error} onRetry={reload} /> : null}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {loading ? (
          <Skeleton />
        ) : !alerts || alerts.length === 0 ? (
          <Empty icon="allClear" title="All clear">
            No emergency is open right now. This is the state the system should usually be in.
          </Empty>
        ) : (
          <table>
            <caption
              className="micro"
              style={{ captionSide: 'top', padding: 'var(--space-12)', textAlign: 'left' }}
            >
              {alerts.length} open, ordered by whoever has been waiting longest without an answer.
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Waiting for an answer</span>
                </th>
                <th scope="col">Elder</th>
                <th scope="col">State</th>
                <th scope="col">Severity</th>
                <th scope="col">Tier</th>
                <th scope="col">Answered by</th>
                <th scope="col">Time left</th>
                <th scope="col">Raised</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <AlertRow key={alert.eventId} alert={alert} live />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
