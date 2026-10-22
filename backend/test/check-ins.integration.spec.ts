import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AlertTrigger,
  AuditAction,
  CheckInStatus,
  EventOutcome,
  EventState,
  Role,
  Severity,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/db/prisma.service';
import { PasswordService } from '../src/modules/auth-service/services/password.service';
import { CheckInClockService } from '../src/modules/check-in-service/services/check-in-clock.service';
import { formatTime, wallClock } from '../src/modules/check-in-service/services/check-in-times';
import { CheckInsService } from '../src/modules/check-in-service/services/check-ins.service';

/**
 * A daily check-in from set-up to a late answer, against real Postgres and Redis.
 *
 * The clock is driven by hand with the instant it should think it is, so the half-hour
 * window takes no time at all. Its own one-minute timer is switched off for this file,
 * so nothing but the test moves it.
 *
 * Requires: docker compose up -d, migrations applied and the database seeded.
 */
describe('daily check-ins, end to end', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let checkIns: CheckInsService;
  let clock: CheckInClockService;
  const previousSetting = process.env.CHECK_INS_ENABLED;

  const suffix = Date.now().toString().slice(-7);
  const ids: { elder?: string; caregiver?: string } = {};
  const MINUTE = 60_000;

  // A time two minutes from now, on the elder's clock, so it falls after the agreement.
  const dueAt = new Date(Math.ceil((Date.now() + 2 * MINUTE) / MINUTE) * MINUTE);
  const at = (minutes: number) => new Date(dueAt.getTime() + minutes * MINUTE);

  beforeAll(async () => {
    process.env.CHECK_INS_ENABLED = 'false';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    checkIns = app.get(CheckInsService);
    clock = app.get(CheckInClockService);
    const passwordHash = app.get(PasswordService).hash('Integration!2026');

    const caregiver = await prisma.user.create({
      data: {
        name: 'Check Caregiver',
        phone: `+2547444${suffix}`,
        role: Role.CAREGIVER,
        passwordHash,
      },
    });
    const elder = await prisma.user.create({
      data: {
        name: 'Check Elder',
        phone: `+2547555${suffix}`,
        role: Role.ELDER,
        passwordHash,
        careLevel: 'INDEPENDENT',
        homeLatitude: -1.2833,
        homeLongitude: 36.7833,
      },
    });
    ids.elder = elder.id;
    ids.caregiver = caregiver.id;
    await prisma.careAssignment.create({
      data: { elderlyId: elder.id, responderId: caregiver.id, priorityOrder: 1 },
    });
  });

  afterAll(async () => {
    if (prisma && ids.elder) {
      const events = await prisma.emergencyEvent.findMany({ where: { elderlyId: ids.elder } });
      const eventIds = events.map((event) => event.id);
      await prisma.checkIn.deleteMany({ where: { elderId: ids.elder } });
      await prisma.checkInSchedule.deleteMany({ where: { elderId: ids.elder } });
      await prisma.auditLog.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.notification.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.emergencyEvent.deleteMany({ where: { elderlyId: ids.elder } });
      await prisma.careAssignment.deleteMany({ where: { elderlyId: ids.elder } });
      await prisma.user.deleteMany({
        where: { id: { in: [ids.elder, ids.caregiver].filter(Boolean) as string[] } },
      });
    }
    await app?.close();
    if (previousSetting === undefined) delete process.env.CHECK_INS_ENABLED;
    else process.env.CHECK_INS_ENABLED = previousSetting;
  });

  it('asks nothing until the elder agrees to a set-up somebody else made', async () => {
    const wall = wallClock(dueAt, 'Africa/Nairobi');
    const time = formatTime(wall.hour * 60 + wall.minute);

    const overview = await checkIns.setSchedule(
      ids.elder as string,
      ids.caregiver as string,
      Role.CAREGIVER,
      { enabled: true, times: [time], graceMinutes: 30 },
    );
    expect(overview.schedule?.waitingForElder).toBe(true);

    await clock.tick(at(1));
    expect(await prisma.checkIn.count({ where: { elderId: ids.elder } })).toBe(0);

    const mine = await checkIns.confirm(ids.elder as string, ids.elder as string, true);
    expect(mine.waitingForAgreement).toBeNull();
  });

  it('asks when it falls due, once, however many times the clock runs', async () => {
    await clock.tick(at(1));
    await clock.tick(at(2));

    const rows = await prisma.checkIn.findMany({ where: { elderId: ids.elder } });
    expect(rows).toHaveLength(1);
    expect(rows[0].dueAt).toEqual(dueAt);
    expect(rows[0].status).toBe(CheckInStatus.PENDING);
  });

  it('reminds once, half way through', async () => {
    await expect(clock.tick(at(16))).resolves.toMatchObject({ reminded: 1 });
    await expect(clock.tick(at(17))).resolves.toMatchObject({ reminded: 0 });
  });

  it('raises a standard alert of its own kind when nobody answers', async () => {
    await expect(clock.tick(at(31))).resolves.toMatchObject({ missed: 1 });

    const row = await prisma.checkIn.findFirstOrThrow({ where: { elderId: ids.elder } });
    expect(row.status).toBe(CheckInStatus.MISSED);
    expect(row.eventId).not.toBeNull();

    const event = await prisma.emergencyEvent.findUniqueOrThrow({
      where: { id: row.eventId as string },
    });
    expect(event.trigger).toBe(AlertTrigger.MISSED_CHECK_IN);
    expect(event.severity).toBe(Severity.STANDARD);
    expect(event.state).toBe(EventState.NOTIFIED);
  });

  it('withdraws the alert when the elder answers late and nobody has taken it on', async () => {
    await expect(checkIns.answer(ids.elder as string, 'app')).resolves.toBe('withdrawn');

    const row = await prisma.checkIn.findFirstOrThrow({ where: { elderId: ids.elder } });
    expect(row.answeredVia).toBe('app');
    const event = await prisma.emergencyEvent.findUniqueOrThrow({
      where: { id: row.eventId as string },
    });
    expect(event.state).toBe(EventState.CANCELLED);
    expect(event.outcome).toBe(EventOutcome.CANCELLED_BY_ELDER);

    const actions = await prisma.auditLog.findMany({
      where: { eventId: event.id },
      select: { action: true },
    });
    expect(actions.map((entry) => entry.action)).toContain(AuditAction.CHECKED_IN_LATE);

    // Nothing left to answer.
    await expect(checkIns.answer(ids.elder as string, 'app')).resolves.toBe('nothing');
  });

  it('turning it off needs nobody’s agreement', async () => {
    const overview = await checkIns.setSchedule(
      ids.elder as string,
      ids.caregiver as string,
      Role.CAREGIVER,
      { enabled: false, times: [] },
    );
    expect(overview.schedule?.enabled).toBe(false);
  });
});
