import { useCallback } from 'react';
import { api } from '../../shared/api/client';
import { Modal } from '../../shared/components/Modal';
import { useLoader } from '../../shared/hooks/useLoader';
import type { DataPolicy } from '../../shared/api/types';

/**
 * What this console does with personal data, one link away from anywhere: under the
 * sign-in form and in the account menu.
 *
 * The full statement of a layered notice. The short layers are where the data is: the
 * view-only marker on an emergency, and the retention line under the history. Every
 * claim here is true of the build as it stands and nothing is promised that the code
 * does not enforce; the retention figures come from the server's own settings when an
 * administrator is signed in, and are described in general terms before.
 */
export function PrivacyPanel({ onClose, signedIn }: { onClose: () => void; signedIn: boolean }) {
  const fetcher = useCallback(() => (signedIn ? api.policy() : Promise.resolve(null)), [signedIn]);
  const { data: policy } = useLoader<DataPolicy | null>(fetcher, 'Could not load the policy.');

  return (
    <Modal
      title="Privacy and data"
      onClose={onClose}
      wide
      footer={
        <button type="button" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="prose">
        <h3>What is shown here</h3>
        <ul>
          <li>
            The name of the person who raised an emergency, and where they were when they raised it.
          </li>
          <li>
            The names and roles of the people in their care chain, because the record is about who
            was asked and in what order.
          </li>
          <li>
            The severity factors behind each decision, so an escalation can be explained afterwards
            rather than taken on trust.
          </li>
          <li>Account details: names, phone numbers, email addresses and roles.</li>
        </ul>
        <p className="muted">
          Nobody&apos;s location is tracked. A place is recorded once, when an alert is raised. No
          health information is held by this system.
        </p>

        <h3>What this browser stores</h3>
        <p>
          Your sign-in, in this tab&apos;s session storage, so moving between screens does not sign
          you out. It is discarded when the tab closes. No cookies, no analytics, and no tracking of
          any kind, so there is nothing to consent to.
        </p>

        <h3>How long records are kept</h3>
        <p>{retentionSentence(policy)}</p>

        <h3>What an administrator cannot do</h3>
        <p>
          Read every record, yes; act on a live emergency, no. Taking one on, declining and closing
          belong to the people in that elder&apos;s care chain, and the server refuses them from an
          administrator account rather than this screen merely hiding the buttons.
        </p>
      </div>
    </Modal>
  );
}

/** The retention rule in one sentence, with the real figures when they are known. */
export function retentionSentence(policy: DataPolicy | null | undefined): string {
  if (!policy) {
    return 'Closed emergencies and their audit trails are deleted automatically after the period set on the server. An open emergency is never deleted.';
  }
  const { enabled, closedEmergencyDays, auditLogDays } = policy.retention;
  if (!enabled) return 'Automatic deletion is switched off on this server, so records are kept.';
  return `Closed emergencies are deleted ${closedEmergencyDays} days after they close, and audit entries after ${auditLogDays} days. An open emergency is never deleted.`;
}
