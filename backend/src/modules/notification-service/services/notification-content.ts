import { EventState, Severity } from '@prisma/client';

export interface NotificationContext {
  state: EventState;
  severity: Severity;
  tier: number;
  elderName: string;
  /** Human-readable place, for example "Kileleshwa, Nairobi". May be absent. */
  addressLabel: string | null;
  eventId: string;
}

export interface ComposedNotification {
  title: string;
  body: string;
  sms: string;
  data: Record<string, string>;
}

/** A single SMS segment. Longer messages split, cost more and arrive out of order. */
export const SMS_LIMIT = 160;

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;

/**
 * What each notification says.
 *
 * The wording follows the rules in the design language, and they are not stylistic. The
 * system cannot promise a response time, is not monitoring anyone, and is not a
 * substitute for emergency services, so it never says otherwise. Every message names
 * what happened and what the reader can do about it.
 */
export function composeNotification(context: NotificationContext): ComposedNotification {
  const name = context.elderName;
  const place = context.addressLabel;
  const at = place ? ` at ${place}` : '';

  const data: Record<string, string> = {
    eventId: context.eventId,
    state: context.state,
    tier: String(context.tier),
  };

  switch (context.state) {
    case EventState.CANCELLED:
      // The false alarm case. The caregiver was already told something was wrong, so
      // the correction has to reach them, and it has to invite a check rather than
      // closing the matter: an elder can cancel by mistake, or under pressure.
      return {
        title: `${firstName(name)} cancelled the alert`,
        body: `${name} marked it a false alarm. Call to check that all is well. If you cannot reach them, you can reopen the alert.`,
        sms: capSms(
          `MzaziCare: ${name} cancelled their emergency alert and marked it a false alarm. Please call to check.`,
          `MzaziCare: ${firstName(name)} cancelled their alert. Please call to check.`,
        ),
        data: { ...data, action: 'confirm_cancellation' },
      };

    case EventState.ESCALATED:
      return {
        title: `Still unanswered: ${firstName(name)} needs help`,
        body: `Nobody has responded to ${name}'s alert${at}. Open MzaziCare to respond.`,
        sms: capSms(
          `MzaziCare: ${name} raised an emergency alert${at} and nobody has responded yet. Please respond or call 999.`,
          `MzaziCare: ${name} needs help and nobody has responded. Please respond or call 999.`,
        ),
        data: { ...data, action: 'respond' },
      };

    case EventState.ACKNOWLEDGED:
      return {
        title: `Someone is responding to ${firstName(name)}'s alert`,
        body: `${name}'s emergency has been acknowledged. No action needed from you.`,
        sms: capSms(
          `MzaziCare: ${name}'s emergency alert has been acknowledged. No action needed from you.`,
          `MzaziCare: ${firstName(name)}'s alert has been acknowledged.`,
        ),
        data: { ...data, action: 'view' },
      };

    case EventState.RESOLVED:
      return {
        title: `${firstName(name)}'s alert is closed`,
        body: `The emergency for ${name} has been resolved.`,
        sms: capSms(
          `MzaziCare: the emergency for ${name} has been resolved.`,
          `MzaziCare: ${firstName(name)}'s emergency is resolved.`,
        ),
        data: { ...data, action: 'view' },
      };

    default: {
      // TRIGGERED and NOTIFIED: the first time this person is told.
      const urgent = context.severity === Severity.CRITICAL;
      return {
        title: urgent ? `${firstName(name)} needs help now` : `${firstName(name)} needs help`,
        body: `${name} raised an emergency alert${at}. Open MzaziCare to respond.`,
        sms: capSms(
          `MzaziCare: ${name} raised an emergency alert${at}. Please respond, or call 999 if you cannot reach them.`,
          `MzaziCare: ${name} raised an emergency alert. Please respond or call 999.`,
        ),
        data: { ...data, action: 'respond' },
      };
    }
  }
}

/**
 * Keeps an SMS to one segment.
 *
 * Falls back to a shorter wording rather than truncating, because a message cut off
 * mid-sentence can lose the very instruction it exists to deliver. If even the short
 * form is too long, which needs an extraordinary name, it is trimmed on a word boundary.
 */
export function capSms(preferred: string, shorter: string): string {
  if (preferred.length <= SMS_LIMIT) return preferred;
  if (shorter.length <= SMS_LIMIT) return shorter;

  const trimmed = shorter.slice(0, SMS_LIMIT - 1);
  const lastSpace = trimmed.lastIndexOf(' ');
  return `${lastSpace > SMS_LIMIT / 2 ? trimmed.slice(0, lastSpace) : trimmed}…`;
}

