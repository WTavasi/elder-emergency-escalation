import { CheckInStatus } from '@prisma/client';
import type { PrismaService } from '../../../db/prisma.service';
import type { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import { CheckInRhythmService } from './check-in-rhythm.service';

/** Monday 9 November 2026, 09:30 in Nairobi. */
const MONDAY = new Date('2026-11-09T06:30:00Z');
const DAY = 24 * 60 * 60 * 1000;

/** A check-in [daysAgo] days before [MONDAY], answered after [minutes], or missed. */
const checkIn = (daysAgo: number, minutes: number | null) => {
  const dueAt = new Date(MONDAY.getTime() - daysAgo * DAY);
  return {
    dueAt,
    answeredAt: minutes === null ? null : new Date(dueAt.getTime() + minutes * 60_000),
    status: minutes === null ? CheckInStatus.MISSED : CheckInStatus.ANSWERED,
  };
};

function build(rows: ReturnType<typeof checkIn>[], timezone = 'Africa/Nairobi') {
  const prisma = {
    checkInSchedule: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { elderId: 'elder-1', elder: { name: 'Grace Wanjiru', timezone, deactivatedAt: null } },
        ]),
      update: jest.fn().mockResolvedValue({}),
    },
    checkIn: { findMany: jest.fn().mockResolvedValue(rows) },
    careAssignment: {
      findMany: jest.fn().mockResolvedValue([{ responder: { phone: '+254700000020' } }]),
    },
  };
  const sms = { send: jest.fn().mockResolvedValue(true) };
  const service = new CheckInRhythmService(
    prisma as unknown as PrismaService,
    sms as unknown as DirectSmsService,
  );
  return { service, prisma, sms };
}

// Four weeks of answers within two or three minutes, before this week.
const usual = Array.from({ length: 20 }, (_, i) => checkIn(8 + i, 2 + (i % 2)));

describe('CheckInRhythmService', () => {
  it("texts the caregivers when this week's answers came much later", async () => {
    const thisWeek = [1, 2, 3, 4, 5].map((day) => checkIn(day, 25));
    const { service, sms, prisma } = build([...usual, ...thisWeek]);

    await expect(service.weekly(MONDAY)).resolves.toBe(1);

    const [phone, text] = sms.send.mock.calls[0] as [string, string];
    expect(phone).toBe('+254700000020');
    expect(text).toContain(
      'Grace answered check-ins later this week: about 25 minutes, against 2 before.',
    );
    expect(prisma.checkInSchedule.update).toHaveBeenCalledWith({
      where: { elderId: 'elder-1' },
      data: { rhythmCheckedAt: MONDAY },
    });
  });

  it('sends nothing for an ordinary week, but still marks it looked at', async () => {
    const thisWeek = [1, 2, 3, 4, 5].map((day) => checkIn(day, 3));
    const { service, sms, prisma } = build([...usual, ...thisWeek]);

    await expect(service.weekly(MONDAY)).resolves.toBe(0);
    expect(sms.send).not.toHaveBeenCalled();
    expect(prisma.checkInSchedule.update).toHaveBeenCalled();
  });

  it("looks only on Monday morning, on the elder's clock", async () => {
    const { service, prisma } = build(usual);
    await service.weekly(new Date('2026-11-09T05:00:00Z')); // 08:00 in Nairobi
    await service.weekly(new Date('2026-11-10T07:00:00Z')); // Tuesday
    expect(prisma.checkInSchedule.update).not.toHaveBeenCalled();
  });
});
