import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Role, type EmergencyEvent } from '@prisma/client';
import type { AlertDetail, AlertSummary } from './alert-views';
import { AlertsService } from './alerts.service';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateAlertDto } from './dto/create-alert.dto';
import { ReopenAlertDto } from './dto/reopen-alert.dto';
import { ListAlertsDto } from './dto/list-alerts.dto';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  /** The panic button. Only the person being cared for can raise their own alert. */
  @Roles(Role.ELDER)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAlertDto,
  ): Promise<EmergencyEvent> {
    return this.alerts.create(user.userId, dto);
  }

  @Roles(Role.ELDER)
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmergencyEvent> {
    return this.alerts.cancel(id, user.userId);
  }

  /** Any member of the elder's care chain, for a cancellation nobody could confirm. */
  @HttpCode(HttpStatus.OK)
  @Post(':id/reopen')
  reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReopenAlertDto,
  ): Promise<EmergencyEvent> {
    return this.alerts.reopen(id, user.userId, dto.reason);
  }

  /**
   * The history view. Scoped to the caller's own care relationships, so the same
   * endpoint serves a family member's short list and an administrator's whole table
   * without either of them naming a scope the API would then have to police.
   */
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAlertsDto,
  ): Promise<AlertSummary[]> {
    return this.alerts.findForUser(user.userId, user.role, {
      onlyOpen: query.open,
      states: query.state,
      severities: query.severity,
      elderId: query.elderId,
      from: query.from,
      to: query.to,
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  /** One emergency with its chain, its audit trail and every delivery attempt. */
  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AlertDetail> {
    return this.alerts.findOne(id, user.userId, user.role);
  }
}
