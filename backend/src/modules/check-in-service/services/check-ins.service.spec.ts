import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CheckInStatus, Role } from '@prisma/client';
import type { PrismaService } from '../../../db/prisma.service';
import type { AlertsService } from '../../emergency-service/services/alerts.service';
import { CheckInsService } from './check-ins.service';

const AGREED = new Date('2026-10-01T08:00:00Z');

const checkIn = (overrides: Record<string, unknown> = {}) => ({
  id: 'check-in-1',
  elderId: 'elder-1',
  dueAt: new Date('2026-10-22T06:00:00Z'),
  remindAt: new Date('2026-10-22T06:15:00Z'),
  deadlineAt: new Date('2026-10-22T06:30:00Z'),
  status: CheckInStatus.PENDING,
  remindedAt: null,
  answeredAt: null,
  answeredVia: null,
  missedAt: null,
  eventId: null,
  ...overrides,
});

function build(
  options: {
    elderRole?: Role | null;
    inChain?: boolean;
    schedule?: Record<string, unknown> | null;
    pending?: unknown;
    missed?: unknown;
  } = {},
) {
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.elderRole === null ? null : { role: options.elderRole ?? Role.ELDER },
        ),
    },
    careAssignment: {
      findFirst: jest.fn().mockResolvedValue(options.inChain === false ? null : { id: 'a-1' }),
    },
    checkInSchedule: {
      findUnique: jest.fn().mockResolvedValue(options.schedule ?? null),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    checkIn: {
      findMany: jest.fn().mockResolvedValue([]),
      // The one waiting first, then one missed whose alert is still open.
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(options.pending ?? null)
        .mockResolvedValueOnce(options.missed ?? null),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const alerts = { answerMissedCheckIn: jest.fn().mockResolvedValue('withdrawn') };
  const service = new CheckInsService(
    prisma as unknown as PrismaService,
    alerts as unknown as AlertsService,
  );
  const saved = (): Record<string, unknown> =>
    prisma.checkInSchedule.upsert.mock.calls[0][0].update as Record<string, unknown>;
  return { service, prisma, alerts, saved };
}

describe('CheckInsService', () => {
  describe('setting it up', () => {
    it('takes effect at once when the elder sets it up, with the times in order', async () => {
      const t = build();
      await t.service.setSchedule('elder-1', 'elder-1', Role.ELDER, {
        enabled: true,
        times: ['18:00', '09:00', '09:00'],
      });

      expect(t.saved()).toMatchObject({ enabled: true, times: [540, 1080], graceMinutes: 30 });
      expect(t.saved().confirmedAt).toBeInstanceOf(Date);
    });

    it('waits for the elder to agree when somebody in their chain sets it up', async () => {
      const t = build();
      await t.service.setSchedule('elder-1', 'carer-1', Role.CAREGIVER, {
        enabled: true,
        times: ['09:00'],
        graceMinutes: 45,
      });

      expect(t.saved()).toMatchObject({ setById: 'carer-1', confirmedAt: null, graceMinutes: 45 });
    });

    it('keeps the agreement when only the time to answer changes', async () => {
      const t = build({
        schedule: { enabled: true, times: [540], graceMinutes: 30, confirmedAt: AGREED },
      });
      await t.service.setSchedule('elder-1', 'family-1', Role.FAMILY_MEMBER, {
        enabled: true,
        times: ['09:00'],
        graceMinutes: 60,
      });
      expect(t.saved().confirmedAt).toBe(AGREED);
    });

    it('asks again when somebody else moves the times', async () => {
      const t = build({
        schedule: { enabled: true, times: [540], graceMinutes: 30, confirmedAt: AGREED },
      });
      await t.service.setSchedule('elder-1', 'carer-1', Role.CAREGIVER, {
        enabled: true,
        times: ['10:00'],
      });
      expect(t.saved().confirmedAt).toBeNull();
    });

    it('lets anybody in the chain turn it off without asking, clearing what is waiting', async () => {
      const t = build({
        schedule: { enabled: true, times: [540], graceMinutes: 30, confirmedAt: AGREED },
      });
      await t.service.setSchedule('elder-1', 'carer-1', Role.CAREGIVER, {
        enabled: false,
        times: [],
      });

      expect(t.saved()).toMatchObject({ enabled: false, confirmedAt: AGREED });
      expect(t.prisma.checkIn.deleteMany).toHaveBeenCalledWith({
        where: { elderId: 'elder-1', status: CheckInStatus.PENDING },
      });
    });

    it('needs at least one time to be turned on', async () => {
      const t = build();
      await expect(
        t.service.setSchedule('elder-1', 'elder-1', Role.ELDER, { enabled: true, times: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lets an administrator look but not change it', async () => {
      const t = build();
      await expect(
        t.service.overview('elder-1', 'admin-1', Role.ADMINISTRATOR),
      ).resolves.toMatchObject({ canEdit: false });
      await expect(
        t.service.setSchedule('elder-1', 'admin-1', Role.ADMINISTRATOR, {
          enabled: true,
          times: ['09:00'],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses somebody outside the elder’s chain', async () => {
      const t = build({ inChain: false });
      await expect(t.service.overview('elder-1', 'stranger-1', Role.CAREGIVER)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('is only for elders', async () => {
      const t = build({ elderRole: Role.CAREGIVER });
      await expect(t.service.overview('carer-2', 'carer-1', Role.CAREGIVER)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('the elder’s agreement', () => {
    const WAITING = {
      enabled: true,
      times: [540],
      graceMinutes: 30,
      confirmedAt: null,
      setBy: { id: 'carer-1', name: 'Mary Otieno' },
    };

    it('shows the elder a set-up waiting for them, and who made it', async () => {
      const t = build({ schedule: WAITING });
      const mine = await t.service.forElder('elder-1');

      expect(mine.waitingForAgreement).toMatchObject({
        times: ['09:00'],
        waitingForElder: true,
        setBy: { name: 'Mary Otieno' },
      });
      expect(mine.checkIn).toBeNull();
    });

    it('starts it when the elder agrees', async () => {
      const t = build({ schedule: WAITING });
      await t.service.confirm('elder-1', 'elder-1', true);
      expect(t.prisma.checkInSchedule.update.mock.calls[0][0].data.confirmedAt).toBeInstanceOf(
        Date,
      );
    });

    it('turns it off when the elder says no', async () => {
      const t = build({ schedule: WAITING });
      await t.service.confirm('elder-1', 'elder-1', false);
      expect(t.prisma.checkInSchedule.update.mock.calls[0][0].data).toEqual({
        enabled: false,
        confirmedAt: null,
      });
    });

    it('is the elder’s alone to give', async () => {
      const t = build({ schedule: WAITING });
      await expect(t.service.confirm('elder-1', 'carer-1', true)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('answering', () => {
    it('answers the check-in waiting', async () => {
      const t = build({ pending: checkIn() });

      await expect(t.service.answer('elder-1', 'app')).resolves.toBe('answered');

      expect(t.prisma.checkIn.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: 'check-in-1', status: CheckInStatus.PENDING },
        data: { status: CheckInStatus.ANSWERED, answeredVia: 'app' },
      });
      expect(t.alerts.answerMissedCheckIn).not.toHaveBeenCalled();
    });

    it('has nothing to answer when nothing is waiting', async () => {
      const t = build();
      await expect(t.service.answer('elder-1')).resolves.toBe('nothing');
    });

    it('answers late a check-in that already raised its alert', async () => {
      const missed = checkIn({ status: CheckInStatus.MISSED, eventId: 'event-1' });
      const t = build({ missed });

      await expect(t.service.answer('elder-1', 'sms')).resolves.toBe('withdrawn');

      expect(t.alerts.answerMissedCheckIn).toHaveBeenCalledWith('event-1', 'elder-1');
      expect(t.prisma.checkIn.update).toHaveBeenCalledWith({
        where: { id: 'check-in-1' },
        data: { answeredAt: expect.any(Date), answeredVia: 'sms' },
      });
    });

    it('answers the alert when the clock marked it missed in the same instant', async () => {
      const t = build({ pending: checkIn() });
      t.prisma.checkIn.updateMany.mockResolvedValue({ count: 0 });
      t.prisma.checkIn.findUnique.mockResolvedValue(checkIn({ eventId: 'event-1' }));

      await expect(t.service.answer('elder-1')).resolves.toBe('withdrawn');
      expect(t.alerts.answerMissedCheckIn).toHaveBeenCalledWith('event-1', 'elder-1');
    });
  });
});
