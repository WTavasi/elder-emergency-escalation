import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  AuditAction,
  DispatchMode,
  EventOutcome,
  EventState,
  NotificationStatus,
  EmergencyType,
  Prisma,
  ResponderService,
  Role,
  Severity,
  TypeDispatch,
} from '@prisma/client';
import { EscalationService } from './escalation.service';
import { StationDispatchService } from './station-dispatch.service';
import { RoutingService } from '../../../shared/routing/routing.service';
import type { RedisService } from '../../../shared/redis/redis.service';
import type { EscalationTimerService } from './escalation-timer.service';
import type { SeverityService } from './severity.service';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../../db/prisma.service';
import type { NotificationsService } from '../../notification-service/services/notifications.service';
import { NoopRealtimePublisher } from '../../realtime-service/services/realtime.publisher';
import type { VolunteerCallsService } from '../../community-service/services/volunteer-calls.service';

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

const CRITICAL_RULES_WITH_SMS = CRITICAL_RULES.map((candidate) => ({
  ...candidate,
  smsFallbackImmediate: candidate.tierOrder < 3,
}));

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
    findMany: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    count: jest.Mock;
  };
  escalationRule: { findMany: jest.Mock };
  emergencyTypeRule: { findUnique: jest.Mock };
  careAssignment: { findMany: jest.Mock; findFirst: jest.Mock };
  user: { findMany: jest.Mock; findUnique: jest.Mock };
  notification: {
    create: jest.Mock;
    updateMany: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
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
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    escalationRule: { findMany: jest.fn().mockResolvedValue(STANDARD_RULES) },
    emergencyTypeRule: { findUnique: jest.fn().mockResolvedValue(null) },
    careAssignment: {
      findMany: jest.fn().mockResolvedValue([{ responderId: 'caregiver-1' }]),
      findFirst: jest.fn().mockResolvedValue({ priorityOrder: 1 }),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ role: Role.CAREGIVER }),
    },
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ id: `notification-${created++}` })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
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

const buildSeverity = (band: Severity = Severity.STANDARD, score = 30) =>
  ({
    evaluate: jest.fn().mockResolvedValue({ score, band, factors: [] }),
    highestOf: jest.fn((a: Severity, b: Severity) => {
      const order = [Severity.STANDARD, Severity.ELEVATED, Severity.CRITICAL];
      return order.indexOf(a) >= order.indexOf(b) ? a : b;
    }),
  }) as unknown as SeverityService & { evaluate: jest.Mock };

const config = {
  get: (_key: string, fallback: unknown) => fallback,
} as unknown as ConfigService;

const buildVolunteers = () =>
  ({
    askNearby: jest.fn().mockResolvedValue(0),
    eventClosed: jest.fn().mockResolvedValue(undefined),
  }) as unknown as VolunteerCallsService & { askNearby: jest.Mock; eventClosed: jest.Mock };

/** Redis for the station waits: what is set, and what is cleared. */
const buildRedis = () => ({
  client: {
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  },
});

