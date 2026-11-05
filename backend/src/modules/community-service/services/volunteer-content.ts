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
 * How far a volunteer is: by road when a router measured it, else the straight line.
 * A distance rather than a time, because a volunteer may walk, ride or drive.
 */
export interface Away {
  distanceMetres: number;
  byRoad: boolean;
}

/** "about 1.8 km away by road", or "about 1.2 km away" for the straight line. */
export function howFarAway(away: Away): string {
  return `${roughDistance(away.distanceMetres)} away${away.byRoad ? ' by road' : ''}`;
}

/**
 * The words a volunteer reads.
 *
 * Before they accept, nothing says who or where: not the name, not the street, not a
 * point on a map. A volunteer is a stranger to the elder until they say they will go, and
 * the disclosure is the price of going, not of being asked. The distance is measured from
 * the centre of their own area, by road when a router could, and rounded, so it says how
 * far without saying where.
 */
export const volunteerMessages = {
  ask(eventId: string, away: Away, severity: Severity, replies: boolean): VolunteerMessage {
    const far = howFarAway(away);
    const urgent = severity === Severity.CRITICAL;
    return {
      title: urgent ? 'Urgent: someone near you needs help' : 'Someone near you needs help',
      body: `An older person ${far} needs help. Can you go?`,
      sms: replies
        ? capSms(
            `MzaziCare: an older person ${far} needs help. Reply 1 to go, 2 if you cannot.`,
            `MzaziCare: someone ${far} needs help. Reply 1 to go, 2 if not.`,
          )
        : capSms(
            `MzaziCare: an older person ${far} needs help. Can you go? Open MzaziCare to answer.`,
            `MzaziCare: someone ${far} needs help. Open MzaziCare.`,
          ),
      data: { type: 'volunteer-call', eventId },
    };
  },

  /** The one who accepted is no longer going, so the others are asked again. */
  stillNeeded(eventId: string, away: Away): VolunteerMessage {
    const far = howFarAway(away);
    return {
      title: 'Still needed nearby',
      body: `The volunteer who was going cannot. An older person ${far} still needs help. Can you go?`,
      sms: capSms(
        `MzaziCare: the volunteer who was going cannot. An older person ${far} still needs help. Open MzaziCare to answer.`,
        `MzaziCare: still needed, someone ${far}. Open MzaziCare.`,
      ),
      data: { type: 'volunteer-call', eventId },
    };
  },

  /** Somebody else accepted first. */
  covered(eventId: string): VolunteerMessage {
    return {
      title: 'Someone else is going',
      body: 'Another volunteer is going. Thanks for being ready.',
      sms: 'MzaziCare: another volunteer is going. Thanks for being ready.',
      data: { type: 'volunteer-call', eventId },
    };
  },

  /** The emergency closed before this volunteer was needed, or while they were going. */
  over(eventId: string, wasGoing: boolean, elderName: string): VolunteerMessage {
    const text = wasGoing
      ? `${firstName(elderName)}'s emergency is closed. Thank you for going.`
      : "You're no longer needed for that emergency. Thanks for being ready.";
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
      `MzaziCare: thanks. ${elderName}${where}. Phone ${phone}. We've told their family you're coming.`,
      `MzaziCare: thank you. ${firstName(elderName)}${where}. Phone ${phone}.`,
    );
  },

  /** To the people already told about the emergency. */
  toTheCircle(volunteerName: string, elderName: string, away: Away): VolunteerMessage {
    const text = `${volunteerName}, a checked volunteer ${howFarAway(away)}, is going to ${firstName(elderName)}. We'll still ask you as usual.`;
    return {
      title: `A volunteer is going to ${firstName(elderName)}`,
      body: text,
      sms: capSms(
        `MzaziCare: ${text}`,
        `MzaziCare: ${firstName(volunteerName)}, a volunteer, is going to ${firstName(elderName)}.`,
      ),
      data: { type: 'volunteer-update' },
    };
  },
};
