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
