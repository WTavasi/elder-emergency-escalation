import { AlertTrigger, EventState, Severity } from '@prisma/client';

export interface NotificationContext {
  state: EventState;
  severity: Severity;
  tier: number;
  elderName: string;
  /** Human-readable place, for example "Kileleshwa, Nairobi". May be absent. */
  addressLabel: string | null;
  eventId: string;
  /**
   * Whether the SMS invites a reply ("1 to go, 2 if you cannot"). Only when replies can
   * actually be read, so nobody is asked to answer a number that ignores them.
   */
  replyByText?: boolean;
  /** A daily check-in the elder did not answer, rather than the elder pressing for help. */
  trigger?: AlertTrigger;
}

export interface ComposedNotification {
  title: string;
  body: string;
  sms: string;
  data: Record<string, string>;
}

/** A single SMS segment. Longer messages split, cost more and arrive out of order. */
export const SMS_LIMIT = 160;

/** The two answers an alert SMS offers when replies are on. Digits, so any phone can send them. */
export const REPLY_ASK = 'Reply 1 if you can go, 2 if you cannot.';

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

  const missed = context.trigger === AlertTrigger.MISSED_CHECK_IN;

  switch (context.state) {
    case EventState.CANCELLED:
      if (missed) {
        // Withdrawn because the elder answered the check-in late. Still an invitation to
        // call: "I am all right" pressed by somebody else is exactly what a check-in
        // cannot rule out.
        return {
          title: `${firstName(name)} answered the check-in`,
          body: `${name} answered late and says they are all right. Call if you want to be sure.`,
          sms: capSms(
            `MzaziCare: ${name} answered the check-in late and says they are all right. Call if you want to be sure.`,
            `MzaziCare: ${firstName(name)} answered the check-in late and is all right.`,
          ),
          data: { ...data, action: 'view' },
        };
      }
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
      if (missed) {
        // Nobody raised an alarm, so the next tier is told what actually happened.
        return {
          title: `Still unanswered: ${firstName(name)} missed a check-in`,
          body: `${name} did not answer the daily check-in and nobody has checked on them yet. Please call or go round.`,
          sms: context.replyByText
            ? capSms(
                `MzaziCare: ${name} did not answer today's check-in and nobody has checked yet. ${REPLY_ASK}`,
                `MzaziCare: ${firstName(name)} missed a check-in, nobody has checked. ${REPLY_ASK}`,
              )
            : capSms(
                `MzaziCare: ${name} did not answer today's check-in and nobody has checked on them yet. Please call.`,
                `MzaziCare: ${firstName(name)} missed a check-in and nobody has checked. Please call.`,
              ),
          data: { ...data, action: 'respond', trigger: AlertTrigger.MISSED_CHECK_IN },
        };
      }
      return {
        title: `Still unanswered: ${firstName(name)} needs help`,
        body: `Nobody has responded to ${name}'s alert${at}. Open MzaziCare to respond.`,
        sms: context.replyByText
          ? capSms(
              `MzaziCare: nobody has answered ${name}'s alert${at} yet. ${REPLY_ASK} Or call 999.`,
              `MzaziCare: ${name} still needs help. ${REPLY_ASK}`,
            )
          : capSms(
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

    case EventState.ON_SCENE:
      // Reached only by a message queued before somebody arrived and sent after. It
      // must not read as a fresh call for help.
      return {
        title: `Someone is with ${firstName(name)}`,
        body: `A member of ${name}'s care circle is with them now. No action needed from you.`,
        sms: capSms(
          `MzaziCare: someone is with ${name} now. No action needed from you.`,
          `MzaziCare: someone is with ${firstName(name)} now.`,
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
      if (missed) {
        // Said for what it is: nobody pressed for help, somebody did not answer. The ask
        // is to call first, which settles most of these in a minute.
        return {
          title: `${firstName(name)} did not answer today's check-in`,
          body: `${name} did not answer the daily check-in. Please call to check on them.`,
          sms: context.replyByText
            ? capSms(
                `MzaziCare: ${name} did not answer today's check-in. Please call to check. ${REPLY_ASK}`,
                `MzaziCare: ${firstName(name)} missed a check-in. Please call. ${REPLY_ASK}`,
              )
            : capSms(
                `MzaziCare: ${name} did not answer today's check-in. Please call to check on them.`,
                `MzaziCare: ${firstName(name)} missed a check-in. Please call to check.`,
              ),
          data: { ...data, action: 'respond', trigger: AlertTrigger.MISSED_CHECK_IN },
        };
      }
      // TRIGGERED and NOTIFIED: the first time this person is told.
      const urgent = context.severity === Severity.CRITICAL;
      return {
        title: urgent ? `${firstName(name)} needs help now` : `${firstName(name)} needs help`,
        body: `${name} raised an emergency alert${at}. Open MzaziCare to respond.`,
        sms: context.replyByText
          ? capSms(
              `MzaziCare: ${name} raised an emergency alert${at}. ${REPLY_ASK} Call 999 if you cannot reach them.`,
              `MzaziCare: ${name} needs help. ${REPLY_ASK} Or call 999.`,
            )
          : capSms(
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
