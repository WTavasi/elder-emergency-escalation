import type { ConfigService } from '@nestjs/config';
import type { RedisService } from '../redis/redis.service';
import { RoutingService } from './routing.service';

// About 2.2 km apart in Nairobi: Kilimani to Kileleshwa.
const FROM = { latitude: -1.2921, longitude: 36.7869 };
const TO = { latitude: -1.2805, longitude: 36.7701 };

function build(settings: Record<string, unknown> = {}) {
  const store = new Map<string, string>();
  const client = {
    set: jest.fn((key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(key)) return Promise.resolve(null);
      store.set(key, value);
      return Promise.resolve('OK');
    }),
  };
  const config = {
    get: (key: string, fallback?: unknown) => settings[key] ?? fallback,
  } as unknown as ConfigService;
  const service = new RoutingService({ client } as unknown as RedisService, config);
  service.sleep = jest.fn().mockResolvedValue(undefined);
  return { service, store, client };
}

const answer = (body: unknown, ok = true) =>
  jest.fn().mockResolvedValue({ ok, status: ok ? 200 : 503, json: () => Promise.resolve(body) });

describe('RoutingService', () => {
  it('estimates from the straight line by default, asking nobody', async () => {
    const { service } = build();
    service.fetcher = jest.fn();

    const route = await service.route(FROM, TO);

    expect(service.fetcher).not.toHaveBeenCalled();
    expect(route.source).toBe('estimate');
    // Longer than the line, for roads, and at city speed a few minutes.
    expect(route.distanceMetres).toBeGreaterThan(2200);
    expect(route.durationSeconds).toBeGreaterThan(300);
    expect(route.durationSeconds).toBeLessThan(900);
  });

  it('asks the router for a driving route, longitude first, when switched on', async () => {
    const { service } = build({ ROUTING_PROVIDER: 'osrm' });
    service.fetcher = answer({ code: 'Ok', routes: [{ duration: 512.4, distance: 3120.7 }] });

    const route = await service.route(FROM, TO);

    expect(route).toEqual({ durationSeconds: 512, distanceMetres: 3121, source: 'osrm' });
    const [url] = (service.fetcher as jest.Mock).mock.calls[0] as [URL];
    expect(url.pathname).toBe('/route/v1/driving/36.7869,-1.2921;36.7701,-1.2805');
  });

  it('falls back to the estimate when the router fails, rather than leaving no time', async () => {
    const { service } = build({ ROUTING_PROVIDER: 'osrm' });
    service.fetcher = answer({}, false);

    await expect(service.route(FROM, TO)).resolves.toMatchObject({ source: 'estimate' });
  });

  it('falls back when the router finds no route', async () => {
    const { service } = build({ ROUTING_PROVIDER: 'osrm' });
    service.fetcher = answer({ code: 'NoRoute', routes: [] });

    await expect(service.route(FROM, TO)).resolves.toMatchObject({ source: 'estimate' });
  });

  it('keeps to one request a second across everyone, estimating in between', async () => {
    const { service } = build({ ROUTING_PROVIDER: 'osrm' });
    service.fetcher = answer({ code: 'Ok', routes: [{ duration: 500, distance: 3000 }] });

    const first = await service.route(FROM, TO);
    const second = await service.route(FROM, TO);

    expect(first.source).toBe('osrm');
    expect(second.source).toBe('estimate');
    expect(service.fetcher).toHaveBeenCalledTimes(1);
  });

  it('waits for no slot when the router is the project’s own', async () => {
    const { service, client } = build({ ROUTING_PROVIDER: 'osrm', ROUTING_RATE_PER_SECOND: 0 });
    service.fetcher = answer({ code: 'Ok', routes: [{ duration: 500, distance: 3000 }] });

    const first = await service.route(FROM, TO);
    const second = await service.route(FROM, TO);

    expect([first.source, second.source]).toEqual(['osrm', 'osrm']);
    expect(client.set).not.toHaveBeenCalled();
  });

  it('draws the road when asked, as latitude and longitude, ending at the elder', async () => {
    const { service } = build({ ROUTING_PROVIDER: 'osrm' });
    service.fetcher = answer({
      code: 'Ok',
      routes: [
        {
          duration: 500,
          distance: 3000,
          geometry: {
            coordinates: [
              [36.786912, -1.292134],
              [36.78, -1.285],
              [36.770143, -1.280512],
            ],
          },
        },
      ],
    });

    const route = await service.route(FROM, TO, { path: true });

    expect(route.path).toEqual([
      [-1.29213, 36.78691],
      [-1.285, 36.78],
      [-1.28051, 36.77014],
    ]);
    const [url] = (service.fetcher as jest.Mock).mock.calls[0] as [URL];
    expect(url.searchParams.get('geometries')).toBe('geojson');
    expect(url.searchParams.get('overview')).toBe('simplified');
  });

  describe('travelTimes', () => {
    const NEAR = { latitude: -1.2835, longitude: 36.7745 };

    it('asks for many places in one request, the destination first', async () => {
      const { service } = build({ ROUTING_PROVIDER: 'osrm' });
      service.fetcher = answer({
        code: 'Ok',
        durations: [[640.2], [180.9]],
        distances: [[4100.4], [900.6]],
      });

      const times = await service.travelTimes([FROM, NEAR], TO);

      expect(times).toEqual([
        { durationSeconds: 640, distanceMetres: 4100, source: 'osrm' },
        { durationSeconds: 181, distanceMetres: 901, source: 'osrm' },
      ]);
      const [url] = (service.fetcher as jest.Mock).mock.calls[0] as [URL];
      expect(url.pathname).toBe(
        '/table/v1/driving/36.7701,-1.2805;36.7869,-1.2921;36.7745,-1.2835',
      );
      expect(url.searchParams.get('sources')).toBe('1;2');
      expect(url.searchParams.get('destinations')).toBe('0');
    });

    it('estimates only the place the router cannot reach', async () => {
      const { service } = build({ ROUTING_PROVIDER: 'osrm' });
      service.fetcher = answer({
        code: 'Ok',
        durations: [[640], [null]],
        distances: [[4100], [null]],
      });

      const [reached, unreached] = await service.travelTimes([FROM, NEAR], TO);

      expect(reached.source).toBe('osrm');
      expect(unreached.source).toBe('estimate');
    });

    it('waits briefly for the slot, then estimates rather than hold up a decision', async () => {
      const { service, store } = build({ ROUTING_PROVIDER: 'osrm' });
      store.set('routing:slot', '1');
      service.fetcher = jest.fn();

      const times = await service.travelTimes([FROM], TO);

      expect(times[0].source).toBe('estimate');
      expect(service.sleep).toHaveBeenCalledTimes(2);
      expect(service.fetcher).not.toHaveBeenCalled();
    });

    it('estimates everything when the router is off, asking nobody', async () => {
      const { service } = build();
      service.fetcher = jest.fn();

      const times = await service.travelTimes([FROM, NEAR], TO);

      expect(times.map((time) => time.source)).toEqual(['estimate', 'estimate']);
      expect(service.fetcher).not.toHaveBeenCalled();
    });
  });

  describe('travelTimesFrom', () => {
    const NEAR = { latitude: -1.2835, longitude: 36.7745 };

    it('asks for one place to many in one request, the origin first', async () => {
      const { service } = build({ ROUTING_PROVIDER: 'osrm' });
      service.fetcher = answer({
        code: 'Ok',
        durations: [[640.2, null]],
        distances: [[4100.4, null]],
      });

      const [reached, unreached] = await service.travelTimesFrom(FROM, [TO, NEAR]);

      expect(reached).toEqual({ durationSeconds: 640, distanceMetres: 4100, source: 'osrm' });
      expect(unreached.source).toBe('estimate');
      const [url] = (service.fetcher as jest.Mock).mock.calls[0] as [URL];
      expect(url.pathname).toBe(
        '/table/v1/driving/36.7869,-1.2921;36.7701,-1.2805;36.7745,-1.2835',
      );
      expect(url.searchParams.get('sources')).toBe('0');
      expect(url.searchParams.get('destinations')).toBe('1;2');
    });
  });
});
