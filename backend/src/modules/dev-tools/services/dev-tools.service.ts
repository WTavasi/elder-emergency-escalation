import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DevOutbox, type OutboxText } from '../../notification-service/providers/dev-outbox';
import { RedisService } from '../../../shared/redis/redis.service';

/**
 * The counters `npm run dev:clear-limits` clears. Kept in step with
 * scripts/clear-rate-limits.mjs: counts only, never codes, sessions or timers.
 */
export const LIMIT_PATTERNS = ['ratelimit:*', 'verify:cooldown:*', 'verify:count:*', 'sms-reply:*'];

/**
 * What the development tools can do, and whether they exist at all.
 *
 * On only outside production and only while texts are printed rather than sent. With a
 * real SMS provider a code reaches a phone, and reading it back here would let anybody
 * who can reach the API skip proving they hold that phone.
 */
@Injectable()
export class DevToolsService {
  private readonly logger = new Logger(DevToolsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly outbox: DevOutbox,
    private readonly redis: RedisService,
  ) {}

  get enabled(): boolean {
    return (
      this.config.get<string>('NODE_ENV') !== 'production' &&
      this.config.get<string>('SMS_PROVIDER', 'logging') === 'logging'
    );
  }

  texts(phone: string): OutboxText[] {
    return this.outbox.to(phone);
  }

  async clearLimits(): Promise<number> {
    let cleared = 0;
    for (const pattern of LIMIT_PATTERNS) {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        if (keys.length > 0) cleared += await this.redis.client.del(...keys);
      } while (cursor !== '0');
    }
    this.logger.log(`Cleared ${cleared} rate-limit counter(s)`);
    return cleared;
  }
}
