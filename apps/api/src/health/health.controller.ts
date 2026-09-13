import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { HealthReport, HealthService } from './health.service';

// The platform health check has no credentials, so this one route is unauthenticated.
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Reports each dependency separately, because "the API is up" and "alerts can
   * actually be stored and escalated" are different claims. Returns 503 when either
   * dependency is down, so a platform health check treats it as unhealthy.
   */
  @Get()
  async check(): Promise<HealthReport> {
    const report = await this.health.check();
    if (report.status !== 'ok') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
