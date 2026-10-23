import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  AlertTrigger,
  AuditAction,
  CareLevel,
  EventOutcome,
  EventState,
  Prisma,
  Role,
  Severity,
} from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { JourneyService } from './journey.service';
import type { VoiceService } from './voice.service';
import type { VolunteerCallsService } from '../../community-service/services/volunteer-calls.service';
import { AlertsService } from './alerts.service';
import type { PrismaService } from '../../../db/prisma.service';
import type { SeverityService } from './severity.service';
import type { EscalationService } from './escalation.service';
import type { EscalationTimerService } from './escalation-timer.service';
import type { NotificationsService } from '../../notification-service/services/notifications.service';
import { NoopRealtimePublisher } from '../../realtime-service/services/realtime.publisher';

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
  // At home, which is the normal case.
  currentLatitude: null,
  currentLongitude: null,
  currentPlaceLabel: null,
  timezone: 'Africa/Nairobi',
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
  notification: { findMany: jest.Mock; findFirst: jest.Mock };
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
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
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
  ({
    cancelAll: jest.fn().mockResolvedValue(1),
    armSeverityReview: jest.fn().mockResolvedValue(undefined),
  }) as unknown as EscalationTimerService & {
    cancelAll: jest.Mock;
    armSeverityReview: jest.Mock;
  };

const buildNotifications = () =>
  ({
    notifyCancellation: jest.fn().mockResolvedValue(undefined),
  }) as unknown as NotificationsService & { notifyCancellation: jest.Mock };

const buildVolunteers = () =>
  ({
    onAlert: jest.fn().mockResolvedValue(null),
    eventClosed: jest.fn().mockResolvedValue(undefined),
  }) as unknown as VolunteerCallsService & { onAlert: jest.Mock; eventClosed: jest.Mock };

const build = (
  prisma: PrismaMock,
  severity = buildSeverity(),
  escalation = buildEscalation(),
  timers = buildTimers(),
  notifications = buildNotifications(),
  volunteers = buildVolunteers(),
): AlertsService =>
  new AlertsService(
    prisma as unknown as PrismaService,
    severity,
    escalation,
    timers,
    notifications,
    new NoopRealtimePublisher(),
    config,
    { current: jest.fn().mockResolvedValue(null) } as unknown as JourneyService,
    {
      current: jest.fn().mockResolvedValue({ available: false, startedBy: null, startedAt: null }),
    } as unknown as VoiceService,
    volunteers,
  );

