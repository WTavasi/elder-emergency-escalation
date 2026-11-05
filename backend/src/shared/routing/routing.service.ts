import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { distanceInMetres, type Coordinates } from '../utils/geo';

/** How long it will take to get from one place to another, and how it was worked out. */
export interface RouteEstimate {
  durationSeconds: number;
  distanceMetres: number;
  /** "osrm" for a routed answer, "estimate" for the straight-line fallback. */
  source: 'osrm' | 'estimate';
  /**
   * The road, as [latitude, longitude] points, when it was asked for and a router drew
   * it. Simplified: enough to draw on a small map, not to navigate by.
   */
  path?: Array<[number, number]>;
}

/**
 * Roads are not straight. In Nairobi's grid and estates a route is typically 30 to 50
 * percent longer than the line between its ends; 1.4 sits in that range.
 */
const DETOUR_FACTOR = 1.4;

/** An average city driving speed, about 25 km/h, in metres a second. */
const CITY_SPEED = 25_000 / 3600;

/** The shared slot that keeps every request together under the router's limit. */
const SLOT_KEY = 'routing:slot';

/** The most points a drawn route keeps. A city route simplified is usually far fewer. */
const MAX_PATH_POINTS = 400;

/** OSRM's table service takes up to 100 places by default: one destination and 99 more. */
const MAX_TABLE_ORIGINS = 99;

/** How often, and how far apart, a decision waits for the slot before estimating. */
const SLOT_TRIES = 3;
const SLOT_WAIT_MS = 350;

const round5 = (value: number): number => Math.round(value * 1e5) / 1e5;

