import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, type User } from '@prisma/client';
import { OPEN_STATES } from '../../../shared/utils/event-lifecycle';
import { PrismaService } from '../../../db/prisma.service';
import { redactPhone } from '../../../shared/utils/redaction';
import { AccessRevocationService } from '../../auth-service/services/access-revocation.service';
import { PasswordService } from '../../auth-service/services/password.service';
import { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import { accountMessages } from '../../notification-service/services/notification-content';
import {
  REALTIME_PUBLISHER,
  type RealtimePublisher,
} from '../../realtime-service/services/realtime.publisher';
import type {
  CoverageDto,
  CreateUserDto,
  ListUsersDto,
  UpdateUserDto,
} from '../validation/user-admin.dto';

/** One account as the console's table shows it. Never a password hash or a token. */
export interface UserRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: Role;
  createdAt: string;
  deactivatedAt: string | null;
  /** For a responder, where they are dispatched. Null for everybody else. */
  coverage: { areaName: string; latitude: number; longitude: number; radiusKm: number } | null;
  /** Places this account holds in elders' chains. */
  chainPlaces: number;
  /** For an elder, how many people are in their own chain. Zero for everybody else. */
  chainSize: number;
}

export interface UserPage {
  items: UserRow[];
  total: number;
  page: number;
  pageSize: number;
}

const ROW_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  role: true,
  createdAt: true,
  deactivatedAt: true,
  coverageAreaName: true,
  coverageLatitude: true,
  coverageLongitude: true,
  coverageRadiusKm: true,
  _count: { select: { assignmentsAsCarer: true, assignmentsAsElder: true } },
} satisfies Prisma.UserSelect;

type RowSource = Prisma.UserGetPayload<{ select: typeof ROW_SELECT }>;

function toRow(user: RowSource): UserRow {
  const hasCoverage =
    user.coverageLatitude !== null &&
    user.coverageLongitude !== null &&
    user.coverageRadiusKm !== null;
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    deactivatedAt: user.deactivatedAt?.toISOString() ?? null,
    coverage: hasCoverage
      ? {
          areaName: user.coverageAreaName ?? '',
          latitude: Number(user.coverageLatitude),
          longitude: Number(user.coverageLongitude),
          radiusKm: Number(user.coverageRadiusKm),
        }
      : null,
    chainPlaces: user._count.assignmentsAsCarer,
    chainSize: user._count.assignmentsAsElder,
  };
}

function coverageColumns(coverage: CoverageDto) {
  return {
    coverageAreaName: coverage.areaName.trim(),
    coverageLatitude: coverage.latitude,
    coverageLongitude: coverage.longitude,
    coverageRadiusKm: coverage.radiusKm,
  };
}

/**
 * Accounts, for the administrator: every one listed, staff accounts created, and any
 * account deactivated or brought back. FR-10.
 *
 * Nothing is deleted. Every account is named somewhere in emergency history, as the
 * elder who raised one or the person who answered it, and that history has to stay
 * readable. Deactivating stops the account signing in and stops dispatch asking it,
 * which is everything deleting would have achieved for a live system.
 */
@Injectable()
export class UserAdminService {
  private readonly logger = new Logger(UserAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sms: DirectSmsService,
    private readonly revocations: AccessRevocationService,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
  ) {}

