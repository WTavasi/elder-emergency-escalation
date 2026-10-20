import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { EmergencyEvent } from '@prisma/client';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../shared/decorators/current-user.decorator';
import { Throttle } from '../../../shared/middleware/rate-limit.guard';
import { JourneyService, type PositionResult } from '../services/journey.service';
import { PositionDto } from '../validation/position.dto';

@Controller('alerts')
export class JourneyController {
  constructor(private readonly journeys: JourneyService) {}

  /**
   * Where the person on their way is now. Sent every 10 to 15 seconds by their phone,
   * only after they turned on "Share my way there" and took this emergency on. The
   * limit allows one every five seconds, comfortably above what the app sends.
   */
  @Throttle(12, 60)
  @HttpCode(HttpStatus.OK)
  @Post(':id/position')
  position(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PositionDto,
  ): Promise<PositionResult> {
    return this.journeys.report(id, user.userId, dto);
  }

  /** "I'm here." The person who took it on is with the elder. */
  @HttpCode(HttpStatus.OK)
  @Post(':id/arrived')
  arrived(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmergencyEvent> {
    return this.journeys.arrive(id, user.userId, 'manual');
  }
}
