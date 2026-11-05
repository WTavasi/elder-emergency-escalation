import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { Throttle } from '../../../shared/middleware/rate-limit.guard';
import {
  SpeechService,
  type SpeechHeard,
  type SpeechStatus,
  type SpokenAudio,
} from '../services/speech.service';

/** A minute of speech, compressed as the app records it, is well under this. */
const MAX_BYTES = 5 * 1024 * 1024;

/** The kinds of recording a phone makes. The speech server converts any of them. */
const AUDIO = /^(audio\/[\w.+-]+|application\/octet-stream)$/;

@Controller()
export class SpeechController {
  constructor(private readonly speech: SpeechService) {}

  /** Whether the microphone is offered: a speech server and the elder's consent. */
  @Roles(Role.ELDER)
  @Get('elders/:id/speech')
  status(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SpeechStatus> {
    return this.speech.status(id, user.userId);
  }

  /** What the elder said after pressing help, as a recording in the `audio` field. */
  @Roles(Role.ELDER)
  @Throttle(10, 600)
  @Post('alerts/:id/speech')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_BYTES, files: 1 } }))
  report(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() audio: SpokenAudio | undefined,
  ): Promise<SpeechHeard> {
    if (!audio || audio.size === 0) throw new BadRequestException('Send a recording.');
    if (!AUDIO.test(audio.mimetype)) throw new BadRequestException('Send a sound recording.');
    return this.speech.report(id, user.userId, audio);
  }
}
