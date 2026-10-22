import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConsentType, Role } from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { PRIVACY_POLICY_VERSION } from '../../../shared/config/policy';
import { OPEN_STATES } from '../../../shared/utils/event-lifecycle';
import { AccessRevocationService } from '../../auth-service/services/access-revocation.service';
import { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import { accountMessages } from '../../notification-service/services/notification-content';

/** One consent about an elder, as the consent screens show it. */
export interface ConsentItem {
  type: ConsentType;
  /** Given and not withdrawn. */
  active: boolean;
  /** Who first gave it on the elder's behalf, as recorded at the time. */
  givenBy: { name: string; relationship: string } | null;
  givenAt: string | null;
  /** When the elder confirmed it for themselves. Null until they do. */
  confirmedAt: string | null;
  /** When it was withdrawn. Null while it is active. */
  withdrawnAt: string | null;
}

export interface ConsentView {
  elderId: string;
  elderName: string;
  policyVersion: string;
  /**
   * The elder has never confirmed, for themselves, what was agreed on their behalf. The
   * app asks at sign-in until they do. Alerts work either way: a safety feature is never
   * held behind a consent screen, and the consent given on their behalf still stands.
   */
  needsConfirmation: boolean;
  /** Whether the caller may withdraw: the elder, or a caregiver in their chain. */
  canWithdraw: boolean;
  items: ConsentItem[];
}

/** How each consent is named in a message to a phone. */
const SPOKEN: Record<ConsentType, string> = {
  [ConsentType.DATA_PROCESSING]: 'MzaziCare holding their information',
  [ConsentType.LOCATION_SHARING]: 'location sharing',
  [ConsentType.CONTACT_SHARING]: 'contact sharing',
  [ConsentType.COMMUNITY_HELP]: 'help from nearby volunteers',
};

/** The relationship recorded when somebody consents for themselves. */
const SELF = 'self';

/**
 * Consent about an elder, from the elder's side.
 *
 * Usually a caregiver registers an elder and consents on their behalf, which the Data
 * Protection Act allows only as far as the elder cannot consent themselves. So the
 * elder is asked to confirm at their first sign-in, and the elder, or the caregiver who
 * acts for them, can withdraw any consent later. Every change is a new record or a
 * withdrawal time on an existing one: nothing is overwritten, so the history of who
 * agreed to what, and when, is always there to show.
 */
@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: DirectSmsService,
    private readonly revocations: AccessRevocationService,
  ) {}

  /** The consents about an elder, for the elder, anybody in their chain, or an administrator. */
  async view(elderId: string, actorId: string, actorRole: Role): Promise<ConsentView> {
    const elder = await this.requireElder(elderId);
    const relation = await this.relationTo(elderId, actorId, actorRole);
    if (relation === 'none') throw new ForbiddenException('You do not look after this person');

    return this.build(elder, relation === 'elder' || relation === 'caregiver');
  }

  /**
   * The elder agreeing, for themselves, to what was agreed on their behalf.
   *
   * Recorded as new rows granted by the elder, alongside the caregiver's, for every
   * consent still active. A consent already withdrawn is not quietly given back: giving
   * it again is a separate decision. Repeating the call changes nothing.
   */
  async confirm(elderId: string, actorId: string): Promise<ConsentView> {
    const elder = await this.requireElder(elderId);
    if (actorId !== elderId) {
      throw new ForbiddenException('Only the person themselves can confirm their consent');
    }

    const rows = await this.prisma.consentRecord.findMany({
      where: { subjectId: elderId, withdrawnAt: null },
      select: { type: true, grantedById: true },
    });
    const active = new Set(rows.map((row) => row.type));
    const alreadyMine = new Set(
      rows.filter((row) => row.grantedById === elderId).map((row) => row.type),
    );
    const toConfirm = [...active].filter((type) => !alreadyMine.has(type));

    if (toConfirm.length > 0) {
      await this.prisma.consentRecord.createMany({
        data: toConfirm.map((type) => ({
          subjectId: elderId,
          grantedById: elderId,
          type,
          granted: true,
          policyVersion: PRIVACY_POLICY_VERSION,
          grantorRelationship: SELF,
        })),
      });
      this.logger.log(`Elder ${elderId} confirmed ${toConfirm.length} consent(s) themselves`);
    }

    return this.build(elder, true);
  }

  /**
   * Giving a consent after registration: the elder for themselves, or a caregiver in
   * their chain on their behalf. Help from community volunteers is the one that matters,
   * since it is never given at registration; location and contact sharing can be given
   * again after a withdrawal. Processing cannot: the account is closed once it goes.
   *
   * A caregiver's is recorded as given on the elder's behalf, so the elder is asked to
   * read and confirm it at their next sign-in, exactly as at registration, and is told
   * by text now. Giving what is already given changes nothing.
   */
  async grant(
    elderId: string,
    actorId: string,
    actorRole: Role,
    type: ConsentType,
  ): Promise<ConsentView> {
    const elder = await this.requireElder(elderId);
    const relation = await this.relationTo(elderId, actorId, actorRole);
    if (relation !== 'elder' && relation !== 'caregiver') {
      throw new ForbiddenException(
        'Only the person themselves or their caregiver can agree to this',
      );
    }
    if (type === ConsentType.DATA_PROCESSING) {
      throw new BadRequestException(
        'This is given when the account is made, and withdrawing it closes the account.',
      );
    }

    const active = await this.prisma.consentRecord.findFirst({
      where: {
        subjectId: elderId,
        type,
        withdrawnAt: null,
        // The elder's own agreement counts over a caregiver's, so a caregiver giving what
        // the elder already gave records nothing new.
        ...(relation === 'elder' ? { grantedById: elderId } : {}),
      },
      select: { id: true },
    });

    if (!active) {
      const byElder = relation === 'elder';
      await this.prisma.consentRecord.create({
        data: {
          subjectId: elderId,
          grantedById: actorId,
          type,
          granted: true,
          policyVersion: PRIVACY_POLICY_VERSION,
          grantorRelationship: byElder ? SELF : 'caregiver',
        },
      });
      this.logger.log(`Consent ${type} given for elder ${elderId} by ${relation}`);
      await this.tellAboutGrant(elder, actorId, type, byElder);
    }

    return this.build(elder, true);
  }

  /** The other side learns of it by text, as for a withdrawal. */
  private async tellAboutGrant(
    elder: { id: string; name: string; phone: string },
    actorId: string,
    type: ConsentType,
    byElder: boolean,
  ): Promise<void> {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { name: true },
    });
    const text = accountMessages.consentGiven(
      actor?.name ?? 'Someone',
      elder.name,
      SPOKEN[type],
      byElder,
    );

    if (!byElder) {
      await this.sms.send(elder.phone, text);
      return;
    }
    const caregivers = await this.prisma.careAssignment.findMany({
      where: { elderlyId: elder.id, responder: { role: Role.CAREGIVER, deactivatedAt: null } },
      select: { responder: { select: { phone: true } } },
    });
    for (const { responder } of caregivers) await this.sms.send(responder.phone, text);
  }

  /**
   * Withdrawing one consent, by the elder or by a caregiver in their chain.
   *
   * Location and contact sharing stop at once outside emergencies: the care circle's
   * screens, closed alerts and history leave them out. During an open emergency the
   * people responding still see them, under the vital interests ground rather than
   * consent. Withdrawing processing itself ends the service: every consent is withdrawn
   * with it, the account is deactivated and its sessions end, and its history is kept.
   */
  async withdraw(
    elderId: string,
    actorId: string,
    actorRole: Role,
    type: ConsentType,
    confirmed: boolean,
  ): Promise<ConsentView> {
    const elder = await this.requireElder(elderId);
    const relation = await this.relationTo(elderId, actorId, actorRole);
    if (relation !== 'elder' && relation !== 'caregiver') {
      throw new ForbiddenException('Only the person themselves or their caregiver can withdraw');
    }

    const endsService = type === ConsentType.DATA_PROCESSING;
    if (endsService && !confirmed) {
      throw new BadRequestException(
        'Withdrawing this ends the service: no more alerts can be raised. Send confirm: true to go ahead.',
      );
    }
    if (endsService) {
      const open = await this.prisma.emergencyEvent.count({
        where: { elderlyId: elderId, state: { in: OPEN_STATES } },
      });
      if (open > 0) {
        throw new ConflictException(
          'There is an emergency open. Close it first, then withdraw consent.',
        );
      }
    }

    const types = endsService ? Object.values(ConsentType) : [type];
    const now = new Date();

    const withdrawn = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.consentRecord.updateMany({
        where: { subjectId: elderId, type: { in: types }, withdrawnAt: null },
        data: { withdrawnAt: now },
      });
      if (endsService) {
        await tx.user.update({
          where: { id: elderId },
          data: { deactivatedAt: now, refreshTokenHash: null, refreshTokenUpdatedAt: now },
        });
      }
      return changed.count;
    });

    if (endsService) await this.revocations.revoke([elderId]);

    // Withdrawing what is already withdrawn is not an error, and tells nobody anything.
    if (withdrawn > 0) {
      this.logger.log(`Consent ${type} withdrawn for elder ${elderId} by ${relation}`);
      await this.tellEveryoneElse(elder, actorId, type, endsService);
    }

    return this.build(elder, true);
  }

  /** The other side learns of it by text: the caregivers, and the elder if it was not them. */
  private async tellEveryoneElse(
    elder: { id: string; name: string; phone: string },
    actorId: string,
    type: ConsentType,
    endsService: boolean,
  ): Promise<void> {
    const [actor, caregivers] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: actorId }, select: { name: true } }),
      this.prisma.careAssignment.findMany({
        where: { elderlyId: elder.id, responder: { role: Role.CAREGIVER, deactivatedAt: null } },
        select: { responder: { select: { id: true, phone: true } } },
      }),
    ]);

    const byElder = actorId === elder.id;
    const byName = actor?.name ?? 'Someone';
    const text = endsService
      ? accountMessages.serviceEnded(byName, elder.name, byElder)
      : accountMessages.consentWithdrawn(byName, elder.name, SPOKEN[type], byElder);

    const phones = caregivers
      .map((assignment) => assignment.responder)
      .filter((person) => person.id !== actorId)
      .map((person) => person.phone);
    // The elder hears about it too, unless they were the one who did it. Not after the
    // service has ended for them: their account is closed, and the caregiver who closed
    // it is the right person to explain.
    if (!byElder && !endsService) phones.push(elder.phone);

    // Sent one by one and never allowed to fail the withdrawal, which has already happened.
    for (const phone of phones) await this.sms.send(phone, text);
  }

  private async build(
    elder: { id: string; name: string },
    canWithdraw: boolean,
  ): Promise<ConsentView> {
    const rows = await this.prisma.consentRecord.findMany({
      where: { subjectId: elder.id },
      orderBy: { grantedAt: 'asc' },
      include: { grantedBy: { select: { name: true } } },
    });

    const items: ConsentItem[] = Object.values(ConsentType).map((type) => {
      const ofType = rows.filter((row) => row.type === type);
      const active = ofType.filter((row) => row.withdrawnAt === null);
      const onBehalf = ofType.find((row) => row.grantedById !== elder.id);
      const mine = active.filter((row) => row.grantedById === elder.id).at(-1);
      const lastWithdrawal = ofType
        .map((row) => row.withdrawnAt)
        .filter((at): at is Date => at !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      return {
        type,
        active: active.length > 0,
        givenBy: onBehalf
          ? { name: onBehalf.grantedBy.name, relationship: onBehalf.grantorRelationship }
          : null,
        givenAt: (onBehalf ?? ofType[0])?.grantedAt.toISOString() ?? null,
        confirmedAt: mine?.grantedAt.toISOString() ?? null,
        withdrawnAt: active.length === 0 ? (lastWithdrawal?.toISOString() ?? null) : null,
      };
    });

    // Asked while anything active was agreed only on their behalf: at first, everything
    // given at registration; later, a consent a caregiver gave for them since.
    const unconfirmed = items.some((item) => item.active && item.confirmedAt === null);

    return {
      elderId: elder.id,
      elderName: elder.name,
      policyVersion: PRIVACY_POLICY_VERSION,
      needsConfirmation: unconfirmed,
      canWithdraw,
      items,
    };
  }

  private async requireElder(elderId: string) {
    const elder = await this.prisma.user.findUnique({
      where: { id: elderId },
      select: { id: true, name: true, phone: true, role: true },
    });
    if (!elder || elder.role !== Role.ELDER) throw new NotFoundException('No such elder');
    return elder;
  }

  /** How the caller stands to this elder. */
  private async relationTo(
    elderId: string,
    actorId: string,
    actorRole: Role,
  ): Promise<'elder' | 'caregiver' | 'chain' | 'administrator' | 'none'> {
    if (actorId === elderId) return 'elder';

    const assignment = await this.prisma.careAssignment.findFirst({
      where: { elderlyId: elderId, responderId: actorId },
      select: { id: true },
    });
    if (assignment) return actorRole === Role.CAREGIVER ? 'caregiver' : 'chain';
    if (actorRole === Role.ADMINISTRATOR) return 'administrator';
    return 'none';
  }
}
