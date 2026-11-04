import { AlertTrigger, EmergencyType, EventState, Severity } from '@prisma/client';

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
  /** What is happening, when the elder or somebody helping said. */
  reportedType?: EmergencyType | null;
  /** Whether the person told is an emergency service, who always needs to know what for. */
  forService?: boolean;
}

/** The type as a word or two at the start of a title: "Fire: Grace needs help now". */
const TYPE_HEADLINE: Record<EmergencyType, string> = {
  [EmergencyType.FIRE]: 'Fire',
  [EmergencyType.UNSAFE]: 'Not safe',
  [EmergencyType.BREATHING]: 'Chest or breathing',
  [EmergencyType.FALL]: 'Fall',
  [EmergencyType.UNWELL]: 'Unwell',
};

/**
 * Types that are health information. Kept off a family member's lock screen, where
 * anybody nearby can read it, and shown inside the app instead. A service is told
 * always, because it decides what to send.
 */
const HEALTH_TYPES: ReadonlySet<EmergencyType> = new Set([
  EmergencyType.BREATHING,
  EmergencyType.FALL,
  EmergencyType.UNWELL,
]);

export interface ComposedNotification {
  title: string;
  body: string;
  sms: string;
  data: Record<string, string>;
}

/** A single SMS segment. Longer messages split, cost more and arrive out of order. */
export const SMS_LIMIT = 160;

/** The two answers an alert SMS offers when replies are on. Digits, so any phone can send them. */
export const REPLY_ASK = 'Reply 1 to go, 2 if you cannot.';

/**
 * The word an elder texts to ask for help when the app has no data. Here, beside the
 * other words texts are built from, because the elder's app is told it (through their
 * profile) and the text replies read it.
 */
export const HELP_WORD = 'HELP';

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
  const composed = composeForState(context);
  const type = context.reportedType;
  // Only on a call to act: an update that needs nothing from the reader stays as it is.
  if (!type || composed.data.action !== 'respond') return composed;
  if (!context.forService && HEALTH_TYPES.has(type)) return composed;

  const headline = TYPE_HEADLINE[type];
  const plain = composed.sms.replace(/^MzaziCare: /, '');
  return {
    ...composed,
    title: `${headline}: ${composed.title}`,
    sms: capSms(`MzaziCare: ${headline}. ${plain}`, composed.sms),
    data: { ...composed.data, type },
  };
}

