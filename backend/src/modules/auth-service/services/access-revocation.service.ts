import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../shared/redis/redis.service';
import { toSeconds } from '../../../shared/utils/duration';

const key = (userId: string): string => `revoked:access:${userId}`;

/**
 * Ends a deactivated account's access tokens at once, rather than when they expire.
 *
 * Access tokens are checked without a database lookup, which keeps the alert path free
 * of an extra query, and the cost was that a deactivated account kept working until
 * its access token ran out, up to one access lifetime. Deactivating now leaves a mark
 * in Redis for that user, and the guard refuses every token belonging to a marked
 * account: one key lookup per request, in the store already holding the rate limits.
 *
 * Each mark lasts one access lifetime and a minute more, then removes itself. Past that
 * point no access token issued before the deactivation can still be valid, and the
 * account cannot get a new one, because refresh and sign-in check the database. So the
 * mark only has to cover the gap, and nothing has to clean it up.
 *
 * If Redis cannot be reached the check lets the request through and says so in the log,
 * the same choice the rate limiter makes: refusing every signed-in person because a
 * cache is down would turn a deactivation safeguard into an outage, and the worst case
 * is the old behaviour, bounded by the access lifetime.
 */
@Injectable()
export class AccessRevocationService {
  private readonly logger = new Logger(AccessRevocationService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private get lifetimeSeconds(): number {
    return toSeconds(this.config.getOrThrow<string>('JWT_ACCESS_TTL')) + 60;
  }

  async revoke(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const pipeline = this.redis.client.multi();
    for (const userId of userIds) pipeline.set(key(userId), '1', 'EX', this.lifetimeSeconds);
    await pipeline.exec();
  }

  async restore(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    await this.redis.client.del(...userIds.map(key));
  }

  async isRevoked(userId: string): Promise<boolean> {
    try {
      return (await this.redis.client.exists(key(userId))) === 1;
    } catch (error) {
      this.logger.warn(
        `Could not check revocation, allowing the request: ${(error as Error).message}`,
      );
      return false;
    }
  }
}
