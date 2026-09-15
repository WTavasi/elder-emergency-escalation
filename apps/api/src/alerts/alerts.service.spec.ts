import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditAction, CareLevel, EventState, Role, Severity } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import { AlertsService } from './alerts.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SeverityService } from '../severity/severity.service';
import type { EscalationService } from '../escalation/escalation.service';
import type { EscalationTimerService } from '../escalation/escalation-timer.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { NoopRealtimePublisher } from '../realtime/realtime.publisher';

const settings: Record<string, number> = { CANCEL_GRACE_WINDOW: 10, RECENT_ACTIVITY_HOURS: 6 };
const config = {
  get: (key: string, fallback: number) => settings[key] ?? fallback,
} as unknown as ConfigService;

const assessment = {
  score: 45,
  band: Severity.ELEVATED,
  factors: [
    {
      key: 'care_level',
      label: 'Care level',
      weight: 30,
      value: 1,
      contribution: 30,
      detail: 'high dependency',
    },
  ],
};

const buildSeverity = (band: Severity = Severity.ELEVATED) =>
  ({
    evaluate: jest.fn().mockResolvedValue({ ...assessment, band }),
    highestOf: jest.fn((a: Severity, b: Severity) => {
      const order = [Severity.STANDARD, Severity.ELEVATED, Severity.CRITICAL];
      return order.indexOf(a) >= order.indexOf(b) ? a : b;
    }),
  }) as unknown as SeverityService & { evaluate: jest.Mock; highestOf: jest.Mock };

const elder = {
  id: 'elder-1',
  role: Role.ELDER,
  careLevel: CareLevel.HIGH_DEPENDENCY,
  homeLatitude: -1.2833,
  homeLongitude: 36.7833,
  homeAddressLabel: 'Kileleshwa, Nairobi',
  timezone: 'Africa/Nairobi',
  assignmentsAsElder: [
    {
      coverDaysOfWeek: [1, 2, 3, 4, 5],
      coverStartMinute: 480,
      coverEndMinute: 1020,
      priorityOrder: 1,
    },
  ],
};

const event = (overrides: Record<string, unknown> = {}) => ({
  id: '1f7f2b6e-0000-4000-8000-000000000001',
  elderlyId: 'elder-1',
  state: EventState.TRIGGERED,
  severity: Severity.STANDARD,
  severityScore: 10,
  currentTier: 1,
  alertLatitude: -1.2833,
  alertLongitude: 36.7833,
  triggeredAt: new Date(),
  ...overrides,
});

interface PrismaMock {
  user: { findUnique: jest.Mock };
  careAssignment: { findFirst: jest.Mock; findMany: jest.Mock };
  emergencyEvent: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
  auditLog: { create: jest.Mock; createMany: jest.Mock; findMany: jest.Mock };
  notification: { findMany: jest.Mock };
  $transaction: jest.Mock;
}

const buildPrisma = (): PrismaMock => {
  const mock: PrismaMock = {
    user: { findUnique: jest.fn().mockResolvedValue(elder) },
    careAssignment: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    emergencyEvent: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ ...event(), elder: elder, owner: null })),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation((args: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...event(), ...args.data }),
        ),
      update: jest
        .fn()
        .mockImplementation((args: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...event(), ...args.data }),
        ),
      count: jest.fn().mockResolvedValue(0),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    notification: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation((fn: (tx: PrismaMock) => unknown) => fn(mock));
  return mock;
};

const buildEscalation = () =>
  ({ dispatchTier: jest.fn().mockResolvedValue(undefined) }) as unknown as EscalationService & {
    dispatchTier: jest.Mock;
  };

const buildTimers = () =>
  ({ cancelAll: jest.fn().mockResolvedValue(1) }) as unknown as EscalationTimerService & {
    cancelAll: jest.Mock;
  };

const buildNotifications = () =>
  ({
    notifyCancellation: jest.fn().mockResolvedValue(undefined),
  }) as unknown as NotificationsService & { notifyCancellation: jest.Mock };

const build = (
  prisma: PrismaMock,
  severity = buildSeverity(),
  escalation = buildEscalation(),
  timers = buildTimers(),
  notifications = buildNotifications(),
): AlertsService =>
  new AlertsService(
    prisma as unknown as PrismaService,
    severity,
    escalation,
    timers,
    notifications,
    new NoopRealtimePublisher(),
    config,
  );

