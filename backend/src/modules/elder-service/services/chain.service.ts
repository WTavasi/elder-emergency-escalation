import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConsentType, Prisma, Role } from '@prisma/client';
import { OPEN_STATES } from '../../../shared/utils/event-lifecycle';
import { PrismaService } from '../../../db/prisma.service';
import { PRIVACY_POLICY_VERSION } from '../../../shared/config/policy';
import { tierForRole } from '../../../shared/utils/chain';
import { CONSENT_STATE_SELECT, disclosureFor } from '../../../shared/utils/consent';
import { redactPhone } from '../../../shared/utils/redaction';
import { PasswordService } from '../../auth-service/services/password.service';
import { PhoneVerificationService } from '../../auth-service/services/phone-verification.service';
import { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import { accountMessages } from '../../notification-service/services/notification-content';
import type { AddChainMemberDto } from '../validation/add-chain-member.dto';
import type { CreateElderDto } from '../validation/create-elder.dto';

/** One elder the caller looks after, for the caregiver's list. */
export interface ElderSummary {
  id: string;
  name: string;
  /** Null when the elder has withdrawn consent to share it and no emergency is open. */
  phone: string | null;
  /** Null when the elder has withdrawn consent to share their location, likewise. */
  homeLabel: string | null;
  /** What is left out because of a withdrawn consent, so the screen can say why. */
  withheld: Array<'phone' | 'location'>;
  /** The caller's own rank in this elder's chain. */
  myTier: number;
  /** Whether the caller may change the chain, which only a caregiver in it may. */
  canEditChain: boolean;
}

/** One place in an elder's chain, filled or held for somebody. */
export interface ChainEntry {
  /** The care assignment's id, or the invitation's while the place is only held. */
  id: string;
  tier: number;
  name: string;
  phone: string;
  role: Role | null;
  /** Invited means the place is held until that number signs up. */
  status: 'member' | 'invited';
  /** Whether the caller may take this place out of the chain. */
  removable: boolean;
}

export interface ChainView {
  elderId: string;
  elderName: string;
  canEdit: boolean;
  entries: ChainEntry[];
}

/** Roles that can hold a place in a chain added from the app. */
const ADDABLE_ROLES: Role[] = [Role.CAREGIVER, Role.FAMILY_MEMBER];

/**
 * Elders and the people who look after them, as a caregiver sets them up.
 *
 * Every place in a chain is a rank, and the rank is what dispatch reads: tier one is
 * told first, tier two when tier one has not answered. The database allows one person
 * per rank for each elder, so adding a family contact fills the family rank, and a
 * second one is refused until the first is removed.
 */
@Injectable()
export class ChainService {
  private readonly logger = new Logger(ChainService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly verification: PhoneVerificationService,
    private readonly sms: DirectSmsService,
  ) {}

  /**
   * Registers an elder and puts the caregiver first in their chain.
   *
   * The elder's phone proves itself with a code exactly as a sign-up does. Consent is
   * written as three rows naming the caregiver as the one who gave it and how they are
   * related, which is what the Data Protection Act asks a record of consent given on
   * somebody's behalf to say.
   */
  async createElder(caregiverId: string, dto: CreateElderDto): Promise<ElderSummary> {
    await this.verification.consume(dto.phone, dto.code);

    try {
      const elder = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: dto.name,
            phone: dto.phone,
            role: Role.ELDER,
            passwordHash: this.passwords.hash(dto.password),
            careLevel: dto.careLevel ?? null,
            homeLatitude: new Prisma.Decimal(dto.home.latitude),
            homeLongitude: new Prisma.Decimal(dto.home.longitude),
            homeAddressLabel: dto.home.label,
          },
        });

        await tx.consentRecord.createMany({
          data: [
            ConsentType.DATA_PROCESSING,
            ConsentType.LOCATION_SHARING,
            ConsentType.CONTACT_SHARING,
          ].map((type) => ({
            subjectId: created.id,
            grantedById: caregiverId,
            type,
            policyVersion: PRIVACY_POLICY_VERSION,
            grantorRelationship: dto.relationship,
          })),
        });

        await tx.careAssignment.create({
          data: {
            elderlyId: created.id,
            responderId: caregiverId,
            priorityOrder: await tierForRole(tx, Role.CAREGIVER),
          },
        });

        return created;
      });

      this.logger.log(`Elder ${elder.id} registered by caregiver ${caregiverId}`);
      return {
        id: elder.id,
        name: elder.name,
        phone: elder.phone,
        homeLabel: elder.homeAddressLabel,
        // Just registered, with all three consents given, so nothing is withheld.
        withheld: [],
        myTier: await tierForRole(this.prisma, Role.CAREGIVER),
        canEditChain: true,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account already exists with that phone number');
      }
      throw error;
    }
  }

  /** The elders the caller looks after, closest rank first. */
  async myElders(userId: string, role: Role): Promise<ElderSummary[]> {
    const assignments = await this.prisma.careAssignment.findMany({
      where: { responderId: userId },
      orderBy: [{ priorityOrder: 'asc' }, { assignedAt: 'asc' }],
      select: {
        priorityOrder: true,
        elder: {
          select: {
            id: true,
            name: true,
            phone: true,
            homeAddressLabel: true,
            consentsAboutMe: CONSENT_STATE_SELECT,
          },
        },
      },
    });

    // One query for every elder in the list, rather than one per elder.
    const inEmergency = new Set(
      (
        await this.prisma.emergencyEvent.findMany({
          where: {
            elderlyId: { in: assignments.map((assignment) => assignment.elder.id) },
            state: { in: OPEN_STATES },
          },
          select: { elderlyId: true },
        })
      ).map((event) => event.elderlyId),
    );

    return assignments.map((assignment) => {
      const shown = disclosureFor(assignment.elder.consentsAboutMe, {
        viewerIsSubject: false,
        emergencyOpen: inEmergency.has(assignment.elder.id),
      });
      return {
        id: assignment.elder.id,
        name: assignment.elder.name,
        phone: shown.phone ? assignment.elder.phone : null,
        homeLabel: shown.location ? assignment.elder.homeAddressLabel : null,
        withheld: [
          ...(shown.phone ? [] : ['phone' as const]),
          ...(shown.location ? [] : ['location' as const]),
        ],
        myTier: assignment.priorityOrder,
        canEditChain: role === Role.CAREGIVER,
      };
    });
  }

  /** Everybody in an elder's chain, and the places held for people yet to sign up. */
  async chain(elderId: string, userId: string, role: Role): Promise<ChainView> {
    const elder = await this.requireInChain(elderId, userId, role);

    const [assignments, invitations] = await Promise.all([
      this.prisma.careAssignment.findMany({
        where: { elderlyId: elderId },
        orderBy: { priorityOrder: 'asc' },
        select: {
          id: true,
          priorityOrder: true,
          responder: { select: { id: true, name: true, phone: true, role: true } },
        },
      }),
      this.prisma.chainInvitation.findMany({
        where: { elderlyId: elderId },
        orderBy: { priorityOrder: 'asc' },
      }),
    ]);

    const canEdit = role === Role.CAREGIVER;
    const entries: ChainEntry[] = [
      ...assignments.map((assignment) => ({
        id: assignment.id,
        tier: assignment.priorityOrder,
        name: assignment.responder.name,
        phone: assignment.responder.phone,
        role: assignment.responder.role,
        status: 'member' as const,
        removable:
          canEdit &&
          assignment.responder.id !== userId &&
          ADDABLE_ROLES.includes(assignment.responder.role),
      })),
      ...invitations.map((invitation) => ({
        id: invitation.id,
        tier: invitation.priorityOrder,
        name: invitation.name ?? 'Invited',
        phone: invitation.phone,
        role: null,
        status: 'invited' as const,
        removable: canEdit,
      })),
    ].sort((a, b) => a.tier - b.tier);

    return { elderId, elderName: elder.name, canEdit, entries };
  }

  /**
   * Adds somebody to the family rank of an elder's chain by phone number.
   *
   * With an account, they take the place now. Without one, the place is held for the
   * number and taken when it signs up. Either way they get an SMS saying who added them
   * and for whom, because being made somebody's emergency contact without being told
   * is not something a person should discover during an emergency.
   */
  async addMember(
    elderId: string,
    userId: string,
    role: Role,
    dto: AddChainMemberDto,
  ): Promise<ChainView> {
    const elder = await this.requireInChain(elderId, userId, role);
    if (role !== Role.CAREGIVER) {
      throw new ForbiddenException('Only a caregiver can change who is in the chain');
    }

    const tier = await tierForRole(this.prisma, Role.FAMILY_MEMBER);
    await this.requireRankFree(elderId, tier);

    const inviter = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true },
    });
    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      select: { id: true, role: true },
    });

    if (existing) {
      if (!ADDABLE_ROLES.includes(existing.role)) {
        throw new BadRequestException(
          'That number belongs to an account that cannot be added to a chain from the app',
        );
      }
      await this.prisma.careAssignment
        .create({ data: { elderlyId: elderId, responderId: existing.id, priorityOrder: tier } })
        .catch((error: unknown) => {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictException('That person is already in this chain');
          }
          throw error;
        });
      await this.sms.send(dto.phone, accountMessages.addedToChain(inviter.name, elder.name));
      this.logger.log(`Account added to the chain of elder ${elderId} at tier ${tier}`);
    } else {
      await this.prisma.chainInvitation.create({
        data: {
          elderlyId: elderId,
          phone: dto.phone,
          name: dto.name ?? null,
          priorityOrder: tier,
          invitedById: userId,
        },
      });
      await this.sms.send(dto.phone, accountMessages.invitedToChain(inviter.name, elder.name));
      this.logger.log(`Place in the chain of elder ${elderId} held for ${redactPhone(dto.phone)}`);
    }

    return this.chain(elderId, userId, role);
  }

  /**
   * Takes a person, or a held place, out of an elder's chain.
   *
   * Refused while the elder has an emergency open: taking somebody out of a chain that
   * is being worked through would change who is asked in the middle of it. Refused for
   * the caller's own place, so a caregiver cannot leave an elder with nobody at tier one
   * by accident, and for emergency responders, who are matched by area and managed by an
   * administrator. Somebody removed is told by SMS, as they were told when added.
   */
  async removeEntry(
    elderId: string,
    entryId: string,
    userId: string,
    role: Role,
  ): Promise<ChainView> {
    const elder = await this.requireInChain(elderId, userId, role);
    if (role !== Role.CAREGIVER) {
      throw new ForbiddenException('Only a caregiver can change who is in the chain');
    }

    const open = await this.prisma.emergencyEvent.count({
      where: { elderlyId: elderId, state: { in: OPEN_STATES } },
    });
    if (open > 0) {
      throw new ConflictException(
        `${elder.name} has an emergency open. Change the chain once it is closed.`,
      );
    }

    const assignment = await this.prisma.careAssignment.findFirst({
      where: { id: entryId, elderlyId: elderId },
      select: { id: true, responder: { select: { id: true, phone: true, role: true } } },
    });

    if (assignment) {
      if (assignment.responder.id === userId) {
        throw new BadRequestException('You cannot remove yourself from the chain');
      }
      if (!ADDABLE_ROLES.includes(assignment.responder.role)) {
        throw new BadRequestException('Emergency responders are managed by an administrator');
      }
      await this.prisma.careAssignment.delete({ where: { id: assignment.id } });

      const remover = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { name: true },
      });
      await this.sms.send(
        assignment.responder.phone,
        accountMessages.removedFromChain(remover.name, elder.name),
      );
      this.logger.log(`Assignment ${assignment.id} removed from elder ${elderId}`);
      return this.chain(elderId, userId, role);
    }

    const invitation = await this.prisma.chainInvitation.findFirst({
      where: { id: entryId, elderlyId: elderId },
      select: { id: true },
    });
    if (!invitation) throw new NotFoundException('That place is not in this chain');

    // A held place was never taken, so there is nobody to tell.
    await this.prisma.chainInvitation.delete({ where: { id: invitation.id } });
    this.logger.log(`Invitation ${invitation.id} withdrawn for elder ${elderId}`);
    return this.chain(elderId, userId, role);
  }

  private async requireRankFree(elderId: string, tier: number): Promise<void> {
    const [taken, held] = await Promise.all([
      this.prisma.careAssignment.findFirst({
        where: { elderlyId: elderId, priorityOrder: tier },
        select: { responder: { select: { name: true } } },
      }),
      this.prisma.chainInvitation.findFirst({
        where: { elderlyId: elderId, priorityOrder: tier },
        select: { name: true, phone: true },
      }),
    ]);

    if (taken) {
      throw new ConflictException(
        `${taken.responder.name} already holds the family place in this chain. Each place holds one person.`,
      );
    }
    if (held) {
      throw new ConflictException(
        `The family place is already held for ${held.name ?? 'somebody who has not signed up yet'}.`,
      );
    }
  }

  /** The same rule as everywhere else: you see an elder's chain only if you are in it. */
  private async requireInChain(elderId: string, userId: string, role: Role) {
    const elder = await this.prisma.user.findUnique({
      where: { id: elderId },
      select: { id: true, name: true, role: true },
    });
    if (!elder || elder.role !== Role.ELDER) throw new NotFoundException('No such elder');
    if (role === Role.ADMINISTRATOR) return elder;

    const assignment = await this.prisma.careAssignment.findFirst({
      where: { elderlyId: elderId, responderId: userId },
      select: { id: true },
    });
    if (!assignment) throw new ForbiddenException('You do not look after this person');
    return elder;
  }
}
