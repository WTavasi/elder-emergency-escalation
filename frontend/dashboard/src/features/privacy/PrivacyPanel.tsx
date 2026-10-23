import { useCallback } from 'react';
import { api } from '../../shared/api/client';
import { Modal } from '../../shared/components/Modal';
import { useLoader } from '../../shared/hooks/useLoader';
import type { DataPolicy, LegalFacts } from '../../shared/api/types';

/**
 * What this console does with personal data, one link away from anywhere: under the
 * sign-in form and in the account menu.
 *
 * The full statement of a layered notice. The short layers are where the data is: the
 * view-only marker on an emergency, and the retention line under the history. Every
 * claim here is true of the build as it stands and nothing is promised that the code
 * does not enforce; the retention figures and the data contact come from the server's
 * own settings, and are described in general terms when they cannot be loaded.
 */
// signedIn stays in the props for the callers; the panel reads the same either way now
// that the figures come from a public endpoint.
export function PrivacyPanel({ onClose }: { onClose: () => void; signedIn: boolean }) {
  // Public, so the figures and the contact are real before sign-in as well as after.
  const fetcher = useCallback(() => api.legal(), []);
  const { data: policy } = useLoader<LegalFacts>(fetcher, 'Could not load the policy.');

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

        <h3>During an open emergency</h3>
        <p>
          If an elder has withdrawn location or contact sharing, the people answering an open
          emergency still see their number, home and where the alert was raised, because protecting
          a person&apos;s life is a lawful reason on its own (vital interests). Once the emergency
          closes, the withdrawal applies again.
        </p>

        <h3>What an administrator cannot do</h3>
        <p>
          Read every record, yes; act on a live emergency, no. Taking one on, declining and closing
          belong to the people in that elder&apos;s care chain, and the server refuses them from an
          administrator account rather than this screen merely hiding the buttons.
        </p>

        <h3>Who to ask</h3>
        <p>{contactSentence(policy)}</p>
        {policy ? (
          <p className="muted">
            Privacy notice {policy.privacyVersion}. Terms of use {policy.termsVersion}.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/** The data contact as the server names it, and never one made up. */
export function contactSentence(policy: LegalFacts | null | undefined): string {
  if (!policy) return 'The data contact could not be loaded.';
  const parts = [policy.contact?.name, policy.contact?.email, policy.contact?.address].filter(
    (part): part is string => Boolean(part?.trim()),
  );
  return parts.length > 0
    ? parts.join(', ')
    : 'No data contact has been set for this server yet. It is set with DATA_CONTACT_NAME, DATA_CONTACT_EMAIL and DATA_CONTACT_ADDRESS.';
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
