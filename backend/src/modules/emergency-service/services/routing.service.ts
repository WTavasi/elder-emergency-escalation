import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../shared/redis/redis.service';
import { distanceInMetres, type Coordinates } from '../../../shared/utils/geo';

/** How long it will take to get from one place to another, and how it was worked out. */
export interface RouteEstimate {
  durationSeconds: number;
  distanceMetres: number;
  /** "osrm" for a routed answer, "estimate" for the straight-line fallback. */
  source: 'osrm' | 'estimate';
}

/**
 * Roads are not straight. In Nairobi's grid and estates a route is typically 30 to 50
 * percent longer than the line between its ends; 1.4 sits in that range.
 */
const DETOUR_FACTOR = 1.4;

/** An average city driving speed, about 25 km/h, in metres a second. */
const CITY_SPEED = 25_000 / 3600;

/** The shared slot that keeps every responder together under the router's one a second. */
const SLOT_KEY = 'routing:slot';
const SLOT_MS = 1000;

/**
 * Time to the elder.
 *
 * Never blocks on the router and never fails: an ETA that is a minute out is useful to
 * an elder waiting for help, and no ETA because a free public service was busy is not.
 * So the router is asked only when this server's one-a-second slot is free, given a
 * short timeout, and the straight-line estimate answers whenever it does not.
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  /** Replaced in tests. */
  fetcher: typeof fetch = (input, init) => fetch(input, init);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async route(from: Coordinates, to: Coordinates): Promise<RouteEstimate> {
    if (this.config.get<string>('ROUTING_PROVIDER', 'estimate') !== 'osrm') {
      return RoutingService.estimate(from, to);
    }

    const slot = await this.redis.client.set(SLOT_KEY, '1', 'PX', SLOT_MS, 'NX');
    if (slot !== 'OK') return RoutingService.estimate(from, to);

    try {
      return await this.fromRouter(from, to);
    } catch (error) {
      this.logger.warn(
        `Routing fell back to an estimate: ${error instanceof Error ? error.message : error}`,
      );
      return RoutingService.estimate(from, to);
    }
  }

  /** The straight line, lengthened for roads, at a city driving speed. */
  static estimate(from: Coordinates, to: Coordinates): RouteEstimate {
    const distanceMetres = Math.round(distanceInMetres(from, to) * DETOUR_FACTOR);
    return {
      distanceMetres,
      durationSeconds: Math.round(distanceMetres / CITY_SPEED),
      source: 'estimate',
    };
  }

  private async fromRouter(from: Coordinates, to: Coordinates): Promise<RouteEstimate> {
    const base = this.config.get<string>('ROUTING_URL', 'https://router.project-osrm.org');
    // OSRM takes longitude first.
    const path = `/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
    const url = new URL(path, base);
    url.search = new URLSearchParams({ overview: 'false', alternatives: 'false' }).toString();

    const response = await this.fetcher(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MzaziCare/0.1 (https://github.com/WTavasi/elder-emergency-escalation)',
      },
      // Short. A position arrives every 10 to 15 seconds, and the next one will ask again.
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`router answered ${response.status}`);

    const body = (await response.json()) as {
      code?: string;
      routes?: { duration?: number; distance?: number }[];
    };
    const best = body.routes?.[0];
    if (
      body.code !== 'Ok' ||
      typeof best?.duration !== 'number' ||
      typeof best.distance !== 'number'
    ) {
      throw new Error(`router found no route (${body.code ?? 'no code'})`);
    }

    return {
      durationSeconds: Math.round(best.duration),
      distanceMetres: Math.round(best.distance),
      source: 'osrm',
    };
  }
}
