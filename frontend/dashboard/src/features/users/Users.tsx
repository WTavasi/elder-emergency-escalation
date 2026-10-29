import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../../shared/api/client';
import type { Role, UserQuery, UserRow } from '../../shared/api/types';
import { Icon } from '../../shared/components/Icon';
import { Modal } from '../../shared/components/Modal';
import { Empty, ErrorNotice, Pager, Skeleton } from '../../shared/components/parts';
import { useAuth } from '../../shared/state/AuthContext';
import { useLoader } from '../../shared/hooks/useLoader';
import { downloadCsv, stamp, toCsv, type CsvColumn } from '../../shared/utils/csv';
import { UserForm } from './UserForm';

const PAGE_SIZE = 25;

const ROLES: { value: Role; label: string }[] = [
  { value: 'ELDER', label: 'Elder' },
  { value: 'CAREGIVER', label: 'Caregiver' },
  { value: 'FAMILY_MEMBER', label: 'Family member' },
  { value: 'EMERGENCY_RESPONDER', label: 'Emergency responder' },
  { value: 'ADMINISTRATOR', label: 'Administrator' },
  { value: 'COMMUNITY_RESPONDER', label: 'Community volunteer' },
];

const ROLE_LABEL = Object.fromEntries(ROLES.map((role) => [role.value, role.label])) as Record<
  Role,
  string
>;

const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const COLUMNS: CsvColumn<UserRow>[] = [
  { header: 'Name', value: (row) => row.name },
  { header: 'Phone', value: (row) => row.phone },
  { header: 'Email', value: (row) => row.email },
  { header: 'Role', value: (row) => ROLE_LABEL[row.role] },
  { header: 'Area', value: (row) => row.coverage?.areaName },
  { header: 'Radius km', value: (row) => row.coverage?.radiusKm },
  { header: 'Places in chains', value: (row) => row.chainPlaces },
  { header: 'Status', value: (row) => (row.deactivatedAt ? 'Deactivated' : 'Active') },
  { header: 'Deactivated', value: (row) => row.deactivatedAt },
  { header: 'Created', value: (row) => row.createdAt },
];

/** Waits for the typing to stop, so a search is one request rather than one per key. */
function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

type Pending =
  { kind: 'form'; user: UserRow | null } | { kind: 'deactivate'; users: UserRow[] } | null;

/**
 * Every account, and the administrator's controls over them. FR-10.
 *
 * Staff accounts, responders and administrators, are added here. Anybody can be
 * deactivated and brought back, one at a time or as a selection: a deactivated account
 * cannot sign in and is never sent an emergency. There is no delete, because every
 * account is named somewhere in emergency history that has to stay readable.
 */
