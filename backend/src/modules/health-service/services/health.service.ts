import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../db/prisma.service';
import { RedisService } from '../../../shared/redis/redis.service';

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

/**
 * How long a dependency may take to answer before it counts as down. A Redis client that
 * has lost its server queues commands rather than failing them, so without a limit the
 * health check itself would hang, and whatever is watching it would hear nothing at all.
 */
export const PROBE_TIMEOUT_MS = 2_000;

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

  private async time(
    probe: () => Promise<unknown>,
    timeoutMs = PROBE_TIMEOUT_MS,
  ): Promise<DependencyCheck> {
    const started = Date.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        probe(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const late = new Error(`no answer within ${timeoutMs} ms`);
            late.name = 'TimeoutError';
            reject(late);
          }, timeoutMs);
        }),
      ]);
      return { status: 'up', latencyMs: Date.now() - started };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - started,
        // A connection error can carry the whole URL, credentials included.
        error: error instanceof Error ? error.name : 'unknown error',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
