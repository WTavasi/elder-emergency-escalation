import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CareLevel, Prisma, Role, type User } from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { SetPlaceDto } from '../validation/set-place.dto';
import type { UpdateElderDto } from '../validation/update-elder.dto';

/** What the caller is told about where an elder is staying. */
export interface PlaceView {
  elderId: string;
  isAtHome: boolean;
  latitude: number | null;
  longitude: number | null;
  label: string | null;
  setAt: string | null;
}

/** Everything the elder's page in the app shows about them. */
export interface ElderDetail {
  id: string;
  name: string;
  phone: string;
  careLevel: CareLevel | null;
  home: { latitude: number; longitude: number; label: string | null } | null;
  place: PlaceView;
  /** Only a caregiver in the chain may change the elder's details. */
  canEdit: boolean;
}

/**
 * Recording where an elder is staying.
 *
 * This is the one piece of elder configuration a caregiver can change, and it exists
 * because the alternative was reading the device's location continuously. A stay away
 * from home is an occasional, knowable fact that somebody in the care circle already
 * knows; asking them to record it costs one action a few times a year and removes the
 * need to track anybody.
 */
@Injectable()
export class EldersService {
  private readonly logger = new Logger(EldersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The elder's details, for anybody in their chain or an administrator. */
  async detail(elderId: string, actorId: string, actorRole: Role): Promise<ElderDetail> {
    const elder = await this.requireVisibleElder(elderId, actorId, actorRole);
    return EldersService.toDetail(elder, actorRole === Role.CAREGIVER);
  }

  /**
   * A caregiver changing the elder's care level or registered home. Moving the home is
   * logged without the coordinates, for the same reason a stay is.
   */
  async update(
    elderId: string,
    actorId: string,
    actorRole: Role,
    dto: UpdateElderDto,
  ): Promise<ElderDetail> {
    await this.requireVisibleElder(elderId, actorId, actorRole);
    if (actorRole !== Role.CAREGIVER) {
      throw new ForbiddenException('Only a caregiver can change these details');
    }

    const updated = await this.prisma.user.update({
      where: { id: elderId },
      data: {
        ...(dto.careLevel !== undefined ? { careLevel: dto.careLevel } : {}),
        ...(dto.home
          ? {
              homeLatitude: new Prisma.Decimal(dto.home.latitude),
              homeLongitude: new Prisma.Decimal(dto.home.longitude),
              homeAddressLabel: dto.home.label,
            }
          : {}),
      },
    });

    if (dto.home) this.logger.log(`Home changed for elder ${elderId} by ${actorId}`);
    return EldersService.toDetail(updated, true);
  }

  async place(elderId: string, actorId: string, actorRole: Role): Promise<PlaceView> {
    const elder = await this.requireVisibleElder(elderId, actorId, actorRole);
    return EldersService.toView(elder);
  }

  async setPlace(
    elderId: string,
    actorId: string,
    actorRole: Role,
    dto: SetPlaceDto,
  ): Promise<PlaceView> {
    await this.requireVisibleElder(elderId, actorId, actorRole);

    const updated = await this.prisma.user.update({
      where: { id: elderId },
      data: {
        currentLatitude: new Prisma.Decimal(dto.latitude),
        currentLongitude: new Prisma.Decimal(dto.longitude),
        currentPlaceLabel: dto.label ?? null,
        currentPlaceSetAt: new Date(),
        currentPlaceSetById: actorId,
      },
    });

    // Logged without the coordinates. Knowing that a stay was recorded is operationally
    // useful; putting an elder's whereabouts into a log file is not.
    this.logger.log(`Stay away from home recorded for elder ${elderId} by ${actorId}`);
    return EldersService.toView(updated);
  }

  /** Back home. Clears the stay, so alerts are located at the registered home again. */
  async clearPlace(elderId: string, actorId: string, actorRole: Role): Promise<PlaceView> {
    await this.requireVisibleElder(elderId, actorId, actorRole);

    const updated = await this.prisma.user.update({
      where: { id: elderId },
      data: {
        currentLatitude: null,
        currentLongitude: null,
        currentPlaceLabel: null,
        currentPlaceSetAt: new Date(),
        currentPlaceSetById: actorId,
      },
    });

    this.logger.log(`Elder ${elderId} recorded as back home by ${actorId}`);
    return EldersService.toView(updated);
  }

  /**
   * An administrator may reach any elder; anybody else must be in that elder's care
   * circle. The same rule the alert projections use, so a caregiver cannot move an
   * elder they could not otherwise see.
   */
  private async requireVisibleElder(elderId: string, actorId: string, actorRole: Role) {
    const elder = await this.prisma.user.findUnique({ where: { id: elderId } });

    if (!elder || elder.role !== Role.ELDER) throw new NotFoundException('No such elder');
    if (actorRole === Role.ADMINISTRATOR) return elder;

    const assignment = await this.prisma.careAssignment.findFirst({
      where: { elderlyId: elderId, responderId: actorId },
      select: { id: true },
    });

    if (!assignment) {
      throw new ForbiddenException('You do not look after this person');
    }

    return elder;
  }

  private static toDetail(elder: User, canEdit: boolean): ElderDetail {
    const hasHome = elder.homeLatitude !== null && elder.homeLongitude !== null;
    return {
      id: elder.id,
      name: elder.name,
      phone: elder.phone,
      careLevel: elder.careLevel,
      home: hasHome
        ? {
            latitude: Number(elder.homeLatitude),
            longitude: Number(elder.homeLongitude),
            label: elder.homeAddressLabel,
          }
        : null,
      place: EldersService.toView(elder),
      canEdit,
    };
  }

  private static toView(elder: {
    id: string;
    currentLatitude: Prisma.Decimal | null;
    currentLongitude: Prisma.Decimal | null;
    currentPlaceLabel: string | null;
    currentPlaceSetAt: Date | null;
  }): PlaceView {
    const away = elder.currentLatitude !== null && elder.currentLongitude !== null;

    return {
      elderId: elder.id,
      isAtHome: !away,
      latitude: away ? Number(elder.currentLatitude) : null,
      longitude: away ? Number(elder.currentLongitude) : null,
      label: elder.currentPlaceLabel ?? null,
      setAt: elder.currentPlaceSetAt?.toISOString() ?? null,
    };
  }
}
