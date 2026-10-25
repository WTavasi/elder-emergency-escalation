import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../../db/prisma.service';
import type { RedisService } from '../../../shared/redis/redis.service';
import type { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import { SMS_LIMIT } from '../../notification-service/services/notification-content';
import type { CheckInsService } from '../../check-in-service/services/check-ins.service';
import type { VolunteerCallsService } from '../../community-service/services/volunteer-calls.service';
import type { AlertsService } from './alerts.service';
import type { EscalationService } from './escalation.service';
import {
  asksForHelp,
  normalisePhone,
  readReply,
  REPLY_LIMIT,
  SmsRepliesService,
} from './sms-replies.service';

const FAMILY = { id: 'family-1', deactivatedAt: null };

/** What the person was asked about: Grace's alert, still waiting. */
const ASKED = {
  eventId: 'event-1',
  event: {
    alertAddressLabel: 'Kileleshwa, Nairobi',
    elder: { name: 'Grace Wanjiru', phone: '+254700000010' },
  },
};

/** An alert Mary already took. */
const TAKEN = {
  event: { elder: { name: 'Grace Wanjiru' }, owner: { id: 'carer-1', name: 'Mary Otieno' } },
};

function build(
  options: {
    person?: Record<string, unknown> | null;
    asked?: Record<string, unknown> | null;
    taken?: Record<string, unknown> | null;
    open?: Record<string, unknown> | null;
    count?: number;
  } = {},
) {
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.person === undefined ? FAMILY : options.person),
    },
    notification: {
      // First the alert still waiting on them, then (if asked) the one somebody took.
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(options.asked === undefined ? ASKED : options.asked)
        .mockResolvedValueOnce(options.taken === undefined ? null : options.taken),
    },
    // The elder's emergency still open, if there is one, when they text HELP.
    emergencyEvent: { findFirst: jest.fn().mockResolvedValue(options.open ?? null) },
  };
  const pipeline = {
    incr: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([[null, options.count ?? 1]]),
  };
  const redis = { client: { pipeline: jest.fn(() => pipeline) } };
  const escalation = {
    acknowledge: jest.fn().mockResolvedValue({}),
    decline: jest.fn().mockResolvedValue({}),
  };
  const sms = { send: jest.fn().mockResolvedValue(true) };
  const checkIns = { answer: jest.fn().mockResolvedValue('answered') };
  const volunteers = {
    answerByText: jest
      .fn()
      .mockResolvedValue({ answer: 'accepted', text: 'MzaziCare: thank you.' }),
  };
  const alerts = { create: jest.fn().mockResolvedValue({ id: 'event-2' }) };

  const service = new SmsRepliesService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    escalation as unknown as EscalationService,
    sms as unknown as DirectSmsService,
    checkIns as unknown as CheckInsService,
    volunteers as unknown as VolunteerCallsService,
    alerts as unknown as AlertsService,
  );
  const sent = (): string[] => sms.send.mock.calls.map((call: unknown[]) => call[1] as string);
  return { service, prisma, escalation, sms, sent, checkIns, volunteers, alerts };
}

describe('readReply', () => {
  it('reads the digits the alert asks for', () => {
    expect(readReply('1')).toBe('accept');
    expect(readReply('2')).toBe('decline');
  });

  it('reads what people type anyway, in English and Swahili, by the first word', () => {
    expect(readReply('  Yes!  ')).toBe('accept');
    expect(readReply('1 on my way')).toBe('accept');
    expect(readReply('Ndio')).toBe('accept');
    expect(readReply('no, at work')).toBe('decline');
    expect(readReply('Hapana')).toBe('decline');
  });

  it('does not guess at anything else', () => {
    expect(readReply('')).toBe('unclear');
    expect(readReply('who is this?')).toBe('unclear');
    expect(readReply('12')).toBe('unclear');
  });
});

describe('asksForHelp', () => {
  it('reads the word the app tells an elder to send, and what people type anyway', () => {
    expect(asksForHelp('HELP')).toBe(true);
    expect(asksForHelp('  help me!  ')).toBe(true);
    expect(asksForHelp('SOS')).toBe(true);
    expect(asksForHelp('Msaada')).toBe(true);
    expect(asksForHelp('saidia tafadhali')).toBe(true);
  });

  it('does not read help into anything else', () => {
    expect(asksForHelp('')).toBe(false);
    expect(asksForHelp('1')).toBe(false);
    expect(asksForHelp('I do not need help')).toBe(false);
    expect(asksForHelp('helpful')).toBe(false);
  });
});

