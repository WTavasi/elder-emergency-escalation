import { useCallback, useState } from 'react';
import { api } from '../../shared/api/client';
import type { EventState, Severity } from '../../shared/api/types';
import { AlertRow, Empty, ErrorNotice, Skeleton } from '../../shared/components/parts';
import { useLoader } from '../../shared/hooks/useLoader';

const STATES: EventState[] = [
  'TRIGGERED',
  'NOTIFIED',
  'ACKNOWLEDGED',
  'ESCALATED',
  'RESOLVED',
  'CANCELLED',
];

/**
 * The filter needs to tell the two waiting states apart, which the pill does not: the
 * pill says what a caregiver needs to know, the filter is for looking something up.
 */
const STATE_OPTION: Record<EventState, string> = {
  TRIGGERED: 'Waiting, nobody told yet',
  NOTIFIED: 'Waiting, people told',
  ACKNOWLEDGED: 'Being handled',
  ESCALATED: 'Escalated',
  RESOLVED: 'Closed',
  CANCELLED: 'Withdrawn',
};

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
                {STATE_OPTION[value]}
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
                {value.charAt(0) + value.slice(1).toLowerCase()}
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
          <Skeleton />
        ) : !alerts || alerts.length === 0 ? (
          <Empty icon="inbox" title="Nothing matches">
            No emergency matches these filters. Try a wider date range, or clear the filters.
          </Empty>
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
