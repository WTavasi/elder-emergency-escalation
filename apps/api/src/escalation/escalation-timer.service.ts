import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { TIMER_PREFIX, timerKey } from './escalation.keys';

/**
 * Escalation timers as expiring Redis keys.
 *
 * Setting a key with a TTL and listening for its expiry means the system does no work
 * at all while an acknowledgement window is open. The alternative, polling the database
 * for overdue events, burns queries proportional to the number of open emergencies and
 * adds the poll interval to every escalation as latency.
 */
@Injectable()
export class EscalationTimerService {
  private readonly logger = new Logger(EscalationTimerService.name);

  constructor(private readonly redis: RedisService) {}

  async arm(eventId: string, tier: number, seconds: number): Promise<Date> {
    const key = timerKey(eventId, tier);
    await this.redis.client.set(key, String(tier), 'EX', seconds);
    this.logger.debug(`Armed ${key} for ${seconds}s`);
    return new Date(Date.now() + seconds * 1000);
  }

  /**
   * Clears every timer for one event.
   *
   * Uses SCAN rather than KEYS: KEYS blocks the server for the whole sweep, and this
   * runs on acknowledgement, which is the moment the system must not stall.
   */
  async cancelAll(eventId: string): Promise<number> {
    const pattern = `${TIMER_PREFIX}:${eventId}:*`;
    let cursor = '0';
    let removed = 0;

    do {
      const [next, keys] = await this.redis.client.scan(cursor, 'MATCH', pattern, 'COUNT', 50);
      cursor = next;
      if (keys.length > 0) removed += await this.redis.client.del(...keys);
    } while (cursor !== '0');

    if (removed > 0) this.logger.debug(`Cleared ${removed} timer(s) for event ${eventId}`);
    return removed;
  }

  /** Seconds left on a tier's timer, or null when no timer is set. */
  async secondsRemaining(eventId: string, tier: number): Promise<number | null> {
    const ttl = await this.redis.client.ttl(timerKey(eventId, tier));
    return ttl >= 0 ? ttl : null;
  }
}
