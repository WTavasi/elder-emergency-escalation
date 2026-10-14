import { useCallback, useState } from 'react';
import { ApiError, api, type AlertQuery } from '../../shared/api/client';
import type { AlertSummary, EventState, Severity } from '../../shared/api/types';
import { Icon } from '../../shared/components/Icon';
import { AlertRow, Empty, ErrorNotice, Pager, Skeleton } from '../../shared/components/parts';
import { useLoader } from '../../shared/hooks/useLoader';
import { downloadCsv, stamp, toCsv, type CsvColumn } from '../../shared/utils/csv';

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

const PAGE_SIZE = 50;
/** The most an export will fetch, two hundred at a time. */
const EXPORT_LIMIT = 5000;

interface Filters {
  q: string;
  state: EventState | '';
  severity: Severity | '';
  from: string;
  to: string;
}

const NO_FILTERS: Filters = { q: '', state: '', severity: '', from: '', to: '' };

function toQuery(filters: Filters): AlertQuery {
  return {
    q: filters.q || undefined,
    state: filters.state ? [filters.state] : undefined,
    severity: filters.severity ? [filters.severity] : undefined,
    from: filters.from ? new Date(filters.from).toISOString() : undefined,
    // An end date means the whole of that day, which is what a person filling in a
    // date field means by it.
    to: filters.to ? new Date(`${filters.to}T23:59:59.999`).toISOString() : undefined,
  };
}

const COLUMNS: CsvColumn<AlertSummary>[] = [
  { header: 'Raised', value: (row) => row.triggeredAt },
  { header: 'Elder', value: (row) => row.elder.name },
  { header: 'Place', value: (row) => row.addressLabel },
  { header: 'State', value: (row) => row.state },
  { header: 'Severity', value: (row) => row.severity },
  { header: 'Severity score', value: (row) => row.severityScore },
  { header: 'Tier', value: (row) => row.currentTier },
  { header: 'Answered by', value: (row) => row.acknowledgedBy?.name },
  { header: 'Answered by role', value: (row) => row.acknowledgedBy?.role },
  { header: 'Response seconds', value: (row) => row.responseSeconds },
  { header: 'Outcome', value: (row) => row.outcome },
  { header: 'Outcome note', value: (row) => row.outcomeNote },
  { header: 'Closed', value: (row) => row.resolvedAt },
];

/**
 * The searchable record, a page at a time.
 *
 * Every filter, the name search included, is applied by the API rather than in the
 * browser. Fetching everything and hiding most of it would put emergencies this operator
 * did not ask to see into the page, which is the opposite of collecting only what is
 * needed.
 *
 * Read-only, like the rest of the console over emergencies: no selection, no row actions.
 * What an administrator does with history is look things up and take it away to read,
 * which is what the search and the export are for.
 */
