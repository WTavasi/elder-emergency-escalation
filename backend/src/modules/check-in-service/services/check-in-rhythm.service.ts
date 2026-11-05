import { Injectable, Logger } from '@nestjs/common';
import { CheckInStatus, Role } from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import { accountMessages } from '../../notification-service/services/notification-content';
import { driftOf, type Drift, type Stretch } from './check-in-rhythm';
import { wallClock } from './check-in-times';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The weekly look is taken on Monday, from this hour, in the elder's own time zone. */
const WEEKLY_DAY = 'Mon';
const WEEKLY_HOUR = 9;

/**
 * The weekly note: once a week, each elder's last seven days of check-ins compared with
 * the four weeks before. When answers came much later, or more were missed, their
 * caregivers are texted, so somebody can call before it becomes an emergency. A quiet
 * week sends nothing.
 */
@Injectable()
export class CheckInRhythmService {
  private readonly logger = new Logger(CheckInRhythmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: DirectSmsService,
  ) {}

  /** Looks at every elder due a weekly look. Returns how many notes were sent. */
  async weekly(now = new Date()): Promise<number> {
    const schedules = await this.prisma.checkInSchedule.findMany({
      where: {
        enabled: true,
        confirmedAt: { not: null },
        OR: [
          { rhythmCheckedAt: null },
          { rhythmCheckedAt: { lt: new Date(now.getTime() - 6 * DAY_MS) } },
        ],
      },
      select: {
        elderId: true,
        elder: { select: { name: true, timezone: true, deactivatedAt: true } },
      },
    });

    let sent = 0;
    for (const schedule of schedules) {
      if (
        schedule.elder.deactivatedAt ||
        !CheckInRhythmService.isTime(now, schedule.elder.timezone)
      ) {
        continue;
      }
      // Marked first, so a failed text is not retried every minute for an hour.
      await this.prisma.checkInSchedule.update({
        where: { elderId: schedule.elderId },
        data: { rhythmCheckedAt: now },
      });
      const drift = await this.driftFor(schedule.elderId, now);
      if (!drift) continue;
      await this.tellCaregivers(schedule.elderId, schedule.elder.name, drift);
      sent += 1;
    }
    return sent;
  }

  /** Monday from nine in the morning, on the elder's clock. */
  static isTime(now: Date, timeZone: string): boolean {
    const weekday = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short' }).format(now);
    return weekday === WEEKLY_DAY && wallClock(now, timeZone).hour >= WEEKLY_HOUR;
  }

  private async driftFor(elderId: string, now: Date): Promise<Drift | null> {
    const weekStart = new Date(now.getTime() - 7 * DAY_MS);
    const beforeStart = new Date(now.getTime() - 35 * DAY_MS);
    const rows = await this.prisma.checkIn.findMany({
      where: {
        elderId,
        dueAt: { gte: beforeStart, lt: now },
        status: { in: [CheckInStatus.ANSWERED, CheckInStatus.MISSED] },
      },
      select: { dueAt: true, answeredAt: true, status: true },
    });
    const stretch = (from: Date, to: Date): Stretch => {
      const inside = rows.filter((row) => row.dueAt >= from && row.dueAt < to);
      return {
        asked: inside.length,
        missed: inside.filter((row) => row.status === CheckInStatus.MISSED).length,
        delays: inside
          .filter((row) => row.answeredAt !== null)
          .map((row) => ((row.answeredAt as Date).getTime() - row.dueAt.getTime()) / 60_000),
      };
    };
    return driftOf(stretch(weekStart, now), stretch(beforeStart, weekStart));
  }

  private async tellCaregivers(elderId: string, elderName: string, drift: Drift): Promise<void> {
    const caregivers = await this.prisma.careAssignment.findMany({
      where: { elderlyId: elderId, responder: { role: Role.CAREGIVER, deactivatedAt: null } },
      select: { responder: { select: { phone: true } } },
    });
    const text = accountMessages.checkInDrift(elderName, drift);
    for (const { responder } of caregivers) await this.sms.send(responder.phone, text);
    this.logger.log(
      `Weekly check-in note for ${elderId}: ${drift.later ? 'later' : ''}${drift.later && drift.moreMissed ? ' and ' : ''}${drift.moreMissed ? 'more missed' : ''}`,
    );
  }
}
