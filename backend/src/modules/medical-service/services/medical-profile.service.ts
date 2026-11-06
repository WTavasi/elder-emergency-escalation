import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConsentType, Role, type EmergencyType, type ResponderService } from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { PRIVACY_POLICY_VERSION } from '../../../shared/config/policy';
import { OPEN_STATES } from '../../../shared/utils/event-lifecycle';
import { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import { accountMessages } from '../../notification-service/services/notification-content';
import type { MedicalProfileDto } from '../validation/medical-profile.dto';
import {
  BLOOD_TYPES,
  FLAG_LABEL,
  MEDICAL_FLAGS,
  ageOn,
  changedFields,
  readFor,
  type MedicalDetails,
  type MedicalFlag,
  type MedicalHighlight,
} from './medical-details';
import { MedicalSealService } from './medical-seal.service';

type Person = { id: string; name: string; role: Role } | null;

/** The elder's medical details as the elder and their caregivers see and edit them. */
export interface MedicalProfilePage {
  elderId: string;
  elderName: string;
  /** Whether this server can keep medical details at all. */
  enabled: boolean;
  consent: MedicalConsent;
  details: MedicalDetails | null;
  age: number | null;
  updatedAt: string | null;
  updatedBy: Person;
  canEdit: boolean;
  /** The choices the form offers, so the app and the server name them the same. */
  options: { flags: { flag: MedicalFlag; label: string }[]; bloodTypes: readonly string[] };
  /** Who changed what, newest first. */
  changes: { by: Person; fields: string[]; at: string }[];
  /** Who opened them, newest first. */
  views: { by: Person; eventId: string | null; at: string }[];
}

/**
 * Why the details are, or are not, on an alert:
 * shown; none (nothing saved); not-shared (the elder has not agreed to share them);
 * closed (the alert is over); not-asked (this person has not been asked to help yet);
 * off (this server keeps no medical details).
 */
/** Whether the details may be kept, and on whose word they are shared. */
export interface MedicalConsent {
  /** Agreed by somebody and not withdrawn: details may be kept. */
  active: boolean;
  /** The elder agreed themselves: details are shown to those asked about an alert. */
  byElder: boolean;
  /**
   * A caregiver said the elder cannot decide for themselves and that they act for them,
   * which shares the details as the elder's own agreement would. Null when nobody has.
   */
  guardian: { by: Person; at: string } | null;
}

export type AlertMedicalStatus = 'shown' | 'none' | 'not-shared' | 'closed' | 'not-asked' | 'off';

export interface AlertMedical {
  status: AlertMedicalStatus;
  details: MedicalDetails | null;
  age: number | null;
  updatedAt: string | null;
  /** What is happening, as last said, that the highlights were read against. */
  readFor: EmergencyType | null;
  highlights: MedicalHighlight[];
  /** The history makes this emergency more serious than it looks. */
  serious: boolean;
  askFor: ResponderService | null;
}

const PERSON = { select: { id: true, name: true, role: true } } as const;

/**
 * The relationship recorded on a MEDICAL_PROFILE consent given by a caregiver who says
 * they decide for the elder because the elder cannot. Its own record beside the consent
 * to keep the details, so it can be withdrawn without deleting them.
 */
export const GUARDIAN = 'guardian';

const EMPTY: MedicalDetails = {
  dateOfBirth: null,
  bloodType: null,
  flags: [],
  conditions: null,
  medications: null,
  allergies: null,
  languages: null,
  doctorName: null,
  doctorPhone: null,
  hospital: null,
  notes: null,
};

/**
 * An elder's medical details: what a helper should know in an emergency, as the medical
 * ID on a phone holds it.
 *
 * Health data is sensitive personal data under the Data Protection Act 2019, so:
 *
 * - Kept only with the MEDICAL_PROFILE consent, separate from registration. A caregiver
 *   may give it for the elder, and the elder is asked to confirm at their next sign-in,
 *   as for every consent given on their behalf.
 * - The elder and their caregivers see and change them at any time. Family and
 *   emergency responders see them only on an open alert they were asked about, and only
 *   once the elder has agreed for themselves, or, where the elder cannot decide, a
 *   caregiver has said so and that they act for them (s.32 of the Act). That declaration
 *   is recorded with its maker and time, texted to the elder and the other caregivers,
 *   and can be withdrawn by any of them. Volunteers and administrators never see them.
 * - Every opening by somebody other than the elder is recorded, and the elder sees who.
 *   Every change is recorded by part, and the elder is told by text of changes made by
 *   somebody else.
 * - Sealed before storage; never put in a push notification or a text, both of which
 *   pass through services outside Kenya.
 * - Withdrawing the consent deletes them (ConsentService).
 */
@Injectable()
export class MedicalProfileService {
  private readonly logger = new Logger(MedicalProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly seal: MedicalSealService,
    private readonly sms: DirectSmsService,
  ) {}

  /** The details for the elder or one of their caregivers. A caregiver's look is recorded. */
  async forElder(elderId: string, actorId: string): Promise<MedicalProfilePage> {
    const elder = await this.requireElder(elderId);
    const relation = await this.relationTo(elderId, actorId);
    if (relation === 'none') {
      throw new ForbiddenException('Only they and their caregivers can see this.');
    }

    if (relation === 'caregiver' && this.seal.enabled) {
      const kept = await this.prisma.medicalProfile.count({ where: { elderlyId: elderId } });
      if (kept > 0) {
        await this.prisma.medicalProfileView.create({
          data: { elderlyId: elderId, viewerId: actorId, eventId: null },
        });
      }
    }

    return this.page(elder);
  }

  /** Replacing the details, by the elder or a caregiver, once the consent is given. */
  async save(
    elderId: string,
    actorId: string,
    dto: MedicalProfileDto,
  ): Promise<MedicalProfilePage> {
    const elder = await this.requireElder(elderId);
    const relation = await this.relationTo(elderId, actorId);
    if (relation === 'none') {
      throw new ForbiddenException('Only they and their caregivers can change this.');
    }
    // Asked before anything else, so the reply says what to do rather than "unavailable".
    const consent = await this.consentOf(elderId);
    if (!consent.active) {
      throw new ConflictException('Agree to keeping medical details first.');
    }

    const existing = await this.prisma.medicalProfile.findUnique({ where: { elderlyId: elderId } });
    const before = existing ? this.seal.open<MedicalDetails>(existing.sealed) : null;
    const after: MedicalDetails = {
      ...EMPTY,
      ...Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined)),
      // In the list's order, so the same ticks always read the same.
      flags: MEDICAL_FLAGS.filter((flag) => dto.flags?.includes(flag)),
    };
    const changed = changedFields(before, after);
    if (changed.length === 0) return this.page(elder);

    const sealed = this.seal.seal(after);
    await this.prisma.$transaction([
      this.prisma.medicalProfile.upsert({
        where: { elderlyId: elderId },
        create: { elderlyId: elderId, sealed, updatedById: actorId },
        update: { sealed, updatedById: actorId },
      }),
      this.prisma.medicalProfileChange.create({
        data: { elderlyId: elderId, changedById: actorId, fields: changed },
      }),
    ]);
    this.logger.log(
      `Medical details for elder ${elderId} changed by ${relation}: ${changed.join(', ')}`,
    );

    // The elder hears of every change somebody else makes.
    if (relation === 'caregiver') {
      const actor = await this.prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true },
      });
      await this.sms.send(elder.phone, accountMessages.medicalChanged(actor?.name ?? 'Someone'));
    }

    return this.page(elder);
  }

  /**
   * The details on an alert, read against what is happening.
   *
   * The elder's caregivers see them on any of the elder's alerts. Family and emergency
   * responders see them while the alert is open, once they have been asked about it, and
   * only if the elder agreed for themselves. Each look is recorded against the alert.
   */
  async forAlert(eventId: string, userId: string, role: Role): Promise<AlertMedical> {
    const event = await this.prisma.emergencyEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        elderlyId: true,
        state: true,
        reportedType: true,
        confirmedType: true,
      },
    });
    if (!event) throw new NotFoundException("We couldn't find this emergency.");
    if (role === Role.ADMINISTRATOR || role === Role.COMMUNITY_RESPONDER) {
      throw new ForbiddenException('Medical details are shown only to the people asked to help.');
    }

    const self = event.elderlyId === userId;
    const [assignment, asked] = self
      ? [null, null]
      : await Promise.all([
          this.prisma.careAssignment.findFirst({
            where: { elderlyId: event.elderlyId, responderId: userId },
            select: { id: true },
          }),
          this.prisma.notification.findFirst({
            where: { eventId, recipientId: userId },
            select: { id: true },
          }),
        ]);
    // The same 404 as the alert itself, so an id nobody showed them confirms nothing.
    if (!self && !assignment && !asked) {
      throw new NotFoundException("We couldn't find this emergency.");
    }

    const type = event.confirmedType ?? event.reportedType;
    const result = (status: AlertMedicalStatus): AlertMedical => ({
      status,
      details: null,
      age: null,
      updatedAt: null,
      readFor: type,
      highlights: [],
      serious: false,
      askFor: null,
    });

    if (!this.seal.enabled) return result('off');

    const caregiver = Boolean(assignment) && role === Role.CAREGIVER;
    if (!self && !caregiver) {
      if (!OPEN_STATES.includes(event.state)) return result('closed');
      if (!asked) return result('not-asked');
      const consent = await this.consentOf(event.elderlyId);
      if (!consent.byElder && !consent.guardian) return result('not-shared');
    }

    const profile = await this.prisma.medicalProfile.findUnique({
      where: { elderlyId: event.elderlyId },
    });
    if (!profile) return result('none');

    if (!self) {
      await this.prisma.medicalProfileView.create({
        data: { elderlyId: event.elderlyId, viewerId: userId, eventId },
      });
    }

    const details = this.seal.open<MedicalDetails>(profile.sealed);
    const now = new Date();
    return {
      ...result('shown'),
      details,
      age: ageOn(details.dateOfBirth, now),
      updatedAt: profile.updatedAt.toISOString(),
      ...readFor(details.flags, type),
    };
  }

  /**
   * A caregiver saying the elder cannot decide about their medical details for themselves,
   * and that they act for them. From then the details are shown to the people asked about
   * an open alert, as the elder's own agreement would show them.
   *
   * Only a caregiver in the chain, only once the details may be kept, and not when the
   * elder has agreed for themselves. Recorded as its own consent row, granted by the
   * caregiver, with their name and the time; the elder and the other caregivers are texted.
   */
  async declareGuardian(elderId: string, actorId: string): Promise<MedicalProfilePage> {
    const elder = await this.requireElder(elderId);
    const relation = await this.relationTo(elderId, actorId);
    if (relation !== 'caregiver') {
      throw new ForbiddenException('Only a caregiver can say this.');
    }
    const consent = await this.consentOf(elderId);
    if (!consent.active) {
      throw new ConflictException('Agree to keeping medical details first.');
    }
    if (consent.byElder) {
      throw new ConflictException('They have already agreed for themselves.');
    }
    if (consent.guardian) return this.page(elder);

    await this.prisma.consentRecord.create({
      data: {
        subjectId: elderId,
        grantedById: actorId,
        type: ConsentType.MEDICAL_PROFILE,
        granted: true,
        policyVersion: PRIVACY_POLICY_VERSION,
        grantorRelationship: GUARDIAN,
      },
    });
    this.logger.log(`Caregiver ${actorId} decides for elder ${elderId} on medical details`);

    const actor = await this.nameOf(actorId);
    await this.sms.send(elder.phone, accountMessages.medicalGuardian(actor, elder.name, true));
    for (const phone of await this.otherCaregivers(elderId, actorId)) {
      await this.sms.send(phone, accountMessages.medicalGuardian(actor, elder.name, false));
    }

    return this.page(elder);
  }

  /**
   * Taking that back, by the elder or any caregiver. The details stay, and stay with the
   * caregivers; they stop being shown to anybody else. Everybody else is texted.
   */
  async endGuardian(elderId: string, actorId: string): Promise<MedicalProfilePage> {
    const elder = await this.requireElder(elderId);
    const relation = await this.relationTo(elderId, actorId);
    if (relation === 'none') {
      throw new ForbiddenException('Only they and their caregivers can change this.');
    }

    const ended = await this.prisma.consentRecord.updateMany({
      where: {
        subjectId: elderId,
        type: ConsentType.MEDICAL_PROFILE,
        grantorRelationship: GUARDIAN,
        withdrawnAt: null,
      },
      data: { withdrawnAt: new Date() },
    });

    if (ended.count > 0) {
      this.logger.log(`Medical guardian for elder ${elderId} ended by ${relation}`);
      const byElder = relation === 'elder';
      const text = accountMessages.medicalGuardianEnded(
        await this.nameOf(actorId),
        elder.name,
        byElder,
      );
      const phones = await this.otherCaregivers(elderId, actorId);
      if (!byElder) phones.push(elder.phone);
      for (const phone of phones) await this.sms.send(phone, text);
    }

    return this.page(elder);
  }

  /**
   * Who opened the details for one alert, and on whose word they are shared, for an
   * administrator. Never the details.
   */
  async viewsForAlert(eventId: string): Promise<{
    views: { by: Person; at: string }[];
    sharing: { byElder: boolean; guardian: MedicalConsent['guardian'] } | null;
  }> {
    const event = await this.prisma.emergencyEvent.findUnique({
      where: { id: eventId },
      select: { elderlyId: true },
    });
    if (!event) throw new NotFoundException("We couldn't find this emergency.");

    const [views, consent] = await Promise.all([
      this.prisma.medicalProfileView.findMany({
        where: { eventId },
        orderBy: { viewedAt: 'asc' },
        include: { viewer: PERSON },
      }),
      this.consentOf(event.elderlyId),
    ]);
    return {
      views: views.map((view) => ({ by: view.viewer, at: view.viewedAt.toISOString() })),
      sharing: consent.active ? { byElder: consent.byElder, guardian: consent.guardian } : null,
    };
  }

  private async page(elder: { id: string; name: string }): Promise<MedicalProfilePage> {
    const [consent, profile, changes, views] = await Promise.all([
      this.consentOf(elder.id),
      this.prisma.medicalProfile.findUnique({ where: { elderlyId: elder.id } }),
      this.prisma.medicalProfileChange.findMany({
        where: { elderlyId: elder.id },
        orderBy: { changedAt: 'desc' },
        take: 20,
        include: { changedBy: PERSON },
      }),
      this.prisma.medicalProfileView.findMany({
        where: { elderlyId: elder.id },
        orderBy: { viewedAt: 'desc' },
        take: 50,
        include: { viewer: PERSON },
      }),
    ]);

    const details =
      profile && this.seal.enabled ? this.seal.open<MedicalDetails>(profile.sealed) : null;
    const updatedBy = profile?.updatedById
      ? await this.prisma.user.findUnique({ where: { id: profile.updatedById }, ...PERSON })
      : null;

    return {
      elderId: elder.id,
      elderName: elder.name,
      enabled: this.seal.enabled,
      consent,
      details,
      age: ageOn(details?.dateOfBirth ?? null, new Date()),
      updatedAt: profile?.updatedAt.toISOString() ?? null,
      updatedBy,
      canEdit: this.seal.enabled && consent.active,
      options: {
        flags: MEDICAL_FLAGS.map((flag) => ({ flag, label: FLAG_LABEL[flag] })),
        bloodTypes: BLOOD_TYPES,
      },
      changes: changes.map((change) => ({
        by: change.changedBy,
        fields: change.fields,
        at: change.changedAt.toISOString(),
      })),
      views: views.map((view) => ({
        by: view.viewer,
        eventId: view.eventId,
        at: view.viewedAt.toISOString(),
      })),
    };
  }

  private async consentOf(elderId: string): Promise<MedicalConsent> {
    const rows = await this.prisma.consentRecord.findMany({
      where: { subjectId: elderId, type: ConsentType.MEDICAL_PROFILE, withdrawnAt: null },
      orderBy: { grantedAt: 'asc' },
      select: { grantedById: true, grantorRelationship: true, grantedAt: true, grantedBy: PERSON },
    });
    const guardian = rows.find((row) => row.grantorRelationship === GUARDIAN);
    return {
      active: rows.length > 0,
      byElder: rows.some((row) => row.grantedById === elderId),
      guardian: guardian ? { by: guardian.grantedBy, at: guardian.grantedAt.toISOString() } : null,
    };
  }

  private async nameOf(userId: string): Promise<string> {
    const person = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return person?.name ?? 'Someone';
  }

  /** The phones of the elder's caregivers, but not the one who acted. */
  private async otherCaregivers(elderId: string, actorId: string): Promise<string[]> {
    const caregivers = await this.prisma.careAssignment.findMany({
      where: { elderlyId: elderId, responder: { role: Role.CAREGIVER, deactivatedAt: null } },
      select: { responder: { select: { id: true, phone: true } } },
    });
    return caregivers
      .map((assignment) => assignment.responder)
      .filter((person) => person.id !== actorId)
      .map((person) => person.phone);
  }

  private async requireElder(elderId: string) {
    const elder = await this.prisma.user.findUnique({
      where: { id: elderId },
      select: { id: true, name: true, phone: true, role: true },
    });
    if (!elder || elder.role !== Role.ELDER) {
      throw new NotFoundException("We couldn't find this person.");
    }
    return elder;
  }

  /** The elder themselves, a caregiver in their chain, or anybody else. */
  private async relationTo(
    elderId: string,
    actorId: string,
  ): Promise<'elder' | 'caregiver' | 'none'> {
    if (actorId === elderId) return 'elder';
    const assignment = await this.prisma.careAssignment.findFirst({
      where: { elderlyId: elderId, responderId: actorId, responder: { role: Role.CAREGIVER } },
      select: { id: true },
    });
    return assignment ? 'caregiver' : 'none';
  }
}
