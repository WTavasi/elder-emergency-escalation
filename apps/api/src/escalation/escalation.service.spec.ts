import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  AuditAction,
  DispatchMode,
  EventOutcome,
  EventState,
  NotificationStatus,
  Role,
  Severity,
} from '@prisma/client';
import { EscalationService } from './escalation.service';
import type { EscalationTimerService } from './escalation-timer.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { NoopRealtimePublisher } from '../realtime/realtime.publisher';

const rule = (
  tierOrder: number,
  responderRole: Role,
  timeoutSeconds: number | null,
  dispatchMode: DispatchMode = DispatchMode.SEQUENTIAL,
) => ({ tierOrder, responderRole, timeoutSeconds, dispatchMode, severity: Severity.STANDARD });

const STANDARD_RULES = [
  rule(1, Role.CAREGIVER, 120),
  rule(2, Role.FAMILY_MEMBER, 180),
  rule(3, Role.EMERGENCY_RESPONDER, null),
];

const CRITICAL_RULES = [
  rule(1, Role.CAREGIVER, 60),
  rule(2, Role.FAMILY_MEMBER, 60, DispatchMode.PARALLEL),
  rule(3, Role.EMERGENCY_RESPONDER, null),
];

const home = { latitude: -1.2833, longitude: 36.7833 };

const event = (overrides: Record<string, unknown> = {}) => ({
  id: 'event-1',
  elderlyId: 'elder-1',
  state: EventState.TRIGGERED,
  severity: Severity.STANDARD,
  currentTier: 1,
  acknowledgedBy: null,
  alertLatitude: home.latitude,
  alertLongitude: home.longitude,
  triggeredAt: new Date(Date.now() - 30_000),
  ...overrides,
});

interface PrismaMock {
  emergencyEvent: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  escalationRule: { findMany: jest.Mock };
  careAssignment: { findMany: jest.Mock; findFirst: jest.Mock };
  user: { findMany: jest.Mock };
  notification: { create: jest.Mock; updateMany: jest.Mock; findFirst: jest.Mock };
  auditLog: { create: jest.Mock };
  $transaction: jest.Mock;
}

let created = 1;
let claimed: Record<string, unknown> | null = null;

const buildPrisma = (): PrismaMock => {
  created = 1;
  claimed = null;
  const mock: PrismaMock = {
    emergencyEvent: {
      findUnique: jest.fn().mockResolvedValue(event()),
      update: jest
        .fn()
        .mockImplementation((args: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...event(), ...args.data }),
        ),
      // The conditional claim: one affected row means this caller won the race.
      updateMany: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        claimed = { ...event(), ...args.data };
        return Promise.resolve({ count: 1 });
      }),
      findUniqueOrThrow: jest.fn().mockImplementation(() => Promise.resolve(claimed ?? event())),
    },
    escalationRule: { findMany: jest.fn().mockResolvedValue(STANDARD_RULES) },
    careAssignment: {
      findMany: jest.fn().mockResolvedValue([{ responderId: 'caregiver-1' }]),
      findFirst: jest.fn().mockResolvedValue({ priorityOrder: 1 }),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    notification: {
      create: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ id: `notification-${created++}` })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation((fn: (tx: PrismaMock) => unknown) => fn(mock));
  return mock;
};

const buildTimers = () =>
  ({
    arm: jest.fn().mockResolvedValue(new Date()),
    cancelAll: jest.fn().mockResolvedValue(1),
    secondsRemaining: jest.fn(),
  }) as unknown as EscalationTimerService & { arm: jest.Mock; cancelAll: jest.Mock };

const buildNotifications = () =>
  ({ enqueue: jest.fn().mockResolvedValue(undefined) }) as unknown as NotificationsService & {
    enqueue: jest.Mock;
  };

const build = (
  prisma: PrismaMock,
  timers = buildTimers(),
  notifications = buildNotifications(),
): EscalationService =>
  new EscalationService(
    prisma as unknown as PrismaService,
    timers,
    notifications,
    new NoopRealtimePublisher(),
  );

/** Every (recipient, tier, channel) the service decided to notify. */
const notified = (
  prisma: PrismaMock,
): Array<{ recipientId: string; tier: number; channel: string }> =>
  prisma.notification.create.mock.calls.map(
    (call) => (call[0] as { data: { recipientId: string; tier: number; channel: string } }).data,
  );

