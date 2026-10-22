import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { Throttle } from '../../../shared/middleware/rate-limit.guard';
import {
  CheckInsService,
  type AnswerOutcome,
  type CheckInsOverview,
  type ElderCheckIns,
} from '../services/check-ins.service';
import { ConfirmCheckInsDto, SetCheckInsDto } from '../validation/set-check-ins.dto';

@Controller()
export class CheckInsController {
  constructor(private readonly checkIns: CheckInsService) {}

  /** An elder's check-in set-up and the last week of answers, for the elder and their circle. */
  @Roles(Role.ELDER, Role.CAREGIVER, Role.FAMILY_MEMBER, Role.ADMINISTRATOR)
  @Get('elders/:id/check-ins')
  overview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CheckInsOverview> {
    return this.checkIns.overview(id, user.userId, user.role);
  }

  /** Set it up, change it, or turn it off. Somebody else's set-up waits for the elder. */
  @Roles(Role.ELDER, Role.CAREGIVER, Role.FAMILY_MEMBER)
  @Throttle(30, 3600)
  @Put('elders/:id/check-ins')
  set(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetCheckInsDto,
  ): Promise<CheckInsOverview> {
    return this.checkIns.setSchedule(id, user.userId, user.role, dto);
  }

  /** The elder agreeing, or not, to a set-up somebody else made. */
  @Roles(Role.ELDER)
  @HttpCode(HttpStatus.OK)
  @Post('elders/:id/check-ins/confirm')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmCheckInsDto,
  ): Promise<ElderCheckIns> {
    return this.checkIns.confirm(id, user.userId, dto.agree);
  }

  /** The elder's own phone: a check-in to answer, and a set-up to agree to. */
  @Roles(Role.ELDER)
  @Get('check-ins/mine')
  mine(@CurrentUser() user: AuthenticatedUser): Promise<ElderCheckIns> {
    return this.checkIns.forElder(user.userId);
  }

  /** "I am all right." */
  @Roles(Role.ELDER)
  @HttpCode(HttpStatus.OK)
  @Post('check-ins/answer')
  async answer(@CurrentUser() user: AuthenticatedUser): Promise<{ outcome: AnswerOutcome }> {
    return { outcome: await this.checkIns.answer(user.userId, 'app') };
  }
}
