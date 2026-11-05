import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AuditAction, EventState, Prisma } from '@prisma/client';
import type { PrismaService } from '../../../db/prisma.service';
import type { RedisService } from '../../../shared/redis/redis.service';
import { NoopRealtimePublisher } from '../../realtime-service/services/realtime.publisher';
import { JOURNEY_TTL_SECONDS, JourneyService, journeyKey } from './journey.service';
import type { RoutingService } from '../../../shared/routing/routing.service';
import type { VolunteerCallsService } from '../../community-service/services/volunteer-calls.service';

// Grace's home in Kileleshwa, and Mary about 2 km away.
const HOME = { latitude: -1.2805, longitude: 36.7701 };
const FAR = { latitude: -1.2921, longitude: 36.7869 };
// About 40 metres from the door.
const AT_THE_GATE = { latitude: -1.28085, longitude: 36.77012 };

const event = (overrides: Record<string, unknown> = {}) => ({
  id: 'event-1',
  elderlyId: 'elder-1',
  state: EventState.ACKNOWLEDGED,
  acknowledgedBy: 'carer-1',
  acknowledgedAt: new Date('2026-10-20T10:01:00.000Z'),
  arrivedAt: null,
  volunteerId: null,
  volunteerArrivedAt: null,
  triggeredAt: new Date('2026-10-20T10:00:00.000Z'),
  alertLatitude: new Prisma.Decimal(HOME.latitude),
  alertLongitude: new Prisma.Decimal(HOME.longitude),
  ...overrides,
});

function build(options: { row?: Record<string, unknown>; sharing?: boolean } = {}) {
  const store = new Map<string, string>();
  const redis = {
    client: {
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      set: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
      del: jest.fn((key: string) => Promise.resolve(store.delete(key) ? 1 : 0)),
    },
  };
  const row = event(options.row);
  const tx = {
    emergencyEvent: {
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...row, ...data }),
      ),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    emergencyEvent: { findUnique: jest.fn().mockResolvedValue(row) },
    userPreference: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.sharing === false ? null : { shareWayThere: true }),
    },
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const routing = {
    route: jest.fn().mockResolvedValue({
      durationSeconds: 600,
      distanceMetres: 3000,
      source: 'osrm',
      path: [
        [FAR.latitude, FAR.longitude],
        [HOME.latitude, HOME.longitude],
      ],
    }),
  };
  const volunteers = { arrived: jest.fn().mockResolvedValue({}) };
  const config = {
    get: (_key: string, fallback?: unknown) => fallback,
  } as unknown as ConfigService;
  const realtime = new NoopRealtimePublisher();
  jest.spyOn(realtime, 'emergencyUpdated');

  const service = new JourneyService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    routing as unknown as RoutingService,
    config,
    volunteers as unknown as VolunteerCallsService,
    realtime,
  );
  return { service, prisma, tx, redis, store, routing, realtime, volunteers, row };
}

