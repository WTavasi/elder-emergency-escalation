import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  AuditAction,
  EventState,
  Severity,
  VolunteerCallStatus,
  VolunteerStatus,
} from '@prisma/client';
import type { PrismaService } from '../../../db/prisma.service';
import { NoopRealtimePublisher } from '../../realtime-service/services/realtime.publisher';
import { VolunteerCallsService } from './volunteer-calls.service';
import type { VolunteerMessenger } from './volunteer-messenger.service';

/** Grace's home in Kileleshwa, where the alert is. */
const ALERT = { latitude: -1.2833, longitude: 36.7833 };

/** A volunteer whose area is centred [metres] south of the alert, with a 1 km radius. */
const volunteer = (id: string, metres: number, radiusKm = 1) => ({
  id,
  name: `${id} Kamau`,
  phone: `+2547100000${id.length}${metres % 10}`,
  pushToken: `token-${id}`,
  coverageLatitude: ALERT.latitude - metres / 111_195,
  coverageLongitude: ALERT.longitude,
  coverageRadiusKm: radiusKm,
});

type Row = Record<string, unknown>;

/** The tables these tests touch, held in memory, so a whole exchange can be followed. */
function world(
  options: {
    consent?: boolean;
    state?: EventState;
    candidates?: Row[];
    chain?: string[];
    calls?: Row[];
    volunteerId?: string | null;
  } = {},
) {
  const event: Row = {
    id: 'event-1',
    elderlyId: 'elder-1',
    state: options.state ?? EventState.NOTIFIED,
    severity: Severity.CRITICAL,
    triggeredAt: new Date('2026-10-23T09:00:00Z'),
    alertLatitude: ALERT.latitude,
    alertLongitude: ALERT.longitude,
    alertAddressLabel: 'Kileleshwa, Nairobi',
    volunteersAskedAt: options.calls ? new Date('2026-10-23T09:00:01Z') : null,
    volunteerId: options.volunteerId ?? null,
    volunteerAcceptedAt: options.volunteerId ? new Date('2026-10-23T09:02:00Z') : null,
    volunteerArrivedAt: null,
  };
  const calls: Row[] = (options.calls ?? []).map((call) => ({ ...call }));
  const audit: Row[] = [];
  const people: Record<string, Row> = Object.fromEntries(
    (options.candidates ?? []).map((person) => [person.id, person]),
  );

  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, wanted]) => {
      if (key === 'event') return true;
      const value = row[key];
      if (wanted && typeof wanted === 'object' && !(wanted instanceof Date)) {
        const condition = wanted as { in?: unknown[]; not?: unknown };
        if (condition.in) return condition.in.includes(value);
        if ('not' in condition) return value !== condition.not;
      }
      return value === wanted;
    });
  const withEvent = (call: Row) => ({
    ...call,
    event: {
      ...event,
      elder: { name: 'Grace Wanjiru', phone: '+254700000010' },
      owner: null,
    },
    volunteer: people[call.volunteerId as string] ?? { phone: '+254711000000', pushToken: null },
  });

  const prisma = {
    emergencyEvent: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          ...event,
          elder: { name: 'Grace Wanjiru' },
          volunteer: event.volunteerId ? people[event.volunteerId as string] : null,
        }),
      ),
      findUniqueOrThrow: jest.fn(() =>
        Promise.resolve({ ...event, elder: { name: 'Grace Wanjiru' } }),
      ),
      updateMany: jest.fn(({ where, data }: { where: Row; data: Row }) => {
        const { id: _id, state, ...rest } = where;
        const ok =
          matches(event, rest) && (!state || (state as { in: unknown[] }).in.includes(event.state));
        if (ok) Object.assign(event, data);
        return Promise.resolve({ count: ok ? 1 : 0 });
      }),
    },
    consentRecord: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.consent === false ? null : { id: 'consent-1' }),
    },
    careAssignment: {
      findMany: jest
        .fn()
        .mockResolvedValue((options.chain ?? []).map((responderId) => ({ responderId }))),
    },
    user: {
      findMany: jest.fn().mockResolvedValue(options.candidates ?? []),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(people[where.id] ?? null),
      ),
      findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(people[where.id]),
      ),
    },
    volunteerCall: {
      createMany: jest.fn(({ data }: { data: Row[] }) => {
        data.forEach((row, index) =>
          calls.push({
            id: `call-${calls.length + index}`,
            status: VolunteerCallStatus.ASKED,
            ...row,
          }),
        );
        return Promise.resolve({ count: data.length });
      }),
      findUnique: jest.fn(({ where }: { where: { eventId_volunteerId: Row } }) =>
        Promise.resolve(calls.find((call) => matches(call, where.eventId_volunteerId)) ?? null),
      ),
      findUniqueOrThrow: jest.fn(({ where }: { where: { eventId_volunteerId: Row } }) =>
        Promise.resolve(withEvent(calls.find((call) => matches(call, where.eventId_volunteerId))!)),
      ),
      update: jest.fn(({ where, data }: { where: Row; data: Row }) => {
        const call = calls.find((row) => row.id === where.id)!;
        Object.assign(call, data);
        return Promise.resolve(call);
      }),
      updateMany: jest.fn(({ where, data }: { where: Row; data: Row }) => {
        const hit = calls.filter((call) => matches(call, where));
        hit.forEach((call) => Object.assign(call, data));
        return Promise.resolve({ count: hit.length });
      }),
      findMany: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(calls.filter((call) => matches(call, where)).map(withEvent)),
      ),
      findFirst: jest.fn(({ where }: { where: Row }) => {
        const open = (event.state as EventState) !== EventState.RESOLVED;
        return Promise.resolve(open ? (calls.find((call) => matches(call, where)) ?? null) : null);
      }),
      count: jest.fn(() => Promise.resolve(calls.length)),
    },
    auditLog: {
      create: jest.fn(({ data }: { data: Row }) => {
        audit.push(data);
        return Promise.resolve(data);
      }),
    },
    notification: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ recipient: { phone: '+254700000020', pushToken: null } }]),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));

  const messenger = { send: jest.fn().mockResolvedValue('push') };
  const settings: Record<string, unknown> = {};
  const config = {
    get: (key: string, fallback: unknown) => (key in settings ? settings[key] : fallback),
  };
  const service = new VolunteerCallsService(
    prisma as unknown as PrismaService,
    new NoopRealtimePublisher(),
    messenger as unknown as VolunteerMessenger,
    config as unknown as ConfigService,
  );
  const sentTo = () => messenger.send.mock.calls.map((call: unknown[]) => call[0] as Row);
  const texts = () =>
    messenger.send.mock.calls.map((call: unknown[]) => {
      const message = call[1] as { title: string; body: string; sms: string };
      return `${message.title} ${message.body} ${message.sms}`;
    });
  return { service, prisma, event, calls, audit, messenger, settings, sentTo, texts };
}

