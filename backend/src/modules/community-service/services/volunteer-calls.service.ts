import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditAction,
  ConsentType,
  Prisma,
  Role,
  Severity,
  VolunteerCallStatus,
  VolunteerStatus,
  type EmergencyEvent,
} from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { OPEN_STATES } from '../../../shared/utils/event-lifecycle';
import { distanceInMetres } from '../../../shared/utils/geo';
import {
  REALTIME_PUBLISHER,
  type RealtimePublisher,
} from '../../realtime-service/services/realtime.publisher';
import { volunteerMessages } from './volunteer-content';
import { VolunteerMessenger, type Reachable } from './volunteer-messenger.service';

/** Why volunteers were asked: a critical alert, or nobody professional covers the place. */
export type AskReason = 'critical' | 'uncovered';

/** One emergency as the volunteer asked about it sees it. */
export interface VolunteerCallView {
  eventId: string;
  status: VolunteerCallStatus;
  askedAt: string;
  /** From the centre of their area, rounded to 10 m. */
  distanceMetres: number;
  severity: Severity;
  raisedAt: string;
  /** Still open. Once it closes nothing more about it is shown. */
  open: boolean;
  /** Another volunteer accepted first. */
  takenByAnother: boolean;
  /**
   * Who and where. Only for the volunteer who accepted, and only while it is open: a
   * volunteer is told this as the price of going, and it is taken back when it ends.
   */
  elder: {
    name: string;
    phone: string;
    addressLabel: string | null;
    latitude: number;
    longitude: number;
  } | null;
  /** First name of somebody from the elder's circle who has taken it on, if anybody has. */
  circleOwner: string | null;
  acceptedAt: string | null;
  arrivedAt: string | null;
}

/** What the elder and their circle see about volunteers on an alert. */
export interface VolunteerOnAlert {
  askedAt: string;
  asked: number;
  /** The volunteer who accepted. The elder is shown the first name only. */
  name: string | null;
  phone: string | null;
  distanceMetres: number | null;
  acceptedAt: string | null;
  arrivedAt: string | null;
}

export type TextAnswer = 'accepted' | 'declined' | 'taken' | 'nothing';

const OPEN = { in: OPEN_STATES };

/**
 * Asking vetted community volunteers near an emergency, and what they say.
 *
 * Volunteers go alongside the elder's chain and never instead of it. Accepting tells
 * the volunteer who and where, shows them to the elder and the circle, and stands the
 * other volunteers down; it does not take the emergency on, stop a timer or change its
 * state, so a stranger can never be the reason the family stopped being asked.
 *
 * Asked once per emergency, only for an elder who agreed (COMMUNITY_HELP consent), and
 * only volunteers who are approved, have switched themselves available, and whose own
 * area contains the place of the alert. Never somebody already in the elder's chain,
 * who is asked as family.
 */
@Injectable()
export class VolunteerCallsService {
  private readonly logger = new Logger(VolunteerCallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    private readonly messenger: VolunteerMessenger,
    private readonly config: ConfigService,
  ) {}

