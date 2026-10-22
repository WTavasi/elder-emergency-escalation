import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { RedisService } from '../../../shared/redis/redis.service';
import { AWAITING_STATES, OPEN_STATES } from '../../../shared/utils/event-lifecycle';
import { redactPhone } from '../../../shared/utils/redaction';
import { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import { CheckInsService } from '../../check-in-service/services/check-ins.service';
import { capSms, REPLY_ASK } from '../../notification-service/services/notification-content';
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
  | 'checked-in';

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

    // An elder's reply is to their check-in, "are you all right?"; anybody else's is to an
    // alert they were asked to answer.
    const outcome =
      person.role === Role.ELDER
        ? await this.answerCheckIn(person.id, phone, readReply(text))
        : await this.answer(person.id, phone, readReply(text));
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
   * An elder's reply to "are you all right? Reply 1 if you are". A 1 answers it, exactly
   * as the button in the app does, including withdrawing an alert raised because it was
   * missed. Anything else is not taken as a call for help, which would turn a mistyped
   * reply into an emergency; the elder is told how to ask for help instead.
   */
  private async answerCheckIn(
    elderId: string,
    phone: string,
    intent: ReplyIntent,
  ): Promise<ReplyOutcome> {
    if (intent !== 'accept') {
      await this.sms.send(
        phone,
        'MzaziCare: if you need help, press the help button in MzaziCare or call 999. Reply 1 if you are all right.',
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