export function Users() {
  const { session } = useAuth();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<UserQuery['status'] | ''>('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const q = useDebounced(search);

  const query: UserQuery = {
    q: q || undefined,
    role: role || undefined,
    status: status || undefined,
  };
  const queryKey = JSON.stringify(query);

  const fetcher = useCallback(
    () => api.users.list({ ...(JSON.parse(queryKey) as UserQuery), page, pageSize: PAGE_SIZE }),
    [queryKey, page],
  );
  const { data, error, loading, reload } = useLoader(fetcher, 'Could not load the accounts.');

  // A new search starts at the first page with nothing selected. Adjusted while
  // rendering, React's own pattern for state that follows other state, so the reset
  // happens with the new filters rather than one render later.
  const [lastKey, setLastKey] = useState(queryKey);
  if (lastKey !== queryKey) {
    setLastKey(queryKey);
    setPage(1);
    setSelected(new Set());
  }

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  const filtered = Boolean(q || role || status);

  const selectedRows = rows.filter((row) => selected.has(row.id));
  const allOnPage = rows.length > 0 && rows.every((row) => selected.has(row.id));

  function toggle(id: string) {
    setSelected((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allOnPage ? new Set() : new Set(rows.map((row) => row.id)));
  }

  async function act(work: () => Promise<{ updated: number }>, done: (count: number) => string) {
    setActionError(null);
    setMessage(null);
    try {
      const { updated } = await work();
      setMessage(done(updated));
      setSelected(new Set());
      reload();
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : 'That did not work. Try again.');
    }
  }

  const reactivate = (users: UserRow[]) =>
    void act(
      () => api.users.reactivate(users.map((user) => user.id)),
      (count) => `${count} ${count === 1 ? 'account was' : 'accounts were'} reactivated.`,
    );

  async function exportCsv() {
    setExporting(true);
    try {
      const everything = await api.users.list({ ...query, page: 1, pageSize: 1000 });
      downloadCsv(`mzazicare-users-${stamp()}.csv`, toCsv(everything.items, COLUMNS));
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : 'Could not export. Try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users</h1>
        </div>
        <button
          type="button"
          className="button--primary"
          onClick={() => setPending({ kind: 'form', user: null })}
        >
          <Icon name="personAdd" size={18} />
          Add user
        </button>
      </div>

      {message ? (
        <p className="notice" role="status">
          {message}
        </p>
      ) : null}
      {actionError ? <ErrorNotice message={actionError} /> : null}

      <div className="card grid">
        <div className="grid__toolbar" role="search">
          <label className="search" htmlFor="users-q">
            <Icon name="search" size={18} />
            <span className="visually-hidden">Search by name, phone or email</span>
            <input
              id="users-q"
              type="search"
              placeholder="Search name, phone or email"
              value={search}
              onChange={(changeEvent) => setSearch(changeEvent.target.value)}
            />
          </label>
          <label className="visually-hidden" htmlFor="users-role">
            Role
          </label>
          <select
            id="users-role"
            value={role}
            onChange={(changeEvent) => setRole(changeEvent.target.value as Role | '')}
          >
            <option value="">Every role</option>
            {ROLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="visually-hidden" htmlFor="users-status">
            Status
          </label>
          <select
            id="users-status"
            value={status}
            onChange={(changeEvent) =>
              setStatus(changeEvent.target.value as UserQuery['status'] | '')
            }
          >
            <option value="">Active and deactivated</option>
            <option value="active">Active</option>
            <option value="deactivated">Deactivated</option>
          </select>
          <button
            type="button"
            className="button--with-icon"
            style={{ marginLeft: 'auto' }}
            onClick={() => void exportCsv()}
            disabled={exporting || total === 0}
          >
            <Icon name="download" size={18} />
            {exporting ? 'Exporting' : 'Export CSV'}
          </button>
        </div>

        {selectedRows.length > 0 ? (
          <div className="grid__selection" role="region" aria-label="Selected accounts">
            <strong>{selectedRows.length} selected</strong>
            {selectedRows.some((row) => !row.deactivatedAt) ? (
              <button
                type="button"
                onClick={() =>
                  setPending({
                    kind: 'deactivate',
                    users: selectedRows.filter((row) => !row.deactivatedAt),
                  })
                }
              >
                Deactivate
              </button>
            ) : null}
            {selectedRows.some((row) => row.deactivatedAt) ? (
              <button
                type="button"
                onClick={() => reactivate(selectedRows.filter((row) => row.deactivatedAt))}
              >
                Reactivate
              </button>
            ) : null}
            <button type="button" className="button--quiet" onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="grid__body">
            <ErrorNotice message={error} onRetry={reload} />
          </div>
        ) : loading ? (
          <Skeleton rows={8} />
        ) : rows.length === 0 ? (
          <Empty icon="people" title={filtered ? 'Nobody matches' : 'No accounts yet'}>
            {filtered
              ? 'No account matches this search. Check the spelling, or clear the filters.'
              : 'Add a responder or an administrator to begin.'}
          </Empty>
        ) : (
          <div className="grid__body">
            <table>
              <thead>
                <tr>
                  <th scope="col" className="select-cell">
                    <input
                      type="checkbox"
                      aria-label="Select every account on this page"
                      checked={allOnPage}
                      onChange={toggleAll}
                    />
                  </th>
                  <th scope="col">Name</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Role</th>
                  <th scope="col">Area</th>
                  <th scope="col" className="num">
                    In chains
                  </th>
                  <th scope="col" className="center">
                    Status
                  </th>
                  <th scope="col" className="num">
                    Created
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} aria-selected={selected.has(row.id)}>
                    <td className="select-cell">
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.name}`}
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                      />
                    </td>
                    <td>
                      <strong>{row.name}</strong>
                      {row.id === session?.user.id ? <span className="micro"> (you)</span> : null}
                      <div className="micro">{row.email ?? 'No email'}</div>
                    </td>
                    <td className="figures">{row.phone}</td>
                    <td>{ROLE_LABEL[row.role]}</td>
                    <td>
                      {row.coverage ? (
                        <>
                          {row.coverage.areaName}
                          <div className="micro">
                            within <span className="figures">{row.coverage.radiusKm}</span> km
                          </div>
                        </>
                      ) : (
                        <span className="muted">&ndash;</span>
                      )}
                    </td>
                    <td className="figures num">{row.chainPlaces}</td>
                    <td className="center">
                      <span
                        className={`status status--${row.deactivatedAt ? 'deactivated' : 'active'}`}
                      >
                        {row.deactivatedAt ? 'Deactivated' : 'Active'}
                      </span>
                    </td>
                    <td className="figures num">{dateOnly.format(new Date(row.createdAt))}</td>
                    <td className="num">
                      <RowMenu
                        name={row.name}
                        items={[
                          {
                            label: 'Edit',
                            onSelect: () => setPending({ kind: 'form', user: row }),
                          },
                          row.deactivatedAt
                            ? { label: 'Reactivate', onSelect: () => reactivate([row]) }
                            : {
                                label: 'Deactivate',
                                onSelect: () => setPending({ kind: 'deactivate', users: [row] }),
                                disabled: row.id === session?.user.id,
                              },
                        ]}
                      />
                    </td>
                  </tr>
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
          onPage={(next) => {
            setPage(next);
            setSelected(new Set());
          }}
          noun="accounts"
        />
      </div>

      {pending?.kind === 'form' ? (
        <UserForm
          user={pending.user}
          onClose={() => setPending(null)}
          onSaved={(saved) => {
            setPending(null);
            setMessage(saved);
            reload();
          }}
        />
      ) : null}

      {pending?.kind === 'deactivate' ? (
        <DeactivateDialog
          users={pending.users}
          onClose={() => setPending(null)}
          onConfirm={() => {
            const users = pending.users;
            setPending(null);
            void act(
              () => api.users.deactivate(users.map((user) => user.id)),
              (count) => `${count} ${count === 1 ? 'account was' : 'accounts were'} deactivated.`,
            );
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Says what deactivating will do before it does it, naming anybody who holds places in
 * elders' chains, because their alerts will go to the next person from now on.
 */
function DeactivateDialog({
  users,
  onClose,
  onConfirm,
}: {
  users: UserRow[];
  onClose: () => void;
  onConfirm: () => void;
}) {
  const inChains = users.filter((user) => user.chainPlaces > 0);
  const one = users.length === 1 ? users[0] : null;

  return (
    <Modal
      title={one ? `Deactivate ${one.name}?` : `Deactivate ${users.length} accounts?`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button--quiet" onClick={onClose}>
            Keep {one ? 'them' : 'them all'}
          </button>
          <button type="button" className="button--primary" onClick={onConfirm}>
            Deactivate
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        {one ? 'They' : 'These accounts'} will be signed out straight away, will not be able to sign
        in, and will not be sent any emergency. Their history stays. You can reactivate{' '}
        {one ? 'the account' : 'them'} at any time.
      </p>
      {inChains.length > 0 ? (
        <p className="notice">
          {inChains.map((user) => user.name).join(', ')} {inChains.length === 1 ? 'holds' : 'hold'}{' '}
          a place in an elder&apos;s chain. From now on those alerts go straight to the next person.
        </p>
      ) : null}
    </Modal>
  );
}

interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * The three-dot menu at the end of a row.
 *
 * Placed against the window rather than inside the table, because the table scrolls
 * sideways on a narrow screen and would cut the menu off; it opens upwards when the row
 * is near the bottom of the window, and closes if the page scrolls under it.
 */
function RowMenu({ name, items }: { name: string; items: MenuItem[] }) {
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null);
  const open = place !== null;
  const box = useRef<HTMLDivElement>(null);

  function setOpen(next: boolean | ((was: boolean) => boolean)) {
    const wanted = typeof next === 'function' ? next(open) : next;
    if (!wanted) return setPlace(null);
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const menuHeight = items.length * 36 + 10;
    const below = window.innerHeight - rect.bottom > menuHeight + 8;
    setPlace({
      top: below ? rect.bottom + 4 : rect.top - menuHeight - 4,
      right: window.innerWidth - rect.right,
    });
  }

  useEffect(() => {
    if (!open) return;
    const onScroll = () => setPlace(null);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (pointerEvent: MouseEvent) => {
      if (!box.current?.contains(pointerEvent.target as Node)) setPlace(null);
    };
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') setPlace(null);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="row-menu" ref={box}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <Icon name="moreVert" label={`Actions for ${name}`} size={18} />
      </button>
      {place ? (
        <div
          className="menu menu--fixed"
          role="menu"
          style={{ top: place.top, right: place.right }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
