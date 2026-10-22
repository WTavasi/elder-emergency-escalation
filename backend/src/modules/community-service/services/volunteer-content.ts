import { Severity } from '@prisma/client';
import { capSms } from '../../notification-service/services/notification-content';

/** What one message to a volunteer says, by push and by text. */
export interface VolunteerMessage {
  title: string;
  body: string;
  sms: string;
  data: Record<string, string>;
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;

/** "about 600 m", "about 1.2 km". Rounded, because the point is how far, not where. */
export function roughDistance(metres: number): string {
  if (metres < 1000) return `about ${Math.max(50, Math.round(metres / 50) * 50)} m`;
  return `about ${(Math.round(metres / 100) / 10).toFixed(1).replace(/\.0$/, '')} km`;
}

/**
 * The words a volunteer reads.
 *
 * Before they accept, nothing says who or where: not the name, not the street, not a
 * point on a map. A volunteer is a stranger to the elder until they say they will go, and
 * the disclosure is the price of going, not of being asked. The distance is measured from
 * the centre of their own area, rounded, so it says how far without saying where.
 */
export const volunteerMessages = {
  ask(
    eventId: string,
    distanceMetres: number,
    severity: Severity,
    replies: boolean,
  ): VolunteerMessage {
    const far = roughDistance(distanceMetres);
    const urgent = severity === Severity.CRITICAL;
    return {
      title: urgent ? 'Urgent: someone near you needs help' : 'Someone near you needs help',
      body: `An older person ${far} away needs help. Open MzaziCare to say whether you can go.`,
      sms: replies
        ? capSms(
            `MzaziCare: an older person ${far} away needs help. Reply 1 if you can go, 2 if you cannot.`,
            `MzaziCare: someone ${far} away needs help. Reply 1 to go, 2 if not.`,
          )
        : capSms(
            `MzaziCare: an older person ${far} away needs help. Open MzaziCare to say whether you can go.`,
            `MzaziCare: someone ${far} away needs help. Open MzaziCare.`,
          ),
      data: { type: 'volunteer-call', eventId },
    };
  },

  /** The one who accepted is no longer going, so the others are asked again. */
  stillNeeded(eventId: string, distanceMetres: number): VolunteerMessage {
    const far = roughDistance(distanceMetres);
    return {
      title: 'Still needed nearby',
      body: `The volunteer who was going cannot. An older person ${far} away still needs help.`,
      sms: capSms(
        `MzaziCare: the volunteer who was going cannot. An older person ${far} away still needs help. Open MzaziCare to say whether you can go.`,
        `MzaziCare: still needed, someone ${far} away. Open MzaziCare.`,
      ),
      data: { type: 'volunteer-call', eventId },
    };
  },

  /** Somebody else accepted first. */
  covered(eventId: string): VolunteerMessage {
    return {
      title: 'Someone else is going',
      body: 'Another volunteer is on the way. Thank you for being ready.',
      sms: 'MzaziCare: another volunteer is on the way. Thank you for being ready.',
      data: { type: 'volunteer-call', eventId },
    };
  },

  /** The emergency closed before this volunteer was needed, or while they were going. */
  over(eventId: string, wasGoing: boolean, elderName: string): VolunteerMessage {
    const text = wasGoing
      ? `${firstName(elderName)}'s emergency has been closed. Thank you for going.`
      : 'You are no longer needed for that emergency. Thank you for being ready.';
    return {
      title: wasGoing ? 'The emergency is closed' : 'No longer needed',
      body: text,
      sms: capSms(`MzaziCare: ${text}`, `MzaziCare: no longer needed. Thank you.`),
      data: { type: 'volunteer-call', eventId },
    };
  },

  /** To the one who accepted by text: who and where, as the app would show them. */
  acceptedByText(elderName: string, addressLabel: string | null, phone: string): string {
    const where = addressLabel ? ` at ${addressLabel}` : '';
    return capSms(
      `MzaziCare: thank you. ${elderName}${where}. Phone ${phone}. Their family has been told you are coming.`,
      `MzaziCare: thank you. ${firstName(elderName)}${where}. Phone ${phone}.`,
    );
  },

  /** To the people already told about the emergency. */
  toTheCircle(volunteerName: string, elderName: string, distanceMetres: number): VolunteerMessage {
    const text = `${volunteerName}, a vetted community volunteer ${roughDistance(distanceMetres)} away, is going to ${firstName(elderName)}. Nothing else changes for you.`;
    return {
      title: `A volunteer is going to ${firstName(elderName)}`,
      body: text,
      sms: capSms(
        `MzaziCare: ${text}`,
        `MzaziCare: ${firstName(volunteerName)}, a community volunteer, is going to ${firstName(elderName)}.`,
      ),
      data: { type: 'volunteer-update' },
    };
  },
};
