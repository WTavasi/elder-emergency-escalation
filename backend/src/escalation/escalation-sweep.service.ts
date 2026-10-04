import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EscalationListener } from './escalation.listener';

/**
 * The second way an emergency gets promoted.
 *
 * The primary mechanism is a Redis key with a time to live, whose expiry event the
 * listener turns into an escalation. It is fast, it is the reason nothing polls, and it
 * has one property that cannot be engineered away: it depends on Redis publishing
 * keyspace notifications. That requires `notify-keyspace-events Ex`, which Compose sets
 * locally, and which a managed Redis may not permit a client to set at all. A deployment
 * onto a provider that disables it would produce a system that accepts emergencies,
 * dispatches tier one, and then silently never escalates any of them.
 *
 * So the durable deadline recorded on every dispatch is reconciled against the clock on
 * an interval as well as on boot. The two mechanisms have different guarantees and that
 * is the point: the listener promotes within a second when expiry events arrive, and the
 * sweep promotes within one interval whatever the provider does.
 *
 * It deliberately runs the same code as boot recovery rather than its own copy. A second
 * implementation of "which deadlines have passed" would be a second thing to keep
 * correct, and the two would drift.
 */
@Injectable()
export class EscalationSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EscalationSweepService.name);
  private timer: NodeJS.Timeout | null = null;

  /** Guards against a slow sweep overlapping the next one and doubling the work. */
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly listener: EscalationListener,
  ) {}

  onModuleInit(): void {
    if (!this.config.get<boolean>('ESCALATION_SWEEP_ENABLED', true)) {
      this.logger.warn(
        'Escalation sweep disabled. Promotion depends entirely on Redis expiry events.',
      );
      return;
    }

    const interval = this.config.get<number>('ESCALATION_SWEEP_INTERVAL_MS', 15_000);

    // The first sweep is left to the interval rather than run now. Boot recovery has
    // just done exactly this work, a few milliseconds earlier, from the listener.
    this.timer = setInterval(() => {
      void this.sweep();
    }, interval);

    // unref() so a pending timer never holds the process open. During a shutdown the
    // right behaviour is to stop, not to finish one more reconciliation.
    this.timer.unref();

    this.logger.log(`Escalation sweep every ${Math.round(interval / 1000)}s`);
  }

  /**
   * Never throws, and never lets one bad pass stop the next.
   *
   * An unhandled rejection on an interval callback would take the process down, which
   * would cost every future escalation to save one.
   */
  async sweep(): Promise<void> {
    if (this.running) {
      this.logger.warn('Previous escalation sweep still running; skipping this one');
      return;
    }

    this.running = true;
    try {
      const { fired } = await this.listener.recoverPendingTimers();

      // Quiet when there is nothing to do, which is almost always. A sweep that logged
      // every pass would bury the one line that matters, and that line matters a lot: it
      // means the listener did not receive an expiry it should have.
      if (fired > 0) {
        this.logger.warn(
          `Escalation sweep promoted ${fired} overdue emergency(ies). ` +
            'Expected to be zero: check that Redis keyspace expiry events are arriving.',
        );
      }
    } catch (error) {
      this.logger.error(
        'Escalation sweep failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
