import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { UpdateElderDto } from '../validation/update-elder.dto';
import { AddressSearchService, type AddressSearchResult } from '../services/address-search.service';
import { ChainService, type ChainView, type ElderSummary } from '../services/chain.service';
import { SetPlaceDto } from '../validation/set-place.dto';
import { EldersService, type ElderDetail, type PlaceView } from '../services/elders.service';
import { ConsentService, type ConsentView } from '../services/consent.service';
import { GrantConsentDto, WithdrawConsentDto } from '../validation/withdraw-consent.dto';

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
    private readonly consents: ConsentService,
  ) {}

  /** What has been agreed about an elder, by whom, and what has been withdrawn. */
  @Roles(Role.ELDER, Role.CAREGIVER, Role.FAMILY_MEMBER, Role.ADMINISTRATOR)
  @Get(':id/consent')
  consent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ConsentView> {
    return this.consents.view(id, user.userId, user.role);
  }

  /** The elder confirming, for themselves, what was agreed on their behalf. */
  @Roles(Role.ELDER)
  @Post(':id/consent/confirm')
  confirmConsent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ConsentView> {
    return this.consents.confirm(id, user.userId);
  }

  /** The elder, or a caregiver in their chain, giving one consent after registration. */
  @Roles(Role.ELDER, Role.CAREGIVER)
  @Throttle(20, 3600)
  @Post(':id/consent/grant')
  grantConsent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GrantConsentDto,
  ): Promise<ConsentView> {
    return this.consents.grant(id, user.userId, user.role, dto.type);
  }

  /** The elder, or a caregiver in their chain, withdrawing one consent. */
  @Roles(Role.ELDER, Role.CAREGIVER)
  @Throttle(20, 3600)
  @Post(':id/consent/withdraw')
  withdrawConsent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: WithdrawConsentDto,
  ): Promise<ConsentView> {
    return this.consents.withdraw(id, user.userId, user.role, dto.type, dto.confirm === true);
  }

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
  @Roles(Role.CAREGIVER, Role.FAMILY_MEMBER, Role.ADMINISTRATOR, Role.COMMUNITY_RESPONDER)
  @Throttle(20, 300)
  @Get('address-search')
  searchAddress(@Query() query: AddressSearchDto): Promise<AddressSearchResult> {
    return this.addresses.search(query.q);
  }

  /** One elder: details, home and where they are now. */
  @Roles(Role.CAREGIVER, Role.FAMILY_MEMBER, Role.ADMINISTRATOR)
  @Get(':id')
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ElderDetail> {
    return this.elders.detail(id, user.userId, user.role);
  }

  /** A caregiver changing the elder's care level or registered home. */
  @Roles(Role.CAREGIVER)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateElderDto,
  ): Promise<ElderDetail> {
    return this.elders.update(id, user.userId, user.role, dto);
  }

  @Roles(Role.CAREGIVER, Role.FAMILY_MEMBER, Role.ADMINISTRATOR)
  @Get(':id/chain')
  chain(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChainView> {
    return this.chains.chain(id, user.userId, user.role);
  }

  /** Takes a person, or a held place, out of the chain. */
  @Roles(Role.CAREGIVER)
  @Delete(':id/chain/:entryId')
  removeFromChain(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChainView> {
    return this.chains.removeEntry(id, entryId, user.userId, user.role);
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
