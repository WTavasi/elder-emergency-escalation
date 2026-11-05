import type { ConfigService } from '@nestjs/config';
import { AuditAction, EventState, Prisma, ResponderService } from '@prisma/client';
import type { PrismaService } from '../../../db/prisma.service';
import type { RedisService } from '../../../shared/redis/redis.service';
import { RoutingService } from '../../../shared/routing/routing.service';
import type { NotificationsService } from '../../notification-service/services/notifications.service';
import { NoopRealtimePublisher } from '../../realtime-service/services/realtime.publisher';
import { stationKey } from './escalation.keys';
import { StationDispatchService } from './station-dispatch.service';

/** Grace's home in Kileleshwa. */
const ALERT = { latitude: -1.2833, longitude: 36.7833 };

/** A unit based [km] east of the alert, covering 8 km around the alert. */
const unit = (
  id: string,
  service: ResponderService,
  km: number,
  station: string | null = `${id} station`,
) => ({
  id,
  name: id,
  responderService: service,
  coverageLatitude: new Prisma.Decimal(ALERT.latitude),
  coverageLongitude: new Prisma.Decimal(ALERT.longitude),
  coverageRadiusKm: new Prisma.Decimal(8),
  stationLabel: station,
  stationLatitude: station ? new Prisma.Decimal(ALERT.latitude) : null,
  stationLongitude: station ? new Prisma.Decimal(ALERT.longitude + km / 111.3) : null,
});

const event = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'event-1',
    state: EventState.ESCALATED,
    acknowledgedBy: null,
    alertLatitude: new Prisma.Decimal(ALERT.latitude),
    alertLongitude: new Prisma.Decimal(ALERT.longitude),
    stationDeadlineAt: null,
    ...overrides,
  }) as never;

function build(units: unknown[], askedAlready: string[] = []) {
  const audit: Array<{ action: AuditAction; detail: Record<string, unknown> }> = [];
  const notifications: Array<{ recipientId: string; channel: string; tier: number }> = [];
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue(units) },
    notification: {
      findMany: jest.fn().mockResolvedValue(askedAlready.map((recipientId) => ({ recipientId }))),
      create: jest.fn(({ data }: { data: (typeof notifications)[number] }) => {
        notifications.push(data);
        return Promise.resolve({ id: `n-${notifications.length}` });
      }),
    },
    auditLog: {
      create: jest.fn(({ data }: { data: (typeof audit)[number] }) => {
        audit.push(data);
        return Promise.resolve(data);
      }),
      findMany: jest.fn(),
    },
    emergencyEvent: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(event()),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((work: (tx: typeof prisma) => unknown) => work(prisma));
  const redis = { client: { set: jest.fn().mockResolvedValue('OK'), del: jest.fn() } };
  const config = {
    get: (_key: string, fallback: unknown) => fallback,
  } as unknown as ConfigService;
  const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const service = new StationDispatchService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    new RoutingService(redis as unknown as RedisService, config),
    queue as unknown as NotificationsService,
    config,
    new NoopRealtimePublisher(),
  );
  return { service, prisma, redis, audit, notifications, queue };
}

