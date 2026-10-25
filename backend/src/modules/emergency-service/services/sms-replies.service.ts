import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { RedisService } from '../../../shared/redis/redis.service';
import { AWAITING_STATES, OPEN_STATES } from '../../../shared/utils/event-lifecycle';
import { redactPhone } from '../../../shared/utils/redaction';
import { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import { CheckInsService } from '../../check-in-service/services/check-ins.service';
import { VolunteerCallsService } from '../../community-service/services/volunteer-calls.service';
import {
  capSms,
  HELP_WORD,
  REPLY_ASK,
} from '../../notification-service/services/notification-content';
import { AlertsService } from './alerts.service';
import { EscalationService } from './escalation.service';

/** What a reply asks for. */
export type ReplyIntent = 'accept' | 'decline' | 'unclear';

/** What became of one reply, for the log and the tests. Nothing here is shown to anyone. */
export type ReplyOutcome =
  | 'ignored'
  | 'limited'
  | 'unclear'
  | 'accepted'
  | 'declined'
  | 'taken'
  | 'moved-on'
  | 'nothing-waiting'
  | 'checked-in'
  | 'raised'
  | 'already-raised';

/**
 * The words a reply is read as. The digits are what the alert asks for and are enough on
 * any phone; the rest are what people type anyway, in English and Swahili.
 */
const ACCEPT = new Set(['1', 'yes', 'y', 'ok', 'go', 'going', 'coming', 'ndio', 'ndiyo', 'sawa']);
const DECLINE = new Set(['2', 'no', 'n', 'cannot', "can't", 'cant', 'hapana', 'siwezi']);

/** Replies one phone may send in [REPLY_WINDOW_SECONDS] before the rest are ignored. */
export const REPLY_LIMIT = 6;
export const REPLY_WINDOW_SECONDS = 600;

/** Reads a reply by its first word, so "1 on my way" and "Yes!" both count. */
export function readReply(text: string): ReplyIntent {
  const first = text
    .trim()
    .toLowerCase()
    .split(/\s+/)[0]
    ?.replace(/[.!,?]+$/, '');
  if (!first) return 'unclear';
  if (ACCEPT.has(first)) return 'accept';
  if (DECLINE.has(first)) return 'decline';
  return 'unclear';
}

/**
 * The words an elder texts to ask for help. [HELP_WORD] is the one the app tells them to
 * send; the rest are what a frightened person types anyway, in English and Swahili.
 */
const HELP = new Set([HELP_WORD.toLowerCase(), 'sos', 'msaada', 'saidia']);

/**
 * Whether a text from an elder asks for help. Read by the first word alone, like a
 * reply, so "Help me" counts and a sentence that merely mentions help further in does
 * not.
 */
export function asksForHelp(text: string): boolean {
  const first = text
    .trim()
    .toLowerCase()
    .split(/\s+/)[0]
    ?.replace(/[.!,?]+$/, '');
  return !!first && HELP.has(first);
}

/** An international number from whatever the gateway sent: spaces gone, a + in front. */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[\s()-]/g, '');
  const international = digits.startsWith('+') ? digits : `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : null;
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;

/**
 * Answering an alert by replying to its SMS: 1 to go, 2 if you cannot.
 *
 * For the person who has no data, no smartphone or no app, a text is the whole of the
 * system. A reply goes through exactly the same acknowledgement and decline as the app,
 * so every rule those enforce holds here too: only somebody who was asked can answer,
 * the first to accept owns it, and declining never closes anything.
 *
 * The sender is known only by their number, which the gateway reports and the callback
 * secret vouches for. A number that belongs to nobody gets no answer at all, so the
 * service cannot be used to learn who is registered or run up a bill.
 *
 * It is also how an elder whose phone has no data asks for help: HELP texted to the same
 * number raises the same alert the button does.
 */
@Injectable()
export class SmsRepliesService {
  private readonly logger = new Logger(SmsRepliesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly escalation: EscalationService,
    private readonly sms: DirectSmsService,
    private readonly checkIns: CheckInsService,
    private readonly volunteers: VolunteerCallsService,
    private readonly alerts: AlertsService,
  ) {}

  async handle(from: string, text: string): Promise<ReplyOutcome> {
    const phone = normalisePhone(from);
    if (!phone) return 'ignored';

    const person = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true, deactivatedAt: true, role: true },
    });
    if (!person || person.deactivatedAt) return 'ignored';

    if (await this.overLimit(phone)) {
      this.logger.warn(`Too many text replies from ${redactPhone(phone)}; ignoring for now`);
      return 'limited';
    }

    // An elder's text asks for help or answers their check-in, "are you all right?";
    // anybody else's is a reply to an alert they were asked to answer.
    const intent = readReply(text);
    const outcome =
      person.role === Role.ELDER
        ? asksForHelp(text)
          ? await this.raiseByText(person.id, phone)
          : await this.answerCheckIn(person.id, phone, intent)
        : person.role === Role.COMMUNITY_RESPONDER
          ? await this.answerAsVolunteer(person.id, phone, intent)
          : await this.answer(person.id, phone, intent);
    this.logger.log(`Text reply from ${redactPhone(phone)}: ${outcome}`);
    return outcome;
  }

  private async answer(userId: string, phone: string, intent: ReplyIntent): Promise<ReplyOutcome> {
    // The newest alert still waiting on this person: open, nobody owns it, and they were
    // asked. Newest, because that is the text they are most likely answering.
    const asked = await this.prisma.notification.findFirst({
      where: {
        recipientId: userId,
        event: { state: { in: AWAITING_STATES }, acknowledgedBy: null },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        eventId: true,
        event: {
          select: { alertAddressLabel: true, elder: { select: { name: true, phone: true } } },
        },
      },
    });

    if (!asked) {
      // Nothing to answer, which most often means somebody else already took it.
      if (intent === 'unclear') return 'ignored';
      return (await this.tellWhoIsGoing(userId, phone)) ? 'taken' : this.nothingWaiting(phone);
    }

    const elder = asked.event.elder;
    const name = firstName(elder.name);

    if (intent === 'unclear') {
      await this.sms.send(
        phone,
        capSms(`MzaziCare: about ${name}'s alert. ${REPLY_ASK}`, REPLY_ASK),
      );
      return 'unclear';
    }

    try {
      if (intent === 'accept') {
        await this.escalation.acknowledge(asked.eventId, userId, undefined, 'sms');
        const place = asked.event.alertAddressLabel;
        await this.sms.send(
          phone,
          capSms(
            `MzaziCare: thank you, you are going to ${name}. Call ${name} on ${elder.phone}.` +
              (place ? ` Address: ${place}.` : ''),
            `MzaziCare: thank you, you are going to ${name}. Call ${name} on ${elder.phone}.`,
          ),
        );
        return 'accepted';
      }

      await this.escalation.decline(asked.eventId, userId, 'Replied by text', 'sms');
      await this.sms.send(
        phone,
        `MzaziCare: thank you for telling us. The next person is being asked to help ${name}.`,
      );
      return 'declined';
    } catch (error) {
      if (error instanceof ConflictException) {
        // Somebody accepted between the alert and this reply.
        return (await this.tellWhoIsGoing(userId, phone)) ? 'taken' : this.nothingWaiting(phone);
      }
      if (error instanceof ForbiddenException) {
        // Asked at a tier the alert has already moved past, so a decline no longer
        // applies to them. Nothing is wrong; it has simply gone on without them.
        await this.sms.send(
          phone,
          `MzaziCare: ${name}'s alert has already moved on to others. Thank you.`,
        );
        return 'moved-on';
      }
      throw error;
    }
  }

  /**
   * HELP from an elder: the panic button for a phone with no data. The app offers it
   * when it cannot reach the server, ready written, so the elder only presses send.
   *
   * One emergency at a time. A second HELP, or the gateway retrying the first, while one
   * is still open is answered with where that one has got to rather than raising another
   * and asking everybody twice.
   */
  private async raiseByText(elderId: string, phone: string): Promise<ReplyOutcome> {
    const open = await this.prisma.emergencyEvent.findFirst({
      where: { elderlyId: elderId, state: { in: OPEN_STATES } },
      orderBy: { triggeredAt: 'desc' },
      select: { owner: { select: { name: true } } },
    });
    if (open) {
      await this.sms.send(
        phone,
        open.owner
          ? `MzaziCare: ${firstName(open.owner.name)} is coming to you. Stay where you are if you can.`
          : 'MzaziCare: the people who look after you have already been told. Someone will call you.',
      );
      return 'already-raised';
    }

    await this.alerts.create(elderId, {}, { via: 'sms' });
    await this.sms.send(
      phone,
      'MzaziCare: we have told the people who look after you. Someone will call you. If you can, call 999 too.',
    );
    return 'raised';
  }

  /**
   * An elder's reply to "are you all right? Reply 1 if you are". A 1 answers it, exactly
   * as the button in the app does, including withdrawing an alert raised because it was
   * missed. HELP is read before this, by [raiseByText]. Anything else is not taken as a
   * call for help, which would turn a mistyped reply into an emergency; the elder is told
   * how to ask for help instead.
   */
  private async answerCheckIn(
    elderId: string,
    phone: string,
    intent: ReplyIntent,
  ): Promise<ReplyOutcome> {
    if (intent !== 'accept') {
      await this.sms.send(
        phone,
        `MzaziCare: if you need help, reply ${HELP_WORD}, press the help button in MzaziCare or call 999. Reply 1 if you are all right.`,
      );
      return 'unclear';
    }

    const outcome = await this.checkIns.answer(elderId, 'sms');
    const text = {
      answered: 'MzaziCare: thank you. Your family can see you are all right.',
      withdrawn: 'MzaziCare: thank you. Your family has been told you are all right.',
      noted: 'MzaziCare: thank you. Someone is already coming, and they know you answered.',
      nothing: 'MzaziCare: there is nothing to answer just now. Thank you.',
    }[outcome];
    await this.sms.send(phone, text);
    return outcome === 'nothing' ? 'nothing-waiting' : 'checked-in';
  }

  /** Says who already took the alert this person was asked about. False if nobody did. */
  private async tellWhoIsGoing(userId: string, phone: string): Promise<boolean> {
    const taken = await this.prisma.notification.findFirst({
      where: {
        recipientId: userId,
        event: { state: { in: OPEN_STATES }, acknowledgedBy: { not: null } },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        event: {
          select: {
            elder: { select: { name: true } },
            owner: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!taken?.event.owner) return false;

    const elder = firstName(taken.event.elder.name);
    // A second "1" from the person who already took it, most often a resend on a weak
    // signal. They are told it stands, not that somebody else has it.
    const text =
      taken.event.owner.id === userId
        ? `MzaziCare: you are already going to ${elder}. Thank you.`
        : `MzaziCare: ${firstName(taken.event.owner.name)} is already going to ${elder}. Thank you.`;
    await this.sms.send(phone, text);
    return true;
  }

  /**
   * A volunteer's reply to "Reply 1 if you can go". The same accept and decline as the
   * app, and an acceptance is answered with who and where, since a volunteer who replied
   * by text may have no app open to read it in.
   */
  private async answerAsVolunteer(
    volunteerId: string,
    phone: string,
    intent: ReplyIntent,
  ): Promise<ReplyOutcome> {
    if (intent === 'unclear') {
      await this.sms.send(phone, `MzaziCare: ${REPLY_ASK}`);
      return 'unclear';
    }
    const { answer, text } = await this.volunteers.answerByText(volunteerId, intent);
    if (answer === 'nothing') return this.nothingWaiting(phone);
    if (text) await this.sms.send(phone, text);
    return answer;
  }

  private async nothingWaiting(phone: string): Promise<ReplyOutcome> {
    await this.sms.send(phone, 'MzaziCare: there is no alert waiting for your answer. Thank you.');
    return 'nothing-waiting';
  }

  /**
   * A fixed window per phone, in Redis like every other limit here. Redis being down
   * lets the reply through: a missed limit costs an SMS, a missed answer could cost
   * somebody their help.
   */
  private async overLimit(phone: string): Promise<boolean> {
    const key = `sms-reply:${phone}`;
    try {
      const results = await this.redis.client
        .pipeline()
        .incr(key)
        .expire(key, REPLY_WINDOW_SECONDS, 'NX')
        .exec();
      const incr = results?.[0];
      if (!incr || incr[0]) return false;
      return Number(incr[1] ?? 0) > REPLY_LIMIT;
    } catch {
      return false;
    }
  }
}
