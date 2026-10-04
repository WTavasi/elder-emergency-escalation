import { HttpException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import { RateLimitGuard, type RateLimit } from './rate-limit.guard';
import type { RedisService } from '../../redis/redis.service';

interface PipelineMock {
  incr: jest.Mock;
  expire: jest.Mock;
  exec: jest.Mock;
}

const buildRedis = (count = 1, failing = false) => {
  const pipeline: PipelineMock = {
    incr: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: failing
      ? jest.fn().mockRejectedValue(new Error('redis is down'))
      : jest.fn().mockResolvedValue([[null, count]]),
  };

  return {
    service: { client: { pipeline: () => pipeline } } as unknown as RedisService,
    pipeline,
  };
};

const buildContext = (request: Record<string, unknown>): ExecutionContext =>
  ({
    getType: () => 'http',
    getHandler: () => ({ name: 'login' }),
    getClass: () => ({ name: 'AuthController' }),
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const DEFAULT_RULE: RateLimit = { limit: 10, windowSeconds: 300 };

/** Passing null means the route declares no limit at all. */
const build = (
  redis: RedisService,
  rule: RateLimit | null = DEFAULT_RULE,
  enabled = true,
): RateLimitGuard =>
  new RateLimitGuard(
    { getAllAndOverride: () => rule ?? undefined } as unknown as Reflector,
    redis,
    {
      get: (_key: string, fallback: unknown) => (enabled ? fallback : false),
    } as unknown as ConfigService,
  );

const request = (extra: Record<string, unknown> = {}) => ({
  method: 'POST',
  headers: {},
  ip: '203.0.113.9',
  ...extra,
});

describe('RateLimitGuard', () => {
  it('lets a route with no declared limit through untouched', async () => {
    const { service, pipeline } = buildRedis();

    await expect(build(service, null).canActivate(buildContext(request()))).resolves.toBe(true);
    expect(pipeline.incr).not.toHaveBeenCalled();
  });

  it('allows the last request inside the window', async () => {
    const { service } = buildRedis(10);

    await expect(
      build(service, { limit: 10, windowSeconds: 300 }).canActivate(buildContext(request())),
    ).resolves.toBe(true);
  });

  it('refuses the first request past it', async () => {
    const { service } = buildRedis(11);

    await expect(
      build(service, { limit: 10, windowSeconds: 300 }).canActivate(buildContext(request())),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('sets the expiry only when the counter is new, so a window cannot be extended', async () => {
    const { service, pipeline } = buildRedis();
    await build(service).canActivate(buildContext(request()));

    // NX means "only if it has no expiry". Without it every request would push the
    // window forward and the limit would never reset.
    expect(pipeline.expire).toHaveBeenCalledWith(expect.any(String), 300, 'NX');
  });

  it('counts a signed-in caller by identity, not by address', async () => {
    const { service, pipeline } = buildRedis();
    await build(service).canActivate(buildContext(request({ user: { userId: 'user-7' } })));

    expect(pipeline.incr).toHaveBeenCalledWith(expect.stringContaining('user:user-7'));
  });

  it('counts an anonymous caller by address, because that is all there is', async () => {
    const { service, pipeline } = buildRedis();
    await build(service).canActivate(buildContext(request()));

    expect(pipeline.incr).toHaveBeenCalledWith(expect.stringContaining('ip:203.0.113.9'));
  });

  it('counts each route separately, so sign-ins and alerts do not share an allowance', async () => {
    const { service, pipeline } = buildRedis();
    await build(service).canActivate(buildContext(request()));

    expect(pipeline.incr).toHaveBeenCalledWith(expect.stringContaining('AuthController.login'));
  });

  it('allows the request when Redis is unreachable rather than closing the front door', async () => {
    const { service } = buildRedis(1, true);

    // The limit is a mitigation, not the access control. Refusing every sign-in
    // because Redis is down would turn a degraded system into an unusable one.
    await expect(build(service).canActivate(buildContext(request()))).resolves.toBe(true);
  });

  it('can be switched off entirely, which the integration suite needs', async () => {
    const { service, pipeline } = buildRedis();

    await expect(
      build(service, { limit: 1, windowSeconds: 300 }, false).canActivate(buildContext(request())),
    ).resolves.toBe(true);
    expect(pipeline.incr).not.toHaveBeenCalled();
  });

  describe('addressOf', () => {
    it('takes the first entry of the forwarded header, which is the original caller', () => {
      expect(
        RateLimitGuard.addressOf({
          method: 'POST',
          headers: { 'x-forwarded-for': '198.51.100.4, 10.0.0.1' },
        }),
      ).toBe('198.51.100.4');
    });

    it('falls back to the socket when nothing was forwarded', () => {
      expect(RateLimitGuard.addressOf({ method: 'POST', headers: {}, ip: '203.0.113.9' })).toBe(
        '203.0.113.9',
      );
    });
  });
});
