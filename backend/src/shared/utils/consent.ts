import { ConsentType } from '@prisma/client';

/** The parts of a consent record that decide what may be shown. */
export interface ConsentState {
  type: ConsentType;
  withdrawnAt: Date | null;
}

/** Prisma select for the consent records about a person, for use in an include. */
export const CONSENT_STATE_SELECT = { select: { type: true, withdrawnAt: true } } as const;

/**
 * The consents a person has withdrawn.
 *
 * A type is withdrawn when it was recorded and none of its records is still active. A
 * type never recorded at all is not withdrawn: an account created before consent was
 * recorded has simply never been asked, and the absence of a record is not a refusal.
 */
export function withdrawnConsents(rows: ConsentState[]): Set<ConsentType> {
  const withdrawn = new Set<ConsentType>();
  for (const type of Object.values(ConsentType)) {
    const ofType = rows.filter((row) => row.type === type);
    if (ofType.length > 0 && ofType.every((row) => row.withdrawnAt !== null)) {
      withdrawn.add(type);
    }
  }
  return withdrawn;
}

/** What may be shown about an elder to one particular viewer, at one particular time. */
export interface Disclosure {
  /** The elder's own phone number. */
  phone: boolean;
  /** The elder's home, any temporary stay, and where an emergency was. */
  location: boolean;
}

/**
 * What a withdrawn consent hides, and when it does not.
 *
 * The elder always sees their own data. During an open emergency everybody responding
 * sees the elder's number and whereabouts whatever was withdrawn: that is processing to
 * protect the person's vital interests, a ground the Data Protection Act provides apart
 * from consent, and the privacy notice says so. Outside an emergency a withdrawal is
 * honoured everywhere: in the care circle's screens, in closed alerts and in history.
 */
export function disclosureFor(
  rows: ConsentState[],
  context: { viewerIsSubject: boolean; emergencyOpen: boolean },
): Disclosure {
  if (context.viewerIsSubject || context.emergencyOpen) return { phone: true, location: true };

  const withdrawn = withdrawnConsents(rows);
  // Withdrawing the processing everything depends on withdraws the rest with it.
  const everything = withdrawn.has(ConsentType.DATA_PROCESSING);
  return {
    phone: !everything && !withdrawn.has(ConsentType.CONTACT_SHARING),
    location: !everything && !withdrawn.has(ConsentType.LOCATION_SHARING),
  };
}
