import { useOpenAlerts } from '../../shared/state/OpenAlerts';
import { Icon } from '../../shared/components/Icon';
import { PageHeader } from '../../shared/components/PageHeader';
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
      <PageHeader
        title="Open emergencies"
        actions={
          <>
            <ConnectionStatus state={connection} />
            <button type="button" className="button--with-icon" onClick={reload}>
              <Icon name="refresh" size={18} />
              Refresh
            </button>
          </>
        }
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
                  {/* The time zone on the column it applies to, rather than in a line of text
                    above the table. */}
                  <th scope="col" className="num" title={`Times in ${localTimezone()}`}>
                    Raised <span className="th__note">{localTimezone()}</span>
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
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
