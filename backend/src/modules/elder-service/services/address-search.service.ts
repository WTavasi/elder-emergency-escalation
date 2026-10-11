import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../shared/redis/redis.service';

/** One place an address search found. */
export interface AddressMatch {
  label: string;
  latitude: number;
  longitude: number;
}

export interface AddressSearchResult {
  results: AddressMatch[];
  /** Shown under the results, as OpenStreetMap's licence requires. */
  attribution: string;
}

export const ATTRIBUTION = 'Search by Nominatim. Map data © OpenStreetMap contributors.';

/** One request a second across every user, which is the public service's limit. */
const SLOT_MS = 1100;
/** How long an answer is reused. Places do not move, and the policy asks for caching. */
const CACHE_SECONDS = 24 * 60 * 60;

/**
 * Finding the coordinates of an address, for setting an elder's home.
 *
 * The app never talks to the geocoder. It asks this server, which asks OpenStreetMap's
 * Nominatim, so the only party that learns an elder's address is this system, and the
 * public service's usage policy can be kept in one place:
 * https://operations.osmfoundation.org/policies/nominatim/
 *
 * - One request a second in total, held by a slot in Redis that every instance of the
 *   API shares. A second request waits for the slot once, then is told to try again.
 * - An identifying User-Agent with a contact, from GEOCODER_CONTACT.
 * - No search-as-you-type: the app searches when the person presses Search, and this
 *   endpoint is rate limited per person besides.
 * - Answers cached for a day, keyed on the normalised query.
 */
@Injectable()
export class AddressSearchService {
  private readonly logger = new Logger(AddressSearchService.name);

  /** Replaced in tests. */
  fetcher: typeof fetch = (input, init) => fetch(input, init);

  /** Replaced in tests, so waiting for the slot does not slow them down. */
  sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async search(query: string): Promise<AddressSearchResult> {
    const countries = this.config.get<string>('GEOCODER_COUNTRY_CODES', 'ke');
    const normalised = query.trim().replace(/\s+/g, ' ').toLowerCase();
    const cacheKey = `geocode:${countries}:${normalised}`;

    const cached = await this.redis.client.get(cacheKey);
    if (cached) return { results: JSON.parse(cached) as AddressMatch[], attribution: ATTRIBUTION };

    await this.takeSlot();

    const base = this.config.get<string>('GEOCODER_URL', 'https://nominatim.openstreetmap.org');
    const url = new URL('/search', base);
    url.search = new URLSearchParams({
      q: normalised,
      format: 'jsonv2',
      limit: '5',
      'accept-language': 'en',
      ...(countries ? { countrycodes: countries } : {}),
    }).toString();

    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { 'User-Agent': this.userAgent(), Accept: 'application/json' },
        signal: AbortSignal.timeout(this.config.get<number>('PROVIDER_TIMEOUT_MS', 10_000)),
      });
    } catch (error) {
      this.logger.warn(`Address search failed: ${error instanceof Error ? error.message : error}`);
      throw new ServiceUnavailableException('Address search is not reachable. Try again shortly.');
    }

    if (!response.ok) {
      this.logger.warn(`Address search answered ${response.status}`);
      throw new ServiceUnavailableException('Address search is not available. Try again shortly.');
    }

    const raw = (await response.json()) as { display_name?: string; lat?: string; lon?: string }[];
    const results = raw
      .filter((item) => item.display_name && item.lat && item.lon)
      .map((item) => ({
        label: item.display_name as string,
        // Six decimal places is about ten centimetres, and what the database stores.
        latitude: Number(Number(item.lat).toFixed(6)),
        longitude: Number(Number(item.lon).toFixed(6)),
      }));

    await this.redis.client.set(cacheKey, JSON.stringify(results), 'EX', CACHE_SECONDS);
    return { results, attribution: ATTRIBUTION };
  }

  /** Waits for the shared one-a-second slot, once, and gives up politely after that. */
  private async takeSlot(): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const taken = await this.redis.client.set('geocode:slot', '1', 'PX', SLOT_MS, 'NX');
      if (taken === 'OK') return;
      if (attempt === 0) await this.sleep(SLOT_MS);
    }
    throw new ServiceUnavailableException('Address search is busy. Try again in a moment.');
  }

  private userAgent(): string {
    const contact =
      this.config.get<string>('GEOCODER_CONTACT') ??
      'https://github.com/WTavasi/elder-emergency-escalation';
    return `MzaziCare/0.1 (${contact})`;
  }
}
