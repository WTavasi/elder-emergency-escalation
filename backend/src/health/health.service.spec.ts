import { HealthService } from './health.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

describe('HealthService', () => {
  const buildService = (prismaOk: boolean, redisOk: boolean): HealthService => {
    const prisma = {
      ping: prismaOk
        ? jest.fn().mockResolvedValue(undefined)
        : jest.fn().mockRejectedValue(new Error('no db')),
    } as unknown as PrismaService;
    const redis = {
      ping: redisOk
        ? jest.fn().mockResolvedValue('PONG')
        : jest.fn().mockRejectedValue(new Error('no redis')),
    } as unknown as RedisService;
    return new HealthService(prisma, redis);
  };

  it('reports ok when both dependencies answer', async () => {
    const report = await buildService(true, true).check();
    expect(report.status).toBe('ok');
    expect(report.checks.postgres.status).toBe('up');
    expect(report.checks.redis.status).toBe('up');
  });

  it('reports degraded and names the failing dependency', async () => {
    const report = await buildService(true, false).check();
    expect(report.status).toBe('degraded');
    expect(report.checks.postgres.status).toBe('up');
    expect(report.checks.redis.status).toBe('down');
  });

  it('never leaks a connection string through an error', async () => {
    const prisma = {
      ping: jest
        .fn()
        .mockRejectedValue(new Error('connect failed: postgresql://user:password@host/db')),
    } as unknown as PrismaService;
    const redis = { ping: jest.fn().mockResolvedValue('PONG') } as unknown as RedisService;

    const report = await new HealthService(prisma, redis).check();
    expect(report.checks.postgres.error).toBe('Error');
    expect(JSON.stringify(report)).not.toContain('password');
  });
});