describe('JourneyService', () => {
  describe('report', () => {
    it('keeps the position for three minutes and gives back the time to the elder', async () => {
      const { service, redis, realtime, routing } = build();

      const result = await service.report('event-1', 'carer-1', FAR);

      expect(result.arrived).toBe(false);
      expect(result.journey).toMatchObject({
        etaSeconds: 600,
        distanceMetres: 3000,
        traveller: 'owner',
      });
      // The road comes back for the map, and the router was asked for it.
      expect(result.journey?.path).toHaveLength(2);
      expect(routing.route).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        path: true,
      });
      expect(redis.client.set).toHaveBeenCalledWith(
        journeyKey('event-1', 'carer-1'),
        expect.any(String),
        'EX',
        JOURNEY_TTL_SECONDS,
      );
      // The care circle is told to look again.
      expect(realtime.emergencyUpdated).toHaveBeenCalled();
    });

    it('asks the router at most every 30 seconds, scaling the route in between', async () => {
      const { service, routing } = build();

      await service.report('event-1', 'carer-1', FAR);
      const halfway = {
        latitude: (FAR.latitude + HOME.latitude) / 2,
        longitude: (FAR.longitude + HOME.longitude) / 2,
      };
      const second = await service.report('event-1', 'carer-1', halfway);

      expect(routing.route).toHaveBeenCalledTimes(1);
      // About half the way left, so about half the time.
      expect(second.journey?.etaSeconds).toBeGreaterThan(250);
      expect(second.journey?.etaSeconds).toBeLessThan(350);
    });

    it('marks them arrived once they are inside the radius', async () => {
      const { service, tx, store } = build();
      await service.report('event-1', 'carer-1', FAR);

      const result = await service.report('event-1', 'carer-1', AT_THE_GATE);

      expect(result).toEqual({ arrived: true, journey: null });
      expect(tx.emergencyEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ state: EventState.ON_SCENE }),
        }),
      );
      expect(store.has(journeyKey('event-1', 'carer-1'))).toBe(false);
    });

    it('does not count a loose fix near the door as arriving', async () => {
      const { service, tx } = build();

      const result = await service.report('event-1', 'carer-1', {
        ...AT_THE_GATE,
        accuracyMetres: 400,
      });

      expect(result.arrived).toBe(false);
      expect(tx.emergencyEvent.update).not.toHaveBeenCalled();
    });

    it('takes positions from the volunteer going, under their own key', async () => {
      const { service, store } = build({ row: { volunteerId: 'volunteer-1' } });

      const result = await service.report('event-1', 'volunteer-1', FAR);

      expect(result.journey?.traveller).toBe('volunteer');
      expect(store.has(journeyKey('event-1', 'volunteer-1'))).toBe(true);
      expect(store.has(journeyKey('event-1', 'carer-1'))).toBe(false);
    });

    it('records the volunteer as arrived at the door, leaving the emergency alone', async () => {
      const { service, volunteers, tx } = build({ row: { volunteerId: 'volunteer-1' } });

      const result = await service.report('event-1', 'volunteer-1', AT_THE_GATE);

      expect(result.arrived).toBe(true);
      expect(volunteers.arrived).toHaveBeenCalledWith('event-1', 'volunteer-1', 'geofence');
      expect(tx.emergencyEvent.update).not.toHaveBeenCalled();
    });

    it('tells a volunteer who already arrived to stop', async () => {
      const { service } = build({
        row: { volunteerId: 'volunteer-1', volunteerArrivedAt: new Date() },
      });

      await expect(service.report('event-1', 'volunteer-1', FAR)).resolves.toEqual({
        arrived: true,
        journey: null,
      });
    });

    it('takes positions only from somebody on their way', async () => {
      const { service } = build();

      await expect(service.report('event-1', 'someone-else', FAR)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('takes nothing from somebody who has not turned sharing on', async () => {
      const { service, redis } = build({ sharing: false });

      await expect(service.report('event-1', 'carer-1', FAR)).rejects.toThrow(ForbiddenException);
      expect(redis.client.set).not.toHaveBeenCalled();
    });

    it('tells a phone that is already there to stop, rather than refusing it', async () => {
      const { service } = build({
        row: { state: EventState.ON_SCENE, arrivedAt: new Date('2026-10-20T10:09:00.000Z') },
      });

      await expect(service.report('event-1', 'carer-1', FAR)).resolves.toEqual({
        arrived: true,
        journey: null,
      });
    });

    it('refuses a closed emergency, so the phone stops sharing', async () => {
      const { service } = build({ row: { state: EventState.RESOLVED } });

      await expect(service.report('event-1', 'carer-1', FAR)).rejects.toThrow(ConflictException);
    });
  });

  describe('arrive', () => {
    it('moves the emergency to on scene and records how long it took', async () => {
      const { service, tx } = build();

      await service.arrive('event-1', 'carer-1', 'manual');

      const write = tx.emergencyEvent.update.mock.calls[0][0] as {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      };
      // Still theirs and not yet arrived, checked in the write itself.
      expect(write.where).toMatchObject({ acknowledgedBy: 'carer-1', arrivedAt: null });
      expect(write.data.arrivedAt).toBeInstanceOf(Date);

      const audit = tx.auditLog.create.mock.calls[0][0] as {
        data: { action: AuditAction; detail: Record<string, unknown> };
      };
      expect(audit.data.action).toBe(AuditAction.ARRIVED);
      expect(audit.data.detail).toMatchObject({ method: 'manual' });
      expect(audit.data.detail.secondsFromAcknowledgement).toEqual(expect.any(Number));
    });

    it('is the owner’s to say', async () => {
      const { service } = build();

      await expect(service.arrive('event-1', 'someone-else', 'manual')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('treats saying it twice as done, not as an error', async () => {
      const { service, tx } = build({
        row: { state: EventState.ON_SCENE, arrivedAt: new Date('2026-10-20T10:09:00.000Z') },
      });

      await service.arrive('event-1', 'carer-1', 'manual');
      expect(tx.emergencyEvent.update).not.toHaveBeenCalled();
    });
  });

  describe('current', () => {
    it('shows the care circle where and the road, and the elder only how long', async () => {
      const { service, row } = build();
      await service.report('event-1', 'carer-1', FAR);

      const circle = await service.current(row as never, false);
      const elder = await service.current(row as never, true);

      expect(circle.owner?.latitude).toBe(FAR.latitude);
      expect(circle.owner?.path).toHaveLength(2);
      expect(elder.owner?.latitude).toBeNull();
      expect(elder.owner?.path).toBeNull();
      expect(elder.owner?.etaSeconds).toBe(600);
    });

    it('lists everybody on their way, soonest first', async () => {
      const { service, row, routing } = build({ row: { volunteerId: 'volunteer-1' } });
      await service.report('event-1', 'carer-1', FAR);
      routing.route.mockResolvedValueOnce({
        durationSeconds: 240,
        distanceMetres: 1200,
        source: 'osrm',
      });
      await service.report('event-1', 'volunteer-1', FAR);

      const { owner, all } = await service.current(row as never, false);

      expect(all.map((journey) => journey.traveller)).toEqual(['volunteer', 'owner']);
      expect(owner?.userId).toBe('carer-1');
    });

    it('drops somebody no longer on their way at once, not after three minutes', async () => {
      const { service, row } = build({ row: { volunteerId: 'volunteer-1' } });
      await service.report('event-1', 'volunteer-1', FAR);

      // The volunteer withdrew: their position is still stored, but not shown.
      const { all } = await service.current({ ...row, volunteerId: null } as never, false);

      expect(all).toEqual([]);
    });

    it('is empty when nobody is on their way', async () => {
      const { service, row } = build();
      await expect(service.current(row as never, false)).resolves.toEqual({
        owner: null,
        all: [],
      });
    });
  });
});
