import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EscalationService } from './escalation.service';
import { EscalationTimerService } from './escalation-timer.service';
import { parseTimerKey } from './escalation.keys';

/** States that can still have a live acknowledgement window. */
const AWAITING_STATES: EventState[] = [
  EventState.TRIGGERED,
  EventState.NOTIFIED,
  EventState.ESCALATED,
];

/**
 * Turns Redis key expiry into escalation.
 *
 * Redis expiry notifications are fire and forget: they are published once, to whoever
 * is listening at that instant, and never again. If this process is restarting when a
 * key expires, that escalation is simply lost. That is why every dispatch also records
 * a deadline in the database, and why recovery runs on boot.
 */
@Injectable()
export class EscalationListener implements OnModuleInit {
  private readonly logger = new Logger(EscalationListener.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly escalation: EscalationService,
    private readonly timers: EscalationTimerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.subscribe();
    await this.recoverPendingTimers();
  }

  private async subscribe(): Promise<void> {
    // Pattern rather than a fixed channel, because the database index appears in the
    // channel name and a configured REDIS_URL may point at any database.
    await this.redis.subscriber.psubscribe('__keyevent@*__:expired');

    this.redis.subscriber.on('pmessage', (_pattern: string, _channel: string, key: string) => {
      void this.handleExpiry(key);
    });

    this.logger.log('Listening for escalation timer expiry');
  }

  /**
   * Never throws. An unhandled rejection here would take down the subscriber and with
   * it every future escalation, which is a far worse outcome than one failed promotion.
   */
  async handleExpiry(key: string): Promise<void> {
    const parsed = parseTimerKey(key);
    if (!parsed) return;

    try {
      await this.escalation.onTierTimeout(parsed.eventId, parsed.tier);
    } catch (error) {
      this.logger.error(
        `Failed to escalate event ${parsed.eventId} from tier ${parsed.tier}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Rebuilds the timer state after a restart.
   *
   * Every open event with a recorded deadline is either overdue, in which case it is
   * escalated now, or still waiting, in which case its Redis key is set again with the
   * time that remains. Without this, a deployment during a quiet acknowledgement window
   * would leave an emergency waiting for a timer that no longer exists.
   */
  async recoverPendingTimers(): Promise<{ fired: number; rearmed: number }> {
    const pending = await this.prisma.emergencyEvent.findMany({
      where: {
        state: { in: AWAITING_STATES },
        currentTierDeadlineAt: { not: null },
      },
      select: { id: true, currentTier: true, currentTierDeadlineAt: true },
    });

    let fired = 0;
    let rearmed = 0;
    const now = Date.now();

    for (const event of pending) {
      const deadline = event.currentTierDeadlineAt?.getTime() ?? 0;
      const remainingSeconds = Math.ceil((deadline - now) / 1000);

      try {
        if (remainingSeconds <= 0) {
          await this.escalation.onTierTimeout(event.id, event.currentTier);
          fired += 1;
        } else {
          await this.timers.arm(event.id, event.currentTier, remainingSeconds);
          rearmed += 1;
        }
      } catch (error) {
        this.logger.error(
          `Recovery failed for event ${event.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    if (pending.length > 0) {
      this.logger.log(
        `Timer recovery: ${fired} overdue escalation(s) fired, ${rearmed} timer(s) restored`,
      );
    }

    return { fired, rearmed };
  }
}
