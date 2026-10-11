import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { RedisService } from '../../../shared/redis/redis.service';
import { AddressSearchService, ATTRIBUTION } from './address-search.service';

function build(settings: Record<string, unknown> = {}) {
  const store = new Map<string, string>();
  const client = {
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: jest.fn((key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(key)) return Promise.resolve(null);
      store.set(key, value);
      return Promise.resolve('OK');
    }),
  };
  const config = {
    get: (key: string, fallback?: unknown) => settings[key] ?? fallback,
  } as unknown as ConfigService;
  const service = new AddressSearchService({ client } as unknown as RedisService, config);
  service.sleep = () => Promise.resolve();
  return { service, store, client };
}

const answer = (body: unknown, ok = true) =>
  jest.fn().mockResolvedValue({ ok, status: ok ? 200 : 503, json: () => Promise.resolve(body) });

describe('AddressSearchService', () => {
  it('returns places with coordinates and the attribution the licence asks for', async () => {
    const { service } = build();
    service.fetcher = answer([
      { display_name: 'Kilimani, Nairobi, Kenya', lat: '-1.2921234567', lon: '36.7812345678' },
    ]);

    const result = await service.search('Kilimani');

    expect(result.results).toEqual([
      { label: 'Kilimani, Nairobi, Kenya', latitude: -1.292123, longitude: 36.781235 },
    ]);
    expect(result.attribution).toBe(ATTRIBUTION);
  });

  it('identifies itself and searches within the configured countries', async () => {
    const { service } = build({ GEOCODER_CONTACT: 'ops@example.com' });
    service.fetcher = answer([]);

    await service.search('Kilimani');

    const [url, init] = (service.fetcher as jest.Mock).mock.calls[0] as [URL, RequestInit];
    expect(url.searchParams.get('countrycodes')).toBe('ke');
    expect(url.searchParams.get('q')).toBe('kilimani');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(
      'MzaziCare/0.1 (ops@example.com)',
    );
  });

  it('answers a repeated search from the cache without asking again', async () => {
    const { service } = build();
    service.fetcher = answer([{ display_name: 'Karen', lat: '-1.3', lon: '36.7' }]);

    await service.search('Karen');
    await service.search('  karen ');

    expect(service.fetcher).toHaveBeenCalledTimes(1);
  });

  it('waits for the shared one-a-second slot once, then says it is busy', async () => {
    const { service, store } = build();
    store.set('geocode:slot', '1');
    service.fetcher = answer([]);

    await expect(service.search('Westlands')).rejects.toThrow(ServiceUnavailableException);
    expect(service.fetcher).not.toHaveBeenCalled();
  });

  it('turns a failing geocoder into a clear message rather than an error page', async () => {
    const { service } = build();
    service.fetcher = answer([], false);

    await expect(service.search('Westlands')).rejects.toThrow(ServiceUnavailableException);
  });
});
