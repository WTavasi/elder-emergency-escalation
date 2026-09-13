import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthReport, HealthService } from './health.service';

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
