import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
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

  /** Who opened them during the alert. Never what they say. */
  @Roles(Role.ADMINISTRATOR)
  @Get(':id/medical/views')
  async views(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ views: { by: unknown; at: string }[] }> {
    return { views: await this.medical.viewsForAlert(id) };
  }
}
