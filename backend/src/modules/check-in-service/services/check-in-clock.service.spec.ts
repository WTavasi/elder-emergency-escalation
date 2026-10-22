import type { ConfigService } from '@nestjs/config';
import { AlertTrigger, CheckInStatus, Prisma } from '@prisma/client';
import type { PrismaService } from '../../../db/prisma.service';
import type { AlertsService } from '../../emergency-service/services/alerts.service';
import { CheckInClockService } from './check-in-clock.service';
import type { CheckInMessenger } from './check-in-messenger.service';

const GRACE = {
  id: 'elder-1',
  name: 'Grace Wanjiru',
  phone: '+254700000010',
  pushToken: null,
  timezone: 'Africa/Nairobi',
  deactivatedAt: null,
};

/** Nine in the morning in Nairobi, agreed to the day before, thirty minutes to answer. */
const SCHEDULE = {
  elderId: 'elder-1',
  enabled: true,
  times: [540],
  graceMinutes: 30,
  confirmedAt: new Date('2026-10-21T08:00:00Z'),
  elder: GRACE,
};
const NINE = new Date('2026-10-22T06:00:00Z');
const minutesAfterNine = (minutes: number) => new Date(NINE.getTime() + minutes * 60_000);

function build(
  options: {
    schedules?: unknown[];
    reminders?: unknown[];
    overdue?: unknown[];
    open?: { id: string } | null;
    claimed?: number;
  } = {},
) {
  const prisma = {
    checkInSchedule: { findMany: jest.fn().mockResolvedValue(options.schedules ?? []) },
    emergencyEvent: { findFirst: jest.fn().mockResolvedValue(options.open ?? null) },
    checkIn: {
      create: jest.fn().mockResolvedValue({ id: 'check-in-1' }),
      // The reminders are looked for first, then the check-ins nobody answered.
      findMany: jest.fn((args: { where: { remindedAt?: null } }) =>
        Promise.resolve(
          'remindedAt' in args.where ? (options.reminders ?? []) : (options.overdue ?? []),
        ),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: options.claimed ?? 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const alerts = { create: jest.fn().mockResolvedValue({ id: 'event-1' }) };
  const messenger = { ask: jest.fn().mockResolvedValue('push') };
  const settings: Record<string, unknown> = {};
  const config = {
    get: (key: string, fallback: unknown) => (key in settings ? settings[key] : fallback),
  };
  const clock = new CheckInClockService(
    config as unknown as ConfigService,
    prisma as unknown as PrismaService,
    alerts as unknown as AlertsService,
    messenger as unknown as CheckInMessenger,
  );
  return { clock, prisma, alerts, messenger, settings };
}

describe('CheckInClockService', () => {
  describe('asking', () => {
    it('asks a check-in that has just fallen due, with its reminder and deadline', async () => {
      const t = build({ schedules: [SCHEDULE] });
      const now = minutesAfterNine(1);

      await expect(t.clock.tick(now)).resolves.toEqual({ asked: 1, reminded: 0, missed: 0 });

      expect(t.prisma.checkIn.create.mock.calls[0][0].data).toEqual({
        elderId: 'elder-1',
        dueAt: NINE,
        remindAt: minutesAfterNine(15),
        deadlineAt: minutesAfterNine(30),
      });
      expect(t.messenger.ask).toHaveBeenCalledWith(GRACE, 'check-in-1', false, now);
    });

    it('still asks after a short restart, but not once the moment has long passed', async () => {
      const shortly = build({ schedules: [SCHEDULE] });
      await shortly.clock.tick(minutesAfterNine(9));
      expect(shortly.messenger.ask).toHaveBeenCalled();

      const later = build({ schedules: [SCHEDULE] });
      await later.clock.tick(minutesAfterNine(12));
      expect(later.prisma.checkIn.create).not.toHaveBeenCalled();
    });

    it('never asks a time from before the elder agreed to it', async () => {
      const t = build({
        schedules: [{ ...SCHEDULE, confirmedAt: new Date(NINE.getTime() + 30_000) }],
      });
      await t.clock.tick(minutesAfterNine(1));
      expect(t.prisma.checkIn.create).not.toHaveBeenCalled();
    });

    it('does not ask somebody in the middle of an emergency of their own', async () => {
      const t = build({ schedules: [SCHEDULE], open: { id: 'event-9' } });
      await t.clock.tick(minutesAfterNine(1));
      expect(t.prisma.checkIn.create).not.toHaveBeenCalled();
    });

    it('skips an account that has been closed', async () => {
      const t = build({
        schedules: [{ ...SCHEDULE, elder: { ...GRACE, deactivatedAt: new Date() } }],
      });
      await t.clock.tick(minutesAfterNine(1));
      expect(t.prisma.checkIn.create).not.toHaveBeenCalled();
    });

    it('asks once even when a second instance got there first', async () => {
      const t = build({ schedules: [SCHEDULE] });
      t.prisma.checkIn.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(t.clock.tick(minutesAfterNine(1))).resolves.toEqual({
        asked: 0,
        reminded: 0,
        missed: 0,
      });
      expect(t.messenger.ask).not.toHaveBeenCalled();
    });
  });

  describe('reminding', () => {
    const LATE = {
      id: 'check-in-1',
      elder: {
        name: 'Grace Wanjiru',
        phone: '+254700000010',
        pushToken: null,
        timezone: 'Africa/Nairobi',
      },
    };

    it('asks once more half way through, as a reminder', async () => {
      const t = build({ reminders: [LATE] });
      const now = minutesAfterNine(15);

      await expect(t.clock.tick(now)).resolves.toMatchObject({ reminded: 1 });

      expect(t.prisma.checkIn.updateMany.mock.calls[0][0].where).toMatchObject({
        status: CheckInStatus.PENDING,
        remindedAt: null,
      });
      expect(t.messenger.ask).toHaveBeenCalledWith(LATE.elder, 'check-in-1', true, now);
    });

    it('does not remind twice when another instance already did', async () => {
      const t = build({ reminders: [LATE], claimed: 0 });
      await t.clock.tick(minutesAfterNine(15));
      expect(t.messenger.ask).not.toHaveBeenCalled();
    });
  });

  describe('a check-in nobody answered', () => {
    const OVERDUE = { id: 'check-in-1', elderId: 'elder-1' };

    it('is marked missed and raises an alert of its own kind', async () => {
      const t = build({ overdue: [OVERDUE] });

      await expect(t.clock.tick(minutesAfterNine(30))).resolves.toMatchObject({ missed: 1 });

      expect(t.prisma.checkIn.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: 'check-in-1', status: CheckInStatus.PENDING },
        data: { status: CheckInStatus.MISSED },
      });
      expect(t.alerts.create).toHaveBeenCalledWith(
        'elder-1',
        {},
        { trigger: AlertTrigger.MISSED_CHECK_IN },
      );
      expect(t.prisma.checkIn.update).toHaveBeenCalledWith({
        where: { id: 'check-in-1' },
        data: { eventId: 'event-1' },
      });
    });

    it('joins an emergency already open rather than raising a second one', async () => {
      const t = build({ overdue: [OVERDUE], open: { id: 'event-9' } });
      await t.clock.tick(minutesAfterNine(30));

      expect(t.alerts.create).not.toHaveBeenCalled();
      expect(t.prisma.checkIn.update).toHaveBeenCalledWith({
        where: { id: 'check-in-1' },
        data: { eventId: 'event-9' },
      });
    });

    it('raises nothing when the answer arrived in the same instant', async () => {
      const t = build({ overdue: [OVERDUE], claimed: 0 });
      await t.clock.tick(minutesAfterNine(30));
      expect(t.alerts.create).not.toHaveBeenCalled();
    });
  });

  it('never throws, so one bad minute does not stop every later check-in', async () => {
    const t = build();
    t.prisma.checkInSchedule.findMany.mockRejectedValue(new Error('database away'));
    await expect(t.clock.tick(NINE)).resolves.toEqual({ asked: 0, reminded: 0, missed: 0 });
  });

  it('does not start when check-ins are switched off on the server', () => {
    const t = build();
    t.settings.CHECK_INS_ENABLED = false;
    const spy = jest.spyOn(global, 'setInterval');

    t.clock.onModuleInit();

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('runs on its clock when switched on, and stops with the server', () => {
    jest.useFakeTimers();
    const t = build();
    t.settings.CHECK_IN_TICK_MS = 1000;
    const tick = jest
      .spyOn(t.clock, 'tick')
      .mockResolvedValue({ asked: 0, reminded: 0, missed: 0 });

    t.clock.onModuleInit();
    jest.advanceTimersByTime(2500);
    expect(tick).toHaveBeenCalledTimes(2);

    t.clock.onModuleDestroy();
    jest.advanceTimersByTime(2000);
    expect(tick).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});