describe('StationDispatchService', () => {
  it('ranks the service the emergency needs first, then by road time from each station', async () => {
    const { service } = build([
      unit('Kileleshwa Police Station', ResponderService.POLICE, 3),
      unit('Kilimani Police Station', ResponderService.POLICE, 1),
      unit('A general unit next door', ResponderService.GENERAL, 0.2),
      unit('St John Ambulance', ResponderService.AMBULANCE, 0.5),
    ]);

    const ranked = await service.ranked(event(), ResponderService.POLICE);

    expect(ranked.map((station) => station.name)).toEqual([
      'Kilimani Police Station',
      'Kileleshwa Police Station',
      'A general unit next door',
      'St John Ambulance',
    ]);
    expect(ranked[0].station).toBe('Kilimani Police Station station');
  });

  it('measures a unit with no station from the middle of its area', async () => {
    const { service } = build([unit('Older unit', ResponderService.POLICE, 0, null)]);

    const [only] = await service.ranked(event(), ResponderService.POLICE);

    expect(only.station).toBeNull();
    expect(only.etaSeconds).toBe(0);
  });

  it('leaves out a unit whose area does not cover the place', async () => {
    const far = { ...unit('Mombasa', ResponderService.POLICE, 1), coverageLatitude: -4.05 };
    const { service } = build([far]);

    await expect(service.pick(event(), ResponderService.POLICE)).resolves.toEqual({
      next: null,
      covered: false,
    });
  });

  it('asks the next station not yet asked, by push and text, and starts its wait', async () => {
    const { service, audit, notifications, redis, queue } = build(
      [
        unit('Kilimani Police Station', ResponderService.POLICE, 1),
        unit('Kileleshwa Police Station', ResponderService.POLICE, 3),
      ],
      ['Kilimani Police Station'],
    );

    const asked = await service.askNext(event(), ResponderService.POLICE, 3, 'declined');

    expect(asked?.name).toBe('Kileleshwa Police Station');
    expect(notifications.map((row) => row.channel)).toEqual(['PUSH', 'SMS']);
    expect(notifications.every((row) => row.recipientId === 'Kileleshwa Police Station')).toBe(
      true,
    );
    expect(queue.enqueue).toHaveBeenCalledWith(['n-1', 'n-2']);
    expect(audit[0]).toMatchObject({
      action: AuditAction.STATION_ASKED,
      detail: { name: 'Kileleshwa Police Station', reason: 'declined', byRoad: false },
    });
    expect(redis.client.set).toHaveBeenCalledWith(stationKey('event-1'), '1', 'EX', 180);
  });

  it('asks nobody twice: with every station asked, it stops waiting', async () => {
    const { service, notifications, redis } = build(
      [unit('Kilimani Police Station', ResponderService.POLICE, 1)],
      ['Kilimani Police Station'],
    );

    await expect(
      service.askNext(event(), ResponderService.POLICE, 3, 'no-answer'),
    ).resolves.toBeNull();
    expect(notifications).toEqual([]);
    expect(redis.client.del).toHaveBeenCalledWith(stationKey('event-1'));
  });

  it('tells the circle who was asked, how far by road, and who is coming', async () => {
    const { service, prisma } = build([]);
    prisma.auditLog.findMany.mockResolvedValue([
      {
        occurredAt: new Date('2026-11-06T10:00:00Z'),
        detail: {
          responderId: 'kilimani',
          name: 'Kilimani Police Station',
          service: 'POLICE',
          station: 'Lenana Road',
          seconds: 360,
          byRoad: true,
          reason: 'nearest',
        },
      },
      {
        occurredAt: new Date('2026-11-06T10:01:00Z'),
        detail: { responderId: 'kileleshwa', name: 'Kileleshwa Police Station', seconds: 540 },
      },
    ]);
    prisma.notification.findMany.mockResolvedValue([{ recipientId: 'kilimani' }]);

    const stations = await service.onAlert(event({ acknowledgedBy: 'kileleshwa' }));

    expect(stations).toEqual([
      expect.objectContaining({ name: 'Kilimani Police Station', status: 'declined' }),
      expect.objectContaining({ name: 'Kileleshwa Police Station', status: 'coming' }),
    ]);
    expect(stations[0]).toMatchObject({ etaSeconds: 360, byRoad: true, station: 'Lenana Road' });
  });

  it('after a restart, asks the next station for a wait that ran out, and re-arms the rest', async () => {
    const { service, prisma, redis } = build([]);
    prisma.emergencyEvent.findMany.mockResolvedValue([
      { id: 'overdue', stationDeadlineAt: new Date(Date.now() - 1000) },
      { id: 'waiting', stationDeadlineAt: new Date(Date.now() + 60_000) },
    ]);
    const fire = jest.fn().mockResolvedValue(undefined);

    await expect(service.recover(fire)).resolves.toEqual({ fired: 1, rearmed: 1 });
    expect(fire).toHaveBeenCalledWith('overdue');
    expect(redis.client.set).toHaveBeenCalledWith(stationKey('waiting'), '1', 'EX', 60);
  });
});
