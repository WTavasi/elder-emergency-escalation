import type { ConfigService } from '@nestjs/config';
import { EmergencyType, EventState, Role, Severity } from '@prisma/client';
import type { PrismaService } from '../../../db/prisma.service';
import type { RedisService } from '../../../shared/redis/redis.service';
import { RoutingService } from '../../../shared/routing/routing.service';
import type { AlertSummary } from '../views/alert-views';
import { AlertRankingService } from './alert-ranking.service';
import type { AlertsService } from './alerts.service';
import type { JourneyService } from './journey.service';

const ME = 'caregiver-1';

/** Where the caregiver is: Kileleshwa. */
const HERE = { latitude: -1.2833, longitude: 36.7833 };

/** An open alert [km] east of the caregiver. */
const alert = (id: string, km: number, overrides: Partial<AlertSummary> = {}): AlertSummary =>
  ({
    eventId: id,
    state: EventState.NOTIFIED,
    severity: Severity.STANDARD,
    elder: { id: `elder-${id}`, name: `Elder ${id}`, phone: null, addressLabel: null },
    acknowledgedBy: null,
    latitude: HERE.latitude,
    longitude: HERE.longitude + km / 111.3,
    reportedType: null,
    triggeredAt: '2026-11-06T10:00:00.000Z',
    ...overrides,
  }) as AlertSummary;

function build(open: AlertSummary[], options: { theirEta?: number; station?: boolean } = {}) {
  const prisma = {
    emergencyEvent: {
      findMany: jest.fn().mockResolvedValue(open.map((item) => ({ id: item.eventId }))),
    },
    emergencyTypeRule: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { type: EmergencyType.FIRE },
          { type: EmergencyType.BREATHING },
          { type: EmergencyType.UNSAFE },
        ]),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.station
            ? { stationLatitude: HERE.latitude, stationLongitude: HERE.longitude }
            : { stationLatitude: null, stationLongitude: null },
        ),
    },
  };
  const alerts = { findForUser: jest.fn().mockResolvedValue(open) };
  const journeys = {
    current: jest.fn().mockResolvedValue({
      owner: null,
      all: options.theirEta === undefined ? [] : [{ etaSeconds: options.theirEta }],
    }),
  };
  const config = { get: (_key: string, fallback: unknown) => fallback } as unknown as ConfigService;
  const service = new AlertRankingService(
    prisma as unknown as PrismaService,
    alerts as unknown as AlertsService,
    journeys as unknown as JourneyService,
    new RoutingService({} as RedisService, config),
  );
  return { service, alerts };
}

const order = (ranked: { alerts: Array<{ alert: AlertSummary }> }): string[] =>
  ranked.alerts.map((item) => item.alert.eventId);

describe('AlertRankingService', () => {
  it('puts what nobody has taken on first, then your own, then the rest', async () => {
    const { service } = build([
      alert('theirs', 1, {
        acknowledgedBy: { id: 'family-1', name: 'Aisha', role: Role.FAMILY_MEMBER },
      }),
      alert('mine', 1, { acknowledgedBy: { id: ME, name: 'Mary', role: Role.CAREGIVER } }),
      alert('nobody', 5),
    ]);

    expect(order(await service.rank(ME, Role.CAREGIVER, HERE))).toEqual([
      'nobody',
      'mine',
      'theirs',
    ]);
  });

  it('within that, the more severe, then the urgent type, then the nearer', async () => {
    const { service } = build([
      alert('near', 1),
      alert('far', 8),
      alert('fire', 9, { reportedType: EmergencyType.FIRE }),
      alert('critical', 10, { severity: Severity.CRITICAL }),
    ]);

    expect(order(await service.rank(ME, Role.CAREGIVER, HERE))).toEqual([
      'critical',
      'fire',
      'near',
      'far',
    ]);
  });

  it('says why, in short sentences', async () => {
    const { service } = build([
      alert('fire', 2, { severity: Severity.CRITICAL, reportedType: EmergencyType.FIRE }),
    ]);

    const [only] = (await service.rank(ME, Role.CAREGIVER, HERE)).alerts;

    expect(only.reasons[0]).toBe('Nobody has taken this on yet.');
    expect(only.reasons).toContain('Critical.');
    expect(only.reasons).toContain('Fire reported.');
    // No router: a rough time, with no "by road".
    expect(only.reasons[3]).toMatch(/^About \d+ minutes? from you\.$/);
    expect(only.byRoad).toBe(false);
    // A list row shows the rest itself; it needs only the distance.
    expect(only.why).toBe(only.reasons[3]);
  });

  it('says when you would get there well before whoever is going', async () => {
    const { service } = build(
      [
        alert('theirs', 1, {
          acknowledgedBy: { id: 'family-1', name: 'Aisha Otieno', role: Role.FAMILY_MEMBER },
        }),
      ],
      { theirEta: 1800 },
    );

    const [only] = (await service.rank(ME, Role.CAREGIVER, HERE)).alerts;

    expect(only.reasons[0]).toBe('Aisha is on the way.');
    expect(only.reasons[1]).toMatch(/^You could be there about \d+ minutes sooner than Aisha\.$/);
  });

  it('measures from the station when the phone said nothing, and from nowhere without one', async () => {
    const withStation = build([alert('a', 1)], { station: true });
    const without = build([alert('a', 1)]);

    const fromStation = await withStation.service.rank('unit-1', Role.EMERGENCY_RESPONDER);
    const fromNowhere = await without.service.rank(ME, Role.CAREGIVER);

    expect(fromStation.measuredFrom).toBe('station');
    expect(fromStation.alerts[0].travelSeconds).not.toBeNull();
    expect(fromNowhere.measuredFrom).toBeNull();
    expect(fromNowhere.alerts[0].travelSeconds).toBeNull();
  });

  it('asks only for open emergencies the person is part of', async () => {
    const { service, alerts } = build([]);

    await expect(service.rank(ME, Role.CAREGIVER)).resolves.toEqual({
      alerts: [],
      measuredFrom: null,
    });
    expect(alerts.findForUser).toHaveBeenCalledWith(ME, Role.CAREGIVER, {
      onlyOpen: true,
      limit: 50,
    });
  });
});
