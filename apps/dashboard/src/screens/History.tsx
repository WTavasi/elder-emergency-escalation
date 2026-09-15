import { useCallback, useState } from 'react';
import { api } from '../api/client';
import type { EventState, Severity } from '../api/types';
import { AlertRow, Empty, ErrorNotice } from '../components/parts';
import { useLoader } from '../useLoader';

const STATES: EventState[] = [
  'TRIGGERED',
  'NOTIFIED',
  'ACKNOWLEDGED',
  'ESCALATED',
  'RESOLVED',
  'CANCELLED',
];

const SEVERITIES: Severity[] = ['STANDARD', 'ELEVATED', 'CRITICAL'];

/**
 * The searchable record.
 *
 * Every filter is applied by the API rather than in the browser. Fetching everything
 * and hiding most of it would put emergencies this operator did not ask to see into
 * the page, which is the opposite of collecting only what is needed.
 */
export function History() {
  const [state, setState] = useState<EventState | ''>('');
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // The filters the last search actually ran with. Kept apart from the form fields so
  // that typing a date does not fire a query on every keystroke: the query changes
  // when the operator submits, which is also what makes the browser Back button and a
  // re-submission behave the way they look like they should.
  const [applied, setApplied] = useState({ state: '', severity: '', from: '', to: '' });

  const fetcher = useCallback(
    () =>
      api.alerts({
        state: applied.state ? [applied.state as EventState] : undefined,
        severity: applied.severity ? [applied.severity as Severity] : undefined,
        from: applied.from ? new Date(applied.from).toISOString() : undefined,
        // An end date means the whole of that day, which is what a person filling in a
        // date field means by it.
        to: applied.to ? new Date(`${applied.to}T23:59:59.999`).toISOString() : undefined,
        limit: 200,
      }),
    [applied],
  );

  const {
    data: alerts,
    error,
    loading,
    reload,
  } = useLoader(fetcher, 'Could not load the emergency history.');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Emergency history</h1>
          <p>Up to 200 records at a time, newest first.</p>
        </div>
      </div>

      <form
        className="card filters"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          setApplied({ state, severity, from, to });
        }}
      >
        <div className="field">
          <label htmlFor="filter-state">State</label>
          <select
            id="filter-state"
            value={state}
            onChange={(changeEvent) => setState(changeEvent.target.value as EventState | '')}
          >
            <option value="">Any state</option>
            {STATES.map((value) => (
              <option key={value} value={value}>
                {value.toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="filter-severity">Severity</label>
          <select
            id="filter-severity"
            value={severity}
            onChange={(changeEvent) => setSeverity(changeEvent.target.value as Severity | '')}
          >
            <option value="">Any severity</option>
            {SEVERITIES.map((value) => (
              <option key={value} value={value}>
                {value.toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="filter-from">Raised on or after</label>
          <input
            id="filter-from"
            type="date"
            value={from}
            onChange={(changeEvent) => setFrom(changeEvent.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="filter-to">Raised on or before</label>
          <input
            id="filter-to"
            type="date"
            value={to}
            onChange={(changeEvent) => setTo(changeEvent.target.value)}
          />
        </div>

        <button type="submit">Apply filters</button>
        <button
          type="button"
          onClick={() => {
            setState('');
            setSeverity('');
            setFrom('');
            setTo('');
            setApplied({ state: '', severity: '', from: '', to: '' });
          }}
        >
          Clear filters
        </button>
      </form>

      {error ? <ErrorNotice message={error} onRetry={reload} /> : null}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {loading ? (
          <Empty>Loading</Empty>
        ) : !alerts || alerts.length === 0 ? (
          <Empty>No emergency matches these filters.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Waiting</span>
                </th>
                <th scope="col">Elder</th>
                <th scope="col">State</th>
                <th scope="col">Severity</th>
                <th scope="col">Tier</th>
                <th scope="col">Answered by</th>
                <th scope="col">Response time</th>
                <th scope="col">Raised</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <AlertRow key={alert.eventId} alert={alert} live={false} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
