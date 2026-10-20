import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../../shared/decorators/public.decorator';
import { Throttle } from '../../../shared/middleware/rate-limit.guard';
import { SmsRepliesService } from '../services/sms-replies.service';

/** Equal without saying how far apart, so the secret cannot be guessed a character at a time. */
function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string): Buffer => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/**
 * Where the SMS gateway delivers replies to alert texts.
 *
 * Public, because the gateway has no account here, and guarded instead by the secret in
 * the callback address. Without SMS_INBOUND_TOKEN set the route answers 404, exactly as
 * an address that does not exist, so it cannot be probed on a deployment that does not
 * use it.
 *
 * The body is read loosely on purpose. Africa's Talking posts a form with from, to,
 * text, date, id, linkId and networkCode, and may add fields; a strict body would turn
 * one new field into every reply being refused. Only from and text are used.
 *
 * It always answers 200 once the secret matches, whatever became of the reply. A
 * gateway that sees an error retries, and a retried "1" is a second confirmation text
 * to somebody already on their way.
 */
@Controller('sms')
export class SmsRepliesController {
  private readonly logger = new Logger(SmsRepliesController.name);

  constructor(
    private readonly replies: SmsRepliesService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  // Generous: every reply arrives from the gateway's few addresses, so this limits the
  // gateway as a whole, not a person. The per-phone limit is in the service.
  @Throttle(300, 60)
  @HttpCode(HttpStatus.OK)
  @Post('inbound')
  async inbound(
    @Query('token') token: string | undefined,
    @Body() body: Record<string, unknown>,
  ): Promise<{ received: true }> {
    const expected = this.config.get<string>('SMS_INBOUND_TOKEN');
    if (!expected || !token || !sameSecret(token, expected)) throw new NotFoundException();

    const from = typeof body?.from === 'string' ? body.from : '';
    const text = typeof body?.text === 'string' ? body.text : '';

    try {
      await this.replies.handle(from, text);
    } catch (error) {
      this.logger.error(
        `A text reply could not be handled: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
    return { received: true };
  }
}