const build = (
  prisma: PrismaMock,
  timers = buildTimers(),
  notifications = buildNotifications(),
  severity = buildSeverity(),
  volunteers = buildVolunteers(),
  redis = buildRedis(),
): EscalationService => {
  // The real station service, over the same tables, with the straight-line estimate.
  const routing = new RoutingService(redis as unknown as RedisService, config);
  const stations = new StationDispatchService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    routing,
    notifications,
    config,
    new NoopRealtimePublisher(),
  );
  return new EscalationService(
    prisma as unknown as PrismaService,
    timers,
    notifications,
    new NoopRealtimePublisher(),
    severity,
    config,
    volunteers,
    stations,
  );
};

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

  describe('community volunteers', () => {
    it('are asked with a critical alert from its first tier', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ severity: Severity.CRITICAL }));
      prisma.escalationRule.findMany.mockResolvedValue(CRITICAL_RULES);
      const volunteers = buildVolunteers();

      await build(
        prisma,
        buildTimers(),
        buildNotifications(),
        buildSeverity(),
        volunteers,
      ).dispatchTier('event-1', 1, 'initial');

      expect(volunteers.askNearby).toHaveBeenCalledWith('event-1', 'critical');
    });

    it('are not asked for an ordinary alert at the family tiers', async () => {
      const volunteers = buildVolunteers();
      await build(
        buildPrisma(),
        buildTimers(),
        buildNotifications(),
        buildSeverity(),
        volunteers,
      ).dispatchTier('event-1', 1, 'initial');

      expect(volunteers.askNearby).not.toHaveBeenCalled();
    });

    it('are asked when no professional responder covers the place', async () => {
      const prisma = buildPrisma();
      prisma.user.findMany.mockResolvedValue([]);
      prisma.careAssignment.findMany.mockResolvedValue([{ responderId: 'assigned-unit' }]);
      const volunteers = buildVolunteers();

      await build(
        prisma,
        buildTimers(),
        buildNotifications(),
        buildSeverity(),
        volunteers,
      ).dispatchTier('event-1', 3, 'escalation');

      expect(volunteers.askNearby).toHaveBeenCalledWith('event-1', 'uncovered');
      // Beside the fallback, never instead of it.
      expect(notified(prisma)).toEqual([expect.objectContaining({ recipientId: 'assigned-unit' })]);
    });

    it('are not asked when a professional responder covers the place', async () => {
      const prisma = buildPrisma();
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'unit-near',
          coverageLatitude: -1.286,
          coverageLongitude: 36.78,
          coverageRadiusKm: 5,
        },
      ]);
      const volunteers = buildVolunteers();

      await build(
        prisma,
        buildTimers(),
        buildNotifications(),
        buildSeverity(),
        volunteers,
      ).dispatchTier('event-1', 3, 'escalation');

      expect(volunteers.askNearby).not.toHaveBeenCalled();
    });

    it('a dispatch never waits for them, nor fails because of them', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ severity: Severity.CRITICAL }));
      prisma.escalationRule.findMany.mockResolvedValue(CRITICAL_RULES);
      const volunteers = buildVolunteers();
      volunteers.askNearby.mockRejectedValue(new Error('push provider down'));

      await expect(
        build(
          prisma,
          buildTimers(),
          buildNotifications(),
          buildSeverity(),
          volunteers,
        ).dispatchTier('event-1', 1, 'initial'),
      ).resolves.toBeUndefined();
      expect(notified(prisma).length).toBeGreaterThan(0);
    });

    it('are stood down when the emergency is closed', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.ACKNOWLEDGED }));
      const volunteers = buildVolunteers();

      await build(prisma, buildTimers(), buildNotifications(), buildSeverity(), volunteers).resolve(
        'event-1',
        'caregiver-1',
        EventOutcome.HANDLED_AT_HOME,
      );

      expect(volunteers.eventClosed).toHaveBeenCalledWith('event-1');
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

    it('records whether the answer came from the app or a text reply', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.NOTIFIED }));

      await build(prisma).acknowledge('event-1', 'caregiver-1', undefined, 'sms');

      const detail = prisma.auditLog.create.mock.calls[0][0].data.detail as { via: string };
      expect(detail.via).toBe('sms');
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
        /already on the way/,
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
      // Two claims; the winner then also clears any station wait.
      const claims = prisma.emergencyEvent.updateMany.mock.calls.filter(
        (call) => (call[0] as { where: Record<string, unknown> }).where.acknowledgedBy === null,
      );
      expect(claims).toHaveLength(2);
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

    it("records the closer's own words, and puts them in the trail too", async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.ACKNOWLEDGED }));

      await build(prisma).resolve(
        'event-1',
        'caregiver-1',
        EventOutcome.OTHER,
        '  She had locked herself out and a neighbour let her in  ',
      );

      const update = prisma.emergencyEvent.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      // Trimmed, because leading whitespace from a phone keyboard is not part of what
      // somebody said.
      expect(update.data.outcomeNote).toBe('She had locked herself out and a neighbour let her in');

      const audit = prisma.auditLog.create.mock.calls
        .map(
          (call: [{ data: { action: AuditAction; detail?: { note?: string } } }]) => call[0].data,
        )
        .find((d: { action: AuditAction }) => d.action === AuditAction.RESOLVED);
      expect(audit?.detail?.note).toContain('locked herself out');
    });

    it('stores nothing rather than an empty note when none was given', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.ACKNOWLEDGED }));

      await build(prisma).resolve('event-1', 'caregiver-1', EventOutcome.HANDLED_AT_HOME, '   ');

      const update = prisma.emergencyEvent.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      // A column that is sometimes '' and sometimes null is two ways to say the same
      // thing, and every later query would have to know about both.
      expect(update.data.outcomeNote).toBeNull();
    });
  });

  describe('reviewSeverity', () => {
    const elder = {
      id: 'elder-1',
      careLevel: 'ASSISTED',
      homeLatitude: home.latitude,
      homeLongitude: home.longitude,
      timezone: 'Africa/Nairobi',
    };
    // Raised ten seconds ago, tier one asked then with a 120 second window.
    const raised = (overrides: Record<string, unknown> = {}) =>
      event({
        state: EventState.NOTIFIED,
        severity: Severity.STANDARD,
        severityScore: 15,
        severityReviewedAt: null,
        currentTierDeadlineAt: new Date(Date.now() + 110_000),
        elder,
        ...overrides,
      });

    it('scores again with "did not cancel" counted, once, and records why', async () => {
      const prisma = buildPrisma();
      const severity = buildSeverity(Severity.ELEVATED, 45);
      prisma.emergencyEvent.findUnique.mockResolvedValue(raised());
      prisma.escalationRule.findMany.mockResolvedValue(STANDARD_RULES);

      await build(prisma, buildTimers(), buildNotifications(), severity).reviewSeverity('event-1');

      expect(severity.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({ cancelWindowElapsed: true }),
      );
      // Its own alert is not its own recent history.
      expect(prisma.emergencyEvent.count.mock.calls[0][0].where.id).toEqual({ not: 'event-1' });

      const claim = prisma.emergencyEvent.updateMany.mock.calls[0][0];
      expect(claim.where).toMatchObject({ id: 'event-1', severityReviewedAt: null });
      expect(claim.data).toMatchObject({ severity: Severity.ELEVATED, severityScore: 45 });

      const audit = prisma.auditLog.create.mock.calls[0][0].data;
      expect(audit.action).toBe(AuditAction.SEVERITY_EVALUATED);
      expect(audit.detail).toMatchObject({
        stage: 'cancel_window_closed',
        severityBefore: Severity.STANDARD,
        severityAfter: Severity.ELEVATED,
      });
    });

    it('does nothing for an emergency already reviewed, or no longer open', async () => {
      const severity = buildSeverity();
      for (const state of [
        raised({ severityReviewedAt: new Date() }),
        raised({ state: EventState.CANCELLED }),
      ]) {
        const prisma = buildPrisma();
        prisma.emergencyEvent.findUnique.mockResolvedValue(state);
        await build(prisma, buildTimers(), buildNotifications(), severity).reviewSeverity(
          'event-1',
        );
        expect(prisma.emergencyEvent.updateMany).not.toHaveBeenCalled();
      }
      expect(severity.evaluate).not.toHaveBeenCalled();
    });

    it('stands down when a cancel or the other reviewer got there first', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(raised());
      prisma.emergencyEvent.updateMany.mockResolvedValue({ count: 0 });

      await build(
        prisma,
        buildTimers(),
        buildNotifications(),
        buildSeverity(Severity.CRITICAL, 75),
      ).reviewSeverity('event-1');

      expect(prisma.auditLog.create).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('brings a promotion to critical forward without restarting the chain', async () => {
      const prisma = buildPrisma();
      const timers = buildTimers();
      const notifications = buildNotifications();
      prisma.emergencyEvent.findUnique.mockResolvedValue(raised());
      prisma.emergencyEvent.findUniqueOrThrow.mockResolvedValue(
        raised({ severity: Severity.CRITICAL }),
      );
      prisma.escalationRule.findMany.mockImplementation((args: { where: { severity: Severity } }) =>
        Promise.resolve(
          args.where.severity === Severity.CRITICAL ? CRITICAL_RULES_WITH_SMS : STANDARD_RULES,
        ),
      );
      // Tier one was pushed to the caregiver and has had no SMS yet.
      prisma.notification.findMany
        .mockResolvedValueOnce([{ recipientId: 'caregiver-1' }])
        .mockResolvedValueOnce([]);

      const volunteers = buildVolunteers();
      await build(
        prisma,
        timers,
        notifications,
        buildSeverity(Severity.CRITICAL, 75),
        volunteers,
      ).reviewSeverity('event-1');

      // Volunteers go out once it is critical, as they would have from the start.
      expect(volunteers.askNearby).toHaveBeenCalledWith('event-1', 'critical');

      // The critical window is 60 seconds from when tier one was asked, about 50 left.
      const [, armedTier, seconds] = timers.arm.mock.calls[0] as [string, number, number];
      expect(armedTier).toBe(1);
      expect(seconds).toBeGreaterThanOrEqual(49);
      expect(seconds).toBeLessThanOrEqual(51);

      // Texted now, because the critical band does not wait for a push to fail.
      expect(notified(prisma)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ recipientId: 'caregiver-1', tier: 1, channel: 'SMS' }),
        ]),
      );
      // And the family tier, which the critical band sends alongside, goes out now.
      expect(notified(prisma).some((row) => row.tier === 2)).toBe(true);
      expect(notifications.enqueue).toHaveBeenCalled();
    });

    it('records a promotion but changes nothing once somebody owns the emergency', async () => {
      const prisma = buildPrisma();
      const timers = buildTimers();
      prisma.emergencyEvent.findUnique.mockResolvedValue(raised());
      prisma.emergencyEvent.findUniqueOrThrow.mockResolvedValue(
        raised({
          state: EventState.ACKNOWLEDGED,
          acknowledgedBy: 'caregiver-1',
          severity: Severity.CRITICAL,
        }),
      );

      await build(
        prisma,
        timers,
        buildNotifications(),
        buildSeverity(Severity.CRITICAL, 75),
      ).reviewSeverity('event-1');

      expect(prisma.auditLog.create).toHaveBeenCalled();
      expect(timers.arm).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('catches up on every emergency whose window closed unreviewed', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findMany.mockResolvedValue([{ id: 'event-1' }, { id: 'event-2' }]);
      const service = build(prisma);
      const review = jest.spyOn(service, 'reviewSeverity').mockResolvedValue(undefined);

      expect(await service.reviewOverdueSeverity()).toBe(2);
      expect(review).toHaveBeenCalledWith('event-1');
      expect(review).toHaveBeenCalledWith('event-2');
      expect(prisma.emergencyEvent.findMany.mock.calls[0][0].where).toMatchObject({
        severityReviewedAt: null,
      });
    });
  });

  describe('lifecycle guards', () => {
    const stale = () =>
      new Prisma.PrismaClientKnownRequestError('No record', {
        code: 'P2025',
        clientVersion: 'test',
      });

    it('stands down when an acknowledgement lands between a timeout reading and writing', async () => {
      const prisma = buildPrisma();
      const timers = buildTimers();
      const notifications = buildNotifications();
      prisma.emergencyEvent.update.mockRejectedValue(stale());

      await build(prisma, timers, notifications).dispatchTier('event-1', 2, 'escalation');

      // A timer may only act on an emergency nobody owns, and the write says so.
      expect(prisma.emergencyEvent.update.mock.calls[0][0].where).toMatchObject({
        acknowledgedBy: null,
      });
      expect(notifications.enqueue).not.toHaveBeenCalled();
      expect(timers.arm).not.toHaveBeenCalled();
    });

    it('lets the owner call in a responder on an emergency they have taken on', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ state: EventState.ACKNOWLEDGED, acknowledgedBy: 'caregiver-1' }),
      );

      await build(prisma).dispatchTier('event-1', 3, 'manual');

      const write = prisma.emergencyEvent.update.mock.calls[0][0];
      expect(write.data.state).toBe(EventState.ESCALATED);
      expect(write.where).not.toHaveProperty('acknowledgedBy');
    });

    it('keeps an escalated emergency escalated when a parallel tier goes out with it', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.ESCALATED }));

      await build(prisma).dispatchTier('event-1', 2, 'initial');

      expect(prisma.emergencyEvent.update.mock.calls[0][0].data.state).toBe(EventState.ESCALATED);
    });
  });

  describe('reportType', () => {
    const covering = (id: string, responderService: ResponderService) => ({
      id,
      coverageLatitude: home.latitude,
      coverageLongitude: home.longitude,
      coverageRadiusKm: 5,
      responderService,
    });
    const typeRule = (
      type: EmergencyType,
      service: ResponderService,
      severityFloor: Severity,
      dispatch: TypeDispatch,
    ) => ({ type, service, severityFloor, dispatch });

    it("raises severity to the type's floor and asks its service at once, beside the family", async () => {
      const prisma = buildPrisma();
      const volunteers = buildVolunteers();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.NOTIFIED }));
      prisma.emergencyTypeRule.findUnique.mockResolvedValue(
        typeRule(
          EmergencyType.FIRE,
          ResponderService.FIRE,
          Severity.CRITICAL,
          TypeDispatch.IMMEDIATE,
        ),
      );
      prisma.user.findMany.mockResolvedValue([
        covering('fire-station', ResponderService.FIRE),
        covering('response-unit', ResponderService.GENERAL),
      ]);

      await build(
        prisma,
        buildTimers(),
        buildNotifications(),
        buildSeverity(),
        volunteers,
      ).reportType('event-1', 'elder-1', EmergencyType.FIRE);

      const report = prisma.emergencyEvent.updateMany.mock.calls[0][0].data;
      expect(report).toMatchObject({
        reportedType: EmergencyType.FIRE,
        reportedTypeVia: 'app',
        severity: Severity.CRITICAL,
      });
      expect(notified(prisma)).toEqual([
        expect.objectContaining({ recipientId: 'fire-station', tier: 3, channel: 'PUSH' }),
        expect.objectContaining({ recipientId: 'fire-station', tier: 3, channel: 'SMS' }),
      ]);
      expect(auditActions(prisma)).toEqual(
        expect.arrayContaining([AuditAction.TYPE_REPORTED, AuditAction.SERVICE_DISPATCHED]),
      );
      expect(volunteers.askNearby).toHaveBeenCalledWith('event-1', 'critical');
    });

    it('never lowers severity: a fall on a critical alert stays critical, and waits for the responder step', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ state: EventState.NOTIFIED, severity: Severity.CRITICAL }),
      );
      prisma.emergencyTypeRule.findUnique.mockResolvedValue(
        typeRule(
          EmergencyType.FALL,
          ResponderService.AMBULANCE,
          Severity.ELEVATED,
          TypeDispatch.AT_RESPONDER_TIER,
        ),
      );

      await build(prisma).reportType('event-1', 'elder-1', EmergencyType.FALL);

      expect(prisma.emergencyEvent.updateMany.mock.calls[0][0].data.severity).toBe(
        Severity.CRITICAL,
      );
      expect(notified(prisma)).toEqual([]);
      expect(auditActions(prisma)).not.toContain(AuditAction.SERVICE_DISPATCHED);
    });

    it('asks a service once, however many reports come in', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.NOTIFIED }));
      prisma.emergencyTypeRule.findUnique.mockResolvedValue(
        typeRule(
          EmergencyType.BREATHING,
          ResponderService.AMBULANCE,
          Severity.CRITICAL,
          TypeDispatch.IMMEDIATE,
        ),
      );
      prisma.user.findMany.mockResolvedValue([covering('ambulance', ResponderService.AMBULANCE)]);
      // The report itself is recorded; the claim on asking a service finds it already taken.
      prisma.emergencyEvent.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await build(prisma).reportType('event-1', 'elder-1', EmergencyType.BREATHING);

      expect(notified(prisma)).toEqual([]);
      expect(auditActions(prisma)).not.toContain(AuditAction.SERVICE_DISPATCHED);
    });

    it('falls back to a responder who takes any call when that service does not cover the place', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.NOTIFIED }));
      prisma.emergencyTypeRule.findUnique.mockResolvedValue(
        typeRule(
          EmergencyType.UNSAFE,
          ResponderService.POLICE,
          Severity.CRITICAL,
          TypeDispatch.IMMEDIATE,
        ),
      );
      prisma.user.findMany.mockResolvedValue([
        covering('ambulance', ResponderService.AMBULANCE),
        covering('response-unit', ResponderService.GENERAL),
      ]);

      await build(prisma).reportType('event-1', 'elder-1', EmergencyType.UNSAFE);

      expect(new Set(notified(prisma).map((row) => row.recipientId))).toEqual(
        new Set(['response-unit']),
      );
    });

    it('asks volunteers nearby when no responder of any service covers the place', async () => {
      const prisma = buildPrisma();
      const volunteers = buildVolunteers();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ state: EventState.NOTIFIED, severity: Severity.CRITICAL }),
      );
      prisma.emergencyTypeRule.findUnique.mockResolvedValue(
        typeRule(
          EmergencyType.FIRE,
          ResponderService.FIRE,
          Severity.CRITICAL,
          TypeDispatch.IMMEDIATE,
        ),
      );

      await build(
        prisma,
        buildTimers(),
        buildNotifications(),
        buildSeverity(),
        volunteers,
      ).reportType('event-1', 'elder-1', EmergencyType.FIRE);

      expect(notified(prisma)).toEqual([]);
      expect(volunteers.askNearby).toHaveBeenCalledWith('event-1', 'uncovered');
    });

    it('refuses someone outside the emergency', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.NOTIFIED }));
      prisma.careAssignment.findFirst.mockResolvedValue(null);
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(
        build(prisma).reportType('event-1', 'stranger', EmergencyType.FIRE),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.emergencyEvent.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('choosing responders by service', () => {
    it('asks the service the reported type needs when the chain reaches its responders', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ state: EventState.ESCALATED, currentTier: 2, reportedType: EmergencyType.FALL }),
      );
      prisma.emergencyTypeRule.findUnique.mockResolvedValue({
        type: EmergencyType.FALL,
        service: ResponderService.AMBULANCE,
        severityFloor: Severity.ELEVATED,
        dispatch: TypeDispatch.AT_RESPONDER_TIER,
      });
      prisma.user.findMany.mockResolvedValue(
        [
          ['police-post', ResponderService.POLICE],
          ['ambulance', ResponderService.AMBULANCE],
        ].map(([id, responderService]) => ({
          id,
          coverageLatitude: home.latitude,
          coverageLongitude: home.longitude,
          coverageRadiusKm: 5,
          responderService,
        })),
      );

      await build(prisma).dispatchTier('event-1', 3, 'escalation');

      expect(new Set(notified(prisma).map((row) => row.recipientId))).toEqual(
        new Set(['ambulance']),
      );
    });
  });

  describe('declining when asked ahead of the chain', () => {
    it('records a service saying it cannot come, and leaves the chain where it was', async () => {
      const prisma = buildPrisma();
      const timers = buildTimers();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ state: EventState.NOTIFIED }));
      prisma.notification.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ tier: 3 }]);

      await build(prisma, timers).decline('event-1', 'fire-station', 'Engine out on a call');

      expect(timers.cancelAll).not.toHaveBeenCalled();
      expect(notified(prisma)).toEqual([]);
      const declined = prisma.auditLog.create.mock.calls[0][0].data;
      expect(declined).toMatchObject({ action: AuditAction.DECLINED });
      expect(declined.detail).toMatchObject({ early: true, tier: 3 });
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

    it('records which service was asked, so it is not asked twice', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ state: EventState.ACKNOWLEDGED, reportedType: EmergencyType.FALL }),
      );
      prisma.emergencyTypeRule.findUnique.mockResolvedValue({
        type: EmergencyType.FALL,
        service: ResponderService.AMBULANCE,
        severityFloor: Severity.ELEVATED,
        dispatch: TypeDispatch.AT_RESPONDER_TIER,
      });

      await build(prisma).requestResponder('event-1', 'caregiver-1');

      expect(prisma.emergencyEvent.update.mock.calls[0][0].data).toMatchObject({
        serviceRequested: ResponderService.AMBULANCE,
      });
    });

    it('does not ask again once a service was asked at once for an urgent type', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ state: EventState.ACKNOWLEDGED, serviceRequestedAt: new Date() }),
      );

      await expect(build(prisma).requestResponder('event-1', 'caregiver-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('refuses an emergency responder, who would be asking for themselves', async () => {
      const prisma = buildPrisma();
      const timers = buildTimers();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ state: EventState.ESCALATED, currentTier: 3 }),
      );
      prisma.user.findUnique.mockResolvedValue({ role: Role.EMERGENCY_RESPONDER });

      await expect(build(prisma, timers).requestResponder('event-1', 'unit-near')).rejects.toThrow(
        "You're the emergency responder on this alert.",
      );
      expect(timers.cancelAll).not.toHaveBeenCalled();
      expect(notified(prisma)).toEqual([]);
    });

    it('does not ask again once a responder has been asked', async () => {
      const prisma = buildPrisma();
      const timers = buildTimers();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ state: EventState.ACKNOWLEDGED, responderRequestedAt: new Date() }),
      );

      await expect(
        build(prisma, timers).requestResponder('event-1', 'caregiver-1'),
      ).rejects.toThrow(ConflictException);
      expect(timers.cancelAll).not.toHaveBeenCalled();
    });

    it('does not ask again once the chain has reached the responders on its own', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ state: EventState.ESCALATED, currentTier: 3 }),
      );

      await expect(build(prisma).requestResponder('event-1', 'caregiver-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('stations, nearest first', () => {
    /** A police station [km] east of Grace's home, covering it. */
    const station = (id: string, km: number) => ({
      id,
      name: id,
      responderService: ResponderService.POLICE,
      coverageLatitude: -1.2833,
      coverageLongitude: 36.7833,
      coverageRadiusKm: 6,
      stationLabel: `${id}, Nairobi`,
      stationLatitude: -1.2833,
      stationLongitude: 36.7833 + km / 111.3,
    });

    it('the responder step asks only the nearest station by road, and starts its wait', async () => {
      const prisma = buildPrisma();
      prisma.user.findMany.mockResolvedValue([
        station('Kileleshwa Police Station', 3),
        station('Kilimani Police Station', 1),
      ]);
      const redis = buildRedis();

      await build(
        prisma,
        buildTimers(),
        buildNotifications(),
        buildSeverity(),
        buildVolunteers(),
        redis,
      ).dispatchTier('event-1', 3, 'escalation');

      expect(notified(prisma).map((row) => row.recipientId)).toEqual(['Kilimani Police Station']);
      expect(auditActions(prisma)).toContain(AuditAction.STATION_ASKED);
      expect(redis.client.set).toHaveBeenCalledWith('escalation:station:event-1', '1', 'EX', 180);
    });

    it('a station that cannot come is passed over at once for the next nearest', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ state: EventState.ESCALATED, currentTier: 3 }),
      );
      prisma.user.findUnique.mockResolvedValue({ role: Role.EMERGENCY_RESPONDER });
      prisma.user.findMany.mockResolvedValue([
        station('Kilimani Police Station', 1),
        station('Kileleshwa Police Station', 3),
      ]);
      prisma.notification.findMany
        .mockResolvedValueOnce([{ id: 'n1', declinedAt: null }]) // what the station was asked
        .mockResolvedValueOnce([{ recipientId: 'Kilimani Police Station' }]) // asked already
        .mockResolvedValueOnce([{ recipientId: 'Kileleshwa Police Station' }]); // still able to answer

      await build(prisma).decline('event-1', 'Kilimani Police Station', 'Car out on a call');

      expect(notified(prisma).map((row) => row.recipientId)).toEqual([
        'Kileleshwa Police Station',
        'Kileleshwa Police Station',
      ]);
      const asked = prisma.auditLog.create.mock.calls
        .map((call) => (call[0] as { data: { action: string; detail: unknown } }).data)
        .find((entry) => entry.action === AuditAction.STATION_ASKED);
      expect(asked?.detail).toMatchObject({ reason: 'declined' });
    });

    it('a station silent for its whole wait has the next nearest asked too', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ state: EventState.ESCALATED, currentTier: 3, stationDeadlineAt: new Date() }),
      );
      prisma.user.findMany.mockResolvedValue([
        station('Kilimani Police Station', 1),
        station('Kileleshwa Police Station', 3),
      ]);
      prisma.notification.findMany.mockResolvedValue([{ recipientId: 'Kilimani Police Station' }]);

      await build(prisma).onStationTimeout('event-1');

      expect(notified(prisma)[0]).toMatchObject({ recipientId: 'Kileleshwa Police Station' });
    });

    it('asks no further station once somebody has taken it on', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({
          state: EventState.ACKNOWLEDGED,
          acknowledgedBy: 'Kilimani Police Station',
          stationDeadlineAt: new Date(),
        }),
      );
      prisma.user.findMany.mockResolvedValue([station('Kileleshwa Police Station', 3)]);

      await build(prisma).onStationTimeout('event-1');

      expect(notified(prisma)).toEqual([]);
    });
  });

  describe('decline', () => {
    const asked = (declinedAt: Date | null = null) => [{ id: 'n1', declinedAt }];

    it('escalates at once when the only contact asked says they cannot come', async () => {
      const prisma = buildPrisma();
      prisma.notification.findMany
        .mockResolvedValueOnce(asked()) // what this person was asked
        .mockResolvedValueOnce([]); // nobody left who could still answer

      const timers = buildTimers();
      await build(prisma, timers).decline(event().id, 'caregiver-1', 'Two hours away');

      // The point of the feature: the window is stopped rather than waited out.
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: AuditAction.DECLINED, actorId: 'caregiver-1' }),
        }),
      );
      expect(timers.cancelAll).toHaveBeenCalledWith(event().id);
    });

    it('records the tier and the reason, so the trail explains the jump', async () => {
      const prisma = buildPrisma();
      prisma.notification.findMany.mockResolvedValueOnce(asked()).mockResolvedValueOnce([]);

      await build(prisma).decline(event().id, 'caregiver-1', 'Two hours away');

      const logged = prisma.auditLog.create.mock.calls[0][0].data as {
        detail: { tier: number; reason: string | null };
      };
      expect(logged.detail.tier).toBe(1);
      expect(logged.detail.reason).toBe('Two hours away');
    });

    it('records a decline from the app as such unless told otherwise', async () => {
      const prisma = buildPrisma();
      prisma.notification.findMany.mockResolvedValueOnce(asked()).mockResolvedValueOnce([]);

      await build(prisma).decline(event().id, 'caregiver-1');

      const logged = prisma.auditLog.create.mock.calls[0][0].data as { detail: { via: string } };
      expect(logged.detail.via).toBe('app');
    });

    it('accepts a decline with no reason given', async () => {
      const prisma = buildPrisma();
      prisma.notification.findMany.mockResolvedValueOnce(asked()).mockResolvedValueOnce([]);

      await build(prisma).decline(event().id, 'caregiver-1');

      const logged = prisma.auditLog.create.mock.calls[0][0].data as {
        detail: { reason: string | null };
      };
      expect(logged.detail.reason).toBeNull();
    });

    it('waits when another contact at the same tier could still answer', async () => {
      const prisma = buildPrisma();
      prisma.notification.findMany
        .mockResolvedValueOnce(asked())
        .mockResolvedValueOnce([{ recipientId: 'family-1' }]);

      const timers = buildTimers();
      await build(prisma, timers).decline(event().id, 'caregiver-1');

      // The critical band dispatches two tiers at once. Escalating on the first
      // decline would cut short somebody in the middle of accepting.
      expect(timers.cancelAll).not.toHaveBeenCalled();
    });

    it('refuses once somebody has taken ownership', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue({
        ...event(),
        acknowledgedBy: 'family-1',
      });

      await expect(build(prisma).decline(event().id, 'caregiver-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses somebody this tier never asked', async () => {
      const prisma = buildPrisma();
      prisma.notification.findMany.mockResolvedValueOnce([]);

      // Being asked is what confers the right to decline. Otherwise a contact further
      // down the chain could decline on tier one's behalf.
      await expect(build(prisma).decline(event().id, 'stranger-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('is idempotent, because a retry on a weak signal is not a failure', async () => {
      const prisma = buildPrisma();
      prisma.notification.findMany.mockResolvedValueOnce(asked(new Date()));

      await build(prisma).decline(event().id, 'caregiver-1');

      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
