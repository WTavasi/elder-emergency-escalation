import { useCallback, useState } from 'react';
import { ApiError, api } from '../../shared/api/client';
import type {
  VolunteerApplication,
  VolunteerStatus,
  VolunteerTraining,
} from '../../shared/api/types';
import { Modal } from '../../shared/components/Modal';
import { Empty, ErrorNotice, Skeleton } from '../../shared/components/parts';
import { useLoader } from '../../shared/hooks/useLoader';

export const TRAINING_LABEL: Record<VolunteerTraining, string> = {
  FIRST_AID: 'First aid',
  CPR: 'CPR',
  COMMUNITY_HEALTH_PROMOTER: 'Community Health Promoter',
  HEALTH_PROFESSIONAL: 'Health professional',
  OTHER: 'Other',
};

const STATUS_LABEL: Record<VolunteerStatus, string> = {
  PENDING: 'Waiting',
  APPROVED: 'Approved',
  REJECTED: 'Not approved',
  SUSPENDED: 'Suspended',
};

const FILTERS: { value: VolunteerStatus | undefined; label: string }[] = [
  { value: 'PENDING', label: 'Waiting' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'REJECTED', label: 'Not approved' },
  { value: undefined, label: 'All' },
];

const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

type Deciding = { volunteer: VolunteerApplication; decision: 'reject' | 'suspend' } | null;

/**
 * The vetting queue for community volunteers.
 *
 * Nobody who signs up as a volunteer is ever sent an emergency until an administrator
 * approves them here. What they say they can do is checked off the system, by seeing a
 * training card or making a call; nothing is uploaded and no ID number is kept. A
 * rejection or a suspension needs a reason, which the volunteer is sent by text.
 */
export function Volunteers() {
  const [status, setStatus] = useState<VolunteerStatus | undefined>('PENDING');
  const [deciding, setDeciding] = useState<Deciding>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetcher = useCallback(() => api.volunteers.list(status), [status]);
  const { data, error, loading, reload } = useLoader(fetcher, 'Could not load volunteers.');

  async function decide(
    volunteer: VolunteerApplication,
    decision: 'approve' | 'reject' | 'suspend',
    reason?: string,
  ) {
    setBusy(true);
    setActionError(null);
    try {
      await api.volunteers.review(volunteer.id, decision, reason);
      setMessage(
        {
          approve: `${volunteer.name} is approved and has been told by text.`,
          reject: `${volunteer.name} was not approved and has been told why.`,
          suspend: `${volunteer.name} is suspended and will not be asked to help.`,
        }[decision],
      );
      setDeciding(null);
      setNote('');
      reload();
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const rows = data ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Volunteers</h1>
          <p>
            Community volunteers are asked to go to an elder near them only once approved here, only
            while they say they are available, and only for elders who agreed to it.
          </p>
        </div>
      </div>

      {message ? (
        <p className="notice" role="status">
          {message}
        </p>
      ) : null}
      {actionError ? <ErrorNotice message={actionError} /> : null}

      <div className="card grid">
        <div className="grid__toolbar">
          <div className="segmented" role="group" aria-label="Which applications">
            {FILTERS.map((filter) => (
              <button
                key={filter.label}
                type="button"
                aria-pressed={status === filter.value}
                onClick={() => setStatus(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {loading && !data ? (
          <Skeleton rows={4} />
        ) : error ? (
          <ErrorNotice message={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <Empty title={status === 'PENDING' ? 'Nobody is waiting' : 'No volunteers here'}>
            {status === 'PENDING'
              ? 'New applications from the app appear here, oldest first.'
              : 'Try another filter.'}
          </Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Volunteer</th>
                <th scope="col">Can do</th>
                <th scope="col">Area</th>
                <th scope="col" className="center">
                  Status
                </th>
                <th scope="col" className="num">
                  Went
                </th>
                <th scope="col" className="num">
                  Applied
                </th>
                <th scope="col">
                  <span className="visually-hidden">Decision</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((volunteer) => (
                <tr key={volunteer.id}>
                  <td>
                    <strong>{volunteer.name}</strong>
                    <div className="micro mono">{volunteer.phone}</div>
                    {volunteer.email ? <div className="micro">{volunteer.email}</div> : null}
                  </td>
                  <td>
                    {volunteer.training.map((kind) => TRAINING_LABEL[kind]).join(', ')}
                    {volunteer.note ? <div className="micro">{volunteer.note}</div> : null}
                  </td>
                  <td>
                    {volunteer.area ? (
                      <>
                        {volunteer.area.label}
                        <div className="micro">
                          within <span className="mono">{volunteer.radiusKm}</span> km
                        </div>
                      </>
                    ) : (
                      <span className="muted">&ndash;</span>
                    )}
                  </td>
                  <td className="center">
                    <span
                      className={`status status--${volunteer.status === 'APPROVED' && !volunteer.deactivated ? 'active' : 'deactivated'}`}
                    >
                      {volunteer.deactivated ? 'Deactivated' : STATUS_LABEL[volunteer.status]}
                    </span>
                    {volunteer.status === 'APPROVED' ? (
                      <div className="micro">
                        {volunteer.available ? 'Available now' : 'Not available'}
                      </div>
                    ) : null}
                    {volunteer.reviewNote ? (
                      <div className="micro">&ldquo;{volunteer.reviewNote}&rdquo;</div>
                    ) : null}
                  </td>
                  <td className="mono num" title="Said they would go / reached the elder">
                    {volunteer.accepted} / {volunteer.arrived}
                  </td>
                  <td className="mono num">{dateOnly.format(new Date(volunteer.appliedAt))}</td>
                  <td className="num">
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      {volunteer.status !== 'APPROVED' ? (
                        <button
                          type="button"
                          disabled={busy || volunteer.deactivated}
                          onClick={() => void decide(volunteer, 'approve')}
                        >
                          Approve
                        </button>
                      ) : null}
                      {volunteer.status === 'PENDING' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setDeciding({ volunteer, decision: 'reject' })}
                        >
                          Do not approve
                        </button>
                      ) : null}
                      {volunteer.status === 'APPROVED' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setDeciding({ volunteer, decision: 'suspend' })}
                        >
                          Suspend
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {deciding ? (
        <Modal
          title={
            deciding.decision === 'reject'
              ? `Do not approve ${deciding.volunteer.name}?`
              : `Suspend ${deciding.volunteer.name}?`
          }
          onClose={() => {
            setDeciding(null);
            setNote('');
          }}
          footer={
            <>
              <button
                type="button"
                onClick={() => {
                  setDeciding(null);
                  setNote('');
                }}
              >
                Keep as it is
              </button>
              <button
                type="button"
                className="button--primary"
                disabled={busy || note.trim().length === 0}
                onClick={() => void decide(deciding.volunteer, deciding.decision, note.trim())}
              >
                {deciding.decision === 'reject' ? 'Do not approve' : 'Suspend'}
              </button>
            </>
          }
        >
          <label htmlFor="volunteer-note">
            Why. They are sent this by text, so write it to them.
          </label>
          <textarea
            id="volunteer-note"
            rows={3}
            maxLength={300}
            value={note}
            onChange={(changeEvent) => setNote(changeEvent.target.value)}
          />
        </Modal>
      ) : null}
    </>
  );
}