describe('normalisePhone', () => {
  it('accepts what a gateway sends and keeps international format', () => {
    expect(normalisePhone('+254700000030')).toBe('+254700000030');
    expect(normalisePhone('254700000030')).toBe('+254700000030');
    expect(normalisePhone('+254 700 000 030')).toBe('+254700000030');
  });

  it('refuses what is not a phone number', () => {
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone('MZAZICARE')).toBeNull();
  });
});

describe('SmsRepliesService', () => {
  it('takes the alert on with a 1, through the same path as the app, and says what next', async () => {
    const t = build();

    await expect(t.service.handle('+254700000030', '1')).resolves.toBe('accepted');

    expect(t.escalation.acknowledge).toHaveBeenCalledWith('event-1', 'family-1', undefined, 'sms');
    const [reply] = t.sent();
    expect(reply).toContain('you are going to Grace');
    // During an open emergency the elder's number is disclosed to the people asked.
    expect(reply).toContain('+254700000010');
    expect(reply.length).toBeLessThanOrEqual(SMS_LIMIT);
  });

  it('declines with a 2, and the chain moves on', async () => {
    const t = build();

    await expect(t.service.handle('+254700000030', '2')).resolves.toBe('declined');

    expect(t.escalation.decline).toHaveBeenCalledWith(
      'event-1',
      'family-1',
      'Replied by text',
      'sms',
    );
    expect(t.sent()[0]).toContain('next person');
  });

  it('says who is already going when somebody accepted first', async () => {
    const t = build({ taken: TAKEN });
    t.escalation.acknowledge.mockRejectedValue(
      new ConflictException('Someone is already responding to this emergency'),
    );

    await expect(t.service.handle('+254700000030', '1')).resolves.toBe('taken');
    expect(t.sent()).toEqual(['MzaziCare: Mary is already going to Grace. Thank you.']);
  });

  it('says so when the alert has moved past the tier that asked them', async () => {
    const t = build();
    t.escalation.decline.mockRejectedValue(
      new ForbiddenException('You were not asked to respond to this emergency'),
    );

    await expect(t.service.handle('+254700000030', '2')).resolves.toBe('moved-on');
    expect(t.sent()[0]).toContain('moved on');
  });

  it('answers a late 1 with who took it, when nothing is waiting any more', async () => {
    const t = build({ asked: null, taken: TAKEN });

    await expect(t.service.handle('+254700000030', '1')).resolves.toBe('taken');
    expect(t.escalation.acknowledge).not.toHaveBeenCalled();
  });

  it('tells the person who already took it that it stands, not that somebody else has it', async () => {
    const t = build({
      asked: null,
      taken: { event: { ...TAKEN.event, owner: { id: 'family-1', name: 'Aisha Otieno' } } },
    });

    await expect(t.service.handle('+254700000030', '1')).resolves.toBe('taken');
    expect(t.sent()).toEqual(['MzaziCare: you are already going to Grace. Thank you.']);
  });

  it('says nothing is waiting when nothing is', async () => {
    const t = build({ asked: null, taken: null });

    await expect(t.service.handle('+254700000030', 'yes')).resolves.toBe('nothing-waiting');
    expect(t.sent()[0]).toContain('no alert waiting');
  });

  it('repeats the two answers to anything it cannot read', async () => {
    const t = build();

    await expect(t.service.handle('+254700000030', 'what happened?')).resolves.toBe('unclear');
    expect(t.sent()[0]).toContain('Reply 1 if you can go, 2 if you cannot.');
    expect(t.escalation.acknowledge).not.toHaveBeenCalled();
    expect(t.escalation.decline).not.toHaveBeenCalled();
  });

  it('never answers a number that belongs to nobody, so it cannot reveal who is registered', async () => {
    const t = build({ person: null });

    await expect(t.service.handle('+254711111111', '1')).resolves.toBe('ignored');
    expect(t.sms.send).not.toHaveBeenCalled();
  });

  it('ignores a deactivated account', async () => {
    const t = build({ person: { id: 'family-1', deactivatedAt: new Date() } });

    await expect(t.service.handle('+254700000030', '1')).resolves.toBe('ignored');
    expect(t.escalation.acknowledge).not.toHaveBeenCalled();
  });

  it('stops answering a phone that sends too many replies', async () => {
    const t = build({ count: REPLY_LIMIT + 1 });

    await expect(t.service.handle('+254700000030', '1')).resolves.toBe('limited');
    expect(t.escalation.acknowledge).not.toHaveBeenCalled();
    expect(t.sms.send).not.toHaveBeenCalled();
  });

  it('reads the sender in the format a gateway may use', async () => {
    const t = build();

    await t.service.handle('254700000030', '1');

    expect(t.prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phone: '+254700000030' } }),
    );
  });

  describe('from an elder, answering a check-in', () => {
    const ELDER = { id: 'elder-1', deactivatedAt: null, role: 'ELDER' };

    it('a 1 answers it, through the same path as the button', async () => {
      const t = build({ person: ELDER });

      await expect(t.service.handle('+254700000010', '1')).resolves.toBe('checked-in');

      expect(t.checkIns.answer).toHaveBeenCalledWith('elder-1', 'sms');
      expect(t.escalation.acknowledge).not.toHaveBeenCalled();
      expect(t.sent()[0]).toContain('all right');
    });

    it('a late 1 that withdrew the alert says the family was told', async () => {
      const t = build({ person: ELDER });
      t.checkIns.answer.mockResolvedValue('withdrawn');

      await t.service.handle('+254700000010', 'ndio');

      expect(t.sent()[0]).toContain('Your family has been told');
    });

    it('anything else is not taken as a call for help, and says how to ask for it', async () => {
      const t = build({ person: ELDER });

      await expect(t.service.handle('+254700000010', 'who is this')).resolves.toBe('unclear');

      expect(t.checkIns.answer).not.toHaveBeenCalled();
      expect(t.alerts.create).not.toHaveBeenCalled();
      expect(t.sent()[0]).toContain('reply HELP');
      expect(t.sent()[0]).toContain('call 999');
    });
  });

  describe('from an elder, asking for help', () => {
    const ELDER = { id: 'elder-1', deactivatedAt: null, role: 'ELDER' };

    it('HELP raises the same alert the button does, marked as texted', async () => {
      const t = build({ person: ELDER });

      await expect(t.service.handle('+254700000010', 'HELP')).resolves.toBe('raised');

      expect(t.alerts.create).toHaveBeenCalledWith('elder-1', {}, { via: 'sms' });
      expect(t.checkIns.answer).not.toHaveBeenCalled();
      expect(t.sent()[0]).toContain('we have told the people who look after you');
      expect(t.sent()[0].length).toBeLessThanOrEqual(SMS_LIMIT);
    });

    it('in Swahili too', async () => {
      const t = build({ person: ELDER });
      await expect(t.service.handle('+254700000010', 'msaada')).resolves.toBe('raised');
      expect(t.alerts.create).toHaveBeenCalledTimes(1);
    });

    it('does not raise a second while one is open, and says who is coming', async () => {
      const t = build({ person: ELDER, open: { owner: { name: 'Mary Otieno' } } });

      await expect(t.service.handle('+254700000010', 'help')).resolves.toBe('already-raised');

      expect(t.alerts.create).not.toHaveBeenCalled();
      expect(t.sent()[0]).toContain('Mary is coming to you');
    });

    it('says they have been told when nobody has answered yet', async () => {
      const t = build({ person: ELDER, open: { owner: null } });

      await expect(t.service.handle('+254700000010', 'SOS')).resolves.toBe('already-raised');

      expect(t.alerts.create).not.toHaveBeenCalled();
      expect(t.sent()[0]).toContain('already been told');
    });

    it('is only read from an elder: anybody else texting HELP raises nothing', async () => {
      const t = build();

      await t.service.handle('+254700000030', 'help');

      expect(t.alerts.create).not.toHaveBeenCalled();
    });
  });

  describe('from a community volunteer', () => {
    const VOLUNTEER = { id: 'vol-1', deactivatedAt: null, role: 'COMMUNITY_RESPONDER' };

    it('a 1 accepts the call, and the reply says who and where', async () => {
      const t = build({ person: VOLUNTEER });

      await expect(t.service.handle('+254711000001', '1')).resolves.toBe('accepted');

      expect(t.volunteers.answerByText).toHaveBeenCalledWith('vol-1', 'accept');
      expect(t.escalation.acknowledge).not.toHaveBeenCalled();
      expect(t.sent()[0]).toBe('MzaziCare: thank you.');
    });

    it('a 2 declines', async () => {
      const t = build({ person: VOLUNTEER });
      t.volunteers.answerByText.mockResolvedValue({ answer: 'declined', text: 'MzaziCare: ok' });

      await expect(t.service.handle('+254711000001', 'hapana')).resolves.toBe('declined');
      expect(t.volunteers.answerByText).toHaveBeenCalledWith('vol-1', 'decline');
    });

    it('anything else repeats the two answers', async () => {
      const t = build({ person: VOLUNTEER });
      await expect(t.service.handle('+254711000001', 'where?')).resolves.toBe('unclear');
      expect(t.volunteers.answerByText).not.toHaveBeenCalled();
      expect(t.sent()[0]).toContain('Reply 1');
    });

    it('nothing waiting is said so', async () => {
      const t = build({ person: VOLUNTEER });
      t.volunteers.answerByText.mockResolvedValue({ answer: 'nothing', text: null });
      await expect(t.service.handle('+254711000001', '1')).resolves.toBe('nothing-waiting');
    });
  });
});
