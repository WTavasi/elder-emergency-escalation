import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';

/**
 * Only the parts of the request this guard reads.
 *
 * Declared here rather than imported from express, in the same style as the logging
 * interceptor, so the guard depends on the shape it uses rather than on a framework's
 * type definitions.
 */
interface LimitedRequest {
  method: string;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  user?: { userId?: string };
}

export interface RateLimit {
  /** Requests allowed inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export const RATE_LIMIT_KEY = 'rateLimit';

/** Declares a limit on one route. A route with no decorator is not limited. */
export const Throttle = (limit: number, windowSeconds: number) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowSeconds } satisfies RateLimit);

/**
 * A fixed-window rate limit, counted in Redis.
 *
 * Redis rather than memory because the counter has to be shared. An in-memory limiter
 * is only a limit while there is one instance of the API: the moment the platform runs
 * two, an attacker gets double the attempts and the limit quietly stops being one. The
 * Redis this system already runs for escalation timers is the natural home.
 *
 * INCR followed by EXPIRE on first use, in one pipeline, so the counter cannot be left
 * without a lifetime if the process dies between the two commands.
 *
 * Applied deliberately rather than globally. The alert endpoint is the one place where
 * a limit could cost somebody their emergency, so the limits below are set where brute
 * force is the risk and kept generous where panic is.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const rule = this.reflector.getAllAndOverride<RateLimit | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) return true;
    if (!this.config.get<boolean>('RATE_LIMIT_ENABLED', true)) return true;

    const request = context.switchToHttp().getRequest<LimitedRequest>();
    const key = this.keyFor(request, context);

    let count: number;
    try {
      const results = await this.redis.client
        .pipeline()
        .incr(key)
        .expire(key, rule.windowSeconds, 'NX')
        .exec();

      const incr = results?.[0];
      // A pipeline reports each command's error separately rather than throwing, so a
      // failed INCR has to be read out rather than assumed to have succeeded.
      if (!incr || incr[0]) throw incr?.[0] ?? new Error('no pipeline result');

      count = Number(incr[1] ?? 0);
    } catch (error: unknown) {
      // Redis being unavailable must not close the front door. Escalation already
      // fails loudly when Redis is down; refusing every sign-in as well would turn a
      // degraded system into an unusable one, and the limit is a mitigation rather
      // than the access control itself.
      this.logger.error(
        `Rate limit check failed, allowing the request: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return true;
    }

    if (count > rule.limit) {
      // No detail about which limit was hit or how much is left, so the response
      // cannot be used to map the policy.
      throw new HttpException(
        'Too many requests. Please wait a moment and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  /**
   * What is being counted.
   *
   * A signed-in caller is counted by user id, so one person on a shared connection
   * cannot exhaust everybody else's allowance. An anonymous caller is counted by
   * address, which is the only identifier there is before a sign-in succeeds.
   *
   * The route is part of the key, so sign-in attempts and alerts are counted
   * separately rather than competing for one allowance.
   */
  private keyFor(request: LimitedRequest, context: ExecutionContext): string {
    const who = request.user?.userId
      ? `user:${request.user.userId}`
      : `ip:${RateLimitGuard.addressOf(request)}`;
    const route = `${request.method}:${context.getClass().name}.${context.getHandler().name}`;

    return `ratelimit:${route}:${who}`;
  }

  /**
   * Behind Render's proxy the socket address is the proxy, so the forwarded header is
   * the only way to tell callers apart. It is client-controlled and therefore spoofable,
   * which is why the limit is a mitigation and not a security boundary: the first entry
   * is taken, and an absent header falls back to the socket.
   */
  static addressOf(request: LimitedRequest): string {
    const forwarded = request.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];

    return first?.trim() || request.ip || request.socket?.remoteAddress || 'unknown';
  }
}
