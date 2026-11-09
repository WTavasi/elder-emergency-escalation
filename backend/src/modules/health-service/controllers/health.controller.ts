import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Public } from '../../../shared/decorators/public.decorator';
import { HealthReport, HealthService } from '../services/health.service';

/** The one thing used from the response: setting its status code. */
interface StatusResponse {
  status(code: number): unknown;
}

// The platform health check has no credentials, so this one route is unauthenticated.
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Reports each dependency separately, because "the API is up" and "alerts can
   * actually be stored and escalated" are different claims. Returns 503 when either
   * dependency is down, so a platform health check treats it as unhealthy, with the
   * same report as the body, so the console can say which one is down. (Thrown as an
   * exception, the report would be replaced by the generic error the filter writes.)
   */
  @Get()
  async check(@Res({ passthrough: true }) response: StatusResponse): Promise<HealthReport> {
    const report = await this.health.check();
    if (report.status !== 'ok') response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
