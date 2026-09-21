import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** States an emergency can finish in. Only a finished one is ever a candidate. */
const CLOSED_STATES: EventState[] = [EventState.RESOLVED, EventState.CANCELLED];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionOutcome {
  ranAt: string;
  eventsDeleted: number;
  auditLogsDeleted: number;
  eventCutoff: string;
  auditCutoff: string;
}

/**
 * Deletes personal data once its retention window has passed.
 *
 * The windows are published to the people whose data this is, in the privacy notice and
 * on the console's data handling page. A published window that nothing enforces is a
 * claim the system cannot keep, so this exists to make the claim true rather than to
 * tidy the database.
 *
 * Two passes, in this order and for a reason. Closed emergencies past their window are
 * deleted first, and the schema cascades that to their audit logs and notifications, so
 * one delete removes everything about that emergency. A second pass then removes audit
 * logs that outlived their own, shorter window while their emergency is still retained,
 * which is the case the cascade cannot reach.
 *
 * An open emergency is never deleted, whatever its age. An emergency nobody ever closed
 * is a failure worth keeping the evidence of.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.get<boolean>('RETENTION_ENABLED', true)) {
      this.logger.warn('Retention sweeps are disabled by configuration');
      return;
    }

    // A plain interval rather than a cron library. This runs once a day and needs no
    // schedule expression, and the project avoids a dependency it would use once.
    //
    // unref() so a pending timer never holds the process open: during a shutdown the
    // sweep is not worth delaying an exit for, and it will run on the next boot.
    const everyMs = this.config.get<number>('RETENTION_INTERVAL_HOURS', 24) * 60 * 60 * 1000;

    this.timer = setInterval(() => {
      void this.sweep().catch((error: unknown) => {
        this.logger.error(
          `Retention sweep failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      });
    }, everyMs);
    this.timer.unref();

    this.logger.log(`Retention sweeps every ${everyMs / 3_600_000}h`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * One sweep. Safe to run at any time and safe to run twice: it deletes by age, so a
   * second run immediately after the first finds nothing left to do.
   */
  async sweep(now = new Date()): Promise<RetentionOutcome> {
    const eventDays = this.config.get<number>('RETENTION_RESOLVED_EVENT_DAYS', 365);
    const auditDays = this.config.get<number>('RETENTION_AUDIT_LOG_DAYS', 365);

    const eventCutoff = new Date(now.getTime() - eventDays * DAY_MS);
    const auditCutoff = new Date(now.getTime() - auditDays * DAY_MS);

    const events = await this.prisma.emergencyEvent.deleteMany({
      where: {
        state: { in: CLOSED_STATES },
        // Measured from when the emergency finished, not when it was raised. An
        // emergency that ran for two days is kept for its full window after closing.
        resolvedAt: { not: null, lt: eventCutoff },
      },
    });

    const auditLogs = await this.prisma.auditLog.deleteMany({
      where: { occurredAt: { lt: auditCutoff } },
    });

    const outcome: RetentionOutcome = {
      ranAt: now.toISOString(),
      eventsDeleted: events.count,
      auditLogsDeleted: auditLogs.count,
      eventCutoff: eventCutoff.toISOString(),
      auditCutoff: auditCutoff.toISOString(),
    };

    // Logged at info even when nothing was deleted, because "the sweep ran and found
    // nothing" and "the sweep never ran" have to be distinguishable in the record.
    this.logger.log(
      `Retention sweep: ${events.count} closed emergencies and ${auditLogs.count} audit ` +
        `log entries deleted (events before ${eventCutoff.toISOString().slice(0, 10)}, ` +
        `logs before ${auditCutoff.toISOString().slice(0, 10)})`,
    );

    return outcome;
  }
}
