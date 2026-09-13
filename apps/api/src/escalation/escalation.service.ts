import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  DispatchMode,
  EventOutcome,
  EventState,
  NotificationChannel,
  NotificationStatus,
  Prisma,
  Role,
  type EmergencyEvent,
  type EscalationRule,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isWithinMetres } from '../common/geo';
import { EscalationTimerService } from './escalation-timer.service';

const OPEN_STATES: EventState[] = [
  EventState.TRIGGERED,
  EventState.NOTIFIED,
  EventState.ACKNOWLEDGED,
  EventState.ESCALATED,
];

/** Guards the parallel-dispatch walk against a cycle in misconfigured rules. */
const MAX_TIERS = 10;

export type DispatchReason = 'initial' | 'escalation' | 'manual';

export interface ResponderLocation {
  latitude: number;
  longitude: number;
}

@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timers: EscalationTimerService,
  ) {}

  /**
   * Notifies one tier and arms its acknowledgement window.
   *
   * Dispatching does not send anything yet; it records who should be told, as
   * notification rows in QUEUED. The sending itself, with its retries and its SMS
   * fallback, belongs with the providers.
   */
  async dispatchTier(eventId: string, tier: number, reason: DispatchReason): Promise<void> {
    const event = await this.requireOpenEvent(eventId);
    const rules = await this.rulesFor(event);
    const rule = rules.find((candidate) => candidate.tierOrder === tier);

    if (!rule) {
      this.logger.error(
        `No ${event.severity} rule for tier ${tier}; event ${eventId} cannot be dispatched further`,
      );
      return;
    }

    const recipients = await this.recipientsFor(event, rule);

    if (recipients.length === 0) {
      // An empty tier must not stall the chain: an elder whose family member never
      // registered would otherwise wait out the whole timeout for nobody.
      this.logger.warn(
        `Tier ${tier} of event ${eventId} has no recipients; escalating immediately`,
      );
      await this.escalate(event, tier);
      return;
    }

    const now = new Date();
    const deadline =
      rule.timeoutSeconds === null ? null : new Date(now.getTime() + rule.timeoutSeconds * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.notification.createMany({
        data: recipients.map((recipientId) => ({
          eventId,
          recipientId,
          channel: NotificationChannel.PUSH,
          status: NotificationStatus.QUEUED,
          tier,
          createdAt: now,
        })),
      });

      await tx.emergencyEvent.update({
        where: { id: eventId },
        data: {
          // ESCALATED is sticky: once a tier has timed out, the event stays marked as
          // escalated, which is what the outlined red state means on every screen.
          state: reason === 'initial' ? EventState.NOTIFIED : EventState.ESCALATED,
          currentTier: tier,
          currentTierDeadlineAt: deadline,
        },
      });

      await tx.auditLog.create({
        data: {
          eventId,
          actorId: null,
          action: AuditAction.TIER_DISPATCHED,
          previousState: event.state,
          newState: reason === 'initial' ? EventState.NOTIFIED : EventState.ESCALATED,
          detail: {
            tier,
            reason,
            responderRole: rule.responderRole,
            recipients: recipients.length,
            timeoutSeconds: rule.timeoutSeconds,
          } as unknown as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });
    });

    if (rule.timeoutSeconds !== null) {
      await this.timers.arm(eventId, tier, rule.timeoutSeconds);
    }

    this.logger.log(
      `Event ${eventId} dispatched to tier ${tier} (${rule.responderRole}), ${recipients.length} recipient(s), timeout ${rule.timeoutSeconds ?? 'none'}`,
    );

    // A tier marked PARALLEL goes out with the tier before it rather than after its
    // timeout. This is how the critical band reaches family at the same time as the
    // caregiver instead of two minutes later.
    const next = rules.find((candidate) => candidate.tierOrder === tier + 1);
    if (next?.dispatchMode === DispatchMode.PARALLEL && tier + 1 <= MAX_TIERS) {
      await this.dispatchTier(eventId, next.tierOrder, reason);
    }
  }

  /**
   * A tier's acknowledgement window expired.
   *
   * Called by the keyspace listener and by recovery on boot. Silently ignores timers
   * for events that have moved on, because an expiry that arrives after someone has
   * already acknowledged is normal, not an error.
   */
  async onTierTimeout(eventId: string, tier: number): Promise<void> {
    const event = await this.prisma.emergencyEvent.findUnique({ where: { id: eventId } });

    if (!event || !OPEN_STATES.includes(event.state)) return;
    if (event.state === EventState.ACKNOWLEDGED) return;
    if (event.currentTier !== tier) return;

    await this.escalate(event, tier);
  }

  /** Someone takes ownership. Stops every pending timer for this emergency. */
  async acknowledge(
    eventId: string,
    userId: string,
    location?: ResponderLocation,
  ): Promise<EmergencyEvent> {
    const event = await this.requireOpenEvent(eventId);

    if (event.acknowledgedBy) {
      throw new ConflictException('Someone is already responding to this emergency');
    }
    await this.requireParticipant(event, userId);

    const now = new Date();
    await this.timers.cancelAll(eventId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.emergencyEvent.update({
        where: { id: eventId },
        data: {
          state: EventState.ACKNOWLEDGED,
          acknowledgedBy: userId,
          acknowledgedAt: now,
          currentTierDeadlineAt: null,
          responderLatitude: location ? new Prisma.Decimal(location.latitude) : null,
          responderLongitude: location ? new Prisma.Decimal(location.longitude) : null,
        },
      });

      // One location capture, at the moment of acknowledgement. No background tracking.
      await tx.notification.updateMany({
        where: { eventId, recipientId: userId, acknowledgedAt: null },
        data: { status: NotificationStatus.ACKNOWLEDGED, acknowledgedAt: now },
      });

      await tx.auditLog.create({
        data: {
          eventId,
          actorId: userId,
          action: AuditAction.ACKNOWLEDGED,
          previousState: event.state,
          newState: EventState.ACKNOWLEDGED,
          detail: {
            tier: event.currentTier,
            secondsFromTrigger: Math.round((now.getTime() - event.triggeredAt.getTime()) / 1000),
            locationCaptured: Boolean(location),
          } as unknown as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });

      return updated;
    });
  }

  /** Closes the emergency with a recorded outcome. */
  async resolve(eventId: string, userId: string, outcome: EventOutcome): Promise<EmergencyEvent> {
    const event = await this.requireOpenEvent(eventId);
    await this.requireParticipant(event, userId);

    const now = new Date();
    await this.timers.cancelAll(eventId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.emergencyEvent.update({
        where: { id: eventId },
        data: {
          state: EventState.RESOLVED,
          outcome,
          resolvedAt: now,
          currentTierDeadlineAt: null,
        },
      });

      await tx.auditLog.create({
        data: {
          eventId,
          actorId: userId,
          action: AuditAction.RESOLVED,
          previousState: event.state,
          newState: EventState.RESOLVED,
          detail: {
            outcome,
            secondsFromTrigger: Math.round((now.getTime() - event.triggeredAt.getTime()) / 1000),
          } as unknown as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });

      return updated;
    });
  }

  /**
   * A caregiver or family member calling in the emergency responder directly.
   *
   * This supersedes the automatic chain: pending timers are cleared and the responder
   * tier is dispatched now, rather than after the tiers between here and there have
   * each waited out their window.
   */
  async requestResponder(eventId: string, userId: string): Promise<void> {
    const event = await this.requireOpenEvent(eventId);
    await this.requireParticipant(event, userId);

    const rules = await this.rulesFor(event);
    const responderRule = rules.find((rule) => rule.responderRole === Role.EMERGENCY_RESPONDER);

    if (!responderRule) {
      throw new ConflictException('No emergency responder tier is configured');
    }

    await this.timers.cancelAll(eventId);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.emergencyEvent.update({
        where: { id: eventId },
        data: { responderRequestedAt: now, currentTierDeadlineAt: null },
      });

      await tx.auditLog.create({
        data: {
          eventId,
          actorId: userId,
          action: AuditAction.RESPONDER_REQUESTED,
          detail: {
            fromTier: event.currentTier,
            toTier: responderRule.tierOrder,
          } as unknown as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });
    });

    await this.dispatchTier(eventId, responderRule.tierOrder, 'manual');
  }

  /** Moves an event up one rung and dispatches the tier it lands on. */
  private async escalate(event: EmergencyEvent, fromTier: number): Promise<void> {
    const rules = await this.rulesFor(event);
    const next = rules.find((rule) => rule.tierOrder > fromTier);

    if (!next) {
      // The last tier has no timeout, so reaching here means the chain is exhausted.
      this.logger.error(
        `Event ${event.id} has no tier above ${fromTier}; it stays open and unacknowledged`,
      );
      await this.prisma.auditLog.create({
        data: {
          eventId: event.id,
          actorId: null,
          action: AuditAction.ESCALATED,
          detail: { fromTier, exhausted: true } as unknown as Prisma.InputJsonValue,
        },
      });
      return;
    }

    await this.prisma.auditLog.create({
      data: {
        eventId: event.id,
        actorId: null,
        action: AuditAction.ESCALATED,
        previousState: event.state,
        newState: EventState.ESCALATED,
        detail: { fromTier, toTier: next.tierOrder } as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.warn(`Event ${event.id} escalating from tier ${fromTier} to ${next.tierOrder}`);
    await this.dispatchTier(event.id, next.tierOrder, 'escalation');
  }

  private rulesFor(event: EmergencyEvent): Promise<EscalationRule[]> {
    return this.prisma.escalationRule.findMany({
      where: { severity: event.severity },
      orderBy: { tierOrder: 'asc' },
    });
  }

  /**
   * Who to tell for one tier.
   *
   * Caregiver and family tiers come from the elder's own ranked chain. The emergency
   * responder tier does not: responders are matched to the alert location against
   * their declared coverage areas, which is what makes a responder registry useful
   * rather than a fixed assignment per elder. If no coverage area contains the alert,
   * the chain's own assigned responder is the fallback, because reaching the wrong
   * responder beats reaching nobody.
   */
  private async recipientsFor(event: EmergencyEvent, rule: EscalationRule): Promise<string[]> {
    if (rule.responderRole === Role.EMERGENCY_RESPONDER) {
      const matched = await this.respondersCovering(event);
      if (matched.length > 0) return matched;

      this.logger.warn(
        `No responder covers the location of event ${event.id}; falling back to the assigned chain`,
      );
    }

    const assignments = await this.prisma.careAssignment.findMany({
      where: { elderlyId: event.elderlyId, priorityOrder: rule.tierOrder },
      select: { responderId: true },
    });

    return assignments.map((assignment) => assignment.responderId);
  }

  private async respondersCovering(event: EmergencyEvent): Promise<string[]> {
    const responders = await this.prisma.user.findMany({
      where: {
        role: Role.EMERGENCY_RESPONDER,
        coverageLatitude: { not: null },
        coverageLongitude: { not: null },
        coverageRadiusKm: { not: null },
      },
      select: {
        id: true,
        coverageLatitude: true,
        coverageLongitude: true,
        coverageRadiusKm: true,
      },
    });

    const alert = {
      latitude: Number(event.alertLatitude),
      longitude: Number(event.alertLongitude),
    };

    return responders
      .filter((responder) =>
        isWithinMetres(
          {
            latitude: Number(responder.coverageLatitude),
            longitude: Number(responder.coverageLongitude),
          },
          alert,
          Number(responder.coverageRadiusKm) * 1000,
        ),
      )
      .map((responder) => responder.id);
  }

  private async requireOpenEvent(eventId: string): Promise<EmergencyEvent> {
    const event = await this.prisma.emergencyEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Emergency not found');

    if (!OPEN_STATES.includes(event.state)) {
      throw new ConflictException(
        event.state === EventState.CANCELLED
          ? 'This alert was cancelled'
          : 'This emergency is already closed',
      );
    }
    return event;
  }

  /** A participant is the elder, a member of their chain, or a covering responder. */
  private async requireParticipant(event: EmergencyEvent, userId: string): Promise<void> {
    if (event.elderlyId === userId) return;

    const assignment = await this.prisma.careAssignment.findFirst({
      where: { elderlyId: event.elderlyId, responderId: userId },
    });
    if (assignment) return;

    const notified = await this.prisma.notification.findFirst({
      where: { eventId: event.id, recipientId: userId },
    });
    if (notified) return;

    throw new ForbiddenException('You are not part of this emergency');
  }
}
