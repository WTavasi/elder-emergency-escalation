import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CheckInStatus, Role, type CheckIn, type CheckInSchedule } from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { OPEN_STATES } from '../../../shared/utils/event-lifecycle';
import { AlertsService } from '../../emergency-service/services/alerts.service';
import type { SetCheckInsDto } from '../validation/set-check-ins.dto';
import { formatTime, parseTime } from './check-in-times';

/** How an elder answered a check-in. */
export type CheckInChannel = 'app' | 'sms';

export interface CheckInScheduleView {
  enabled: boolean;
  /** "09:00", in the elder's own time zone. */
  times: string[];
  graceMinutes: number;
  /** Set up by somebody else and not yet agreed by the elder, so nothing is being sent. */
  waitingForElder: boolean;
  setBy: { id: string; name: string } | null;
}

export interface CheckInView {
  id: string;
  dueAt: string;
  deadlineAt: string;
  status: CheckInStatus;
  answeredAt: string | null;
  answeredVia: string | null;
  /** The alert raised when it was missed. */
  eventId: string | null;
}

export interface CheckInsOverview {
  schedule: CheckInScheduleView | null;
  recent: CheckInView[];
  /** Whether the person asking may set it up or change it. */
  canEdit: boolean;
}

/** What the elder's own phone needs: a check-in to answer, and a set-up to agree to. */
export interface ElderCheckIns {
  checkIn: CheckInView | null;
  waitingForAgreement: CheckInScheduleView | null;
}

export type AnswerOutcome = 'answered' | 'withdrawn' | 'noted' | 'nothing';

const DEFAULT_GRACE_MINUTES = 30;

/**
 * Daily check-ins: "are you all right?" at times the elder chose, or agreed to.
 *
 * Opt-in twice over. Nothing exists until somebody sets it up, and when somebody other
 * than the elder sets it up, nothing is sent until the elder agrees on their own phone.
 * Turning it off never needs anybody's agreement. The schedule belongs to the elder: they
 * can change it or turn it off at any time, and anybody in their chain can see it.
 *
 * An answer is one press, or a reply of 1 to the text. A late answer to a check-in that
 * already raised an alert withdraws that alert if nobody has taken it on yet.
 */
@Injectable()
export class CheckInsService {
  private readonly logger = new Logger(CheckInsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
  ) {}

  async overview(elderId: string, actorId: string, role: Role): Promise<CheckInsOverview> {
    const canEdit = await this.access(elderId, actorId, role);
    const [schedule, recent] = await Promise.all([
      this.prisma.checkInSchedule.findUnique({
        where: { elderId },
        include: { setBy: { select: { id: true, name: true } } },
      }),
      this.prisma.checkIn.findMany({
        where: { elderId },
        orderBy: { dueAt: 'desc' },
        take: 7,
      }),
    ]);
    return {
      schedule: schedule ? CheckInsService.scheduleView(schedule, schedule.setBy) : null,
      recent: recent.map(CheckInsService.view),
      canEdit,
    };
  }

  /**
   * Sets it up, changes it, or turns it off. The elder's own change takes effect at once.
   * Anybody else's needs the elder's agreement, except turning it off, which never does.
   */
  async setSchedule(
    elderId: string,
    actorId: string,
    role: Role,
    dto: SetCheckInsDto,
  ): Promise<CheckInsOverview> {
    const canEdit = await this.access(elderId, actorId, role);
    if (!canEdit) throw new ForbiddenException('Only the elder or their chain can set this up');

    const times = [...new Set(dto.times.map(parseTime))]
      .filter((minutes): minutes is number => minutes !== null)
      .sort((a, b) => a - b);
    if (dto.enabled && times.length === 0) {
      throw new BadRequestException('Choose at least one time of day');
    }

    const byElder = actorId === elderId;
    const previous = await this.prisma.checkInSchedule.findUnique({ where: { elderId } });
    // Agreement stands only for what was agreed. Somebody else turning it on or moving
    // the times asks again; turning it off keeps whatever agreement there was, so turning
    // it back on later can still ask.
    const sameAsAgreed =
      previous?.confirmedAt != null &&
      previous.enabled === dto.enabled &&
      previous.times.join(',') === times.join(',');
    const confirmedAt = byElder
      ? new Date()
      : !dto.enabled || sameAsAgreed
        ? (previous?.confirmedAt ?? null)
        : null;

    const data = {
      enabled: dto.enabled,
      times,
      graceMinutes: dto.graceMinutes ?? previous?.graceMinutes ?? DEFAULT_GRACE_MINUTES,
      setById: actorId,
      confirmedAt,
    };
    await this.prisma.checkInSchedule.upsert({
      where: { elderId },
      create: { elderId, ...data },
      update: data,
    });

    // Turning it off removes any check-in still waiting, so nobody is alerted for one and
    // nothing records it as answered when nobody answered it.
    if (!dto.enabled) {
      await this.prisma.checkIn.deleteMany({ where: { elderId, status: CheckInStatus.PENDING } });
    }

    this.logger.log(
      `Check-ins for ${elderId} ${dto.enabled ? `set to ${times.map(formatTime).join(', ')}` : 'off'}` +
        (byElder ? ' by the elder' : ', waiting for the elder to agree'),
    );
    return this.overview(elderId, actorId, role);
  }

