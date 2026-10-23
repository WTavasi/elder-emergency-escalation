import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Role, VolunteerCallStatus, VolunteerStatus, VolunteerTraining } from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import { capSms } from '../../notification-service/services/notification-content';
import type { ApplyDto, ReviewDto } from '../validation/volunteer.dto';

/** A volunteer's own application and standing. */
export interface VolunteerView {
  /** NOT_APPLIED until they send an application. */
  status: VolunteerStatus | 'NOT_APPLIED';
  training: VolunteerTraining[];
  note: string | null;
  area: { label: string; latitude: number; longitude: number } | null;
  radiusKm: number | null;
  available: boolean;
  appliedAt: string | null;
  /** Why it was rejected or suspended, as the reviewer wrote it. */
  reviewNote: string | null;
}

/** One application, as the vetting queue shows it. */
export interface VolunteerApplication {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: VolunteerStatus;
  training: VolunteerTraining[];
  note: string | null;
  area: { label: string; latitude: number; longitude: number } | null;
  radiusKm: number | null;
  available: boolean;
  appliedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  /** How many times they said they would go, and how many they reached. */
  accepted: number;
  arrived: number;
  deactivated: boolean;
}

const PROFILE_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  deactivatedAt: true,
  coverageAreaName: true,
  coverageLatitude: true,
  coverageLongitude: true,
  coverageRadiusKm: true,
  volunteerProfile: { include: { reviewedBy: { select: { name: true } } } },
} as const;

/**
 * Becoming a community volunteer, and an administrator deciding.
 *
 * Anybody can sign up as one, and nothing is ever sent to them until an administrator
 * approves the application. What they can do is declared and checked off the system
 * (a training card, a call); no certificate or ID number is stored. An approved
 * volunteer is asked only while they have switched themselves available, and an
 * administrator can suspend them at any time, which also switches that off.
 */
@Injectable()
export class VolunteersService {
  private readonly logger = new Logger(VolunteersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: DirectSmsService,
  ) {}