  async list(query: ListUsersDto): Promise<UserPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const q = query.q?.trim();

    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status === 'active' ? { deactivatedAt: null } : {}),
      ...(query.status === 'deactivated' ? { deactivatedAt: { not: null } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q.replace(/\s+/g, '') } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: ROW_SELECT,
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: rows.map(toRow), total, page, pageSize };
  }

  /**
   * A responder or an administrator. They are told by SMS that the account exists, and
   * told nothing else: the first password comes from the administrator in person, never
   * by text message.
   */
  async create(dto: CreateUserDto, actorId: string): Promise<UserRow> {
    if (dto.role === Role.EMERGENCY_RESPONDER && !dto.coverage) {
      throw new BadRequestException('A responder needs an area, because dispatch matches by area');
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name.trim(),
          phone: dto.phone,
          email: dto.email?.trim().toLowerCase() ?? null,
          role: dto.role,
          passwordHash: this.passwords.hash(dto.password),
          ...(dto.role === Role.EMERGENCY_RESPONDER && dto.coverage
            ? coverageColumns(dto.coverage)
            : {}),
        },
        select: ROW_SELECT,
      });

      await this.sms.send(dto.phone, accountMessages.staffAccountCreated(dto.role));
      this.logger.log(`${actorId} created ${dto.role} ${redactPhone(dto.phone)}`);
      return toRow(user);
    } catch (error) {
      throw UserAdminService.conflict(error);
    }
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserRow> {
    const existing = await this.require(id);
    if (dto.coverage && existing.role !== Role.EMERGENCY_RESPONDER) {
      throw new BadRequestException('Only an emergency responder has an area');
    }

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.email !== undefined
            ? { email: dto.email === null ? null : dto.email.trim().toLowerCase() }
            : {}),
          ...(dto.coverage ? coverageColumns(dto.coverage) : {}),
        },
        select: ROW_SELECT,
      });
      return toRow(user);
    } catch (error) {
      throw UserAdminService.conflict(error);
    }
  }

  /**
   * Deactivates accounts. Refused, with the reason, for the administrator's own
   * account, for anybody handling an open emergency, and for whatever would leave no
   * active administrator: each of those would leave something nobody can fix.
   *
   * Every session ends straight away: the refresh fingerprint is cleared so no new
   * token can be had, the access tokens already issued are revoked, and any live
   * connection the console or app holds is closed.
   */
  async deactivate(ids: string[], actorId: string): Promise<{ updated: number }> {
    const unique = [...new Set(ids)];
    if (unique.includes(actorId)) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true, role: true, deactivatedAt: true },
    });
    if (users.length !== unique.length) throw new NotFoundException('Account not found');

    const handling = await this.prisma.emergencyEvent.findMany({
      where: { acknowledgedBy: { in: unique }, state: { in: OPEN_STATES } },
      select: { owner: { select: { name: true } } },
    });
    if (handling.length > 0) {
      const names = [...new Set(handling.map((event) => event.owner?.name ?? 'Somebody'))];
      throw new ConflictException(
        `${names.join(' and ')} ${names.length === 1 ? 'is' : 'are'} handling an open emergency. ` +
          'Deactivate once it is closed.',
      );
    }

    const adminsLeaving = users.filter(
      (user) => user.role === Role.ADMINISTRATOR && user.deactivatedAt === null,
    ).length;
    if (adminsLeaving > 0) {
      const activeAdmins = await this.prisma.user.count({
        where: { role: Role.ADMINISTRATOR, deactivatedAt: null },
      });
      if (activeAdmins - adminsLeaving < 1) {
        throw new ConflictException('At least one administrator has to stay active');
      }
    }

    const result = await this.prisma.user.updateMany({
      where: { id: { in: unique }, deactivatedAt: null },
      data: { deactivatedAt: new Date(), refreshTokenHash: null, pushToken: null },
    });
    await this.revocations.revoke(unique);
    this.realtime.disconnectUsers(unique);
    this.logger.log(`${actorId} deactivated ${result.count} account(s)`);
    return { updated: result.count };
  }

  async reactivate(ids: string[], actorId: string): Promise<{ updated: number }> {
    const unique = [...new Set(ids)];
    const result = await this.prisma.user.updateMany({
      where: { id: { in: unique }, deactivatedAt: { not: null } },
      data: { deactivatedAt: null },
    });
    // Lifted at once, so somebody brought back can sign in again straight away rather
    // than being refused for whatever is left of the mark.
    await this.revocations.restore(unique);
    this.logger.log(`${actorId} reactivated ${result.count} account(s)`);
    return { updated: result.count };
  }

  private async require(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Account not found');
    return user;
  }

  /** A taken phone number or email, named, because the caller is an administrator. */
  private static conflict(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const field = String((error.meta?.target as string[] | undefined)?.join(', ') ?? '');
      return new ConflictException(
        field.includes('email')
          ? 'Another account already uses that email address'
          : 'Another account already uses that phone number',
      );
    }
    return error;
  }
}
