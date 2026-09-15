import { Controller, Get, ParseIntPipe, Query, DefaultValuePipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';
import type { DashboardOverview } from './dashboard.types';

/**
 * Aggregate figures across every elder, so administrator only.
 *
 * A caregiver's own numbers would be a different endpoint with a different scope; this
 * one deliberately has none, which is why the role is enforced rather than the result
 * being filtered.
 */
@Roles(Role.ADMINISTRATOR)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  overview(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ): Promise<DashboardOverview> {
    return this.dashboard.overview(Math.min(Math.max(days, 1), 365));
  }
}