/**
 * Travel times by road, from an OSRM router.
 *
 * Never blocks for long and never fails: an answer a minute out is useful, and no answer
 * because a router was busy is not. Every request shares one slot sized to the router's
 * limit (`ROUTING_RATE_PER_SECOND`, one a second for the public demonstration server,
 * none for the project's own), and the straight-line estimate answers whenever the
 * router is off, busy, slow or wrong. Each answer says which it was, so a screen can say
 * "by road" or "in a straight line".
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  /** Replaced in tests. */
  fetcher: typeof fetch = (input, init) => fetch(input, init);

  /** Replaced in tests, so waiting for the slot takes no real time. */
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  /**
   * The time from one place to another. Asked often, for somebody on their way, so it
   * never waits for the slot: the next position will ask again.
   */
  async route(
    from: Coordinates,
    to: Coordinates,
    options: { path?: boolean } = {},
  ): Promise<RouteEstimate> {
    if (!this.enabled || !(await this.takeSlot())) return RoutingService.estimate(from, to);

    try {
      return await this.fromRouter(from, to, options.path === true);
    } catch (error) {
      this.logger.warn(`Routing fell back to an estimate: ${RoutingService.reason(error)}`);
      return RoutingService.estimate(from, to);
    }
  }

  /**
   * The time from each of several places to one, in the same order, in one request.
   * Used for a decision (which volunteers to ask), so it waits briefly for the slot,
   * about a second at most, before estimating. Each answer falls back on its own: a
   * place the router cannot reach is estimated while the others stay routed.
   */
  async travelTimes(origins: Coordinates[], to: Coordinates): Promise<RouteEstimate[]> {
    const estimates = origins.map((from) => RoutingService.estimate(from, to));
    if (origins.length === 0 || !this.enabled) return estimates;
    if (!(await this.takeSlot(SLOT_TRIES))) return estimates;

    try {
      const routed = await this.fromTable(origins.slice(0, MAX_TABLE_ORIGINS), to);
      return estimates.map((estimate, index) => routed[index] ?? estimate);
    } catch (error) {
      this.logger.warn(`Travel times fell back to estimates: ${RoutingService.reason(error)}`);
      return estimates;
    }
  }

  /**
   * The time from one place to each of several, in the same order, in one request: a
   * person to every open emergency they could go to. Waits briefly for the slot, as
   * [travelTimes] does, and falls back per place.
   */
  async travelTimesFrom(from: Coordinates, destinations: Coordinates[]): Promise<RouteEstimate[]> {
    const estimates = destinations.map((to) => RoutingService.estimate(from, to));
    if (destinations.length === 0 || !this.enabled) return estimates;
    if (!(await this.takeSlot(SLOT_TRIES))) return estimates;

    try {
      const routed = await this.fromTableOut(from, destinations.slice(0, MAX_TABLE_ORIGINS));
      return estimates.map((estimate, index) => routed[index] ?? estimate);
    } catch (error) {
      this.logger.warn(`Travel times fell back to estimates: ${RoutingService.reason(error)}`);
      return estimates;
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

  private get enabled(): boolean {
    return this.config.get<string>('ROUTING_PROVIDER', 'estimate') === 'osrm';
  }

  /**
   * One request's turn under the router's limit, shared by every instance through
   * Redis. A limit of 0 means none, for a router the project runs itself.
   */
  private async takeSlot(tries = 1): Promise<boolean> {
    const perSecond = Number(this.config.get<number>('ROUTING_RATE_PER_SECOND', 1));
    if (!(perSecond > 0)) return true;
    const gap = Math.max(1, Math.floor(1000 / perSecond));

    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (attempt > 0) await this.sleep(SLOT_WAIT_MS);
      const slot = await this.redis.client.set(SLOT_KEY, '1', 'PX', gap, 'NX');
      if (slot === 'OK') return true;
    }
    return false;
  }

  private async ask(path: string, query: Record<string, string>): Promise<unknown> {
    const base = this.config.get<string>('ROUTING_URL', 'https://router.project-osrm.org');
    const url = new URL(path, base);
    url.search = new URLSearchParams(query).toString();

    const response = await this.fetcher(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MzaziCare/0.1 (https://github.com/WTavasi/elder-emergency-escalation)',
      },
      // Short. A position arrives every 10 to 15 seconds, and the next one will ask
      // again; a decision would rather go ahead on an estimate than wait.
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`router answered ${response.status}`);
    return response.json();
  }

  private async fromRouter(
    from: Coordinates,
    to: Coordinates,
    withPath: boolean,
  ): Promise<RouteEstimate> {
    const body = (await this.ask(`/route/v1/driving/${lonLat(from)};${lonLat(to)}`, {
      overview: withPath ? 'simplified' : 'false',
      alternatives: 'false',
      ...(withPath ? { geometries: 'geojson' } : {}),
    })) as {
      code?: string;
      routes?: {
        duration?: number;
        distance?: number;
        geometry?: { coordinates?: unknown };
      }[];
    };
    const best = body.routes?.[0];
    if (
      body.code !== 'Ok' ||
      typeof best?.duration !== 'number' ||
      typeof best.distance !== 'number'
    ) {
      throw new Error(`router found no route (${body.code ?? 'no code'})`);
    }

    const path = withPath ? RoutingService.path(best.geometry?.coordinates) : undefined;
    return {
      durationSeconds: Math.round(best.duration),
      distanceMetres: Math.round(best.distance),
      source: 'osrm',
      ...(path ? { path } : {}),
    };
  }

  /** One request for many origins to one destination: the destination first, then each. */
  private async fromTable(
    origins: Coordinates[],
    to: Coordinates,
  ): Promise<Array<RouteEstimate | undefined>> {
    const places = [to, ...origins].map(lonLat).join(';');
    const body = (await this.ask(`/table/v1/driving/${places}`, {
      sources: origins.map((_, index) => String(index + 1)).join(';'),
      destinations: '0',
      annotations: 'duration,distance',
    })) as { code?: string; durations?: unknown; distances?: unknown };
    if (body.code !== 'Ok' || !Array.isArray(body.durations)) {
      throw new Error(`router gave no table (${body.code ?? 'no code'})`);
    }

    const durations = body.durations as unknown[];
    const distances = Array.isArray(body.distances) ? (body.distances as unknown[]) : [];
    return origins.map((_, index) => {
      const duration = firstNumber(durations[index]);
      const distance = firstNumber(distances[index]);
      // Null where the router has no road between them, such as a place off the map.
      if (duration === null || distance === null) return undefined;
      return {
        durationSeconds: Math.round(duration),
        distanceMetres: Math.round(distance),
        source: 'osrm' as const,
      };
    });
  }

  /** One request for one origin to many destinations: the origin first, then each. */
  private async fromTableOut(
    from: Coordinates,
    destinations: Coordinates[],
  ): Promise<Array<RouteEstimate | undefined>> {
    const places = [from, ...destinations].map(lonLat).join(';');
    const body = (await this.ask(`/table/v1/driving/${places}`, {
      sources: '0',
      destinations: destinations.map((_, index) => String(index + 1)).join(';'),
      annotations: 'duration,distance',
    })) as { code?: string; durations?: unknown; distances?: unknown };
    if (body.code !== 'Ok' || !Array.isArray(body.durations)) {
      throw new Error(`router gave no table (${body.code ?? 'no code'})`);
    }
    // One row, the origin's, with a column per destination.
    const durations = Array.isArray(body.durations[0]) ? (body.durations[0] as unknown[]) : [];
    const distances =
      Array.isArray(body.distances) && Array.isArray(body.distances[0])
        ? (body.distances[0] as unknown[])
        : [];
    return destinations.map((_, index) => {
      const duration = durations[index];
      const distance = distances[index];
      if (typeof duration !== 'number' || typeof distance !== 'number') return undefined;
      return {
        durationSeconds: Math.round(duration),
        distanceMetres: Math.round(distance),
        source: 'osrm' as const,
      };
    });
  }

  /** GeoJSON's [longitude, latitude] pairs as [latitude, longitude], thinned if long. */
  private static path(coordinates: unknown): Array<[number, number]> | undefined {
    if (!Array.isArray(coordinates)) return undefined;
    const points = coordinates.filter(
      (point): point is [number, number] =>
        Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number',
    );
    if (points.length < 2) return undefined;

    const step = Math.ceil(points.length / MAX_PATH_POINTS);
    const kept = points.filter((_, index) => index % step === 0);
    // The end always stays, so the line reaches the elder.
    if (kept[kept.length - 1] !== points[points.length - 1]) kept.push(points[points.length - 1]);
    return kept.map(([longitude, latitude]) => [round5(latitude), round5(longitude)]);
  }

  private static reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

/** OSRM takes longitude first. */
const lonLat = (place: Coordinates): string => `${place.longitude},${place.latitude}`;

const firstNumber = (row: unknown): number | null =>
  Array.isArray(row) && typeof row[0] === 'number' ? row[0] : null;
