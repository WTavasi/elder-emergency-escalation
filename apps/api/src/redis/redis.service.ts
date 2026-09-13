import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Two connections, deliberately.
 *
 * A Redis client in subscribe mode cannot issue ordinary commands, so the escalation
 * engine needs one connection subscribed to keyspace expiry notifications and a
 * separate one to read and write the keys themselves. Creating both here means the
 * engine stage does not have to revisit connection management.
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

    // Verify the server is configured to publish expiry events. Without the Ex flag
    // the escalation engine would sit silent, which is the one failure in this system
    // that must never be quiet.
    // CONFIG GET replies as a flat [name, value] array, which ioredis types as unknown.
    const reply: unknown = await this.client.config('GET', 'notify-keyspace-events');
    const flags = Array.isArray(reply) ? String(reply[1] ?? '') : '';

    if (!flags.includes('E')) {
      this.logger.error(
        `Redis notify-keyspace-events is "${flags}". Escalation timeouts rely on keyspace expiry events and will not fire. Start Redis with --notify-keyspace-events Ex.`,
      );
    } else {
      this.logger.log(`Connected to Redis, keyspace events: "${flags}"`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.client.quit(), this.subscriber.quit()]);
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }
}
