import { useOpenAlerts } from '../OpenAlerts';
import type { ConnectionState } from '../api/realtime';
import { AlertRow, Empty, ErrorNotice } from '../components/parts';
import { localTimezone } from '../format';

function connectionLabel(state: ConnectionState): string {
  if (state === 'live') return 'Live';
  if (state === 'connecting') return 'Connecting';
  return 'Not receiving updates';
}

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
          <span className={connection === 'live' ? 'muted' : 'severity severity--CRITICAL'}>
            {connectionLabel(connection)}
          </span>
          <button type="button" onClick={reload}>
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
          <Empty>Loading</Empty>
        ) : !alerts || alerts.length === 0 ? (
          <Empty>No emergency is open. This is the state the system should usually be in.</Empty>
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
