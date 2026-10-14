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
  Res,
} from '@nestjs/common';
import { Role, type EmergencyEvent } from '@prisma/client';
import type { AlertDetail, AlertSummary } from '../views/alert-views';
import { AlertsService } from '../services/alerts.service';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CreateAlertDto } from '../validation/create-alert.dto';
import { ReopenAlertDto } from '../validation/reopen-alert.dto';
import { ListAlertsDto } from '../validation/list-alerts.dto';
import { Throttle } from '../../../shared/middleware/rate-limit.guard';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  /** The panic button. Only the person being cared for can raise their own alert. */
  @Roles(Role.ELDER)
  // Deliberately generous. This is the panic button, and the cost of refusing a real
  // emergency is not comparable to the cost of accepting a duplicate one. The limit
  // exists only to stop a compromised account filling the database, and is set far
  // above anything a frightened person pressing repeatedly would reach.
  @Throttle(30, 60)
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
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAlertsDto,
    // Only the one method used, so no HTTP framework types are needed for it.
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): unknown },
  ): Promise<AlertSummary[]> {
    const filters = {
      onlyOpen: query.open,
      states: query.state,
      severities: query.severity,
      elderId: query.elderId,
      from: query.from,
      to: query.to,
      limit: query.limit,
      cursor: query.cursor,
      q: query.q,
      offset: query.offset,
    };
    const [rows, total] = await Promise.all([
      this.alerts.findForUser(user.userId, user.role, filters),
      this.alerts.countForUser(user.userId, user.role, filters),
    ]);
    // The total travels in a header so the body stays the plain list the app already
    // reads; a client that wants numbered pages reads the header, and one that does not
    // never notices it.
    response.setHeader('X-Total-Count', String(total));
    return rows;
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