describe('AlertsService', () => {
  describe('create', () => {
    it('arms the severity review for when the cancel window closes', async () => {
      const prisma = buildPrisma();
      const timers = buildTimers();
      const created = await build(prisma, buildSeverity(), buildEscalation(), timers).create(
        'elder-1',
        {},
      );
      expect(timers.armSeverityReview).toHaveBeenCalledWith(created.id, 10);
    });

    it('still raises the alert if the review cannot be armed, leaving it to the sweep', async () => {
      const prisma = buildPrisma();
      const timers = buildTimers();
      const escalation = buildEscalation();
      timers.armSeverityReview.mockRejectedValue(new Error('redis down'));

      await expect(
        build(prisma, buildSeverity(), escalation, timers).create('elder-1', {}),
      ).resolves.toBeDefined();
      expect(escalation.dispatchTier).toHaveBeenCalled();
    });

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

  describe('where the emergency is located', () => {
    it('uses the registered home, not whatever the caller sent', async () => {
      const prisma = buildPrisma();
      const severity = buildSeverity();

      // A caller claiming to be somewhere else. The claim is ignored, because an input
      // to a severity decision does not belong in the caller's hands.
      await build(prisma, severity).create('elder-1', { latitude: 1.11, longitude: 2.22 });

      expect(severity.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          alertLocation: { latitude: -1.2833, longitude: 36.7833 },
        }),
      );
      expect(prisma.emergencyEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ alertAddressLabel: 'Kileleshwa, Nairobi' }),
        }),
      );
    });

    it('uses a recorded stay away from home when one is set', async () => {
      const prisma = buildPrisma();
      const severity = buildSeverity();
      prisma.user.findUnique.mockResolvedValue({
        ...elder,
        currentLatitude: -1.31,
        currentLongitude: 36.83,
        currentPlaceLabel: 'Staying with her daughter, South B',
      });

      await build(prisma, severity).create('elder-1', {});

      expect(severity.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          alertLocation: { latitude: -1.31, longitude: 36.83 },
          // The home never moves, so the away-from-home factor has something to measure
          // against and actually scores.
          homeLocation: { latitude: -1.2833, longitude: 36.7833 },
        }),
      );
      expect(prisma.emergencyEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            alertAddressLabel: 'Staying with her daughter, South B',
          }),
        }),
      );
    });

    it('falls back to the caller only when no home was ever recorded', async () => {
      const prisma = buildPrisma();
      const severity = buildSeverity();
      prisma.user.findUnique.mockResolvedValue({
        ...elder,
        homeLatitude: null,
        homeLongitude: null,
        homeAddressLabel: null,
      });

      await build(prisma, severity).create('elder-1', { latitude: 1.11, longitude: 2.22 });

      expect(severity.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({ alertLocation: { latitude: 1.11, longitude: 2.22 } }),
      );
    });

    it('still raises the alert when nothing at all is known about the location', async () => {
      const prisma = buildPrisma();
      prisma.user.findUnique.mockResolvedValue({
        ...elder,
        homeLatitude: null,
        homeLongitude: null,
        homeAddressLabel: null,
      });

      // An emergency that cannot be located is still an emergency. Refusing a panic
      // request over an incomplete profile would be the worst place to enforce data
      // quality, so this must not throw.
      const created = await build(prisma).create('elder-1', {});
      expect(created.state).toBe(EventState.TRIGGERED);
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

    it('stands down any volunteers who were asked', async () => {
      const prisma = buildPrisma();
      const volunteers = buildVolunteers();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ triggeredAt: new Date(Date.now() - 2000) }),
      );

      await build(
        prisma,
        buildSeverity(),
        buildEscalation(),
        buildTimers(),
        buildNotifications(),
        volunteers,
      ).cancel(event().id, 'elder-1');
      expect(volunteers.eventClosed).toHaveBeenCalledWith(event().id);
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

    it('still cancels inside the window when an empty first tier has already escalated it', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        event({ state: EventState.ESCALATED, acknowledgedBy: null }),
      );

      const cancelled = await build(prisma).cancel(event().id, 'elder-1');

      expect(cancelled.state).toBe(EventState.CANCELLED);
      // Conditional on nobody owning it, checked by the write itself.
      expect(prisma.emergencyEvent.update.mock.calls[0][0].where).toMatchObject({
        acknowledgedBy: null,
      });
    });

    it('loses to a caregiver who acknowledges in the same instant', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ acknowledgedBy: null }));
      prisma.emergencyEvent.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('No record', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );

      await expect(build(prisma).cancel(event().id, 'elder-1')).rejects.toThrow(/changed/);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
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

    it('restarts the chain once when two people reopen it at the same moment', async () => {
      const prisma = buildPrisma();
      const escalation = buildEscalation();
      prisma.emergencyEvent.findUnique.mockResolvedValue(cancelled());
      prisma.careAssignment.findFirst.mockResolvedValue({ priorityOrder: 1 });
      // The other reopen committed first, so this write finds the row no longer cancelled.
      prisma.emergencyEvent.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('No record', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );

      await expect(
        build(prisma, buildSeverity(), escalation).reopen(cancelled().id, 'caregiver-1'),
      ).rejects.toThrow(ConflictException);
      expect(escalation.dispatchTier).not.toHaveBeenCalled();
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

    it('does not count the alert being reopened as its own recent history', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(cancelled());
      prisma.careAssignment.findFirst.mockResolvedValue({ priorityOrder: 1 });

      await build(prisma).reopen(cancelled().id, 'caregiver-1');

      const where = prisma.emergencyEvent.count.mock.calls[0][0].where as { id: unknown };
      expect(where.id).toEqual({ not: cancelled().id });
    });

    it('marks the severity as reviewed, since it was scored with the window closed', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(cancelled());
      prisma.careAssignment.findFirst.mockResolvedValue({ priorityOrder: 1 });

      const updated = await build(prisma).reopen(cancelled().id, 'caregiver-1');
      expect(updated.severityReviewedAt).toBeInstanceOf(Date);
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

  describe('an alert raised by a missed check-in', () => {
    it('is held at the standard band whatever the factors say, and never reviewed', async () => {
      const prisma = buildPrisma();
      const timers = buildTimers();
      const created = await build(
        prisma,
        buildSeverity(Severity.CRITICAL),
        buildEscalation(),
        timers,
      ).create('elder-1', {}, { trigger: AlertTrigger.MISSED_CHECK_IN });

      expect(created.severity).toBe(Severity.STANDARD);
      expect(prisma.emergencyEvent.create.mock.calls[0][0].data.trigger).toBe(
        AlertTrigger.MISSED_CHECK_IN,
      );
      expect(timers.armSeverityReview).not.toHaveBeenCalled();
    });

    it('is recorded as raised by the system, not by the elder', async () => {
      const prisma = buildPrisma();
      await build(prisma).create('elder-1', {}, { trigger: AlertTrigger.MISSED_CHECK_IN });

      const entries = prisma.auditLog.createMany.mock.calls[0][0].data as Array<
        Record<string, unknown>
      >;
      expect(entries[0].action).toBe(AuditAction.EVENT_CREATED);
      expect(entries[0].actorId).toBeNull();
      expect(entries[0].detail).toEqual({ trigger: AlertTrigger.MISSED_CHECK_IN });
    });

    it('a press of the button is still a panic alert', async () => {
      const prisma = buildPrisma();
      await build(prisma).create('elder-1', {});
      expect(prisma.emergencyEvent.create.mock.calls[0][0].data.trigger).toBe(AlertTrigger.PANIC);
    });
  });

  describe('answerMissedCheckIn', () => {
    const missed = (overrides: Record<string, unknown> = {}) =>
      event({ trigger: AlertTrigger.MISSED_CHECK_IN, acknowledgedBy: null, ...overrides });

    it('withdraws the alert when nobody has taken it on, and tells everyone', async () => {
      const prisma = buildPrisma();
      const timers = buildTimers();
      const notifications = buildNotifications();
      prisma.emergencyEvent.findUnique.mockResolvedValue(missed());

      const outcome = await build(
        prisma,
        buildSeverity(),
        buildEscalation(),
        timers,
        notifications,
      ).answerMissedCheckIn(event().id, 'elder-1');

      expect(outcome).toBe('withdrawn');
      expect(timers.cancelAll).toHaveBeenCalledWith(event().id);
      const update = prisma.emergencyEvent.update.mock.calls[0][0];
      expect(update.data.state).toBe(EventState.CANCELLED);
      expect(update.data.outcome).toBe(EventOutcome.CANCELLED_BY_ELDER);
      // Only if still nobody's: somebody taking it on in the same instant keeps it.
      expect(update.where.acknowledgedBy).toBeNull();
      const actions = (
        prisma.auditLog.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>
      ).map((entry) => entry.action);
      expect(actions).toEqual([AuditAction.CHECKED_IN_LATE, AuditAction.CANCELLED]);
      expect(notifications.notifyCancellation).toHaveBeenCalledWith(event().id);
    });

    it('only notes the answer when somebody is already coming', async () => {
      const prisma = buildPrisma();
      const timers = buildTimers();
      prisma.emergencyEvent.findUnique.mockResolvedValue(
        missed({ state: EventState.ACKNOWLEDGED, acknowledgedBy: 'carer-1' }),
      );

      const outcome = await build(
        prisma,
        buildSeverity(),
        buildEscalation(),
        timers,
      ).answerMissedCheckIn(event().id, 'elder-1');

      expect(outcome).toBe('noted');
      expect(timers.cancelAll).not.toHaveBeenCalled();
      expect(prisma.emergencyEvent.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe(AuditAction.CHECKED_IN_LATE);
    });

    it('does nothing to an alert that is already over', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(missed({ state: EventState.RESOLVED }));

      await expect(build(prisma).answerMissedCheckIn(event().id, 'elder-1')).resolves.toBe('noted');
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('never withdraws a press of the button, which only the elder can cancel', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event({ trigger: AlertTrigger.PANIC }));

      await expect(build(prisma).answerMissedCheckIn(event().id, 'elder-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses an alert raised for another elder', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(missed({ elderlyId: 'elder-2' }));

      await expect(build(prisma).answerMissedCheckIn(event().id, 'elder-1')).rejects.toThrow(
        ForbiddenException,
      );
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

    it('lets in somebody outside the chain who was asked about this emergency', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findUnique.mockResolvedValue(event());
      prisma.careAssignment.findFirst.mockResolvedValue(null);
      prisma.notification.findFirst.mockResolvedValue({ id: 'notification-1' });

      await expect(
        build(prisma).findOne(event().id, 'area-responder-1', Role.EMERGENCY_RESPONDER),
      ).resolves.toBeDefined();
    });

    it('carries the volunteer, named for the elder by first name only', async () => {
      const prisma = buildPrisma();
      const volunteers = buildVolunteers();
      volunteers.onAlert.mockResolvedValue({ asked: 3, name: 'Joseph' });
      prisma.emergencyEvent.findUnique.mockResolvedValue(event());

      const detail = await build(
        prisma,
        buildSeverity(),
        buildEscalation(),
        buildTimers(),
        buildNotifications(),
        volunteers,
      ).findOne(event().id, 'elder-1', Role.ELDER);

      expect(volunteers.onAlert).toHaveBeenCalledWith(event().id, true);
      expect(detail.volunteer).toEqual({ asked: 3, name: 'Joseph' });
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
    const listed = (state: EventState) => ({
      ...event({ state, outcome: null, outcomeNote: null }),
      alertAddressLabel: 'Kileleshwa',
      acknowledgedAt: null,
      resolvedAt: null,
      currentTierDeadlineAt: null,
      responderRequestedAt: null,
      owner: null,
      elder: {
        id: 'elder-1',
        name: 'Grace',
        phone: '+254700000010',
        homeAddressLabel: 'Kileleshwa',
        consentsAboutMe: [
          { type: 'LOCATION_SHARING', withdrawnAt: new Date() },
          { type: 'CONTACT_SHARING', withdrawnAt: new Date() },
        ],
      },
    });

    it('leaves out what the elder withdrew once the emergency is over, and says so', async () => {
      const prisma = buildPrisma();
      prisma.careAssignment.findMany.mockResolvedValue([{ elderlyId: 'elder-1' }]);
      prisma.emergencyEvent.findMany.mockResolvedValue([listed(EventState.RESOLVED)]);

      const [alert] = await build(prisma).findForUser('caregiver-1', Role.CAREGIVER);

      expect(alert.elder.phone).toBeNull();
      expect(alert.addressLabel).toBeNull();
      expect(alert.latitude).toBeNull();
      expect(alert.withheld).toEqual(['phone', 'location']);
    });

    it('shows it all while the emergency is open, and always to the elder herself', async () => {
      const prisma = buildPrisma();
      prisma.careAssignment.findMany.mockResolvedValue([{ elderlyId: 'elder-1' }]);
      prisma.emergencyEvent.findMany.mockResolvedValue([listed(EventState.NOTIFIED)]);
      const [open] = await build(prisma).findForUser('caregiver-1', Role.CAREGIVER);
      expect(open.elder.phone).toBe('+254700000010');
      expect(open.withheld).toEqual([]);

      prisma.emergencyEvent.findMany.mockResolvedValue([listed(EventState.RESOLVED)]);
      const [own] = await build(prisma).findForUser('elder-1', Role.ELDER);
      expect(own.addressLabel).toBe('Kileleshwa');
    });

    it('scopes a caregiver to the elders whose chains they belong to', async () => {
      const prisma = buildPrisma();
      prisma.careAssignment.findMany.mockResolvedValue([
        { elderlyId: 'elder-1' },
        { elderlyId: 'elder-2' },
      ]);

      await build(prisma).findForUser('caregiver-1', Role.CAREGIVER);

      const where = prisma.emergencyEvent.findMany.mock.calls[0][0].where as {
        OR: [{ elderlyId: { in: string[] } }, { notifications: { some: { recipientId: string } } }];
      };
      expect(where.OR[0].elderlyId.in).toEqual(['caregiver-1', 'elder-1', 'elder-2']);
      // And anything they were asked about outside those chains, by area for instance.
      expect(where.OR[1].notifications.some.recipientId).toBe('caregiver-1');
    });

    it("matches part of the elder's name or the responder's, without regard to case", async () => {
      const prisma = buildPrisma();
      await build(prisma).findForUser('admin-1', Role.ADMINISTRATOR, { q: '  grace ' });

      const where = prisma.emergencyEvent.findMany.mock.calls[0][0].where as {
        AND: Array<{ OR: Array<Record<string, { name: unknown }>> }>;
      };
      const either = where.AND[0].OR;
      expect(either[0].elder.name).toEqual({ contains: 'grace', mode: 'insensitive' });
      expect(either[1].owner.name).toEqual({ contains: 'grace', mode: 'insensitive' });
    });

    it('finds missed check-ins by the words people would type', async () => {
      for (const q of ['check-in', 'Missed', 'checkin']) {
        const prisma = buildPrisma();
        await build(prisma).findForUser('admin-1', Role.ADMINISTRATOR, { q });
        const where = prisma.emergencyEvent.findMany.mock.calls[0][0].where as {
          AND: Array<{ OR: Array<Record<string, unknown>> }>;
        };
        expect(where.AND[0].OR).toContainEqual({ trigger: AlertTrigger.MISSED_CHECK_IN });
      }

      const prisma = buildPrisma();
      await build(prisma).findForUser('admin-1', Role.ADMINISTRATOR, { q: 'grace' });
      const where = prisma.emergencyEvent.findMany.mock.calls[0][0].where as {
        AND: Array<{ OR: unknown[] }>;
      };
      expect(where.AND[0].OR).toHaveLength(2);
    });

    it('keeps the scope when searching, rather than replacing it', async () => {
      const prisma = buildPrisma();
      await build(prisma).findForUser('caregiver-1', Role.CAREGIVER, { q: 'mary' });

      const where = prisma.emergencyEvent.findMany.mock.calls[0][0].where as {
        OR?: unknown[];
        AND?: unknown[];
      };
      // Both present: the scope's OR (whose emergencies these are) and the search's.
      expect(where.OR).toBeDefined();
      expect(where.AND).toHaveLength(1);
    });

    it('skips to a numbered page, and counts with the same filter', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.count.mockResolvedValue(312);
      const filters = { offset: 50, limit: 50, onlyOpen: true };

      await build(prisma).findForUser('admin-1', Role.ADMINISTRATOR, filters);
      const total = await build(prisma).countForUser('admin-1', Role.ADMINISTRATOR, filters);

      const page = prisma.emergencyEvent.findMany.mock.calls[0][0];
      expect(page.skip).toBe(50);
      expect(total).toBe(312);
      expect(prisma.emergencyEvent.count.mock.calls.at(-1)[0].where).toEqual(page.where);
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

    it("asks for the elder's number, so a caregiver can call before deciding to go", async () => {
      const prisma = buildPrisma();
      await build(prisma).findForUser('caregiver-1', Role.CAREGIVER);

      // Asserted at the query rather than on the output: if the select drops the column,
      // the projection would quietly send undefined and the call button would dial nobody.
      const include = prisma.emergencyEvent.findMany.mock.calls[0][0].include as {
        elder: { select: Record<string, boolean> };
      };
      expect(include.elder.select.phone).toBe(true);
    });
  });
});
