import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Two connections, deliberately.
 *
 * A Redis client in subscribe mode cannot issue ordinary commands, so the escalation
 * engine needs one connection subscribed to keyspace expiry notifications and a
 * separate one to read and write the keys themselves.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  /** Ordinary commands: SET, GET, EXPIRE and so on. */
  readonly client: Redis;

  /** Subscriber, used for keyspace expiry events. Never issues other commands. */
  readonly subscriber: Redis;

  constructor(config: ConfigService) {
    const url = config.getOrThrow<string>('REDIS_URL');
    const options = {
      lazyConnect: true,
      // BullMQ requires this to be null, and it is the right behaviour here anyway:
      // an escalation timer must not be dropped because a command retried too often.
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    } as const;

    this.client = new Redis(url, options);
    this.subscriber = new Redis(url, options);
  }

  async onModuleInit(): Promise<void> {
    await Promise.all([this.client.connect(), this.subscriber.connect()]);
    await this.ensureExpiryEvents();
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.client.quit(), this.subscriber.quit()]);
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  /**
   * Escalation depends on Redis publishing an event when a key expires, which is off
   * by default. A Redis without it accepts every timer we set and silently never
   * mentions them again, so an emergency would sit unescalated with nothing in the
   * logs to explain why.
   *
   * That failure is severe enough to be worth fixing rather than only reporting: if
   * the flags are missing, they are set at runtime, preserving any that are already
   * there. A managed Redis may refuse CONFIG SET, in which case this says so and names
   * the exact setting to change.
   */
  private async ensureExpiryEvents(): Promise<void> {
    const current = await this.readKeyspaceFlags();

    if (RedisService.publishesExpiry(current)) {
      this.logger.log(`Connected to Redis, keyspace events: "${current}"`);
      return;
    }

    // Keep whatever is configured and add only what is missing: another application
    // may be relying on flags we know nothing about.
    const desired = RedisService.withExpiryFlags(current);

    try {
      await this.client.config('SET', 'notify-keyspace-events', desired);
      this.logger.warn(
        `Redis was not publishing key expiry events (flags: "${current}"). Set to "${desired}" at runtime so escalation timeouts fire. Add "--notify-keyspace-events ${desired}" to the server configuration to make it permanent.`,
      );
    } catch (error) {
      this.logger.error(
        `Redis is not publishing key expiry events (flags: "${current}") and CONFIG SET was refused. Escalation timeouts will NOT fire. Start Redis with "--notify-keyspace-events Ex", or set it on your managed instance. Cause: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }

  private async readKeyspaceFlags(): Promise<string> {
    // CONFIG GET replies as a flat [name, value] array, which ioredis types as unknown.
    const reply: unknown = await this.client.config('GET', 'notify-keyspace-events');
    return Array.isArray(reply) ? String(reply[1] ?? '') : '';
  }

  /**
   * Expiry events need the keyevent class (E) and the expired class (x). A is an alias
   * covering every class including x, so E plus A is equally valid.
   */
  static publishesExpiry(flags: string): boolean {
    return flags.includes('E') && (flags.includes('x') || flags.includes('A'));
  }

  /** Adds the missing flags without disturbing any that are already set. */
  static withExpiryFlags(flags: string): string {
    const set = new Set(flags.split(''));
    set.add('E');
    if (!set.has('A')) set.add('x');
    return [...set].join('');
  }
}
