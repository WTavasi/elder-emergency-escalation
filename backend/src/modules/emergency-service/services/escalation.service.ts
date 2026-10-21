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
import { PrismaService } from '../../../db/prisma.service';
import { isWithinMetres } from '../../../shared/utils/geo';
import {
  AWAITING_STATES,
  OPEN_STATES,
  StaleTransitionError,
  assertTransition,
  sourcesOf,
  transitionEvent,
} from '../../../shared/utils/event-lifecycle';
import { EscalationTimerService } from './escalation-timer.service';
import { SeverityService } from './severity.service';
import {
  recentEventsWhere,
  severityAuditDetail,
  severityContextFor,
} from '../models/severity-context';
import { NotificationsService } from '../../notification-service/services/notifications.service';
import {
  REALTIME_PUBLISHER,
  type RealtimePublisher,
} from '../../realtime-service/services/realtime.publisher';

/** Guards the parallel-dispatch walk against a cycle in misconfigured rules. */
const MAX_TIERS = 10;

/**
 * Why a tier is going out. `severity` is a tier sent early because the emergency was
 * promoted to a band that sends it alongside the one before.
 */
export type DispatchReason = 'initial' | 'escalation' | 'manual' | 'severity';

export interface ResponderLocation {
  latitude: number;
  longitude: number;
}

/** How a person answered an alert: in the app, or by replying to its SMS. */
export type AnswerChannel = 'app' | 'sms';

