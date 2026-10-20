import type { ConfigService } from '@nestjs/config';
import type { RedisService } from '../../../shared/redis/redis.service';
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
  return { service, store };
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
});
