import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SetPlaceDto } from './dto/set-place.dto';
import { EldersService, type PlaceView } from './elders.service';

/**
 * Where an elder is staying.
 *
 * An elder cannot change this about themselves, which is deliberate: the control exists
 * so that somebody who knows a stay is happening can record it, and an elder in the
 * middle of an emergency should never be asked where they are.
 */
@Controller('elders')
export class EldersController {
  constructor(private readonly elders: EldersService) {}

  @Roles(Role.CAREGIVER, Role.FAMILY_MEMBER, Role.ADMINISTRATOR)
  @Get(':id/place')
  place(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PlaceView> {
    return this.elders.place(id, user.userId, user.role);
  }

  /** Record a stay away from home. Idempotent, so sending it twice is harmless. */
  @Roles(Role.CAREGIVER, Role.FAMILY_MEMBER, Role.ADMINISTRATOR)
  @Put(':id/place')
  setPlace(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetPlaceDto,
  ): Promise<PlaceView> {
    return this.elders.setPlace(id, user.userId, user.role, dto);
  }

  /** Back home. */
  @Roles(Role.CAREGIVER, Role.FAMILY_MEMBER, Role.ADMINISTRATOR)
  @Delete(':id/place')
  clearPlace(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PlaceView> {
    return this.elders.clearPlace(id, user.userId, user.role);
  }
}
