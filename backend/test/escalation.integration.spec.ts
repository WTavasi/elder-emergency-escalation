import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AuditAction,
  EmergencyType,
  EventState,
  NotificationChannel,
  NotificationStatus,
  ResponderService,
  Role,
  Severity,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AlertsService } from '../src/modules/emergency-service/services/alerts.service';
import { EscalationService } from '../src/modules/emergency-service/services/escalation.service';
import { PrismaService } from '../src/db/prisma.service';
import { PasswordService } from '../src/modules/auth-service/services/password.service';
import { RedisService } from '../src/shared/redis/redis.service';
import type { SeverityAssessment } from '../src/modules/emergency-service/models/severity.types';

/**
 * The claim this project makes is that an unacknowledged emergency climbs the chain by
 * itself. Every other test mocks the clock or the database. This one does not: it runs
 * against real Postgres and real Redis, sets a two second acknowledgement window, waits,
 * and checks that the emergency actually moved up a tier because a Redis key expired and
 * the listener acted on it.
 *
 * Requires: docker compose up -d, and migrations applied.
 */
describe('escalation, end to end', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let alerts: AlertsService;
  let escalation: EscalationService;

  // The elder's registered home. Written to the account in setup, and never passed to
  // alerts.create: the server resolves where an emergency is from the account itself, so
  // passing it here would test the fallback rung instead of the real path.
  const home = { latitude: -1.2833, longitude: 36.7833 };
  const suffix = Date.now().toString().slice(-7);
  const ids: {
    elder?: string;
    caregiver?: string;
    family?: string;
    secondFamily?: string;
    station?: string;
    nearPolice?: string;
    farPolice?: string;
  } = {};
  let originalTimeout: number | null = null;

  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Waits for something to become true, rather than for a length of time.
   *
   * Sleeping for a fixed period and then asserting works on a developer machine and
   * fails on a shared CI runner, because the chain being measured here is Redis
   * publishing an expiry, a listener receiving it, a dispatch running and a row being
   * written, and none of that has a bounded duration. This polls instead: as fast as
   * the machine allows, and patient when the machine is busy. A timeout reports what
   * it was waiting for, so a genuine failure still reads as one rather than as a
   * confusing assertion four seconds later.
   *
   * Only for asserting that something HAPPENS. Proving that something does not happen
   * still needs a fixed wait longer than the window, and those are left alone below.
   */
  const waitFor = async (
    what: string,
    condition: () => Promise<boolean>,
    timeoutMs = 20_000,
  ): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await condition()) return;
      await wait(100);
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${what}`);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    // Fail here with an explanation rather than four seconds later with a confusing
    // state assertion. Without expiry events nothing in this suite can pass.
    const redis = app.get(RedisService);
    const reply: unknown = await redis.client.config('GET', 'notify-keyspace-events');
    const flags = Array.isArray(reply) ? String(reply[1] ?? '') : '';
    if (!RedisService.publishesExpiry(flags)) {
      throw new Error(
        `Redis is not publishing key expiry events (flags: "${flags}"), so no timer can ever fire. Check which server is on the port with: lsof -nP -iTCP:6379 -sTCP:LISTEN`,
      );
    }

    prisma = app.get(PrismaService);
    alerts = app.get(AlertsService);
    escalation = app.get(EscalationService);
    const passwords = app.get(PasswordService);
    const passwordHash = passwords.hash('Integration!2026');

    const caregiver = await prisma.user.create({
      data: {
        name: 'Test Caregiver',
        phone: `+2547111${suffix}`,
        role: Role.CAREGIVER,
        passwordHash,
      },
    });
    const family = await prisma.user.create({
      data: {
        name: 'Test Family',
        phone: `+2547222${suffix}`,
        role: Role.FAMILY_MEMBER,
        passwordHash,
      },
    });
    const elder = await prisma.user.create({
      data: {
        name: 'Test Elder',
        phone: `+2547333${suffix}`,
        role: Role.ELDER,
        passwordHash,
        careLevel: 'INDEPENDENT',
        homeLatitude: home.latitude,
        homeLongitude: home.longitude,
      },
    });

    ids.elder = elder.id;
    ids.caregiver = caregiver.id;
    ids.family = family.id;

    await prisma.careAssignment.createMany({
      data: [
        { elderlyId: elder.id, responderId: caregiver.id, priorityOrder: 1 },
        { elderlyId: elder.id, responderId: family.id, priorityOrder: 2 },
      ],
    });

    // Shorten the standard first tier so the test takes seconds rather than minutes.
    const rule = await prisma.escalationRule.findFirst({
      where: { severity: Severity.STANDARD, tierOrder: 1 },
    });
    if (!rule) throw new Error('Seed the database first: npm run db:seed -w @mzazicare/api');
    originalTimeout = rule.timeoutSeconds;
    await prisma.escalationRule.update({ where: { id: rule.id }, data: { timeoutSeconds: 2 } });
  });

  afterAll(async () => {
    if (prisma && ids.elder) {
      const events = await prisma.emergencyEvent.findMany({ where: { elderlyId: ids.elder } });
      const eventIds = events.map((event) => event.id);

      await prisma.auditLog.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.notification.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.emergencyEvent.deleteMany({ where: { elderlyId: ids.elder } });
      await prisma.careAssignment.deleteMany({ where: { elderlyId: ids.elder } });
      await prisma.user.deleteMany({
        where: {
          id: {
            in: [
              ids.elder,
              ids.caregiver,
              ids.family,
              ids.secondFamily,
              ids.station,
              ids.nearPolice,
              ids.farPolice,
            ].filter(Boolean) as string[],
          },
        },
      });

      if (originalTimeout !== null) {
        const rule = await prisma.escalationRule.findFirst({
          where: { severity: Severity.STANDARD, tierOrder: 1 },
        });
        if (rule) {
          await prisma.escalationRule.update({
            where: { id: rule.id },
            data: { timeoutSeconds: originalTimeout },
          });
        }
      }
    }
    await app?.close();
  });

  it('dispatches tier one immediately and arms its acknowledgement window', async () => {
    const event = await alerts.create(ids.elder as string, {});

    const stored = await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(stored.state).toBe(EventState.NOTIFIED);
    expect(stored.currentTier).toBe(1);
    expect(stored.currentTierDeadlineAt).not.toBeNull();

    // Push rows only. Dispatch writes one push row per person at the tier, and that is
    // what this asserts. The caregiver here has no registered device, so the push
    // fails and the worker adds an SMS row as the fallback; whether that row exists
    // yet depends on how fast the queue worker ran, which is why counting every row
    // passed on a laptop and failed on the CI runner with "expected 1, received 2".
    const notifications = await prisma.notification.findMany({
      where: { eventId: event.id, channel: NotificationChannel.PUSH },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].recipientId).toBe(ids.caregiver);
  });

  it('asks the fire service shortly after the elder reports a fire, beside the family', async () => {
    const station = await prisma.user.create({
      data: {
        name: 'Test Fire Unit',
        phone: `+2547888${suffix}`,
        role: Role.EMERGENCY_RESPONDER,
        responderService: ResponderService.FIRE,
        passwordHash: 'not-for-signing-in',
        coverageAreaName: 'Around the test elder',
        coverageLatitude: home.latitude,
        coverageLongitude: home.longitude,
        coverageRadiusKm: 3,
      },
    });
    ids.station = station.id;

    const event = await alerts.create(ids.elder as string, {});
    await escalation.reportType(event.id, ids.elder as string, EmergencyType.FIRE);

    // Not at the tap: the service is asked a short while later, so a mistaken tap can
    // be changed first. The wait is kept in the database as well as in Redis.
    const waiting = await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(waiting.serviceDueAt).not.toBeNull();
    expect(
      await prisma.notification.count({ where: { eventId: event.id, recipientId: station.id } }),
    ).toBe(0);

    // The wait ends, as the key's expiry would end it.
    await escalation.onServiceDue(event.id);

    const stored = await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(stored.reportedType).toBe(EmergencyType.FIRE);
    expect(stored.severity).toBe(Severity.CRITICAL);
    expect(stored.serviceRequested).toBe(ResponderService.FIRE);
    expect(stored.serviceDueAt).toBeNull();

    // Pushed and texted at once, ahead of the chain.
    const asked = await prisma.notification.findMany({
      where: { eventId: event.id, recipientId: station.id },
    });
    expect(asked.map((row) => row.channel).sort()).toEqual([
      NotificationChannel.PUSH,
      NotificationChannel.SMS,
    ]);
    // And the family is still asked, as before.
    expect(
      await prisma.notification.count({
        where: { eventId: event.id, recipientId: ids.caregiver },
      }),
    ).toBeGreaterThan(0);

    const actions = (await prisma.auditLog.findMany({ where: { eventId: event.id } })).map(
      (entry) => entry.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([AuditAction.TYPE_REPORTED, AuditAction.SERVICE_DISPATCHED]),
    );
  });

  it('asks the nearest police station first, and the next at once when it cannot come', async () => {
    const policeAt = (name: string, phone: string, kmEast: number) =>
      prisma.user.create({
        data: {
          name,
          phone,
          role: Role.EMERGENCY_RESPONDER,
          responderService: ResponderService.POLICE,
          passwordHash: 'not-for-signing-in',
          coverageAreaName: 'Around the test elder',
          coverageLatitude: home.latitude,
          coverageLongitude: home.longitude,
          coverageRadiusKm: 3,
          stationLabel: `${name}, test road`,
          stationLatitude: home.latitude,
          stationLongitude: home.longitude + kmEast / 111.3,
        },
      });
    const near = await policeAt('Test Near Police', `+2547889${suffix}`, 0);
    const far = await policeAt('Test Far Police', `+2547887${suffix}`, 2);
    ids.nearPolice = near.id;
    ids.farPolice = far.id;

    const event = await alerts.create(ids.elder as string, {});
    await escalation.reportType(event.id, ids.elder as string, EmergencyType.UNSAFE);
    await escalation.onServiceDue(event.id);

    const askedStations = async () =>
      (
        await prisma.auditLog.findMany({
          where: { eventId: event.id, action: AuditAction.STATION_ASKED },
          orderBy: { occurredAt: 'asc' },
        })
      ).map((entry) => entry.detail as { responderId: string; reason: string });

    // One station only, the nearest by road, waiting for its answer.
    const first = await askedStations();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ responderId: near.id, reason: 'nearest' });
    expect(
      (await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: event.id } }))
        .stationDeadlineAt,
    ).not.toBeNull();
    expect(
      await prisma.notification.count({ where: { eventId: event.id, recipientId: far.id } }),
    ).toBe(0);

    await escalation.decline(event.id, near.id, 'Car out on another call');

    const then = await askedStations();
    expect(then).toHaveLength(2);
    expect(then[1].reason).toBe('declined');
    expect(then[1].responderId).not.toBe(near.id);

    // Whoever takes it on stops any further station being asked.
    await escalation.acknowledge(event.id, then[1].responderId);
    expect(
      (await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: event.id } }))
        .stationDeadlineAt,
    ).toBeNull();
  });

  it('escalates to tier two on its own when nobody acknowledges', async () => {
    const event = await alerts.create(ids.elder as string, {});

    // The tier one window is two seconds. What is being waited for is the whole chain
    // that follows it: the key expiring, the listener acting, and tier two going out.
    await waitFor(
      'the emergency to reach tier two',
      async () => (await prisma.notification.count({ where: { eventId: event.id, tier: 2 } })) > 0,
    );

    const stored = await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(stored.state).toBe(EventState.ESCALATED);
    expect(stored.currentTier).toBe(2);

    const logs = await prisma.auditLog.findMany({
      where: { eventId: event.id },
      orderBy: { occurredAt: 'asc' },
    });
    // Delivery outcomes are interleaved with the lifecycle and depend on whether the
    // recipients have registered devices, so this asserts the lifecycle sequence rather
    // than the whole log. What was delivered is asserted in its own test below.
    // The alert and its first scoring are written in the same millisecond, so the order
    // between those two is not stored; the alert goes first, as every screen puts it.
    const lifecycle = logs
      .map((log) => log.action)
      .filter((action) => action !== AuditAction.NOTIFICATION_FAILED)
      .sort((a, b) =>
        a === AuditAction.EVENT_CREATED ? -1 : b === AuditAction.EVENT_CREATED ? 1 : 0,
      );

    expect(lifecycle).toEqual([
      AuditAction.EVENT_CREATED,
      AuditAction.SEVERITY_EVALUATED,
      AuditAction.TIER_DISPATCHED,
      AuditAction.ESCALATED,
      AuditAction.TIER_DISPATCHED,
    ]);

    const notified = await prisma.notification.findMany({ where: { eventId: event.id, tier: 2 } });
    expect(notified[0].recipientId).toBe(ids.family);
  });

  it('stops climbing once someone acknowledges', async () => {
    const event = await alerts.create(ids.elder as string, {});
    await escalation.acknowledge(event.id, ids.caregiver as string, home);

    // A fixed wait on purpose. This asserts that something does NOT happen, and the
    // only way to show that is to outlast the window that would have made it happen.
    await wait(4000);

    const stored = await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(stored.state).toBe(EventState.ACKNOWLEDGED);
    expect(stored.currentTier).toBe(1);
    expect(stored.currentTierDeadlineAt).toBeNull();
  });

  it('falls back to SMS when the recipient has no registered device', async () => {
    const event = await alerts.create(ids.elder as string, {});

    // The accounts have no push token, which the logging provider refuses exactly as
    // Firebase would, so the fallback path runs for real here.
    //
    // Scoped to tier one throughout. This test previously slept for two seconds, which
    // is exactly the shortened tier one window, so whether tier two had dispatched by
    // the time it looked was a coin toss. A second tier brings a second push failure
    // and a second SMS, which turned a passing assertion into a failing one at random.
    await waitFor(
      'the SMS fallback to be recorded for tier one',
      async () =>
        (await prisma.notification.count({
          where: { eventId: event.id, tier: 1, channel: NotificationChannel.SMS },
        })) > 0,
    );

    const notifications = await prisma.notification.findMany({
      where: { eventId: event.id, tier: 1 },
      orderBy: { createdAt: 'asc' },
    });

    const push = notifications.find((item) => item.channel === NotificationChannel.PUSH);
    const sms = notifications.find((item) => item.channel === NotificationChannel.SMS);

    expect(push?.status).toBe(NotificationStatus.FAILED);
    expect(push?.failureReason).toContain('no registered device');
    expect(sms).toBeDefined();
    expect(sms?.status).toBe(NotificationStatus.SENT);
    expect(sms?.recipientId).toBe(ids.caregiver);

    // Tier one's failure only. A tier two dispatch would add its own.
    const failures = await prisma.auditLog.findMany({
      where: { eventId: event.id, action: AuditAction.NOTIFICATION_FAILED },
    });
    expect(failures.length).toBeGreaterThanOrEqual(1);
  });

  it('tells the caregiver when the elder cancels, so they can call to check', async () => {
    const event = await alerts.create(ids.elder as string, {});
    await waitFor(
      'the first dispatch to be recorded',
      async () => (await prisma.notification.count({ where: { eventId: event.id } })) > 0,
    );
    const before = await prisma.notification.count({ where: { eventId: event.id } });

    await alerts.cancel(event.id, ids.elder as string);
    await waitFor(
      'the cancellation notice to reach the caregiver',
      async () => (await prisma.notification.count({ where: { eventId: event.id } })) > before,
    );

    const after = await prisma.notification.count({ where: { eventId: event.id } });
    expect(after).toBeGreaterThan(before);
  });

  it('stops climbing once the elder cancels inside the grace window', async () => {
    const event = await alerts.create(ids.elder as string, {});
    await alerts.cancel(event.id, ids.elder as string);

    // Fixed, for the same reason: outlasting the window is what proves the timer was
    // cleared rather than merely slow.
    await wait(4000);

    const stored = await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(stored.state).toBe(EventState.CANCELLED);
    expect(stored.currentTier).toBe(1);
  });

  it('scores severity again once the cancel window closes without a cancel', async () => {
    const event = await alerts.create(ids.elder as string, {});
    const noCancelAtPress = (event.severityFactors as unknown as SeverityAssessment).factors.find(
      (factor) => factor.key === 'no_cancel_in_grace_window',
    );
    expect(noCancelAtPress?.contribution).toBe(0);

    // Driven by a Redis key expiring when the ten second window closes. The sweep is off
    // in this suite, so nothing else could have done it.
    await waitFor('the severity review', async () => {
      const current = await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: event.id } });
      return current.severityReviewedAt !== null;
    });

    const reviewed = await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: event.id } });
    const noCancelAfter = (reviewed.severityFactors as unknown as SeverityAssessment).factors.find(
      (factor) => factor.key === 'no_cancel_in_grace_window',
    );
    expect(noCancelAfter?.contribution).toBe(30);
    expect(reviewed.severityScore).toBeGreaterThan(event.severityScore);

    const evaluations = await prisma.auditLog.count({
      where: { eventId: event.id, action: AuditAction.SEVERITY_EVALUATED },
    });
    expect(evaluations).toBe(2);
  });

  it('passes over a deactivated chain member and goes straight to the next rank', async () => {
    // The caregiver holds rank one. Deactivating them leaves that rank empty, and an
    // empty rank escalates at once rather than waiting out its window for somebody who
    // can no longer sign in. Set on the column directly, because the column is what
    // dispatch reads; the console's deactivate action is covered by its own tests.
    await prisma.user.update({
      where: { id: ids.caregiver },
      data: { deactivatedAt: new Date() },
    });

    try {
      const event = await alerts.create(ids.elder as string, {});

      await waitFor(
        'the emergency to reach the family member at tier two',
        async () =>
          (await prisma.notification.count({
            where: { eventId: event.id, tier: 2, recipientId: ids.family },
          })) > 0,
      );

      const stored = await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: event.id } });
      expect(stored.state).toBe(EventState.ESCALATED);
      expect(stored.currentTier).toBe(2);

      // Nothing at all for the deactivated caregiver, on any channel or tier: not a
      // push, not the SMS fallback, and nothing at tier one, whose only member they are.
      const toCaregiver = await prisma.notification.count({
        where: { eventId: event.id, recipientId: ids.caregiver },
      });
      expect(toCaregiver).toBe(0);
      const atTierOne = await prisma.notification.count({
        where: { eventId: event.id, tier: 1 },
      });
      expect(atTierOne).toBe(0);
    } finally {
      // Restored whatever happens, so a failure here cannot leave the account
      // deactivated for anything that runs after it.
      await prisma.user.update({
        where: { id: ids.caregiver },
        data: { deactivatedAt: null },
      });
    }
  });

  it('asks every family member at the family rank together', async () => {
    // A second relative at the same rank as the first. Several people may share a rank,
    // and everybody at a rank is asked at the same moment.
    const second = await prisma.user.create({
      data: {
        name: 'Test Second Family',
        phone: `+2547444${suffix}`,
        role: Role.FAMILY_MEMBER,
        passwordHash: app.get(PasswordService).hash('Integration!2026'),
      },
    });
    ids.secondFamily = second.id;
    const place = await prisma.careAssignment.create({
      data: { elderlyId: ids.elder as string, responderId: second.id, priorityOrder: 2 },
    });

    try {
      const event = await alerts.create(ids.elder as string, {});

      await waitFor(
        'both family members to be asked at tier two',
        async () =>
          (await prisma.notification.count({
            where: {
              eventId: event.id,
              tier: 2,
              channel: NotificationChannel.PUSH,
              recipientId: { in: [ids.family as string, second.id] },
            },
          })) === 2,
      );

      // One dispatch for the rank, naming both, rather than one after the other.
      const dispatched = await prisma.auditLog.findMany({
        where: { eventId: event.id, action: AuditAction.TIER_DISPATCHED },
        orderBy: { occurredAt: 'asc' },
      });
      expect(dispatched).toHaveLength(2);
      expect(dispatched[1].detail).toMatchObject({ tier: 2, recipients: 2 });
    } finally {
      // The place goes whatever happens; the account goes in afterAll, after the
      // notifications that name it.
      await prisma.careAssignment.delete({ where: { id: place.id } });
    }
  });
});
