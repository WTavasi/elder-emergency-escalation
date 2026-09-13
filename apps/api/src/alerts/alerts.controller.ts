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
import { AlertsService } from './alerts.service';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateAlertDto } from './dto/create-alert.dto';
import { ReopenAlertDto } from './dto/reopen-alert.dto';

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

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('open') open?: string,
  ): Promise<EmergencyEvent[]> {
    return this.alerts.findForUser(user.userId, user.role, open === 'true');
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmergencyEvent> {
    return this.alerts.findOne(id, user.userId, user.role);
  }
}
