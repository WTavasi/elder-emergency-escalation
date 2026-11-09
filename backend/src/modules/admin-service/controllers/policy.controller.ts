import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Put,
} from '@nestjs/common';
import { Role, Severity } from '@prisma/client';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { Throttle } from '../../../shared/middleware/rate-limit.guard';
import { PolicyAdminService, type PolicyView } from '../services/policy-admin.service';
import {
  UpdateBandsDto,
  UpdateEscalationRuleDto,
  UpdateSeverityFactorDto,
} from '../validation/policy.dto';

/**
 * The escalation policy, for administrators: the rules, the severity weights and the
 * bands. Each change answers with the whole policy as it now stands.
 */
@Roles(Role.ADMINISTRATOR)
@Controller('admin/policy')
export class PolicyController {
  constructor(private readonly policy: PolicyAdminService) {}

  @Get()
  view(): Promise<PolicyView> {
    return this.policy.view();
  }

  @Throttle(60, 3600)
  @Patch('escalation-rules/:severity/:tier')
  updateRule(
    @Param('severity', new ParseEnumPipe(Severity)) severity: Severity,
    @Param('tier', ParseIntPipe) tier: number,
    @Body() dto: UpdateEscalationRuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PolicyView> {
    return this.policy.updateRule(severity, tier, dto, user.userId);
  }

  @Throttle(60, 3600)
  @Patch('severity-factors/:key')
  updateFactor(
    @Param('key') key: string,
    @Body() dto: UpdateSeverityFactorDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PolicyView> {
    return this.policy.updateFactor(key, dto, user.userId);
  }

  @Throttle(60, 3600)
  @Put('bands')
  updateBands(
    @Body() dto: UpdateBandsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PolicyView> {
    return this.policy.updateBands(dto, user.userId);
  }
}
