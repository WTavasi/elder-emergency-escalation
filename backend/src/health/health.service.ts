import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface DependencyCheck {
  status: 'up' | 'down';
  latencyMs: number;
  error?: string;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  checks: {
    postgres: DependencyCheck;
    redis: DependencyCheck;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthReport> {
    const [postgres, redis] = await Promise.all([
      this.time(() => this.prisma.ping()),
      this.time(() => this.redis.ping()),
    ]);

    return {
      status: postgres.status === 'up' && redis.status === 'up' ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      checks: { postgres, redis },
    };
  }

  private async time(probe: () => Promise<unknown>): Promise<DependencyCheck> {
    const started = Date.now();
    try {
      await probe();
      return { status: 'up', latencyMs: Date.now() - started };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - started,
        // A connection error can carry the whole URL, credentials included.
        error: error instanceof Error ? error.name : 'unknown error',
      };
    }
  }
}