describe('AlertsService', () => {
  describe('create', () => {
    it('records the alert with the severity band and score the policy returned', async () => {
      const prisma = buildPrisma();
      const created = await build(prisma).create('elder-1', { latitude: -1.28, longitude: 36.78 });

      expect(created.severity).toBe(Severity.ELEVATED);
      expect(created.severityScore).toBe(45);
      expect(created.state).toBe(EventState.TRIGGERED);
      expect(created.currentTier).toBe(1);
    });

    it('scores with the cancel window still open, since tier one goes out immediately', async () => {
      const prisma = buildPrisma();
      const severity = buildSeverity();
      await build(prisma, severity).create('elder-1', { latitude: -1.28, longitude: 36.78 });

      expect(severity.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          cancelWindowElapsed: false,
          careLevel: CareLevel.HIGH_DEPENDENCY,
        }),
      );
    });

    it('writes the creation and the scoring to the audit log, in one transaction', async () => {
      const prisma = buildPrisma();
      await build(prisma).create('elder-1', { latitude: -1.28, longitude: 36.78 });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const entries = prisma.auditLog.createMany.mock.calls[0][0].data as Array<
        Record<string, unknown>
      >;
      expect(entries.map((entry) => entry.action)).toEqual([
        AuditAction.EVENT_CREATED,
        AuditAction.SEVERITY_EVALUATED,
      ]);
      // The system did the scoring, so that entry has no human actor.
      expect(entries[1].actorId).toBeNull();
    });

    it('falls back to the registered home label when no address is supplied', async () => {
      const prisma = buildPrisma();
      await build(prisma).create('elder-1', { latitude: -1.28, longitude: 36.78 });
      expect(prisma.emergencyEvent.create.mock.calls[0][0].data.alertAddressLabel).toBe(
        'Kileleshwa, Nairobi',
      );
    });

    it('dispatches the first tier before returning, so a timer is running', async () => {
      const prisma = buildPrisma();
      const escalation = buildEscalation();
      await build(prisma, buildSeverity(), escalation).create('elder-1', {
        latitude: -1.28,
        longitude: 36.78,
      });

      expect(escalation.dispatchTier).toHaveBeenCalledWith(expect.any(String), 1, 'initial');
    });

    it('refuses anyone who is not the person being cared for', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue({ ...elder, role: Role.CAREGIVER });
      await expect(
        build(prisma).create('elder-1', { latitude: -1.28, longitude: 36.78 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses an account that no longer exists', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        build(prisma).create('elder-1', { latitude: -1.28, longitude: 36.78 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancel', () => {
    it('cancels inside the grace window and records how long it took', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ triggeredAt: new Date(Date.now() - 4000) }),
      );

      const updated = await build(prisma).cancel(event().id, 'elder-1');

      expect(updated.state).toBe(EventState.CANCELLED);
      const entry = prisma.auditLog.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(entry.action).toBe(AuditAction.CANCELLED);
      expect((entry.detail as { secondsAfterTrigger: number }).secondsAfterTrigger).toBe(4);
    });

    it('stops the pending timers when the alert is withdrawn', async () => {
      const prisma = buildPrisma();
      const timers = buildTimers();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ triggeredAt: new Date(Date.now() - 2000) }),
      );

      await build(prisma, buildSeverity(), buildEscalation(), timers).cancel(event().id, 'elder-1');
      expect(timers.cancelAll).toHaveBeenCalledWith(event().id);
    });

    it('tells everyone who was alerted that it was withdrawn', async () => {
      const prisma = buildPrisma();
      const notifications = buildNotifications();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ triggeredAt: new Date(Date.now() - 2000) }),
      );

      await build(prisma, buildSeverity(), buildEscalation(), buildTimers(), notifications).cancel(
        event().id,
        'elder-1',
      );
      expect(notifications.notifyCancellation).toHaveBeenCalledWith(event().id);
    });

    it('refuses once the grace window has passed', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ triggeredAt: new Date(Date.now() - 30_000) }),
      );

      await expect(build(prisma).cancel(event().id, 'elder-1')).rejects.toThrow(
        /window to cancel has passed/,
      );
    });

    it('refuses anyone other than the person who raised it', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event());
      await expect(build(prisma).cancel(event().id, 'caregiver-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses once somebody has taken ownership', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.ACKNOWLEDGED }));
      await expect(build(prisma).cancel(event().id, 'elder-1')).rejects.toThrow(
        /already responding/,
      );
    });

    it('refuses to cancel twice', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.CANCELLED }));
      await expect(build(prisma).cancel(event().id, 'elder-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('reopen', () => {
    const cancelled = () =>
      event({ state: EventState.CANCELLED, severity: Severity.STANDARD, severityScore: 20 });

    it('restarts the chain at the tier of the person reopening it', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(cancelled());
      prisma.careAssignment.findFirst.mockResolvedValue({ priorityOrder: 2 });

      const updated = await build(prisma).reopen(
        cancelled().id,
        'family-1',
        'called twice, no answer',
      );

      expect(updated.state).toBe(EventState.TRIGGERED);
      expect(updated.currentTier).toBe(2);
      expect(updated.resolvedAt).toBeNull();
    });

    it('records who reopened it and why', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(cancelled());
      prisma.careAssignment.findFirst.mockResolvedValue({ priorityOrder: 1 });

      await build(prisma).reopen(cancelled().id, 'caregiver-1', 'no answer on two calls');

      const entry = prisma.auditLog.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(entry.action).toBe(AuditAction.REOPENED);
      expect(entry.actorId).toBe('caregiver-1');
      expect(entry.previousState).toBe(EventState.CANCELLED);
      expect((entry.detail as { reason: string }).reason).toBe('no answer on two calls');
    });

    it('re-scores with the cancel window treated as elapsed, and never lowers the band', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(cancelled());
      prisma.careAssignment.findFirst.mockResolvedValue({ priorityOrder: 1 });
      const severity = buildSeverity(Severity.STANDARD);

      const updated = await build(prisma, severity).reopen(cancelled().id, 'caregiver-1');

      expect(severity.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({ cancelWindowElapsed: true }),
      );
      // The stored score was 20 and the new assessment scores 45, so the higher wins.
      expect(updated.severityScore).toBe(45);
    });

    it('restarts the chain at the reopening tier', async () => {
      const prisma = buildPrisma();
      const escalation = buildEscalation();
      prisma.emergencyEvent.findUnique.mockResolvedValue(cancelled());
      prisma.careAssignment.findFirst.mockResolvedValue({ priorityOrder: 2 });

      await build(prisma, buildSeverity(), escalation).reopen(cancelled().id, 'family-1');
      expect(escalation.dispatchTier).toHaveBeenCalledWith(cancelled().id, 2, 'initial');
    });

    it('refuses to reopen anything that is not cancelled', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.TRIGGERED }));
      await expect(build(prisma).reopen(event().id, 'caregiver-1')).rejects.toThrow(
        /Only a cancelled alert/,
      );
    });

    it('refuses someone outside the care chain', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(cancelled());
      prisma.careAssignment.findFirst.mockResolvedValue(null);
      await expect(build(prisma).reopen(cancelled().id, 'stranger-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lets the elder reopen their own alert', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(cancelled());
      const updated = await build(prisma).reopen(cancelled().id, 'elder-1');
      expect(updated.state).toBe(EventState.TRIGGERED);
      expect(prisma.careAssignment.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('gives an outsider a not-found rather than confirming the id exists', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event());
      prisma.careAssignment.findFirst.mockResolvedValue(null);

      await expect(build(prisma).findOne(event().id, 'stranger-1', Role.CAREGIVER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lets a chain member and an administrator through', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event());
      prisma.careAssignment.findFirst.mockResolvedValue({ priorityOrder: 1 });

      await expect(
        build(prisma).findOne(event().id, 'caregiver-1', Role.CAREGIVER),
      ).resolves.toBeDefined();
      await expect(
        build(prisma).findOne(event().id, 'admin-1', Role.ADMINISTRATOR),
      ).resolves.toBeDefined();
    });
  });

  describe('findForUser', () => {
    it('scopes a caregiver to the elders whose chains they belong to', async () => {
      const prisma = buildPrisma();
      prisma.careAssignment.findMany.mockResolvedValue([
        { elderlyId: 'elder-1' },
        { elderlyId: 'elder-2' },
      ]);

      await build(prisma).findForUser('caregiver-1', Role.CAREGIVER);

      const where = prisma.emergencyEvent.findMany.mock.calls[0][0].where as {
        elderlyId: { in: string[] };
      };
      expect(where.elderlyId.in).toEqual(['caregiver-1', 'elder-1', 'elder-2']);
    });

    it('filters to open emergencies when asked', async () => {
      const prisma = buildPrisma();
      await build(prisma).findForUser('caregiver-1', Role.CAREGIVER, { onlyOpen: true });

      const where = prisma.emergencyEvent.findMany.mock.calls[0][0].where as {
        state: { in: EventState[] };
      };
      expect(where.state.in).toContain(EventState.TRIGGERED);
      expect(where.state.in).not.toContain(EventState.CANCELLED);
    });

    it('narrows by state, severity and date when the history view asks', async () => {
      const prisma = buildPrisma();
      const from = new Date('2026-01-01T00:00:00.000Z');
      const to = new Date('2026-01-31T00:00:00.000Z');

      await build(prisma).findForUser('admin-1', Role.ADMINISTRATOR, {
        states: [EventState.ESCALATED],
        severities: [Severity.CRITICAL],
        from,
        to,
      });

      const where = prisma.emergencyEvent.findMany.mock.calls[0][0].where as {
        state: { in: EventState[] };
        severity: { in: Severity[] };
        triggeredAt: { gte: Date; lte: Date };
      };
      expect(where.state.in).toEqual([EventState.ESCALATED]);
      expect(where.severity.in).toEqual([Severity.CRITICAL]);
      expect(where.triggeredAt).toEqual({ gte: from, lte: to });
    });

    it('caps the page size, so a caller cannot ask for the whole table', async () => {
      const prisma = buildPrisma();
      await build(prisma).findForUser('admin-1', Role.ADMINISTRATOR, { limit: 10_000 });

      expect(prisma.emergencyEvent.findMany.mock.calls[0][0].take).toBe(200);
    });
  });
});
