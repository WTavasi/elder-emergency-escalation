import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditAction, EventState, Role, Severity } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AlertsService } from '../src/alerts/alerts.service';
import { EscalationService } from '../src/escalation/escalation.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PasswordService } from '../src/auth/password.service';

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

  const home = { latitude: -1.2833, longitude: 36.7833 };
  const suffix = Date.now().toString().slice(-7);
  const ids: { elder?: string; caregiver?: string; family?: string } = {};
  let originalTimeout: number | null = null;

  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

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
        where: { id: { in: [ids.elder, ids.caregiver, ids.family].filter(Boolean) as string[] } },
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
    const event = await alerts.create(ids.elder as string, home);

    const stored = await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(stored.state).toBe(EventState.NOTIFIED);
    expect(stored.currentTier).toBe(1);
    expect(stored.currentTierDeadlineAt).not.toBeNull();

    const notifications = await prisma.notification.findMany({ where: { eventId: event.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].recipientId).toBe(ids.caregiver);
  });

  it('escalates to tier two on its own when nobody acknowledges', async () => {
    const event = await alerts.create(ids.elder as string, home);

    // Two second window, plus room for the expiry notification to arrive.
    await wait(4000);

    const stored = await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(stored.state).toBe(EventState.ESCALATED);
    expect(stored.currentTier).toBe(2);

    const logs = await prisma.auditLog.findMany({
      where: { eventId: event.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(logs.map((log) => log.action)).toEqual([
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
    const event = await alerts.create(ids.elder as string, home);
    await escalation.acknowledge(event.id, ids.caregiver as string, home);

    await wait(4000);

    const stored = await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(stored.state).toBe(EventState.ACKNOWLEDGED);
    expect(stored.currentTier).toBe(1);
    expect(stored.currentTierDeadlineAt).toBeNull();
  });

  it('stops climbing once the elder cancels inside the grace window', async () => {
    const event = await alerts.create(ids.elder as string, home);
    await alerts.cancel(event.id, ids.elder as string);

    await wait(4000);

    const stored = await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(stored.state).toBe(EventState.CANCELLED);
    expect(stored.currentTier).toBe(1);
  });
});
