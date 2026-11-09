import { useCallback, useState } from 'react';
import { ApiError, api } from '../../shared/api/client';
import type { ChainView, UserRow } from '../../shared/api/types';
import { Modal } from '../../shared/components/Modal';
import { ErrorNotice, Skeleton } from '../../shared/components/parts';
import { useLoader } from '../../shared/hooks/useLoader';

const GROUP: string[] = ['Asked first', 'Asked next', 'Asked after that'];

/**
 * Who is asked first for one elder, for an administrator: each person in the circle at a
 * group, everybody in a group asked at once. The whole order is saved together, and the
 * elder and anybody moved are told by text. Emergency services are always asked last
 * and are not listed.
 */
export function ChainOrder({
  elder,
  onClose,
  onSaved,
}: {
  elder: UserRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const fetcher = useCallback(() => api.chains.get(elder.id), [elder.id]);
  const { data, error, loading, reload } = useLoader<ChainView>(
    fetcher,
    'Could not load their contacts.',
  );
  const [tiers, setTiers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const people = (data?.entries ?? []).filter((entry) => entry.movable);
  const tierOf = (id: string, fallback: number) => tiers[id] ?? fallback;
  const changed = people.some((entry) => tierOf(entry.id, entry.tier) !== entry.tier);

  async function save() {
    setBusy(true);
    setFailure(null);
    try {
      await api.chains.reorder(
        elder.id,
        Object.fromEntries(people.map((entry) => [entry.id, tierOf(entry.id, entry.tier)])),
      );
      onSaved(`${elder.name}'s contacts are in the new order. They and anyone moved were told.`);
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.message : 'Could not save. Try again.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Who is asked first for ${elder.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button--primary"
            disabled={!changed || busy}
            onClick={() => void save()}
          >
            {busy ? 'Saving' : 'Save order'}
          </button>
        </>
      }
    >
      <p className="muted">
        Everyone in a group is asked at the same time. If nobody answers, the next group is asked,
        and after them the emergency services near {elder.name.split(' ')[0]}.
      </p>
      {failure ? <ErrorNotice message={failure} /> : null}
      {loading && !data ? (
        <Skeleton rows={3} />
      ) : error ? (
        <ErrorNotice message={error} onRetry={reload} />
      ) : people.length === 0 ? (
        <p className="muted">Nobody in their circle can be moved.</p>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Group</th>
            </tr>
          </thead>
          <tbody>
            {people.map((entry) => (
              <tr key={entry.id}>
                <td>
                  {entry.name}
                  {entry.status === 'invited' ? (
                    <span className="micro muted block">Invited, not signed up yet</span>
                  ) : null}
                </td>
                <td>
                  <select
                    aria-label={`Group for ${entry.name}`}
                    value={tierOf(entry.id, entry.tier)}
                    onChange={(event) =>
                      setTiers((current) => ({
                        ...current,
                        [entry.id]: Number(event.target.value),
                      }))
                    }
                  >
                    {(data?.personTiers ?? [1, 2]).map((tier, index) => (
                      <option key={tier} value={tier}>
                        {GROUP[index] ?? `Group ${tier}`}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
