import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Public } from '../../../shared/decorators/public.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import type { OutboxText } from '../../notification-service/providers/dev-outbox';
import { DevToolsService } from '../services/dev-tools.service';

/**
 * Help for testing on one machine, so the Postman collection runs from start to finish
 * without anybody copying a code out of the terminal. Answers 404, as if it were not
 * there, in production and whenever texts are really sent.
 */
@Controller('dev')
export class DevToolsController {
  constructor(private readonly tools: DevToolsService) {}

  /** The texts the logging provider printed for one number, newest first. */
  @Roles(Role.ADMINISTRATOR)
  @Get('texts')
  texts(@Query('to') to?: string): OutboxText[] {
    this.ensureEnabled();
    if (!to) throw new BadRequestException('Say whose texts: ?to=+254…');
    return this.tools.texts(to.trim());
  }

  /**
   * Starts the sign-in and code limits again from zero, as `npm run dev:clear-limits`
   * does. Open, because a run that has reached the sign-in limit cannot sign in to ask.
   */
  @Public()
  @Post('clear-limits')
  @HttpCode(200)
  async clearLimits(): Promise<{ cleared: number }> {
    this.ensureEnabled();
    return { cleared: await this.tools.clearLimits() };
  }

  private ensureEnabled(): void {
    if (!this.tools.enabled) throw new NotFoundException();
  }
}
