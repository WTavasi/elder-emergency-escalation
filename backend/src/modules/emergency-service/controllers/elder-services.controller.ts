import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../shared/decorators/current-user.decorator';
import { StationDispatchService, type RankedStation } from '../services/station-dispatch.service';

/** The emergency services near one elder's home, as the elder and their circle see them. */
export interface ElderServices {
  /** False when the elder has no home recorded, so nothing can be measured. */
  hasHome: boolean;
  /** The nearest of each service, the default responder first. */
  services: RankedStation[];
}

/**
 * Who can come to an elder besides their circle: the nearest emergency responder, who is
 * asked by default when the circle does not answer, and the nearest ambulance, police and
 * fire service, asked when what is happening needs them. For the elder, everybody in
 * their circle, and an administrator.
 */
@Controller('elders')
export class ElderServicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stations: StationDispatchService,
  ) {}

  @Get(':id/services')
  async services(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ElderServices> {
    const elder = await this.prisma.user.findUnique({
      where: { id },
      select: { role: true, homeLatitude: true, homeLongitude: true },
    });
    if (!elder || elder.role !== Role.ELDER) {
      throw new NotFoundException("We couldn't find this person.");
    }
    if (user.userId !== id && user.role !== Role.ADMINISTRATOR) {
      const inCircle = await this.prisma.careAssignment.findFirst({
        where: { elderlyId: id, responderId: user.userId },
        select: { elderlyId: true },
      });
      if (!inCircle) throw new ForbiddenException("You're not in this person's care circle.");
    }
    if (elder.homeLatitude === null || elder.homeLongitude === null) {
      return { hasHome: false, services: [] };
    }
    return {
      hasHome: true,
      services: await this.stations.nearestEach({
        latitude: Number(elder.homeLatitude),
        longitude: Number(elder.homeLongitude),
      }),
    };
  }
}
