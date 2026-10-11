import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { Throttle } from '../../../shared/middleware/rate-limit.guard';
import { AddChainMemberDto } from '../validation/add-chain-member.dto';
import { AddressSearchDto } from '../validation/address-search.dto';
import { CreateElderDto } from '../validation/create-elder.dto';
import { AddressSearchService, type AddressSearchResult } from '../services/address-search.service';
import { ChainService, type ChainView, type ElderSummary } from '../services/chain.service';
import { SetPlaceDto } from '../validation/set-place.dto';
import { EldersService, type PlaceView } from '../services/elders.service';

/**
 * Where an elder is staying.
 *
 * An elder cannot change this about themselves, which is deliberate: the control exists
 * so that somebody who knows a stay is happening can record it, and an elder in the
 * middle of an emergency should never be asked where they are.
 */
@Controller('elders')
export class EldersController {
  constructor(
    private readonly elders: EldersService,
    private readonly chains: ChainService,
    private readonly addresses: AddressSearchService,
  ) {}

  /** The elders the caller looks after. */
  @Roles(Role.CAREGIVER, Role.FAMILY_MEMBER)
  @Get()
  mine(@CurrentUser() user: AuthenticatedUser): Promise<ElderSummary[]> {
    return this.chains.myElders(user.userId, user.role);
  }

  /** A caregiver registers an elder and becomes first in their chain. */
  @Roles(Role.CAREGIVER)
  @Throttle(10, 3600)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateElderDto,
  ): Promise<ElderSummary> {
    return this.chains.createElder(user.userId, dto);
  }

  /**
   * Finds coordinates for an address, for setting a home. Searched when the person
   * presses Search, never as they type, and limited per person, because the public
   * geocoder behind it allows one request a second for everyone together.
   */
  @Roles(Role.CAREGIVER, Role.FAMILY_MEMBER, Role.ADMINISTRATOR)
  @Throttle(20, 300)
  @Get('address-search')
  searchAddress(@Query() query: AddressSearchDto): Promise<AddressSearchResult> {
    return this.addresses.search(query.q);
  }

  @Roles(Role.CAREGIVER, Role.FAMILY_MEMBER, Role.ADMINISTRATOR)
  @Get(':id/chain')
  chain(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChainView> {
    return this.chains.chain(id, user.userId, user.role);
  }

  /** Adds a family member by phone, now or when that number signs up. */
  @Roles(Role.CAREGIVER)
  @Throttle(20, 3600)
  @Post(':id/chain')
  addToChain(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddChainMemberDto,
  ): Promise<ChainView> {
    return this.chains.addMember(id, user.userId, user.role, dto);
  }

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
