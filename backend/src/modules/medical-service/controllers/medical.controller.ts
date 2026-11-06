import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
  MedicalProfileService,
  type AlertMedical,
  type MedicalProfilePage,
} from '../services/medical-profile.service';
import { MedicalProfileDto } from '../validation/medical-profile.dto';

/** An elder's medical details, for the elder and their caregivers. */
@Controller('elders')
export class ElderMedicalController {
  constructor(private readonly medical: MedicalProfileService) {}

  @Roles(Role.ELDER, Role.CAREGIVER)
  @Get(':id/medical')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MedicalProfilePage> {
    return this.medical.forElder(id, user.userId);
  }

  @Roles(Role.ELDER, Role.CAREGIVER)
  @Throttle(30, 3600)
  @Put(':id/medical')
  save(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MedicalProfileDto,
  ): Promise<MedicalProfilePage> {
    return this.medical.save(id, user.userId, dto);
  }

  /**
   * A caregiver saying the elder cannot decide about their medical details and that they
   * act for them, so the details are shared with those asked during an emergency.
   */
  @Roles(Role.CAREGIVER)
  @Throttle(10, 3600)
  @Post(':id/medical/guardian')
  @HttpCode(200)
  declareGuardian(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MedicalProfilePage> {
    return this.medical.declareGuardian(id, user.userId);
  }

  /** The elder, or any caregiver, taking that back. The details stay. */
  @Roles(Role.ELDER, Role.CAREGIVER)
  @Throttle(10, 3600)
  @Delete(':id/medical/guardian')
  endGuardian(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MedicalProfilePage> {
    return this.medical.endGuardian(id, user.userId);
  }
}

/** The elder's medical details on an alert, for the people asked to help. */
@Controller('alerts')
export class AlertMedicalController {
  constructor(private readonly medical: MedicalProfileService) {}

  @Roles(Role.ELDER, Role.CAREGIVER, Role.FAMILY_MEMBER, Role.EMERGENCY_RESPONDER)
  @Get(':id/medical')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AlertMedical> {
    return this.medical.forAlert(id, user.userId, user.role);
  }

  /** Who opened them during the alert, and on whose word they are shared. Never what they say. */
  @Roles(Role.ADMINISTRATOR)
  @Get(':id/medical/views')
  views(
    @Param('id', ParseUUIDPipe) id: string,
  ): ReturnType<MedicalProfileService['viewsForAlert']> {
    return this.medical.viewsForAlert(id);
  }
}