  /**
   * Asks the nearest available volunteers, once. Returns how many were asked. Never
   * throws for an ordinary reason, because it runs beside a dispatch that must not fail
   * on its account.
   */
  async askNearby(eventId: string, reason: AskReason): Promise<number> {
    if (!this.config.get<boolean>('VOLUNTEERS_ENABLED', true)) return 0;

    const event = await this.prisma.emergencyEvent.findUnique({ where: { id: eventId } });
    if (!event || !OPEN_STATES.includes(event.state) || event.volunteersAskedAt) return 0;

    const agreed = await this.prisma.consentRecord.findFirst({
      where: { subjectId: event.elderlyId, type: ConsentType.COMMUNITY_HELP, withdrawnAt: null },
      select: { id: true },
    });
    if (!agreed) return 0;

    const now = new Date();
    // Once, whichever of a dispatch, a review or a second instance gets here first.
    const claimed = await this.prisma.emergencyEvent.updateMany({
      where: { id: eventId, volunteersAskedAt: null, state: OPEN },
      data: { volunteersAskedAt: now },
    });
    if (claimed.count === 0) return 0;

    const nearby = await this.nearby(event);
    await this.prisma.$transaction(async (tx) => {
      if (nearby.length > 0) {
        await tx.volunteerCall.createMany({
          data: nearby.map((volunteer) => ({
            eventId,
            volunteerId: volunteer.id,
            distanceMetres: volunteer.distanceMetres,
            askedAt: now,
            askedVia: 'none',
          })),
          skipDuplicates: true,
        });
      }
      await tx.auditLog.create({
        data: {
          eventId,
          actorId: null,
          action: AuditAction.VOLUNTEERS_ASKED,
          detail: { reason, asked: nearby.length } as unknown as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });
    });
    this.logger.log(`Event ${eventId}: ${nearby.length} volunteer(s) asked (${reason})`);
    this.realtime.emergencyUpdated({ ...event, volunteersAskedAt: now });

    // After the rows exist, so a volunteer who answers at once finds their call.
    const replies = Boolean(this.config.get<string>('SMS_INBOUND_TOKEN'));
    for (const volunteer of nearby) {
      const via = await this.messenger.send(
        volunteer,
        volunteerMessages.ask(eventId, volunteer.distanceMetres, event.severity, replies),
      );
      await this.prisma.volunteerCall.updateMany({
        where: { eventId, volunteerId: volunteer.id },
        data: { askedVia: via },
      });
    }
    return nearby.length;
  }

  /** "I can go." The first to say it is the one who goes. */
  async accept(eventId: string, volunteerId: string): Promise<VolunteerCallView> {
    const { call, event } = await this.callFor(eventId, volunteerId);
    if (!OPEN_STATES.includes(event.state)) throw new ConflictException('This emergency is over');
    if (event.volunteerId === volunteerId) return this.view(eventId, volunteerId);
    if (call.status === VolunteerCallStatus.WITHDRAWN) {
      throw new ConflictException('You said you could not go after all');
    }

    const now = new Date();
    const claimed = await this.prisma.$transaction(async (tx) => {
      // Conditional on nobody having it, so two volunteers pressing at once cannot both win.
      const claim = await tx.emergencyEvent.updateMany({
        where: { id: eventId, volunteerId: null, state: OPEN },
        data: { volunteerId, volunteerAcceptedAt: now, volunteerArrivedAt: null },
      });
      if (claim.count === 0) return false;

      await tx.volunteerCall.update({
        where: { id: call.id },
        data: { status: VolunteerCallStatus.ACCEPTED, respondedAt: now },
      });
      await tx.volunteerCall.updateMany({
        where: { eventId, id: { not: call.id }, status: VolunteerCallStatus.ASKED },
        data: { status: VolunteerCallStatus.STOOD_DOWN },
      });
      await tx.auditLog.create({
        data: {
          eventId,
          actorId: volunteerId,
          action: AuditAction.VOLUNTEER_ACCEPTED,
          detail: {
            distanceMetres: call.distanceMetres,
            secondsAfterTrigger: Math.round((now.getTime() - event.triggeredAt.getTime()) / 1000),
          } as unknown as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });
      return true;
    });
    if (!claimed) throw new ConflictException('Another volunteer is already going. Thank you.');

    this.logger.log(`Event ${eventId}: volunteer ${volunteerId} accepted`);
    this.realtime.emergencyUpdated({ ...event, volunteerId, volunteerAcceptedAt: now });
    void this.afterAccept(eventId, volunteerId, call.distanceMetres).catch((error: unknown) =>
      this.logger.warn(
        `Telling people about the volunteer failed: ${error instanceof Error ? error.message : 'unknown'}`,
      ),
    );
    return this.view(eventId, volunteerId);
  }

  /** "I cannot go." Nothing else changes; the others are still being asked. */
  async decline(eventId: string, volunteerId: string): Promise<VolunteerCallView> {
    const { call } = await this.callFor(eventId, volunteerId);
    if (call.status === VolunteerCallStatus.ACCEPTED) {
      throw new ConflictException('You said you would go. Say you can no longer go instead.');
    }
    if (
      call.status === VolunteerCallStatus.ASKED ||
      call.status === VolunteerCallStatus.STOOD_DOWN
    ) {
      await this.prisma.volunteerCall.update({
        where: { id: call.id },
        data: { status: VolunteerCallStatus.DECLINED, respondedAt: new Date() },
      });
    }
    return this.view(eventId, volunteerId);
  }

  /**
   * "I can no longer go." Gives the place back and asks the others again, since an
   * elder somebody said they would go to is the worst one to leave waiting.
   */
  async withdraw(eventId: string, volunteerId: string): Promise<VolunteerCallView> {
    const { call, event } = await this.callFor(eventId, volunteerId);
    if (event.volunteerId !== volunteerId) {
      throw new ConflictException('You are not the volunteer going to this emergency');
    }

    const now = new Date();
    const released = await this.prisma.$transaction(async (tx) => {
      const release = await tx.emergencyEvent.updateMany({
        where: { id: eventId, volunteerId },
        data: { volunteerId: null, volunteerAcceptedAt: null, volunteerArrivedAt: null },
      });
      if (release.count === 0) return false;
      await tx.volunteerCall.update({
        where: { id: call.id },
        data: { status: VolunteerCallStatus.WITHDRAWN, respondedAt: now },
      });
      await tx.auditLog.create({
        data: {
          eventId,
          actorId: volunteerId,
          action: AuditAction.VOLUNTEER_WITHDREW,
          occurredAt: now,
        },
      });
      if (OPEN_STATES.includes(event.state)) {
        await tx.volunteerCall.updateMany({
          where: { eventId, status: VolunteerCallStatus.STOOD_DOWN },
          data: { status: VolunteerCallStatus.ASKED },
        });
      }
      return true;
    });
    if (!released) return this.view(eventId, volunteerId);

    this.realtime.emergencyUpdated({
      ...event,
      volunteerId: null,
      volunteerAcceptedAt: null,
      volunteerArrivedAt: null,
    });
    if (OPEN_STATES.includes(event.state)) {
      void this.askAgain(eventId).catch(() => undefined);
    }
    return this.view(eventId, volunteerId);
  }

  /** "I'm here." Recorded and shown; the emergency's own state is the circle's to move. */
  async arrived(eventId: string, volunteerId: string): Promise<VolunteerCallView> {
    const { call, event } = await this.callFor(eventId, volunteerId);
    if (event.volunteerId !== volunteerId) {
      throw new ConflictException('You are not the volunteer going to this emergency');
    }
    if (!OPEN_STATES.includes(event.state)) throw new ConflictException('This emergency is over');
    if (event.volunteerArrivedAt) return this.view(eventId, volunteerId);

    const now = new Date();
    const marked = await this.prisma.$transaction(async (tx) => {
      const mark = await tx.emergencyEvent.updateMany({
        where: { id: eventId, volunteerId, volunteerArrivedAt: null },
        data: { volunteerArrivedAt: now },
      });
      if (mark.count === 0) return false;
      await tx.volunteerCall.update({ where: { id: call.id }, data: { arrivedAt: now } });
      await tx.auditLog.create({
        data: {
          eventId,
          actorId: volunteerId,
          action: AuditAction.VOLUNTEER_ARRIVED,
          detail: {
            secondsAfterAccepting: event.volunteerAcceptedAt
              ? Math.round((now.getTime() - event.volunteerAcceptedAt.getTime()) / 1000)
              : null,
          } as unknown as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });
      return true;
    });
    if (marked) this.realtime.emergencyUpdated({ ...event, volunteerArrivedAt: now });
    return this.view(eventId, volunteerId);
  }

  /**
   * The emergency was closed. Volunteers still being asked are told they are not needed,
   * and the one going is thanked. Safe to call for an emergency no volunteer was asked
   * about, and never throws.
   */
  async eventClosed(eventId: string): Promise<void> {
    try {
      const event = await this.prisma.emergencyEvent.findUnique({
        where: { id: eventId },
        select: { volunteersAskedAt: true, volunteerId: true, elder: { select: { name: true } } },
      });
      if (!event?.volunteersAskedAt) return;

      const waiting = await this.prisma.volunteerCall.findMany({
        where: { eventId, status: VolunteerCallStatus.ASKED },
        include: { volunteer: { select: { phone: true, pushToken: true } } },
      });
      await this.prisma.volunteerCall.updateMany({
        where: { eventId, status: VolunteerCallStatus.ASKED },
        data: { status: VolunteerCallStatus.STOOD_DOWN },
      });
      for (const call of waiting) {
        await this.messenger.send(
          call.volunteer,
          volunteerMessages.over(eventId, false, event.elder.name),
        );
      }

      if (event.volunteerId) {
        const going = await this.prisma.user.findUnique({
          where: { id: event.volunteerId },
          select: { phone: true, pushToken: true },
        });
        if (going)
          await this.messenger.send(going, volunteerMessages.over(eventId, true, event.elder.name));
      }
    } catch (error) {
      this.logger.warn(
        `Standing volunteers down failed for ${eventId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  /** The emergencies this volunteer was asked about: the open ones, then the last few. */
  async mine(volunteerId: string): Promise<VolunteerCallView[]> {
    const calls = await this.prisma.volunteerCall.findMany({
      where: { volunteerId },
      orderBy: { askedAt: 'desc' },
      take: 20,
      select: { eventId: true },
    });
    const views = await Promise.all(calls.map((call) => this.view(call.eventId, volunteerId)));
    return views.sort((a, b) => Number(b.open) - Number(a.open));
  }

  async one(eventId: string, volunteerId: string): Promise<VolunteerCallView> {
    await this.callFor(eventId, volunteerId);
    return this.view(eventId, volunteerId);
  }

  /**
   * A reply by text to "Reply 1 if you can go". Applies to the newest open emergency
   * this volunteer was asked about and has not answered.
   */
  async answerByText(
    volunteerId: string,
    intent: 'accept' | 'decline',
  ): Promise<{ answer: TextAnswer; text: string | null }> {
    const call = await this.prisma.volunteerCall.findFirst({
      where: {
        volunteerId,
        status: { in: [VolunteerCallStatus.ASKED, VolunteerCallStatus.STOOD_DOWN] },
        event: { state: OPEN },
      },
      orderBy: { askedAt: 'desc' },
    });
    if (!call) return { answer: 'nothing', text: null };

    if (intent === 'decline') {
      await this.decline(call.eventId, volunteerId);
      return { answer: 'declined', text: 'MzaziCare: thank you for letting us know.' };
    }
    try {
      const view = await this.accept(call.eventId, volunteerId);
      const elder = view.elder;
      return {
        answer: 'accepted',
        text: elder
          ? volunteerMessages.acceptedByText(elder.name, elder.addressLabel, elder.phone)
          : null,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        return { answer: 'taken', text: volunteerMessages.covered(call.eventId).sms };
      }
      throw error;
    }
  }

  /** For the alert's own detail, to the elder and the circle. Null if nobody was asked. */
  async onAlert(eventId: string, forElder: boolean): Promise<VolunteerOnAlert | null> {
    const event = await this.prisma.emergencyEvent.findUnique({
      where: { id: eventId },
      select: {
        volunteersAskedAt: true,
        volunteerAcceptedAt: true,
        volunteerArrivedAt: true,
        volunteer: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!event?.volunteersAskedAt) return null;

    const [asked, accepted] = await Promise.all([
      this.prisma.volunteerCall.count({ where: { eventId } }),
      event.volunteer
        ? this.prisma.volunteerCall.findFirst({
            where: { eventId, volunteerId: event.volunteer.id },
            select: { distanceMetres: true },
          })
        : Promise.resolve(null),
    ]);
    const volunteer = event.volunteer;
    return {
      askedAt: event.volunteersAskedAt.toISOString(),
      asked,
      name: volunteer ? (forElder ? volunteer.name.split(/\s+/)[0] : volunteer.name) : null,
      phone: volunteer && !forElder ? volunteer.phone : null,
      distanceMetres: accepted?.distanceMetres ?? null,
      acceptedAt: event.volunteerAcceptedAt?.toISOString() ?? null,
      arrivedAt: event.volunteerArrivedAt?.toISOString() ?? null,
    };
  }

  // ------------------------------------------------------------------ internals --

  /** Approved, available volunteers whose area contains the alert, nearest first. */
  private async nearby(
    event: EmergencyEvent,
  ): Promise<Array<Reachable & { id: string; distanceMetres: number }>> {
    const most = this.config.get<number>('VOLUNTEER_MAX_ASKED', 10);
    const chain = await this.prisma.careAssignment.findMany({
      where: { elderlyId: event.elderlyId },
      select: { responderId: true },
    });
    const excluded = new Set([event.elderlyId, ...chain.map((link) => link.responderId)]);

    const candidates = await this.prisma.user.findMany({
      where: {
        role: Role.COMMUNITY_RESPONDER,
        deactivatedAt: null,
        coverageLatitude: { not: null },
        coverageLongitude: { not: null },
        coverageRadiusKm: { not: null },
        volunteerProfile: { status: VolunteerStatus.APPROVED, available: true },
      },
      select: {
        id: true,
        phone: true,
        pushToken: true,
        coverageLatitude: true,
        coverageLongitude: true,
        coverageRadiusKm: true,
      },
    });

    const alert = {
      latitude: Number(event.alertLatitude),
      longitude: Number(event.alertLongitude),
    };
    return candidates
      .filter((person) => !excluded.has(person.id))
      .map((person) => ({
        id: person.id,
        phone: person.phone,
        pushToken: person.pushToken,
        radius: Number(person.coverageRadiusKm) * 1000,
        distanceMetres:
          Math.round(
            distanceInMetres(
              {
                latitude: Number(person.coverageLatitude),
                longitude: Number(person.coverageLongitude),
              },
              alert,
            ) / 10,
          ) * 10,
      }))
      .filter((person) => person.distanceMetres <= person.radius)
      .sort((a, b) => a.distanceMetres - b.distanceMetres)
      .slice(0, most)
      .map(({ radius: _radius, ...person }) => person);
  }

  private async callFor(eventId: string, volunteerId: string) {
    const call = await this.prisma.volunteerCall.findUnique({
      where: { eventId_volunteerId: { eventId, volunteerId } },
    });
    // Not "forbidden": whether an emergency exists is itself not a volunteer's to know.
    if (!call) throw new NotFoundException('You were not asked about this emergency');
    const event = await this.prisma.emergencyEvent.findUniqueOrThrow({ where: { id: eventId } });
    return { call, event };
  }

  private async view(eventId: string, volunteerId: string): Promise<VolunteerCallView> {
    const call = await this.prisma.volunteerCall.findUniqueOrThrow({
      where: { eventId_volunteerId: { eventId, volunteerId } },
      include: {
        event: {
          select: {
            state: true,
            severity: true,
            triggeredAt: true,
            volunteerId: true,
            volunteerAcceptedAt: true,
            volunteerArrivedAt: true,
            alertLatitude: true,
            alertLongitude: true,
            alertAddressLabel: true,
            elder: { select: { name: true, phone: true } },
            owner: { select: { name: true } },
          },
        },
      },
    });
    const event = call.event;
    const open = OPEN_STATES.includes(event.state);
    const mine = event.volunteerId === volunteerId;
    const told = mine && open;

    return {
      eventId,
      status: call.status,
      askedAt: call.askedAt.toISOString(),
      distanceMetres: call.distanceMetres,
      severity: event.severity,
      raisedAt: event.triggeredAt.toISOString(),
      open,
      takenByAnother: event.volunteerId !== null && !mine,
      elder: told
        ? {
            name: event.elder.name,
            phone: event.elder.phone,
            addressLabel: event.alertAddressLabel,
            latitude: Number(event.alertLatitude),
            longitude: Number(event.alertLongitude),
          }
        : null,
      circleOwner: told && event.owner ? event.owner.name.split(/\s+/)[0] : null,
      acceptedAt: mine ? (event.volunteerAcceptedAt?.toISOString() ?? null) : null,
      arrivedAt: mine ? (event.volunteerArrivedAt?.toISOString() ?? null) : null,
    };
  }

  /** Tells the circle who is coming, and the volunteer who and where by text. */
  private async afterAccept(
    eventId: string,
    volunteerId: string,
    distanceMetres: number,
  ): Promise<void> {
    const [stoodDown, volunteer, event, told] = await Promise.all([
      this.prisma.volunteerCall.findMany({
        where: { eventId, status: VolunteerCallStatus.STOOD_DOWN },
        include: { volunteer: { select: { phone: true, pushToken: true } } },
      }),
      this.prisma.user.findUniqueOrThrow({ where: { id: volunteerId }, select: { name: true } }),
      this.prisma.emergencyEvent.findUniqueOrThrow({
        where: { id: eventId },
        select: { elder: { select: { name: true } } },
      }),
      // Everybody in the chain already told about this emergency.
      this.prisma.notification.findMany({
        where: { eventId },
        distinct: ['recipientId'],
        select: { recipient: { select: { phone: true, pushToken: true } } },
      }),
    ]);

    for (const call of stoodDown) {
      await this.messenger.send(call.volunteer, volunteerMessages.covered(eventId));
    }
    const message = volunteerMessages.toTheCircle(volunteer.name, event.elder.name, distanceMetres);
    for (const { recipient } of told) await this.messenger.send(recipient, message);
  }

  /** The volunteer going withdrew: everybody still waiting is asked again. */
  private async askAgain(eventId: string): Promise<void> {
    const waiting = await this.prisma.volunteerCall.findMany({
      where: { eventId, status: VolunteerCallStatus.ASKED },
      include: { volunteer: { select: { phone: true, pushToken: true } } },
    });
    for (const call of waiting) {
      await this.messenger.send(
        call.volunteer,
        volunteerMessages.stillNeeded(eventId, call.distanceMetres),
      );
    }
  }
}
