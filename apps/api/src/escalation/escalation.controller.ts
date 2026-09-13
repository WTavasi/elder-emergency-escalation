import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { EmergencyEvent } from '@prisma/client';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { AcknowledgeDto } from './dto/acknowledge.dto';
import { ResolveDto } from './dto/resolve.dto';
import { EscalationService } from './escalation.service';

@Controller('alerts')
export class EscalationController {
  constructor(private readonly escalation: EscalationService) {}

  /** Take ownership. Stops the chain from climbing any further. */
  @HttpCode(HttpStatus.OK)
  @Post(':id/acknowledge')
  acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AcknowledgeDto,
  ): Promise<EmergencyEvent> {
    const location =
      dto.latitude !== undefined && dto.longitude !== undefined
        ? { latitude: dto.latitude, longitude: dto.longitude }
        : undefined;

    return this.escalation.acknowledge(id, user.userId, location);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/resolve')
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ResolveDto,
  ): Promise<EmergencyEvent> {
    return this.escalation.resolve(id, user.userId, dto.outcome);
  }

  /** Call in the emergency responder now, superseding the automatic chain. */
  @HttpCode(HttpStatus.ACCEPTED)
  @Post(':id/request-responder')
  requestResponder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.escalation.requestResponder(id, user.userId);
  }
}