/**
 * Messages about accounts rather than emergencies: sign-up codes and being added to
 * somebody's chain. Kept here with the emergency wording so every word the system
 * sends to a phone is in one file.
 *
 * None of them carries a link. A link in an unexpected SMS is what phishing looks like,
 * and anybody who needs the app can find it by name.
 */
export const accountMessages = {
  /** The sign-up code. The code leads, so a phone's notification preview shows it. */
  verificationCode(code: string, minutes: number): string {
    return `${code} is your MzaziCare code. It expires in ${minutes} minutes. Do not share it with anyone.`;
  },

  /**
   * The password reset code. Says what it is for, so a code nobody asked for reads as a
   * warning rather than a puzzle, and says the password is unchanged, so nobody panics.
   */
  resetCode(code: string, minutes: number): string {
    return `${code} is your MzaziCare password reset code. It expires in ${minutes} minutes. If you did not ask for it, ignore this: your password has not changed.`;
  },

  /**
   * Somebody asked for a code for a number that already has an account. Sent to that
   * number, so the person who asked learns nothing, and the owner learns that somebody
   * tried.
   */
  alreadyRegistered(): string {
    return 'Somebody tried to create a MzaziCare account with this number, which already has one. If it was you, sign in instead. If not, you can ignore this.';
  },

  /**
   * A staff account made by an administrator. No password and no link: the first
   * password comes from the administrator in person.
   */
  staffAccountCreated(role: 'EMERGENCY_RESPONDER' | 'ADMINISTRATOR'): string {
    return role === 'ADMINISTRATOR'
      ? 'A MzaziCare administrator account has been made for this number. Sign in to the MzaziCare console with the password your administrator gives you.'
      : 'A MzaziCare emergency responder account has been made for this number. Sign in to the MzaziCare app with the password your administrator gives you.';
  },

  /** Added to an elder's chain, with an account already. */
  addedToChain(inviterName: string, elderName: string): string {
    return capSms(
      `${firstName(inviterName)} added you to ${elderName}'s MzaziCare emergency contacts. You will be alerted if ${firstName(elderName)} asks for help.`,
      `${firstName(inviterName)} added you to ${firstName(elderName)}'s MzaziCare emergency contacts.`,
    );
  },

  /** Taken out of an elder's chain by their caregiver. */
  removedFromChain(removerName: string, elderName: string): string {
    return capSms(
      `${firstName(removerName)} removed you from ${elderName}'s MzaziCare emergency contacts. You will no longer be alerted for ${firstName(elderName)}.`,
      `${firstName(removerName)} removed you from ${firstName(elderName)}'s MzaziCare emergency contacts.`,
    );
  },

  /** Added to an elder's chain, with no account yet. */
  invitedToChain(inviterName: string, elderName: string): string {
    return capSms(
      `${firstName(inviterName)} added you to ${elderName}'s MzaziCare emergency contacts. Install the MzaziCare app and sign up with this number to be alerted.`,
      `${firstName(inviterName)} added you to ${firstName(elderName)}'s MzaziCare contacts. Sign up in the MzaziCare app with this number.`,
    );
  },

  /**
   * A consent about an elder was withdrawn. Sent to their caregivers, and to the elder
   * when somebody else withdrew it, so nobody learns of it by finding a blank screen.
   * `what` names the consent, such as "location sharing".
   */
  consentWithdrawn(byName: string, elderName: string, what: string, byElder: boolean): string {
    const elder = firstName(elderName);
    const action = byElder
      ? `${elder} has withdrawn consent to ${what} in MzaziCare.`
      : `${firstName(byName)} has withdrawn ${elder}'s consent to ${what} in MzaziCare.`;
    return capSms(
      `${action} In an emergency, responders still see what they need to reach ${elder}.`,
      action,
    );
  },

  /** Consent to processing was withdrawn, which ends the service for that elder. */
  serviceEnded(byName: string, elderName: string, byElder: boolean): string {
    const elder = firstName(elderName);
    const action = byElder
      ? `${elder} has withdrawn consent for MzaziCare to hold their information.`
      : `${firstName(byName)} has withdrawn ${elder}'s consent for MzaziCare to hold their information.`;
    return capSms(
      `${action} ${elder} can no longer raise an alert. An administrator can restore the account.`,
      `${action} Alerts are now off for ${elder}.`,
    );
  },
};
