import { useOpenAlerts } from '../../shared/state/OpenAlerts';
import { PageHeader } from '../../shared/components/PageHeader';
import {
  AlertRow,
  UpdatedStatus,
  moveBetweenRows,
  Empty,
  ErrorNotice,
  Skeleton,
} from '../../shared/components/parts';

export function Board() {
  const { alerts, error, loading, connection, updatedAt, reload } = useOpenAlerts();

  return (
    <>
      <PageHeader
        title="Open emergencies"
        actions={<UpdatedStatus state={connection} updatedAt={updatedAt} onRefresh={reload} />}
      />

      {connection === 'offline' ? (
        <div className="notice" role="status">
          This screen is not receiving live updates, so what you see may be out of date. Use
          Refresh, or sign in again if the problem continues.
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
                  <AlertRow key={alert.eventId} alert={alert} live />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