export function History() {
  const [form, setForm] = useState<Filters>(NO_FILTERS);

  // The filters the last search actually ran with. Kept apart from the form fields so
  // that typing does not fire a query on every keystroke: the query changes when the
  // operator submits.
  const [applied, setApplied] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const fetcher = useCallback(
    () => api.alertPage({ ...toQuery(applied), limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    [applied, page],
  );

  const {
    data: result,
    error,
    loading,
    reload,
  } = useLoader(fetcher, 'Could not load the emergency history.');

  const total = result?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  const filtered = JSON.stringify(applied) !== JSON.stringify(NO_FILTERS);

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setForm((was) => ({ ...was, [key]: value }));
  }

  function apply(next: Filters) {
    setApplied(next);
    setPage(1);
  }

  /** Every match for the applied filters, two hundred at a time, as one file. */
  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      const rows: AlertSummary[] = [];
      for (let offset = 0; offset < EXPORT_LIMIT; offset += 200) {
        const chunk = await api.alertPage({ ...toQuery(applied), limit: 200, offset });
        rows.push(...chunk.items);
        if (rows.length >= chunk.total || chunk.items.length < 200) break;
      }
      downloadCsv(`mzazicare-history-${stamp()}.csv`, toCsv(rows, COLUMNS));
    } catch (caught) {
      setExportError(caught instanceof ApiError ? caught.message : 'Could not export. Try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Emergency history</h1>
          <p>Every emergency on record, newest first.</p>
        </div>
        <button
          type="button"
          className="button--with-icon"
          onClick={() => void exportCsv()}
          disabled={exporting || total === 0}
        >
          <Icon name="download" size={18} />
          {exporting ? 'Exporting' : 'Export CSV'}
        </button>
      </div>

      {exportError ? <ErrorNotice message={exportError} /> : null}

      <div className="card grid">
        <form
          className="grid__toolbar"
          role="search"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            apply(form);
          }}
        >
          <label className="search" htmlFor="filter-q">
            <Icon name="search" size={18} />
            <span className="visually-hidden">Search by elder name</span>
            <input
              id="filter-q"
              type="search"
              placeholder="Search by elder name"
              value={form.q}
              onChange={(changeEvent) => set('q', changeEvent.target.value)}
            />
          </label>

          <label className="visually-hidden" htmlFor="filter-state">
            State
          </label>
          <select
            id="filter-state"
            value={form.state}
            onChange={(changeEvent) => set('state', changeEvent.target.value as EventState | '')}
          >
            <option value="">Any state</option>
            {STATES.map((value) => (
              <option key={value} value={value}>
                {STATE_OPTION[value]}
              </option>
            ))}
          </select>

          <label className="visually-hidden" htmlFor="filter-severity">
            Severity
          </label>
          <select
            id="filter-severity"
            value={form.severity}
            onChange={(changeEvent) => set('severity', changeEvent.target.value as Severity | '')}
          >
            <option value="">Any severity</option>
            {SEVERITIES.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0) + value.slice(1).toLowerCase()}
              </option>
            ))}
          </select>

          <span className="grid__dates">
            <label className="visually-hidden" htmlFor="filter-from">
              Raised on or after
            </label>
            <input
              id="filter-from"
              type="date"
              value={form.from}
              title="Raised on or after"
              onChange={(changeEvent) => set('from', changeEvent.target.value)}
            />
            <span className="muted" aria-hidden="true">
              to
            </span>
            <label className="visually-hidden" htmlFor="filter-to">
              Raised on or before
            </label>
            <input
              id="filter-to"
              type="date"
              value={form.to}
              title="Raised on or before"
              onChange={(changeEvent) => set('to', changeEvent.target.value)}
            />
          </span>

          <button type="submit">Apply</button>
          {filtered ? (
            <button
              type="button"
              className="button--quiet"
              onClick={() => {
                setForm(NO_FILTERS);
                apply(NO_FILTERS);
              }}
            >
              Clear
            </button>
          ) : null}
        </form>

        {error ? (
          <div className="grid__body">
            <ErrorNotice message={error} onRetry={reload} />
          </div>
        ) : loading ? (
          <Skeleton rows={8} />
        ) : !result || result.items.length === 0 ? (
          <Empty icon="inbox" title={filtered ? 'Nothing matches' : 'No emergencies yet'}>
            {filtered
              ? 'No emergency matches these filters. Try a wider date range, or clear the filters.'
              : 'Every emergency raised will be listed here, newest first.'}
          </Empty>
        ) : (
          <div className="grid__body">
            <table>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Waiting</span>
                  </th>
                  <th scope="col">Elder</th>
                  <th scope="col" className="center">
                    State
                  </th>
                  <th scope="col" className="center">
                    Severity
                  </th>
                  <th scope="col" className="num">
                    Tier
                  </th>
                  <th scope="col">Answered by</th>
                  <th scope="col" className="num">
                    Response time
                  </th>
                  <th scope="col" className="num">
                    Raised
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((alert) => (
                  <AlertRow key={alert.eventId} alert={alert} live={false} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pager
          first={first}
          last={last}
          total={total}
          page={page}
          pages={pages}
          onPage={setPage}
          noun="emergencies"
        />
      </div>
    </>
  );
}
