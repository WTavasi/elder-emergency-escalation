import { useOpenAlerts } from '../../shared/state/OpenAlerts';
import { PageHeader } from '../../shared/components/PageHeader';
import {
  AlertRow,
  LiveStatus,
  moveBetweenRows,
  Empty,
  ErrorNotice,
  Skeleton,
} from '../../shared/components/parts';

export function Board() {
  const { alerts, error, loading, connection, health, down, updatedAt, arrived, reload } =
    useOpenAlerts();

  return (
    <>
      <PageHeader
        title="Open emergencies"
        actions={
          <LiveStatus
            state={connection}
            health={health}
            down={down}
            updatedAt={updatedAt}
            onRetry={() => window.location.reload()}
          />
        }
      />

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
        ) : !alerts || alerts.length === 0 ? (
          <Empty icon="allClear" title="All clear">
            No emergency is open right now. This is the state the system should usually be in.
          </Empty>
        ) : (
          <div className="grid__body">
            <table className="list">
              <caption className="list__caption">
                {alerts.length} open, ordered by whoever has been waiting longest without an answer.
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
              <tbody onKeyDown={moveBetweenRows}>
                {alerts.map((alert) => (
                  <AlertRow
                    key={alert.eventId}
                    alert={alert}
                    live
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
