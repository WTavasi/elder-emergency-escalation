import { Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../shared/decorators/current-user.decorator';
import { Throttle } from '../../../shared/middleware/rate-limit.guard';
import { VoiceService, type VoiceAccess } from '../services/voice.service';

@Controller('alerts')
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  /**
   * A token to join this emergency's voice room. The elder's phone asks once somebody
   * has started talking; a responder's when they press "Talk to Grace". Generous,
   * because a dropped connection rejoins.
   */
  @Throttle(20, 60)
  @HttpCode(HttpStatus.OK)
  @Post(':id/voice')
  join(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VoiceAccess> {
    return this.voice.join(id, user.userId);
  }
}