const asked = (volunteerId: string, extra: Row = {}): Row => ({
  id: `call-${volunteerId}`,
  eventId: 'event-1',
  volunteerId,
  distanceMetres: 300,
  status: VolunteerCallStatus.ASKED,
  askedAt: new Date('2026-10-23T09:00:01Z'),
  askedVia: 'push',
  respondedAt: null,
  arrivedAt: null,
  ...extra,
});

describe('VolunteerCallsService', () => {
  describe('asking', () => {
    it('asks approved, available volunteers whose area covers the alert, nearest first', async () => {
      const t = world({
        candidates: [
          volunteer('far', 3000),
          volunteer('near', 300),
          volunteer('family', 80),
          volunteer('mid', 800),
        ],
        chain: ['family'],
      });

      await expect(t.service.askNearby('event-1', 'critical')).resolves.toBe(2);

      expect(t.prisma.user.findMany.mock.calls[0][0].where.volunteerProfile).toEqual({
        status: VolunteerStatus.APPROVED,
        available: true,
      });
      // Somebody in the chain is asked as family, not as a stranger.
      expect(t.calls.map((call) => call.volunteerId)).toEqual(['near', 'mid']);
      expect(t.calls[0].distanceMetres).toBe(300);
      expect(t.audit[0]).toMatchObject({
        action: AuditAction.VOLUNTEERS_ASKED,
        detail: { reason: 'critical', asked: 2 },
      });
      expect(t.calls.every((call) => call.askedVia === 'push')).toBe(true);
    });

    it('says how far but never who or where', async () => {
      const t = world({ candidates: [volunteer('near', 300)] });
      await t.service.askNearby('event-1', 'critical');

      const said = t.texts().join(' ');
      expect(said).toContain('about 300 m');
      expect(said).not.toContain('Grace');
      expect(said).not.toContain('Kileleshwa');
    });

    it('asks nobody for an elder who has not agreed to it', async () => {
      const t = world({ consent: false, candidates: [volunteer('near', 300)] });
      await expect(t.service.askNearby('event-1', 'critical')).resolves.toBe(0);
      expect(t.event.volunteersAskedAt).toBeNull();
      expect(t.messenger.send).not.toHaveBeenCalled();
    });

    it('asks once per emergency, whoever calls first', async () => {
      const t = world({ candidates: [volunteer('near', 300)] });
      await t.service.askNearby('event-1', 'critical');
      await expect(t.service.askNearby('event-1', 'uncovered')).resolves.toBe(0);
      expect(t.calls).toHaveLength(1);
    });

    it('asks nobody about an emergency that is over, or when switched off', async () => {
      const closed = world({ state: EventState.RESOLVED, candidates: [volunteer('near', 300)] });
      await expect(closed.service.askNearby('event-1', 'critical')).resolves.toBe(0);

      const off = world({ candidates: [volunteer('near', 300)] });
      off.settings.VOLUNTEERS_ENABLED = false;
      await expect(off.service.askNearby('event-1', 'critical')).resolves.toBe(0);
    });

    it('records the asking even when nobody is near, so it is not tried again', async () => {
      const t = world({ candidates: [volunteer('far', 3000)] });
      await expect(t.service.askNearby('event-1', 'uncovered')).resolves.toBe(0);
      expect(t.audit[0]).toMatchObject({ detail: { reason: 'uncovered', asked: 0 } });
      expect(t.event.volunteersAskedAt).toBeInstanceOf(Date);
    });
  });

  describe('accepting', () => {
    it('gives the first volunteer who and where, and stands the others down', async () => {
      const t = world({
        candidates: [volunteer('near', 300), volunteer('mid', 800)],
        calls: [asked('near'), asked('mid')],
      });

      const view = await t.service.accept('event-1', 'near');

      expect(view.status).toBe(VolunteerCallStatus.ACCEPTED);
      expect(view.elder).toMatchObject({
        name: 'Grace Wanjiru',
        addressLabel: 'Kileleshwa, Nairobi',
      });
      expect(t.event.volunteerId).toBe('near');
      expect(t.calls.find((call) => call.volunteerId === 'mid')?.status).toBe(
        VolunteerCallStatus.STOOD_DOWN,
      );
      expect(t.audit[0]).toMatchObject({ action: AuditAction.VOLUNTEER_ACCEPTED, actorId: 'near' });
      // The event's own state is the chain's: accepting takes nothing on.
      expect(t.event.state).toBe(EventState.NOTIFIED);
    });

    it('a second volunteer is told somebody is already going', async () => {
      const t = world({
        candidates: [volunteer('near', 300), volunteer('mid', 800)],
        calls: [asked('near'), asked('mid')],
      });
      await t.service.accept('event-1', 'near');

      await expect(t.service.accept('event-1', 'mid')).rejects.toThrow(ConflictException);
      expect(t.event.volunteerId).toBe('near');
    });

    it('a volunteer who was not asked cannot learn the emergency exists', async () => {
      const t = world({ calls: [asked('near')] });
      await expect(t.service.accept('event-1', 'stranger')).rejects.toThrow(NotFoundException);
    });

    it('nothing is shown before accepting, and nothing after it is over', async () => {
      const before = world({ candidates: [volunteer('near', 300)], calls: [asked('near')] });
      expect((await before.service.one('event-1', 'near')).elder).toBeNull();

      const after = world({
        state: EventState.RESOLVED,
        candidates: [volunteer('near', 300)],
        calls: [asked('near', { status: VolunteerCallStatus.ACCEPTED })],
        volunteerId: 'near',
      });
      const view = await after.service.one('event-1', 'near');
      expect(view.open).toBe(false);
      expect(view.elder).toBeNull();
    });

    it('refuses an emergency that is over', async () => {
      const t = world({ state: EventState.CANCELLED, calls: [asked('near')] });
      await expect(t.service.accept('event-1', 'near')).rejects.toThrow(ConflictException);
    });
  });

  describe('after accepting', () => {
    it('withdrawing gives the place back and asks the others again', async () => {
      const t = world({
        candidates: [volunteer('near', 300), volunteer('mid', 800)],
        calls: [asked('near'), asked('mid')],
      });
      await t.service.accept('event-1', 'near');
      t.messenger.send.mockClear();

      await t.service.withdraw('event-1', 'near');

      expect(t.event.volunteerId).toBeNull();
      expect(t.calls.find((call) => call.volunteerId === 'near')?.status).toBe(
        VolunteerCallStatus.WITHDRAWN,
      );
      expect(t.calls.find((call) => call.volunteerId === 'mid')?.status).toBe(
        VolunteerCallStatus.ASKED,
      );
      expect(t.audit.map((entry) => entry.action)).toContain(AuditAction.VOLUNTEER_WITHDREW);
      await new Promise((resolve) => setImmediate(resolve));
      expect(t.texts().join(' ')).toContain('still needs help');
    });

    it('arriving is recorded once', async () => {
      const t = world({ candidates: [volunteer('near', 300)], calls: [asked('near')] });
      await t.service.accept('event-1', 'near');

      const view = await t.service.arrived('event-1', 'near');
      await t.service.arrived('event-1', 'near');

      expect(view.arrivedAt).not.toBeNull();
      expect(
        t.audit.filter((entry) => entry.action === AuditAction.VOLUNTEER_ARRIVED),
      ).toHaveLength(1);
    });

    it('only the volunteer going can arrive or withdraw', async () => {
      const t = world({
        candidates: [volunteer('near', 300)],
        calls: [asked('near'), asked('mid')],
      });
      await t.service.accept('event-1', 'near');
      await expect(t.service.arrived('event-1', 'mid')).rejects.toThrow(ConflictException);
      await expect(t.service.withdraw('event-1', 'mid')).rejects.toThrow(ConflictException);
    });
  });

  describe('when the emergency ends', () => {
    it('stands down those still asked and thanks the one going', async () => {
      const t = world({
        candidates: [volunteer('near', 300), volunteer('mid', 800)],
        calls: [asked('near', { status: VolunteerCallStatus.ACCEPTED }), asked('mid')],
        volunteerId: 'near',
      });

      await t.service.eventClosed('event-1');

      expect(t.calls.find((call) => call.volunteerId === 'mid')?.status).toBe(
        VolunteerCallStatus.STOOD_DOWN,
      );
      const said = t.texts();
      expect(said.some((text) => text.includes('no longer needed'))).toBe(true);
      expect(said.some((text) => text.includes('Thank you for going'))).toBe(true);
    });

    it('does nothing for an emergency no volunteer was asked about', async () => {
      const t = world();
      await t.service.eventClosed('event-1');
      expect(t.messenger.send).not.toHaveBeenCalled();
    });
  });

  describe('by text', () => {
    it('a 1 accepts and is answered with who and where', async () => {
      const t = world({ candidates: [volunteer('near', 300)], calls: [asked('near')] });
      const reply = await t.service.answerByText('near', 'accept');
      expect(reply.answer).toBe('accepted');
      expect(reply.text).toContain('Grace Wanjiru at Kileleshwa, Nairobi');
    });

    it('a 1 after somebody else accepted is thanked, not given the address', async () => {
      const t = world({
        candidates: [volunteer('near', 300), volunteer('mid', 800)],
        calls: [asked('near'), asked('mid')],
      });
      await t.service.accept('event-1', 'near');
      t.calls.find((call) => call.volunteerId === 'mid')!.status = VolunteerCallStatus.ASKED;

      const reply = await t.service.answerByText('mid', 'accept');
      expect(reply.answer).toBe('taken');
      expect(reply.text).not.toContain('Kileleshwa');
    });

    it('nothing waiting is said so', async () => {
      const t = world();
      await expect(t.service.answerByText('near', 'accept')).resolves.toEqual({
        answer: 'nothing',
        text: null,
      });
    });
  });

  describe('on the alert', () => {
    it('the elder sees the first name; the circle also sees the number', async () => {
      const t = world({
        candidates: [volunteer('near', 300)],
        calls: [asked('near', { status: VolunteerCallStatus.ACCEPTED })],
        volunteerId: 'near',
      });

      const elder = await t.service.onAlert('event-1', true);
      expect(elder).toMatchObject({ asked: 1, name: 'near', phone: null });

      const circle = await t.service.onAlert('event-1', false);
      expect(circle).toMatchObject({ name: 'near Kamau', distanceMetres: 300 });
      expect(circle?.phone).toBeTruthy();
    });

    it('is null when no volunteer was asked', async () => {
      await expect(world().service.onAlert('event-1', false)).resolves.toBeNull();
    });
  });
});