  async me(userId: string): Promise<VolunteerView> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: PROFILE_SELECT,
    });
    const profile = user.volunteerProfile;
    return {
      status: profile?.status ?? 'NOT_APPLIED',
      training: profile?.training ?? [],
      note: profile?.note ?? null,
      area: areaOf(user),
      radiusKm: user.coverageRadiusKm === null ? null : Number(user.coverageRadiusKm),
      available: profile?.available ?? false,
      appliedAt: profile?.appliedAt.toISOString() ?? null,
      reviewNote: profile?.reviewNote ?? null,
    };
  }

  /**
   * Sends or changes the application. A first application, or one after a rejection,
   * goes into the queue. Changing the area or training of an approved application keeps
   * the approval: the reviewer vetted the person, not their postcode. A suspended
   * volunteer can update their details but stays suspended.
   */
  async apply(userId: string, dto: ApplyDto): Promise<VolunteerView> {
    if (dto.training.includes(VolunteerTraining.OTHER) && !dto.note?.trim()) {
      throw new BadRequestException('Say what your other training is in the note');
    }

    const existing = await this.prisma.volunteerProfile.findUnique({ where: { userId } });
    const fresh = !existing || existing.status === VolunteerStatus.REJECTED;
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          coverageAreaName: dto.area.label.trim(),
          coverageLatitude: dto.area.latitude,
          coverageLongitude: dto.area.longitude,
          coverageRadiusKm: dto.radiusKm,
        },
      }),
      this.prisma.volunteerProfile.upsert({
        where: { userId },
        create: {
          userId,
          training: dto.training,
          note: dto.note?.trim() || null,
          appliedAt: now,
        },
        update: {
          training: dto.training,
          note: dto.note?.trim() || null,
          ...(fresh
            ? {
                status: VolunteerStatus.PENDING,
                appliedAt: now,
                reviewedAt: null,
                reviewedById: null,
                reviewNote: null,
                available: false,
              }
            : {}),
        },
      }),
    ]);
    if (fresh) this.logger.log(`Volunteer application from ${userId}`);
    return this.me(userId);
  }

  /** "I'm available." Only once approved; anybody can switch off at any time. */
  async setAvailable(userId: string, available: boolean): Promise<VolunteerView> {
    const profile = await this.prisma.volunteerProfile.findUnique({ where: { userId } });
    if (available && profile?.status !== VolunteerStatus.APPROVED) {
      throw new ConflictException(
        profile ? 'Your application has not been approved yet' : 'Send your application first',
      );
    }
    if (profile && profile.available !== available) {
      await this.prisma.volunteerProfile.update({
        where: { userId },
        data: { available, availableChangedAt: new Date() },
      });
    }
    return this.me(userId);
  }

  /** The vetting queue: oldest waiting first, then the rest by when they applied. */
  async list(status?: VolunteerStatus): Promise<VolunteerApplication[]> {
    const applications = await this.applications(undefined, status);
    return applications.sort((a, b) => {
      const waiting = Number(b.status === 'PENDING') - Number(a.status === 'PENDING');
      if (waiting !== 0) return waiting;
      return a.status === 'PENDING'
        ? a.appliedAt.localeCompare(b.appliedAt)
        : b.appliedAt.localeCompare(a.appliedAt);
    });
  }

  /** Applications with their record of going, for some volunteers or all. */
  private async applications(
    only?: string[],
    status?: VolunteerStatus,
  ): Promise<VolunteerApplication[]> {
    const users = await this.prisma.user.findMany({
      where: {
        role: Role.COMMUNITY_RESPONDER,
        ...(only ? { id: { in: only } } : {}),
        volunteerProfile: status ? { status } : { isNot: null },
      },
      select: PROFILE_SELECT,
    });
    const ids = users.map((user) => user.id);
    const record = await this.prisma.volunteerCall.groupBy({
      by: ['volunteerId'],
      where: {
        volunteerId: { in: ids },
        status: { in: [VolunteerCallStatus.ACCEPTED, VolunteerCallStatus.WITHDRAWN] },
      },
      _count: { _all: true },
    });
    const arrivals = await this.prisma.volunteerCall.groupBy({
      by: ['volunteerId'],
      where: { volunteerId: { in: ids }, arrivedAt: { not: null } },
      _count: { _all: true },
    });
    const count = (rows: Array<{ volunteerId: string; _count: { _all: number } }>, id: string) =>
      rows.find((row) => row.volunteerId === id)?._count._all ?? 0;

    return users.map((user) =>
      toApplication(user, count(record, user.id), count(arrivals, user.id)),
    );
  }

  /** Approve, reject or suspend. The volunteer is told by text either way. */
  async review(
    volunteerId: string,
    adminId: string,
    dto: ReviewDto,
  ): Promise<VolunteerApplication> {
    const profile = await this.prisma.volunteerProfile.findUnique({
      where: { userId: volunteerId },
      include: { user: { select: { name: true, phone: true } } },
    });
    if (!profile) throw new NotFoundException('No such application');

    const note = dto.note?.trim() || null;
    if (dto.decision !== 'approve' && !note) {
      throw new BadRequestException('Say why, so the volunteer knows');
    }
    if (dto.decision === 'suspend' && profile.status !== VolunteerStatus.APPROVED) {
      throw new ConflictException('Only an approved volunteer can be suspended');
    }

    const status = {
      approve: VolunteerStatus.APPROVED,
      reject: VolunteerStatus.REJECTED,
      suspend: VolunteerStatus.SUSPENDED,
    }[dto.decision];
    const now = new Date();
    await this.prisma.volunteerProfile.update({
      where: { userId: volunteerId },
      data: {
        status,
        reviewedAt: now,
        reviewedById: adminId,
        reviewNote: note,
        // Approval does not switch them on: they say when they are available.
        ...(status === VolunteerStatus.APPROVED
          ? {}
          : { available: false, availableChangedAt: now }),
      },
    });
    this.logger.log(`Volunteer ${volunteerId} ${status.toLowerCase()} by ${adminId}`);

    const first = profile.user.name.split(/\s+/)[0];
    const text = {
      approve: capSms(
        `MzaziCare: ${first}, you are approved as a community volunteer. Turn on Available in the app whenever you can help.`,
        `MzaziCare: you are approved as a community volunteer.`,
      ),
      reject: capSms(
        `MzaziCare: ${first}, your volunteer application was not approved: ${note}`,
        `MzaziCare: your volunteer application was not approved.`,
      ),
      suspend: capSms(
        `MzaziCare: ${first}, you will not be asked to help for now: ${note}`,
        `MzaziCare: you will not be asked to help for now.`,
      ),
    }[dto.decision];
    await this.sms.send(profile.user.phone, text);

    const [updated] = await this.applications([volunteerId]);
    return updated;
  }
}

type ProfileRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  deactivatedAt: Date | null;
  coverageAreaName: string | null;
  coverageLatitude: unknown;
  coverageLongitude: unknown;
  coverageRadiusKm: unknown;
  volunteerProfile: {
    status: VolunteerStatus;
    training: VolunteerTraining[];
    note: string | null;
    available: boolean;
    appliedAt: Date;
    reviewedAt: Date | null;
    reviewNote: string | null;
    reviewedBy: { name: string } | null;
  } | null;
};

function areaOf(
  user: Pick<ProfileRow, 'coverageAreaName' | 'coverageLatitude' | 'coverageLongitude'>,
) {
  if (user.coverageLatitude === null || user.coverageLongitude === null) return null;
  return {
    label: user.coverageAreaName ?? '',
    latitude: Number(user.coverageLatitude),
    longitude: Number(user.coverageLongitude),
  };
}

function toApplication(user: ProfileRow, accepted: number, arrived: number): VolunteerApplication {
  const profile = user.volunteerProfile!;
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    status: profile.status,
    training: profile.training,
    note: profile.note,
    area: areaOf(user),
    radiusKm: user.coverageRadiusKm === null ? null : Number(user.coverageRadiusKm),
    available: profile.available,
    appliedAt: profile.appliedAt.toISOString(),
    reviewedAt: profile.reviewedAt?.toISOString() ?? null,
    reviewedBy: profile.reviewedBy?.name ?? null,
    reviewNote: profile.reviewNote,
    accepted,
    arrived,
    deactivated: user.deactivatedAt !== null,
  };
}