  /** The elder's answer to a set-up somebody else made for them. */
  async confirm(elderId: string, actorId: string, agree: boolean): Promise<ElderCheckIns> {
    if (actorId !== elderId) throw new ForbiddenException('Only the elder can agree to this');
    const schedule = await this.prisma.checkInSchedule.findUnique({ where: { elderId } });
    if (!schedule) throw new NotFoundException('Nobody has set up a check-in');

    await this.prisma.checkInSchedule.update({
      where: { elderId },
      data: agree ? { confirmedAt: new Date() } : { enabled: false, confirmedAt: null },
    });
    return this.forElder(elderId);
  }

  /** What the elder's phone shows: a check-in to answer, or a set-up to agree to. */
  async forElder(elderId: string): Promise<ElderCheckIns> {
    const [checkIn, schedule] = await Promise.all([
      this.answerable(elderId),
      this.prisma.checkInSchedule.findUnique({
        where: { elderId },
        include: { setBy: { select: { id: true, name: true } } },
      }),
    ]);
    const waiting = schedule && schedule.enabled && schedule.confirmedAt === null;
    return {
      checkIn: checkIn ? CheckInsService.view(checkIn) : null,
      waitingForAgreement: waiting ? CheckInsService.scheduleView(schedule, schedule.setBy) : null,
    };
  }

  /**
   * "I am all right." Answers the check-in waiting, or, if it was already missed and its
   * alert is still open, answers that late: withdrawn if nobody has taken it on, noted on
   * the alert if somebody has.
   */
  async answer(elderId: string, via: CheckInChannel = 'app'): Promise<AnswerOutcome> {
    const checkIn = await this.answerable(elderId);
    if (!checkIn) return 'nothing';
    const now = new Date();

    if (checkIn.status === CheckInStatus.PENDING) {
      // Conditional, so an answer racing the clock's "missed" cannot both land.
      const answered = await this.prisma.checkIn.updateMany({
        where: { id: checkIn.id, status: CheckInStatus.PENDING },
        data: { status: CheckInStatus.ANSWERED, answeredAt: now, answeredVia: via },
      });
      if (answered.count === 1) return 'answered';
      // Missed in the same instant: fall through to answering the alert.
      const latest = await this.prisma.checkIn.findUnique({ where: { id: checkIn.id } });
      if (!latest?.eventId) return 'nothing';
      checkIn.eventId = latest.eventId;
    }

    if (!checkIn.eventId) return 'nothing';
    const outcome = await this.alerts.answerMissedCheckIn(checkIn.eventId, elderId);
    await this.prisma.checkIn.update({
      where: { id: checkIn.id },
      data: { answeredAt: now, answeredVia: via },
    });
    return outcome;
  }

  /** The check-in the elder can answer now: one waiting, or one missed whose alert is open. */
  private async answerable(elderId: string): Promise<CheckIn | null> {
    const pending = await this.prisma.checkIn.findFirst({
      where: { elderId, status: CheckInStatus.PENDING },
      orderBy: { dueAt: 'desc' },
    });
    if (pending) return pending;
    return this.prisma.checkIn.findFirst({
      where: {
        elderId,
        status: CheckInStatus.MISSED,
        answeredAt: null,
        event: { state: { in: OPEN_STATES } },
      },
      orderBy: { dueAt: 'desc' },
    });
  }

  /**
   * The elder, anybody in their chain, or an administrator may look. The elder and their
   * chain (caregivers and family) may change it; an administrator may not.
   */
  private async access(elderId: string, actorId: string, role: Role): Promise<boolean> {
    const elder = await this.prisma.user.findUnique({
      where: { id: elderId },
      select: { role: true },
    });
    if (!elder || elder.role !== Role.ELDER) throw new NotFoundException('No such elder');
    if (actorId === elderId) return true;
    if (role === Role.ADMINISTRATOR) return false;

    const assignment = await this.prisma.careAssignment.findFirst({
      where: { elderlyId: elderId, responderId: actorId },
      select: { id: true },
    });
    if (!assignment) throw new ForbiddenException('You do not look after this person');
    return role === Role.CAREGIVER || role === Role.FAMILY_MEMBER;
  }

  static scheduleView(
    schedule: CheckInSchedule,
    setBy: { id: string; name: string } | null,
  ): CheckInScheduleView {
    return {
      enabled: schedule.enabled,
      times: schedule.times.map(formatTime),
      graceMinutes: schedule.graceMinutes,
      waitingForElder: schedule.enabled && schedule.confirmedAt === null,
      setBy,
    };
  }

  static view(checkIn: CheckIn): CheckInView {
    return {
      id: checkIn.id,
      dueAt: checkIn.dueAt.toISOString(),
      deadlineAt: checkIn.deadlineAt.toISOString(),
      status: checkIn.status,
      answeredAt: checkIn.answeredAt?.toISOString() ?? null,
      answeredVia: checkIn.answeredVia,
      eventId: checkIn.eventId,
    };
  }
}