@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timers: EscalationTimerService,
    private readonly notifications: NotificationsService,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    private readonly severity: SeverityService,
    private readonly config: ConfigService,
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

    // Created one at a time rather than in bulk because the queue needs their ids, and
    // recorded inside the transaction so a committed dispatch is always in the audit
    // trail even if the queue is unreachable.
    const channels = rule.smsFallbackImmediate
      ? [NotificationChannel.PUSH, NotificationChannel.SMS]
      : [NotificationChannel.PUSH];

    // ESCALATED is sticky: once a tier has timed out, the event stays marked as
    // escalated, which is what the outlined red state means on every screen. So a tier
    // sent alongside an escalated one in parallel does not set it back to NOTIFIED.
    const escalating = reason === 'escalation' || reason === 'manual';
    const target =
      escalating || event.state === EventState.ESCALATED
        ? EventState.ESCALATED
        : EventState.NOTIFIED;

    let dispatched: { updated: EmergencyEvent; notificationIds: string[] };
    try {
      dispatched = await this.dispatchInTransaction(event, tier, reason, rule, recipients, {
        target,
        channels,
        now,
        deadline,
      });
    } catch (error) {
      if (!(error instanceof StaleTransitionError)) throw error;
      // Somebody acknowledged, resolved or cancelled between this dispatch reading the
      // event and writing it. The transaction rolled back, so nobody is notified and no
      // timer is armed: the emergency is exactly as the other action left it.
      this.logger.log(`Event ${eventId} moved on before tier ${tier} went out; standing down`);
      return;
    }

    // Screens update the moment the chain moves, rather than on their next poll.
    this.realtime.emergencyUpdated(dispatched.updated);

    // Queued after the transaction commits: a job that ran against uncommitted rows
    // would find nothing to send.
    await this.notifications.enqueue(dispatched.notificationIds);

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

  /** The durable half of a dispatch: notification rows, the state change and its audit entry. */
  private dispatchInTransaction(
    event: EmergencyEvent,
    tier: number,
    reason: DispatchReason,
    rule: EscalationRule,
    recipients: string[],
    plan: {
      target: EventState;
      channels: NotificationChannel[];
      now: Date;
      deadline: Date | null;
    },
  ): Promise<{ updated: EmergencyEvent; notificationIds: string[] }> {
    const eventId = event.id;
    const { target, channels, now, deadline } = plan;

    return this.prisma.$transaction(async (tx) => {
      const created = await Promise.all(
        recipients.flatMap((recipientId) =>
          channels.map((channel) =>
            tx.notification.create({
              data: {
                eventId,
                recipientId,
                channel,
                status: NotificationStatus.QUEUED,
                tier,
                createdAt: now,
              },
              select: { id: true },
            }),
          ),
        ),
      );

      // A manual request is the owner calling in a responder, so it may find the event
      // acknowledged. A timer or a decline acting on an acknowledged event has lost a
      // race, and the extra condition makes its write match nothing.
      const updated = await transitionEvent(
        tx,
        event,
        target,
        { currentTier: tier, currentTierDeadlineAt: deadline },
        reason === 'manual' ? {} : { acknowledgedBy: null },
      );

      await tx.auditLog.create({
        data: {
          eventId,
          actorId: null,
          action: AuditAction.TIER_DISPATCHED,
          previousState: event.state,
          newState: target,
          detail: {
            tier,
            reason,
            responderRole: rule.responderRole,
            recipients: recipients.length,
            channels,
            timeoutSeconds: rule.timeoutSeconds,
          } as unknown as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });

      return { updated, notificationIds: created.map((notification) => notification.id) };
    });
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

    if (!event || !AWAITING_STATES.includes(event.state)) return;
    if (event.currentTier !== tier) return;

    await this.escalate(event, tier);
  }

  /**
   * The second look at severity, once the cancel window has closed.
   *
   * At the press, "did not cancel" cannot be known, so it scores nothing. When the window
   * closes without a cancel, that is the clearest sign the person may not be able to
   * reach their phone, and the emergency is scored again with it counted. Called by the
   * review timer and, as a safety net, by the sweep; the column it sets makes sure only
   * one of them does the work.
   *
   * Severity only ever rises. A rise changes the rules for the rest of the chain at once
   * (see promote), unless somebody has already taken the emergency on.
   */
  async reviewSeverity(eventId: string): Promise<void> {
    const event = await this.prisma.emergencyEvent.findUnique({
      where: { id: eventId },
      include: { elder: true },
    });
    if (!event || event.severityReviewedAt || !OPEN_STATES.includes(event.state)) return;

    const at = new Date();
    const hours = this.config.get<number>('RECENT_ACTIVITY_HOURS', 6);
    const recentEventCount = await this.prisma.emergencyEvent.count({
      where: recentEventsWhere(event.elderlyId, at, hours, event.id),
    });

    const assessment = await this.severity.evaluate(
      severityContextFor(
        event.elder,
        { latitude: Number(event.alertLatitude), longitude: Number(event.alertLongitude) },
        at,
        recentEventCount,
        true,
      ),
    );

    const band = this.severity.highestOf(event.severity, assessment.band);
    // The stored factors always explain the stored score, so they are replaced only
    // together. A lower re-score, which only a clock crossing out of night inside ten
    // seconds could produce, leaves both as they were.
    const rescored = assessment.score >= event.severityScore;

    const claimed = await this.prisma.$transaction(async (tx) => {
      // Exactly once, and only while the emergency is open: a cancel that lands in the
      // same instant as the review wins, and the review finds nothing to claim.
      const claim = await tx.emergencyEvent.updateMany({
        where: { id: eventId, severityReviewedAt: null, state: { in: OPEN_STATES } },
        data: {
          severityReviewedAt: at,
          severity: band,
          ...(rescored
            ? {
                severityScore: assessment.score,
                severityFactors: assessment as unknown as Prisma.InputJsonValue,
              }
            : {}),
        },
      });
      if (claim.count === 0) return false;

      await tx.auditLog.create({
        data: {
          eventId,
          actorId: null,
          action: AuditAction.SEVERITY_EVALUATED,
          detail: {
            ...severityAuditDetail(assessment),
            stage: 'cancel_window_closed',
            severityBefore: event.severity,
            severityAfter: band,
          } as unknown as Prisma.InputJsonValue,
          occurredAt: at,
        },
      });
      return true;
    });

    if (!claimed) return;

    const reviewed = await this.prisma.emergencyEvent.findUniqueOrThrow({ where: { id: eventId } });
    this.realtime.emergencyUpdated(reviewed);
    this.logger.log(
      `Event ${eventId} reviewed after its cancel window: ${event.severity} to ${band} (score ${assessment.score})`,
    );

    if (band !== event.severity) await this.promote(reviewed, event.severity);
  }

  /**
   * Reviews every open emergency whose cancel window closed without a review.
   *
   * Normally none: the review timer does this within a second of the window closing.
   * This catches the ones it could not, because the API was restarting, the timer could
   * not be armed, or Redis is not publishing expiry events. Returns how many it found.
   */
  async reviewOverdueSeverity(): Promise<number> {
    const windowSeconds = this.config.get<number>('CANCEL_GRACE_WINDOW', 10);
    const closedBefore = new Date(Date.now() - windowSeconds * 1000);

    const overdue = await this.prisma.emergencyEvent.findMany({
      where: {
        severityReviewedAt: null,
        state: { in: OPEN_STATES },
        triggeredAt: { lte: closedBefore },
      },
      select: { id: true },
      orderBy: { triggeredAt: 'asc' },
      take: 50,
    });

    for (const { id } of overdue) {
      try {
        await this.reviewSeverity(id);
      } catch (error) {
        this.logger.error(
          `Severity review failed for event ${id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
    return overdue.length;
  }

  /**
   * Applies a higher band's rules to an emergency already under way.
   *
   * Three things can differ between bands, and each is brought forward rather than
   * restarted: the tier already asked keeps its place but gets the shorter window,
   * measured from when it was asked; if the new band texts as well as pushes, that tier
   * is texted now; and if the new band sends the next tier alongside this one, it goes
   * out now. Nothing changes once somebody owns the emergency.
   */
  private async promote(
    event: EmergencyEvent,
    fromBand: EmergencyEvent['severity'],
  ): Promise<void> {
    if (event.acknowledgedBy || !AWAITING_STATES.includes(event.state)) return;

    const [rules, previousRules] = await Promise.all([
      this.rulesFor(event),
      this.prisma.escalationRule.findMany({ where: { severity: fromBand } }),
    ]);
    const tier = event.currentTier;
    const current = rules.find((rule) => rule.tierOrder === tier);
    const previous = previousRules.find((rule) => rule.tierOrder === tier);

    await this.shortenWindow(event, current, previous);
    if (current?.smsFallbackImmediate && !previous?.smsFallbackImmediate) {
      await this.textTierNow(event.id, tier);
    }

    const next = rules.find((rule) => rule.tierOrder === tier + 1);
    if (next?.dispatchMode === DispatchMode.PARALLEL) {
      const alreadySent = await this.prisma.notification.count({
        where: { eventId: event.id, tier: next.tierOrder },
      });
      if (alreadySent === 0) await this.dispatchTier(event.id, next.tierOrder, 'severity');
    }
  }

  /** The tier already asked gets the new band's window, counted from when it was asked. */
  private async shortenWindow(
    event: EmergencyEvent,
    current: EscalationRule | undefined,
    previous: EscalationRule | undefined,
  ): Promise<void> {
    const oldDeadline = event.currentTierDeadlineAt;
    if (!oldDeadline || current?.timeoutSeconds == null || previous?.timeoutSeconds == null) {
      return;
    }

    const askedAt = oldDeadline.getTime() - previous.timeoutSeconds * 1000;
    const newDeadline = askedAt + current.timeoutSeconds * 1000;
    if (newDeadline >= oldDeadline.getTime()) return;

    // At least a second, so a window that should already have closed closes now
    // through the normal path rather than through a special case.
    const seconds = Math.max(1, Math.ceil((newDeadline - Date.now()) / 1000));
    const moved = await this.prisma.emergencyEvent.updateMany({
      where: { id: event.id, currentTier: event.currentTier, acknowledgedBy: null },
      data: { currentTierDeadlineAt: new Date(Date.now() + seconds * 1000) },
    });
    if (moved.count > 0) await this.timers.arm(event.id, event.currentTier, seconds);
  }

  /** Texts everybody at this tier who was pushed, has not declined and has not had an SMS. */
  private async textTierNow(eventId: string, tier: number): Promise<void> {
    const [pushed, texted] = await Promise.all([
      this.prisma.notification.findMany({
        where: { eventId, tier, channel: NotificationChannel.PUSH, declinedAt: null },
        select: { recipientId: true },
      }),
      this.prisma.notification.findMany({
        where: { eventId, tier, channel: NotificationChannel.SMS },
        select: { recipientId: true },
      }),
    ]);

    const already = new Set(texted.map((row) => row.recipientId));
    const recipients = [...new Set(pushed.map((row) => row.recipientId))].filter(
      (recipientId) => !already.has(recipientId),
    );
    if (recipients.length === 0) return;

    const now = new Date();
    const created = await this.prisma.$transaction((tx) =>
      Promise.all(
        recipients.map((recipientId) =>
          tx.notification.create({
            data: {
              eventId,
              recipientId,
              channel: NotificationChannel.SMS,
              status: NotificationStatus.QUEUED,
              tier,
              createdAt: now,
            },
            select: { id: true },
          }),
        ),
      ),
    );
    await this.notifications.enqueue(created.map((row) => row.id));
  }

  /**
   * Someone takes ownership. Stops every pending timer for this emergency.
   *
   * [via] is how they said so, the app or a reply to the alert SMS, kept in the audit
   * entry so the evaluation can count how often a text was the way somebody answered.
   */
  async acknowledge(
    eventId: string,
    userId: string,
    location?: ResponderLocation,
    via: AnswerChannel = 'app',
  ): Promise<EmergencyEvent> {
    const event = await this.requireOpenEvent(eventId);

    if (event.acknowledgedBy) {
      throw new ConflictException('Someone is already responding to this emergency');
    }
    assertTransition(event.state, EventState.ACKNOWLEDGED);
    await this.requireParticipant(event, userId);

    const now = new Date();
    await this.timers.cancelAll(eventId);

    const acknowledged = await this.prisma.$transaction(async (tx) => {
      // NFR-04. The check above reads the event and then writes it as two separate
      // statements, so two responders pressing "I am on my way" in the same instant
      // can both find acknowledgedBy null and both be told they own the emergency.
      // Ownership is therefore claimed by a conditional write: the database applies
      // the WHERE and the SET atomically, so exactly one of the two updates can match
      // a row. Zero affected rows means somebody else got there first, which is a
      // conflict rather than a failure, and the loser is told so. The states it may
      // find the row in come from the lifecycle table, like every other transition.
      const claim = await tx.emergencyEvent.updateMany({
        where: {
          id: eventId,
          acknowledgedBy: null,
          state: { in: sourcesOf(EventState.ACKNOWLEDGED) },
        },
        data: {
          state: EventState.ACKNOWLEDGED,
          acknowledgedBy: userId,
          acknowledgedAt: now,
          currentTierDeadlineAt: null,
          responderLatitude: location ? new Prisma.Decimal(location.latitude) : null,
          responderLongitude: location ? new Prisma.Decimal(location.longitude) : null,
        },
      });

      if (claim.count === 0) {
        throw new ConflictException('Someone is already responding to this emergency');
      }

      const updated = await tx.emergencyEvent.findUniqueOrThrow({ where: { id: eventId } });

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
            via,
          } as unknown as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });

      return updated;
    });

    this.realtime.emergencyUpdated(acknowledged);
    return acknowledged;
  }

  /** Closes the emergency with a recorded outcome. */
  /**
   * "I cannot come."
   *
   * A tier's timeout exists to bound how long an unanswered emergency waits, not to
   * make somebody who already knows they cannot attend sit out the rest of it. A
   * caregiver who is two hours away, in theatre, or simply asleep can say so, and the
   * emergency moves on at once instead of burning the remainder of the window.
   *
   * Three rules keep it from being a way to make an emergency disappear. Only the
   * people this tier actually asked may decline, so somebody further down the chain
   * cannot decline on tier one's behalf and somebody outside the chain cannot decline
   * at all. Nobody may decline once a person has taken ownership. And a decline never
   * closes an emergency: it removes one person from consideration and the chain
   * continues, which is the opposite of a veto.
   */
  async decline(
    eventId: string,
    userId: string,
    reason?: string,
    via: AnswerChannel = 'app',
  ): Promise<EmergencyEvent> {
    const event = await this.requireOpenEvent(eventId);

    if (event.acknowledgedBy) {
      throw new ConflictException('Someone is already responding to this emergency');
    }

    // Scoped to the current tier. Being asked is what confers the right to decline.
    const asked = await this.prisma.notification.findMany({
      where: { eventId, recipientId: userId, tier: event.currentTier },
      select: { id: true, declinedAt: true },
    });

    if (asked.length === 0) {
      throw new ForbiddenException('You were not asked to respond to this emergency');
    }

    // Idempotent rather than an error. A retry from a phone with one bar of signal is
    // the most likely way this is called twice, and it should not read as a failure.
    if (asked.every((notification) => notification.declinedAt !== null)) {
      return event;
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.notification.updateMany({
        where: { eventId, recipientId: userId, tier: event.currentTier },
        data: { declinedAt: now },
      });

      await tx.auditLog.create({
        data: {
          eventId,
          actorId: userId,
          action: AuditAction.DECLINED,
          detail: {
            tier: event.currentTier,
            reason: reason ?? null,
            secondsFromTrigger: Math.round((now.getTime() - event.triggeredAt.getTime()) / 1000),
            via,
          } as unknown as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });
    });

    // Whether anybody this tier asked could still say yes. The critical band dispatches
    // two tiers at once, so one person declining is not the same as the tier being
    // exhausted: escalating on the first decline would cut short somebody who is in the
    // middle of accepting.
    const remaining = await this.prisma.notification.findMany({
      where: { eventId, tier: event.currentTier, declinedAt: null },
      select: { recipientId: true },
      distinct: ['recipientId'],
    });

    if (remaining.length > 0) {
      this.logger.log(
        `Event ${eventId}: a tier ${event.currentTier} contact declined, ` +
          `${remaining.length} still able to answer`,
      );
    } else {
      // Nobody left. The window has nothing to wait for, so it is stopped rather than
      // left to expire into an escalation that has already happened.
      this.logger.warn(
        `Event ${eventId}: every tier ${event.currentTier} contact declined, escalating now`,
      );
      await this.timers.cancelAll(eventId);
      await this.escalate(event, event.currentTier);
    }

    const latest = await this.prisma.emergencyEvent.findUniqueOrThrow({ where: { id: eventId } });
    this.realtime.emergencyUpdated(latest);
    return latest;
  }

  async resolve(
    eventId: string,
    userId: string,
    outcome: EventOutcome,
    note?: string,
  ): Promise<EmergencyEvent> {
    const event = await this.requireOpenEvent(eventId);
    await this.requireParticipant(event, userId);

    const now = new Date();
    await this.timers.cancelAll(eventId);

    const resolved = await this.prisma.$transaction(async (tx) => {
      const updated = await transitionEvent(tx, event, EventState.RESOLVED, {
        outcome,
        // Trimmed, and an empty string becomes null rather than an empty note. A
        // column that is sometimes '' and sometimes null is two ways to say the same
        // thing, and every later query has to know about both.
        outcomeNote: note?.trim() ? note.trim() : null,
        resolvedAt: now,
        currentTierDeadlineAt: null,
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
            note: note?.trim() || null,
            secondsFromTrigger: Math.round((now.getTime() - event.triggeredAt.getTime()) / 1000),
          } as unknown as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });

      return updated;
    });

    this.realtime.emergencyUpdated(resolved);
    return resolved;
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
      // A deactivated account is skipped, so its rank is passed over as if empty and
      // the emergency moves on rather than waiting on somebody who cannot sign in.
      where: {
        elderlyId: event.elderlyId,
        priorityOrder: rule.tierOrder,
        responder: { deactivatedAt: null },
      },
      select: { responderId: true },
    });

    return assignments.map((assignment) => assignment.responderId);
  }

  private async respondersCovering(event: EmergencyEvent): Promise<string[]> {
    const responders = await this.prisma.user.findMany({
      where: {
        role: Role.EMERGENCY_RESPONDER,
        deactivatedAt: null,
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