function composeForState(context: NotificationContext): ComposedNotification {
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
        // call: "I'm OK" pressed by somebody else is exactly what a check-in
        // cannot rule out.
        return {
          title: `${firstName(name)} answered the check-in`,
          body: `${name} answered late and says they're OK. Call if you want to be sure.`,
          sms: capSms(
            `MzaziCare: ${name} answered the check-in late and says they're OK. Call if you want to be sure.`,
            `MzaziCare: ${firstName(name)} answered the check-in late and is OK.`,
          ),
          data: { ...data, action: 'view' },
        };
      }
      // The false alarm case. The caregiver was already told something was wrong, so
      // the correction has to reach them, and it has to invite a check rather than
      // closing the matter: an elder can cancel by mistake, or under pressure.
      return {
        title: `${firstName(name)} cancelled the alert`,
        body: `Marked as a false alarm. Call to check they're OK. No answer? Reopen the alert.`,
        sms: capSms(
          `MzaziCare: ${name} cancelled their alert as a false alarm. Please call to check they're OK.`,
          `MzaziCare: ${firstName(name)} cancelled their alert. Please call to check.`,
        ),
        data: { ...data, action: 'confirm_cancellation' },
      };

    case EventState.ESCALATED:
      if (missed) {
        // Nobody raised an alarm, so the next tier is told what actually happened.
        return {
          title: `${firstName(name)} missed a check-in`,
          body: 'No one has checked on them yet. Call or visit.',
          sms: context.replyByText
            ? capSms(
                `MzaziCare: ${name} missed today's check-in and no one has checked yet. ${REPLY_ASK}`,
                `MzaziCare: ${firstName(name)} missed a check-in. No one has checked. ${REPLY_ASK}`,
              )
            : capSms(
                `MzaziCare: ${name} missed today's check-in and no one has checked yet. Please call.`,
                `MzaziCare: ${firstName(name)} missed a check-in. No one has checked. Please call.`,
              ),
          data: { ...data, action: 'respond', trigger: AlertTrigger.MISSED_CHECK_IN },
        };
      }
      return {
        title: `${firstName(name)} still needs help`,
        body: `${name} asked for help${at}. No one has answered yet. Tap to respond.`,
        sms: context.replyByText
          ? capSms(
              `MzaziCare: ${name} still needs help${at}. No one has answered. ${REPLY_ASK} Or call 999.`,
              `MzaziCare: ${name} still needs help. ${REPLY_ASK}`,
            )
          : capSms(
              `MzaziCare: ${name} still needs help${at}. No one has answered. Please respond or call 999.`,
              `MzaziCare: ${name} still needs help. Please respond or call 999.`,
            ),
        data: { ...data, action: 'respond' },
      };

    case EventState.ACKNOWLEDGED:
      return {
        title: `Someone is on the way to ${firstName(name)}`,
        body: 'Nothing for you to do.',
        sms: capSms(
          `MzaziCare: someone is on the way to ${name}. Nothing for you to do.`,
          `MzaziCare: someone is on the way to ${firstName(name)}.`,
        ),
        data: { ...data, action: 'view' },
      };

    case EventState.ON_SCENE:
      // Reached only by a message queued before somebody arrived and sent after. It
      // must not read as a fresh call for help.
      return {
        title: `Someone is with ${firstName(name)}`,
        body: 'Nothing for you to do.',
        sms: capSms(
          `MzaziCare: someone is with ${name} now. Nothing for you to do.`,
          `MzaziCare: someone is with ${firstName(name)} now.`,
        ),
        data: { ...data, action: 'view' },
      };

    case EventState.RESOLVED:
      return {
        title: `${firstName(name)}'s alert is closed`,
        body: `${name}'s emergency is over.`,
        sms: capSms(
          `MzaziCare: ${name}'s emergency is over.`,
          `MzaziCare: ${firstName(name)}'s emergency is over.`,
        ),
        data: { ...data, action: 'view' },
      };

    default: {
      if (missed) {
        // Said for what it is: nobody pressed for help, somebody did not answer. The ask
        // is to call first, which settles most of these in a minute.
        return {
          title: `${firstName(name)} missed today's check-in`,
          body: `Call ${firstName(name)} to check on them.`,
          sms: context.replyByText
            ? capSms(
                `MzaziCare: ${name} missed today's check-in. Please call to check. ${REPLY_ASK}`,
                `MzaziCare: ${firstName(name)} missed a check-in. Please call. ${REPLY_ASK}`,
              )
            : capSms(
                `MzaziCare: ${name} missed today's check-in. Please call to check on them.`,
                `MzaziCare: ${firstName(name)} missed a check-in. Please call to check.`,
              ),
          data: { ...data, action: 'respond', trigger: AlertTrigger.MISSED_CHECK_IN },
        };
      }
      // TRIGGERED and NOTIFIED: the first time this person is told.
      const urgent = context.severity === Severity.CRITICAL;
      return {
        title: urgent ? `${firstName(name)} needs help now` : `${firstName(name)} needs help`,
        body: `${name} asked for help${at}. Tap to respond.`,
        sms: context.replyByText
          ? capSms(
              `MzaziCare: ${name} needs help${at}. ${REPLY_ASK} Cannot reach them? Call 999.`,
              `MzaziCare: ${name} needs help. ${REPLY_ASK} Or call 999.`,
            )
          : capSms(
              `MzaziCare: ${name} needs help${at}. Please respond, or call 999 if you cannot reach them.`,
              `MzaziCare: ${name} needs help. Please respond or call 999.`,
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
  /** An elder signing in with no password. Says so, so a code nobody asked for reads as a warning. */
  signInCode(code: string, minutes: number): string {
    return `${code} is your MzaziCare sign-in code. It expires in ${minutes} minutes. Do not share it with anyone who calls asking for it.`;
  },

  /** Sent to the new number when somebody moves their account to it. */
  changeNumberCode(code: string, minutes: number): string {
    return `${code} is your code to move a MzaziCare account to this number. It expires in ${minutes} minutes. If you did not ask for it, ignore this.`;
  },

  /**
   * Sent to the old number once the account has moved, so a change nobody meant to make
   * is noticed by the person who still holds the old phone.
   */
  numberChanged(): string {
    return 'The phone number on your MzaziCare account has been changed, and this number no longer signs in to it. If you did not do this, tell your caregiver or an administrator.';
  },

  alreadyRegistered(): string {
    return 'Someone tried to sign up to MzaziCare with this number. If it was you, sign in instead. If not, ignore this.';
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
      `${firstName(inviterName)} added you to ${elderName}'s MzaziCare contacts. We'll alert you if ${firstName(elderName)} needs help.`,
      `${firstName(inviterName)} added you to ${firstName(elderName)}'s MzaziCare contacts.`,
    );
  },

  /** Taken out of an elder's chain by their caregiver. */
  removedFromChain(removerName: string, elderName: string): string {
    return capSms(
      `${firstName(removerName)} removed you from ${elderName}'s MzaziCare contacts. We'll stop alerting you for ${firstName(elderName)}.`,
      `${firstName(removerName)} removed you from ${firstName(elderName)}'s MzaziCare contacts.`,
    );
  },

  /** Added to an elder's chain, with no account yet. */
  invitedToChain(inviterName: string, elderName: string): string {
    return capSms(
      `${firstName(inviterName)} added you to ${elderName}'s MzaziCare contacts. Install MzaziCare and sign up with this number to get alerts.`,
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

  /** A consent given after registration, by the elder or by a caregiver for them. */
  consentGiven(byName: string, elderName: string, what: string, byElder: boolean): string {
    const elder = firstName(elderName);
    return byElder
      ? capSms(
          `${elder} has agreed to ${what} in MzaziCare. They can change this at any time.`,
          `${elder} has agreed to ${what} in MzaziCare.`,
        )
      : capSms(
          `${firstName(byName)} has agreed to ${what} for you in MzaziCare. Open MzaziCare to read it. You can say no at any time.`,
          `${firstName(byName)} has agreed to ${what} for you. Open MzaziCare to read it.`,
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
