import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertTrigger, CheckInStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { OPEN_STATES } from '../../../shared/utils/event-lifecycle';
import { AlertsService } from '../../emergency-service/services/alerts.service';
import { CheckInMessenger } from './check-in-messenger.service';
import { dueTimesOn } from './check-in-times';

/** A check-in is still asked if the clock reaches it this late, after a restart say. */
export const CATCH_UP_MS = 10 * 60 * 1000;

export interface TickResult {
  asked: number;
  reminded: number;
  missed: number;
}

/**
 * Asks, reminds and, when nobody answered, raises the alert.
 *
 * A check-in is a time of day, so this runs on a one-minute clock rather than a Redis
 * key per check-in: a minute late is nothing for "are you all right?", and the clock has
 * nothing to lose in a restart because everything it acts on is in the database. Each
 * step is a conditional write (one check-in per elder per time, PENDING to MISSED only
 * once), so a second API instance, or a tick that overlaps the last, does nothing twice.
 *
 * What a missed check-in raises is an ordinary alert at the standard band, through the
 * same escalation as any other, so the chain, the timers, the texts and the console all
 * behave exactly as they do for a press of the button.
 */
@Injectable()
export class CheckInClockService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CheckInClockService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
    private readonly messenger: CheckInMessenger,
  ) {}

  onModuleInit(): void {
    if (!this.config.get<boolean>('CHECK_INS_ENABLED', true)) {
      this.logger.warn('Daily check-ins are switched off on this server');
      return;
    }
    const interval = this.config.get<number>('CHECK_IN_TICK_MS', 60_000);
    this.timer = setInterval(() => void this.tick(), interval);
    // A pending tick never holds the process open during a shutdown.
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Never throws: an unhandled rejection on an interval would stop every later check-in. */
  async tick(now = new Date()): Promise<TickResult> {
    if (this.running) return { asked: 0, reminded: 0, missed: 0 };
    this.running = true;
    try {
      const asked = await this.askDue(now);
      const reminded = await this.remindLate(now);
      const missed = await this.raiseMissed(now);
      if (asked + reminded + missed > 0) {
        this.logger.log(`Check-ins: ${asked} asked, ${reminded} reminded, ${missed} missed`);
      }
      return { asked, reminded, missed };
    } catch (error) {
      this.logger.error(
        'Check-in clock failed this minute',
        error instanceof Error ? error.stack : undefined,
      );
      return { asked: 0, reminded: 0, missed: 0 };
    } finally {
      this.running = false;
    }
  }

  /** Creates and sends each check-in that has just fallen due. */
  private async askDue(now: Date): Promise<number> {
    const schedules = await this.prisma.checkInSchedule.findMany({
      where: { enabled: true, confirmedAt: { not: null } },
      include: {
        elder: {
          select: {
            id: true,
            name: true,
            phone: true,
            pushToken: true,
            timezone: true,
            deactivatedAt: true,
          },
        },
      },
    });

    let asked = 0;
    for (const schedule of schedules) {
      const elder = schedule.elder;
      if (elder.deactivatedAt) continue;
      const agreedAt = schedule.confirmedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;

      const due = dueTimesOn(now, schedule.times, elder.timezone).filter((at) => {
        const late = now.getTime() - at.getTime();
        // Due, not too long ago, and not from before the elder agreed to it.
        return late >= 0 && late < CATCH_UP_MS && at.getTime() >= agreedAt;
      });
      if (due.length === 0) continue;

      // Nobody is asked "are you all right?" in the middle of an emergency of their own.
      const busy = await this.prisma.emergencyEvent.findFirst({
        where: { elderlyId: elder.id, state: { in: OPEN_STATES } },
        select: { id: true },
      });
      if (busy) continue;

      for (const dueAt of due) {
        const grace = schedule.graceMinutes * 60_000;
        let checkInId: string;
        try {
          const created = await this.prisma.checkIn.create({
            data: {
              elderId: elder.id,
              dueAt,
              remindAt: new Date(dueAt.getTime() + grace / 2),
              deadlineAt: new Date(dueAt.getTime() + grace),
            },
            select: { id: true },
          });
          checkInId = created.id;
        } catch (error) {
          // Already created by an earlier tick or another instance.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            continue;
          }
          throw error;
        }
        await this.messenger.ask(elder, checkInId, false, now);
        asked += 1;
      }
    }
    return asked;
  }

  /** Asks once more, half way through the time to answer. */
  private async remindLate(now: Date): Promise<number> {
    const late = await this.prisma.checkIn.findMany({
      where: {
        status: CheckInStatus.PENDING,
        remindedAt: null,
        remindAt: { lte: now },
        deadlineAt: { gt: now },
      },
      include: { elder: { select: { name: true, phone: true, pushToken: true, timezone: true } } },
    });

    let reminded = 0;
    for (const checkIn of late) {
      const claimed = await this.prisma.checkIn.updateMany({
        where: { id: checkIn.id, status: CheckInStatus.PENDING, remindedAt: null },
        data: { remindedAt: now },
      });
      if (claimed.count !== 1) continue;
      await this.messenger.ask(checkIn.elder, checkIn.id, true, now);
      reminded += 1;
    }
    return reminded;
  }

  /** Marks unanswered check-ins missed and raises the alert for each. */
  private async raiseMissed(now: Date): Promise<number> {
    const overdue = await this.prisma.checkIn.findMany({
      where: { status: CheckInStatus.PENDING, deadlineAt: { lte: now } },
      select: { id: true, elderId: true },
    });

    let missed = 0;
    for (const checkIn of overdue) {
      // Once only, and never over an answer that arrived in the same instant.
      const claimed = await this.prisma.checkIn.updateMany({
        where: { id: checkIn.id, status: CheckInStatus.PENDING },
        data: { status: CheckInStatus.MISSED, missedAt: now },
      });
      if (claimed.count !== 1) continue;

      // An emergency already open covers it; a second alert for the same person would
      // only split the circle's attention.
      const open = await this.prisma.emergencyEvent.findFirst({
        where: { elderlyId: checkIn.elderId, state: { in: OPEN_STATES } },
        select: { id: true },
      });
      const eventId =
        open?.id ??
        (await this.alerts.create(checkIn.elderId, {}, { trigger: AlertTrigger.MISSED_CHECK_IN }))
          .id;
      await this.prisma.checkIn.update({ where: { id: checkIn.id }, data: { eventId } });
      missed += 1;
    }
    return missed;
  }
}
