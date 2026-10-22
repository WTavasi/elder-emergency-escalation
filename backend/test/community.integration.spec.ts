import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AuditAction,
  ConsentType,
  EventState,
  Role,
  VolunteerCallStatus,
  VolunteerStatus,
  VolunteerTraining,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/db/prisma.service';
import { PasswordService } from '../src/modules/auth-service/services/password.service';
import { VolunteerCallsService } from '../src/modules/community-service/services/volunteer-calls.service';
import { AlertsService } from '../src/modules/emergency-service/services/alerts.service';

/**
 * Community volunteers against real Postgres and Redis: who is asked, that the first to
 * accept wins even when two press at once, that withdrawing asks the others again, and
 * that closing the emergency stands them down.
 *
 * Requires: docker compose up -d, migrations applied and the database seeded.
 */
describe('community volunteers, end to end', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let volunteers: VolunteerCallsService;
  let alerts: AlertsService;

  const suffix = Date.now().toString().slice(-7);
  // Kisumu, well away from the seeded volunteers around Kileleshwa, so only the ones made
  // here can be near enough to be asked.
  const home = { latitude: -0.0917, longitude: 34.768 };
  const ids: Record<string, string> = {};
  let eventId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    volunteers = app.get(VolunteerCallsService);
    alerts = app.get(AlertsService);
    const passwordHash = app.get(PasswordService).hash('Integration!2026');

    const elder = await prisma.user.create({
      data: {
        name: 'Volunteer Elder',
        phone: `+2547666${suffix}`,
        role: Role.ELDER,
        passwordHash,
        careLevel: 'INDEPENDENT',
        homeLatitude: home.latitude,
        homeLongitude: home.longitude,
      },
    });
    const caregiver = await prisma.user.create({
      data: {
        name: 'Volunteer Carer',
        phone: `+2547667${suffix}`,
        role: Role.CAREGIVER,
        passwordHash,
      },
    });
    ids.elder = elder.id;
    ids.caregiver = caregiver.id;
    await prisma.careAssignment.create({
      data: { elderlyId: elder.id, responderId: caregiver.id, priorityOrder: 1 },
    });
    await prisma.consentRecord.create({
      data: {
        subjectId: elder.id,
        grantedById: elder.id,
        type: ConsentType.COMMUNITY_HELP,
        policyVersion: 'integration',
        grantorRelationship: 'self',
      },
    });

    // Two near Grace and available, one near but not available, one far away.
    const volunteer = async (key: string, metres: number, available: boolean) => {
      const user = await prisma.user.create({
        data: {
          name: `Volunteer ${key}`,
          phone: `+25476${key.charCodeAt(0) % 10}8${suffix}`,
          role: Role.COMMUNITY_RESPONDER,
          passwordHash,
          coverageAreaName: 'Near Grace',
          coverageLatitude: home.latitude - metres / 111_195,
          coverageLongitude: home.longitude,
          coverageRadiusKm: 1,
          volunteerProfile: {
            create: {
              status: VolunteerStatus.APPROVED,
              training: [VolunteerTraining.FIRST_AID],
              available,
            },
          },
        },
      });
      ids[key] = user.id;
    };
    await volunteer('A', 200, true);
    await volunteer('B', 600, true);
    await volunteer('C', 300, false);
    await volunteer('D', 5000, true);

    const event = await alerts.create(elder.id, {});
    eventId = event.id;
  });

  afterAll(async () => {
    if (prisma && ids.elder) {
      const events = await prisma.emergencyEvent.findMany({ where: { elderlyId: ids.elder } });
      const eventIds = events.map((event) => event.id);
      await prisma.volunteerCall.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.auditLog.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.notification.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.emergencyEvent.deleteMany({ where: { elderlyId: ids.elder } });
      await prisma.careAssignment.deleteMany({ where: { elderlyId: ids.elder } });
      await prisma.consentRecord.deleteMany({ where: { subjectId: ids.elder } });
      await prisma.volunteerProfile.deleteMany({ where: { userId: { in: Object.values(ids) } } });
      await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    }
    await app?.close();
  });

  it('asks only the available volunteers whose area covers the alert, once', async () => {
    // A critical alert has asked them already; anything else is asked here. Either way,
    // asking a second time asks nobody.
    await volunteers.askNearby(eventId, 'uncovered');
    await expect(volunteers.askNearby(eventId, 'critical')).resolves.toBe(0);

    // The dispatch asks without waiting, so give a critical alert's asking time to land.
    const deadline = Date.now() + 10_000;
    while (
      (await prisma.volunteerCall.count({ where: { eventId } })) < 2 &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const calls = await prisma.volunteerCall.findMany({ where: { eventId } });
    expect(calls.map((call) => call.volunteerId).sort()).toEqual([ids.A, ids.B].sort());

    const audit = await prisma.auditLog.findMany({
      where: { eventId, action: AuditAction.VOLUNTEERS_ASKED },
    });
    expect(audit).toHaveLength(1);
  });

  it('gives the emergency to exactly one of two volunteers accepting at once', async () => {
    const results = await Promise.allSettled([
      volunteers.accept(eventId, ids.A),
      volunteers.accept(eventId, ids.B),
    ]);

    const won = results.filter((result) => result.status === 'fulfilled');
    const lost = results.filter((result) => result.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect((lost[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const event = await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: eventId } });
    expect([ids.A, ids.B]).toContain(event.volunteerId);
    // Going beside the chain: the emergency itself is untouched.
    expect(event.acknowledgedBy).toBeNull();
  });

  it('asks the other again when the one going withdraws', async () => {
    const event = await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: eventId } });
    const going = event.volunteerId as string;
    const other = going === ids.A ? ids.B : ids.A;

    await volunteers.withdraw(eventId, going);

    const after = await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: eventId } });
    expect(after.volunteerId).toBeNull();
    const call = await prisma.volunteerCall.findFirstOrThrow({
      where: { eventId, volunteerId: other },
    });
    expect(call.status).toBe(VolunteerCallStatus.ASKED);
    // And now they can go.
    await expect(volunteers.accept(eventId, other)).resolves.toMatchObject({
      status: VolunteerCallStatus.ACCEPTED,
    });
  });

  it('takes who and where back once the emergency is over', async () => {
    const event = await prisma.emergencyEvent.findUniqueOrThrow({ where: { id: eventId } });
    const going = event.volunteerId as string;
    expect((await volunteers.one(eventId, going)).elder).not.toBeNull();

    await prisma.emergencyEvent.update({
      where: { id: eventId },
      data: { state: EventState.RESOLVED, resolvedAt: new Date() },
    });
    await volunteers.eventClosed(eventId);

    const view = await volunteers.one(eventId, going);
    expect(view.open).toBe(false);
    expect(view.elder).toBeNull();
  });
});