const auditActions = (prisma: PrismaMock): string[] =>
  prisma.auditLog.create.mock.calls.map(
    (call) => (call[0] as { data: { action: string } }).data.action,
  );

describe('EscalationService', () => {
  describe('dispatchTier', () => {
    it('notifies the tier, marks the event notified, and arms the acknowledgement window', async () => {
      const prisma = buildPrisma();
      const timers = buildTimers();
      await build(prisma, timers).dispatchTier('event-1', 1, 'initial');

      expect(notified(prisma)).toEqual([
        expect.objectContaining({ recipientId: 'caregiver-1', tier: 1 }),
      ]);
      expect(prisma.emergencyEvent.update.mock.calls[0][0].data).toMatchObject({
        state: EventState.NOTIFIED,
        currentTier: 1,
      });
      expect(timers.arm).toHaveBeenCalledWith('event-1', 1, 120);
      expect(auditActions(prisma)).toContain(AuditAction.TIER_DISPATCHED);
    });

    it('queues the delivery only after the transaction commits', async () => {
      const prisma = buildPrisma();
      const notifications = buildNotifications();
      await build(prisma, buildTimers(), notifications).dispatchTier('event-1', 1, 'initial');

      expect(notifications.enqueue).toHaveBeenCalledWith(['notification-1']);
    });

    it('sends SMS alongside push when the rule says not to wait for a push failure', async () => {
      const prisma = buildPrisma();
      prisma.escalationRule.findMany.mockResolvedValue([
        { ...rule(1, Role.CAREGIVER, 60), smsFallbackImmediate: true },
      ]);

      await build(prisma).dispatchTier('event-1', 1, 'initial');
      expect(notified(prisma).map((notification) => notification.channel)).toEqual(['PUSH', 'SMS']);
    });

    it('records a durable deadline alongside the Redis timer', async () => {
      const prisma = buildPrisma();
      await build(prisma).dispatchTier('event-1', 1, 'initial');

      const deadline = prisma.emergencyEvent.update.mock.calls[0][0].data
        .currentTierDeadlineAt as Date;
      expect(deadline.getTime()).toBeGreaterThan(Date.now() + 119_000);
    });

    it('marks the event escalated when the dispatch follows a timeout', async () => {
      const prisma = buildPrisma();
      await build(prisma).dispatchTier('event-1', 2, 'escalation');
      expect(prisma.emergencyEvent.update.mock.calls[0][0].data.state).toBe(EventState.ESCALATED);
    });

    it('arms no timer on the final tier, which has nowhere left to escalate', async () => {
      const prisma = buildPrisma();
      const timers = buildTimers();
      await build(prisma, timers).dispatchTier('event-1', 3, 'escalation');

      expect(timers.arm).not.toHaveBeenCalled();
      expect(prisma.emergencyEvent.update.mock.calls[0][0].data.currentTierDeadlineAt).toBeNull();
    });

    it('escalates straight past a tier with nobody in it', async () => {
      const prisma = buildPrisma();
      // Tier 1 is empty, tier 2 has someone.
      prisma.careAssignment.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValue([{ responderId: 'family-1' }]);

      await build(prisma).dispatchTier('event-1', 1, 'initial');

      expect(auditActions(prisma)).toContain(AuditAction.ESCALATED);
      expect(notified(prisma)).toEqual([
        expect.objectContaining({ recipientId: 'family-1', tier: 2 }),
      ]);
    });

    it('sends a parallel tier out with the one before it, not after its timeout', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ severity: Severity.CRITICAL }));
      prisma.escalationRule.findMany.mockResolvedValue(CRITICAL_RULES);
      prisma.careAssignment.findMany.mockResolvedValue([{ responderId: 'someone' }]);

      await build(prisma).dispatchTier('event-1', 1, 'initial');

      expect(notified(prisma).map((notification) => notification.tier)).toEqual([1, 2]);
    });

    it('does nothing when the severity band has no rule for that tier', async () => {
      const prisma = buildPrisma();
      prisma.escalationRule.findMany.mockResolvedValue([rule(1, Role.CAREGIVER, 120)]);

      await build(prisma).dispatchTier('event-1', 2, 'escalation');
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('refuses to dispatch a cancelled emergency', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.CANCELLED }));

      await expect(build(prisma).dispatchTier('event-1', 1, 'initial')).rejects.toThrow(
        ConflictException,
      );
    });

    describe('the emergency responder tier', () => {
      it('picks responders whose coverage area contains the alert', async () => {
        const prisma = buildPrisma();
        prisma.user.findMany.mockResolvedValue([
          {
            id: 'unit-near',
            coverageLatitude: -1.286,
            coverageLongitude: 36.78,
            coverageRadiusKm: 5,
          },
          {
            id: 'unit-far',
            coverageLatitude: -4.05,
            coverageLongitude: 39.66,
            coverageRadiusKm: 6,
          },
        ]);

        await build(prisma).dispatchTier('event-1', 3, 'escalation');

        expect(notified(prisma)).toEqual([expect.objectContaining({ recipientId: 'unit-near' })]);
      });

      it('falls back to the assigned chain when no coverage area matches', async () => {
        const prisma = buildPrisma();
        prisma.user.findMany.mockResolvedValue([
          {
            id: 'unit-far',
            coverageLatitude: -4.05,
            coverageLongitude: 39.66,
            coverageRadiusKm: 6,
          },
        ]);
        prisma.careAssignment.findMany.mockResolvedValue([{ responderId: 'assigned-unit' }]);

        await build(prisma).dispatchTier('event-1', 3, 'escalation');

        expect(notified(prisma)).toEqual([
          expect.objectContaining({ recipientId: 'assigned-unit' }),
        ]);
      });
    });
  });

  describe('onTierTimeout', () => {
    it('promotes the event to the next tier', async () => {
      const prisma = buildPrisma();
      prisma.careAssignment.findMany.mockResolvedValue([{ responderId: 'family-1' }]);

      await build(prisma).onTierTimeout('event-1', 1);

      expect(auditActions(prisma)).toEqual([AuditAction.ESCALATED, AuditAction.TIER_DISPATCHED]);
      expect(prisma.emergencyEvent.update.mock.calls[0][0].data).toMatchObject({
        state: EventState.ESCALATED,
        currentTier: 2,
      });
    });

    it('ignores a timer that fires after someone has acknowledged', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ state: EventState.ACKNOWLEDGED, acknowledgedBy: 'caregiver-1' }),
      );

      await build(prisma).onTierTimeout('event-1', 1);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('ignores a stale timer from a tier the event has already left', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ currentTier: 3 }));

      await build(prisma).onTierTimeout('event-1', 1);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('ignores a timer for an event that has been resolved or cancelled', async () => {
      const prisma = buildPrisma();
      for (const state of [EventState.RESOLVED, EventState.CANCELLED]) {
        prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state }));
        await build(prisma).onTierTimeout('event-1', 1);
      }
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('records that the chain is exhausted rather than failing silently', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ currentTier: 3 }));

      await build(prisma).onTierTimeout('event-1', 3);

      const detail = prisma.auditLog.create.mock.calls[0][0].data.detail as { exhausted: boolean };
      expect(detail.exhausted).toBe(true);
    });
  });

  describe('acknowledge', () => {
    it('takes ownership, stops every timer, and records the response time', async () => {
      const prisma = buildPrisma();
      const timers = buildTimers();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.NOTIFIED }));

      const updated = await build(prisma, timers).acknowledge('event-1', 'caregiver-1', {
        latitude: -1.28,
        longitude: 36.78,
      });

      expect(updated.state).toBe(EventState.ACKNOWLEDGED);
      expect(updated.acknowledgedBy).toBe('caregiver-1');
      expect(timers.cancelAll).toHaveBeenCalledWith('event-1');

      const detail = prisma.auditLog.create.mock.calls[0][0].data.detail as {
        secondsFromTrigger: number;
        locationCaptured: boolean;
      };
      expect(detail.secondsFromTrigger).toBeGreaterThanOrEqual(29);
      expect(detail.locationCaptured).toBe(true);
    });

    it('accepts an acknowledgement without a location rather than refusing it', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.NOTIFIED }));

      const updated = await build(prisma).acknowledge('event-1', 'caregiver-1');
      expect(updated.state).toBe(EventState.ACKNOWLEDGED);
      expect(updated.responderLatitude).toBeNull();
    });

    it('marks the responder’s own notification as acknowledged', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.NOTIFIED }));

      await build(prisma).acknowledge('event-1', 'caregiver-1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1', recipientId: 'caregiver-1', acknowledgedAt: null },
        data: expect.objectContaining({ status: NotificationStatus.ACKNOWLEDGED }),
      });
    });

    it('refuses a second owner', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ state: EventState.ACKNOWLEDGED, acknowledgedBy: 'someone-else' }),
      );

      await expect(build(prisma).acknowledge('event-1', 'caregiver-1')).rejects.toThrow(
        /already responding/,
      );
    });

    it('refuses someone with no connection to the emergency', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.NOTIFIED }));
      prisma.careAssignment.findFirst.mockResolvedValue(null);
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(build(prisma).acknowledge('event-1', 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('gives ownership to exactly one of two responders acknowledging at the same instant', async () => {
      const prisma = buildPrisma();
      // Both callers read the event before either wrote, so both see acknowledgedBy
      // null and both pass the guard. The database decides between them: the second
      // conditional update matches no row, because the first already set the column.
      prisma.emergencyEvent.updateMany
        .mockImplementationOnce((args: { data: Record<string, unknown> }) => {
          claimed = { ...event(), ...args.data };
          return Promise.resolve({ count: 1 });
        })
        .mockImplementationOnce(() => Promise.resolve({ count: 0 }));

      const service = build(prisma);
      const results = await Promise.allSettled([
        service.acknowledge(event().id, 'caregiver-1'),
        service.acknowledge(event().id, 'family-1'),
      ]);

      const won = results.filter((r) => r.status === 'fulfilled');
      const lost = results.filter((r) => r.status === 'rejected');

      expect(won).toHaveLength(1);
      expect(lost).toHaveLength(1);
      expect((lost[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
      expect(prisma.emergencyEvent.updateMany).toHaveBeenCalledTimes(2);
    });

    it('accepts a responder who was notified but is not in the chain', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.ESCALATED }));
      prisma.careAssignment.findFirst.mockResolvedValue(null);
      prisma.notification.findFirst.mockResolvedValue({ id: 'notification-1' });

      await expect(build(prisma).acknowledge('event-1', 'unit-near')).resolves.toBeDefined();
    });
  });

  describe('resolve', () => {
    it('closes the emergency with an outcome and clears the timers', async () => {
      const prisma = buildPrisma();
      const timers = buildTimers();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.ACKNOWLEDGED }));

      const updated = await build(prisma, timers).resolve(
        'event-1',
        'caregiver-1',
        EventOutcome.HANDLED_AT_HOME,
      );

      expect(updated.state).toBe(EventState.RESOLVED);
      expect(updated.outcome).toBe(EventOutcome.HANDLED_AT_HOME);
      expect(timers.cancelAll).toHaveBeenCalled();
      expect(auditActions(prisma)).toContain(AuditAction.RESOLVED);
    });

    it('refuses to resolve an emergency that is already closed', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.RESOLVED }));

      await expect(
        build(prisma).resolve('event-1', 'caregiver-1', EventOutcome.FALSE_ALARM),
      ).rejects.toThrow(/already closed/);
    });
  });

  describe('requestResponder', () => {
    it('jumps to the responder tier and stops the automatic chain', async () => {
      const prisma = buildPrisma();
      const timers = buildTimers();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.NOTIFIED }));
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'unit-near',
          coverageLatitude: -1.286,
          coverageLongitude: 36.78,
          coverageRadiusKm: 5,
        },
      ]);

      await build(prisma, timers).requestResponder('event-1', 'caregiver-1');

      expect(timers.cancelAll).toHaveBeenCalledWith('event-1');
      expect(auditActions(prisma)).toContain(AuditAction.RESPONDER_REQUESTED);
      expect(notified(prisma)).toEqual([
        expect.objectContaining({ recipientId: 'unit-near', tier: 3 }),
      ]);
    });

    it('refuses someone outside the emergency', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.NOTIFIED }));
      prisma.careAssignment.findFirst.mockResolvedValue(null);
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(build(prisma).requestResponder('event-1', 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
