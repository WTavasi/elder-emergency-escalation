import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditAction,
  EventOutcome,
  EventState,
  Prisma,
  Role,
  type EmergencyEvent,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EscalationService } from '../escalation/escalation.service';
import { EscalationTimerService } from '../escalation/escalation-timer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../realtime/realtime.publisher';
import { SeverityService } from '../severity/severity.service';
import type { SeverityAssessment } from '../severity/severity.types';
import type { CoverWindow } from '../common/time';
import type { CreateAlertDto } from './dto/create-alert.dto';

/** The columns of a care assignment that the severity policy reads. */
interface CoverSource {
  coverDaysOfWeek: number[];
  coverStartMinute: number | null;
  coverEndMinute: number | null;
}

/** States in which an emergency is still live. */
const OPEN_STATES: EventState[] = [
  EventState.TRIGGERED,
  EventState.NOTIFIED,
  EventState.ACKNOWLEDGED,
  EventState.ESCALATED,
];

/** Before anyone has taken ownership, so still cancellable by the elder. */
const UNOWNED_STATES: EventState[] = [EventState.TRIGGERED, EventState.NOTIFIED];

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly severity: SeverityService,
    private readonly escalation: EscalationService,
    private readonly timers: EscalationTimerService,
    private readonly notifications: NotificationsService,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    private readonly config: ConfigService,
  ) {}

  /**
   * Creates the emergency and returns.
   *
   * Tier one is dispatched immediately rather than waiting out the cancel window:
   * ten seconds on every real emergency is a worse trade than an occasional
   * cancelled notification. Dispatch itself is queued by the escalation engine, so
   * this path does only what has to be durable before the caller hears back.
   */
  async create(elderId: string, dto: CreateAlertDto): Promise<EmergencyEvent> {
    const at = new Date();

    const elder = await this.prisma.user.findUnique({
      where: { id: elderId },
      include: { assignmentsAsElder: true },
    });

    if (!elder) throw new NotFoundException('Account no longer exists');
    if (elder.role !== Role.ELDER) {
      throw new ForbiddenException('Only the person being cared for can raise an alert');
    }

    const recentEventCount = await this.countRecentEvents(elderId, at);

    const assessment = await this.severity.evaluate({
      careLevel: elder.careLevel,
      alertLocation: { latitude: dto.latitude, longitude: dto.longitude },
      homeLocation:
        elder.homeLatitude !== null && elder.homeLongitude !== null
          ? { latitude: Number(elder.homeLatitude), longitude: Number(elder.homeLongitude) }
          : null,
      timezone: elder.timezone,
      at,
      coverWindows: AlertsService.toCoverWindows(elder.assignmentsAsElder),
      recentEventCount,
      cancelWindowElapsed: false,
    });

    const event = await this.prisma.$transaction(async (tx) => {
      const created = await tx.emergencyEvent.create({
        data: {
          elderlyId: elderId,
          alertLatitude: new Prisma.Decimal(dto.latitude),
          alertLongitude: new Prisma.Decimal(dto.longitude),
          alertAddressLabel: dto.addressLabel ?? elder.homeAddressLabel ?? null,
          state: EventState.TRIGGERED,
          currentTier: 1,
          severity: assessment.band,
          severityScore: assessment.score,
          severityFactors: assessment as unknown as Prisma.InputJsonValue,
          triggeredAt: at,
        },
      });

      await tx.auditLog.createMany({
        data: [
          {
            eventId: created.id,
            actorId: elderId,
            action: AuditAction.EVENT_CREATED,
            newState: EventState.TRIGGERED,
            occurredAt: at,
          },
          {
            // No actor: the system scored this, not a person.
            eventId: created.id,
            actorId: null,
            action: AuditAction.SEVERITY_EVALUATED,
            detail: AlertsService.auditDetail(assessment),
            occurredAt: at,
          },
        ],
      });

      return created;
    });

    this.logger.log(
      `Emergency ${event.id} raised, severity ${assessment.band} at score ${assessment.score}`,
    );

    // Awaited on purpose. What this does is write durable state and arm a timer, not
    // call a provider: if it were left to run after the response, a process that died
    // in the next second would leave an emergency nobody is counting down for. The
    // actual sending, which is network work that can fail and retry, is queued.
    this.realtime.emergencyUpdated(event);
    await this.escalation.dispatchTier(event.id, 1, 'initial');

    return event;
  }

  /**
   * The elder withdrawing their own alert inside the grace window.
   *
   * Writes a CANCELLED transition rather than deleting anything: a withdrawn alert is
   * part of the record, and the caregiver is told it was cancelled so they can call to
   * confirm. If that call goes unanswered, reopen() puts the chain back in motion.
   */
  async cancel(eventId: string, userId: string): Promise<EmergencyEvent> {
    const event = await this.requireEvent(eventId);

    if (event.elderlyId !== userId) {
      throw new ForbiddenException('Only the person who raised this alert can cancel it');
    }
    if (event.state === EventState.CANCELLED) {
      throw new ConflictException('This alert was already cancelled');
    }
    if (!UNOWNED_STATES.includes(event.state)) {
      throw new ConflictException(
        'Someone is already responding to this alert. Speak to them rather than cancelling.',
      );
    }

    const graceWindow = this.config.get<number>('CANCEL_GRACE_WINDOW', 10);
    const elapsedSeconds = (Date.now() - event.triggeredAt.getTime()) / 1000;
    if (elapsedSeconds > graceWindow) {
      throw new ConflictException(
        `The ${graceWindow} second window to cancel has passed. Help is on the way.`,
      );
    }

    const now = new Date();
    await this.timers.cancelAll(eventId);

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.emergencyEvent.update({
        where: { id: eventId },
        data: {
          state: EventState.CANCELLED,
          currentTierDeadlineAt: null,
          outcome: EventOutcome.CANCELLED_BY_ELDER,
          resolvedAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          eventId,
          actorId: userId,
          action: AuditAction.CANCELLED,
          previousState: event.state,
          newState: EventState.CANCELLED,
          detail: { secondsAfterTrigger: Math.round(elapsedSeconds) },
          occurredAt: now,
        },
      });

      return updated;
    });

    // Everyone who was told about the emergency is told it was withdrawn, so nobody is
    // left believing help is still on its way, and so they can call to check.
    this.realtime.emergencyUpdated(cancelled);
    await this.notifications.notifyCancellation(eventId);
    return cancelled;
  }

  /**
   * Puts a cancelled alert back in motion.
   *
   * The case this exists for: a caregiver is told the alert was cancelled, calls to
   * check, and nobody answers. Reopening restarts the chain from that caregiver's own
   * tier, since the tiers above them have already been given their chance.
   *
   * Severity is re-scored with the cancel window treated as elapsed, and the higher of
   * the old and new bands wins. A reopened alert can become more serious, never less.
   */
  async reopen(eventId: string, userId: string, reason?: string): Promise<EmergencyEvent> {
    const event = await this.requireEvent(eventId);

    if (event.state !== EventState.CANCELLED) {
      throw new ConflictException('Only a cancelled alert can be reopened');
    }

    const isElder = event.elderlyId === userId;
    const assignment = isElder
      ? null
      : await this.prisma.careAssignment.findFirst({
          where: { elderlyId: event.elderlyId, responderId: userId },
        });

    if (!isElder && !assignment) {
      throw new ForbiddenException('Only this person’s care chain can reopen their alert');
    }

    const at = new Date();
    const elder = await this.prisma.user.findUnique({
      where: { id: event.elderlyId },
      include: { assignmentsAsElder: true },
    });
    if (!elder) throw new NotFoundException('Emergency not found');

    const assessment = await this.severity.evaluate({
      careLevel: elder.careLevel,
      alertLocation: {
        latitude: Number(event.alertLatitude),
        longitude: Number(event.alertLongitude),
      },
      homeLocation:
        elder.homeLatitude !== null && elder.homeLongitude !== null
          ? { latitude: Number(elder.homeLatitude), longitude: Number(elder.homeLongitude) }
          : null,
      timezone: elder.timezone,
      at,
      coverWindows: AlertsService.toCoverWindows(elder.assignmentsAsElder),
      recentEventCount: await this.countRecentEvents(event.elderlyId, at),
      cancelWindowElapsed: true,
    });

    const band = this.severity.highestOf(event.severity, assessment.band);
    const tier = assignment?.priorityOrder ?? 1;

    const reopened = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.emergencyEvent.update({
        where: { id: eventId },
        data: {
          state: EventState.TRIGGERED,
          currentTier: tier,
          currentTierDeadlineAt: null,
          outcome: null,
          resolvedAt: null,
          acknowledgedBy: null,
          acknowledgedAt: null,
          severity: band,
          severityScore: Math.max(event.severityScore, assessment.score),
          severityFactors: assessment as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.auditLog.create({
        data: {
          eventId,
          actorId: userId,
          action: AuditAction.REOPENED,
          previousState: EventState.CANCELLED,
          newState: EventState.TRIGGERED,
          detail: {
            restartedAtTier: tier,
            reason: reason ?? null,
            severityBefore: event.severity,
            severityAfter: band,
          },
          occurredAt: at,
        },
      });

      return updated;
    });

    this.realtime.emergencyUpdated(reopened);
    await this.escalation.dispatchTier(eventId, tier, 'initial');
    return reopened;
  }

  /** One emergency, if the caller is part of it. */
  async findOne(eventId: string, userId: string, role: Role): Promise<EmergencyEvent> {
    const event = await this.requireEvent(eventId);
    if (role === Role.ADMINISTRATOR || event.elderlyId === userId) return event;

    const assignment = await this.prisma.careAssignment.findFirst({
      where: { elderlyId: event.elderlyId, responderId: userId },
    });
    if (!assignment) throw new NotFoundException('Emergency not found');

    return event;
  }

  /**
   * Emergencies the caller is part of: their own if they are an elder, and those of
   * every elder whose chain they belong to. A 404 rather than a 403 on an event they
   * are not part of, so the API does not confirm that an id exists.
   */
  async findForUser(userId: string, role: Role, onlyOpen = false): Promise<EmergencyEvent[]> {
    const where =
      role === Role.ADMINISTRATOR
        ? {}
        : {
            elderlyId: {
              in: [
                userId,
                ...(
                  await this.prisma.careAssignment.findMany({
                    where: { responderId: userId },
                    select: { elderlyId: true },
                  })
                ).map((assignment) => assignment.elderlyId),
              ],
            },
          };

    return this.prisma.emergencyEvent.findMany({
      where: onlyOpen ? { ...where, state: { in: OPEN_STATES } } : where,
      orderBy: { triggeredAt: 'desc' },
      take: 50,
    });
  }

  private async requireEvent(eventId: string): Promise<EmergencyEvent> {
    const event = await this.prisma.emergencyEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Emergency not found');
    return event;
  }

  private countRecentEvents(elderId: string, at: Date): Promise<number> {
    const hours = this.config.get<number>('RECENT_ACTIVITY_HOURS', 6);
    const since = new Date(at.getTime() - hours * 60 * 60 * 1000);

    return this.prisma.emergencyEvent.count({
      where: {
        elderlyId: elderId,
        OR: [{ triggeredAt: { gte: since } }, { state: { in: OPEN_STATES } }],
      },
    });
  }

  private static toCoverWindows(assignments: CoverSource[]): CoverWindow[] {
    return assignments.map((assignment) => ({
      daysOfWeek: assignment.coverDaysOfWeek,
      startMinute: assignment.coverStartMinute,
      endMinute: assignment.coverEndMinute,
    }));
  }

  private static auditDetail(assessment: SeverityAssessment): Prisma.InputJsonValue {
    return {
      score: assessment.score,
      band: assessment.band,
      factors: assessment.factors.map((factor) => ({
        key: factor.key,
        weight: factor.weight,
        value: factor.value,
        contribution: factor.contribution,
        detail: factor.detail,
      })),
    } as unknown as Prisma.InputJsonValue;
  }
}
