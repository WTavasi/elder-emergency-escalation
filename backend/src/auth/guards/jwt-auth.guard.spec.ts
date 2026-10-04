import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenService } from '../token.service';

const secrets: Record<string, string> = {
  JWT_ACCESS_SECRET: 'access-secret-that-is-long-enough-for-tests',
  JWT_REFRESH_SECRET: 'refresh-secret-that-is-long-enough-for-tests',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
};

const tokens = new TokenService(new JwtService({}), {
  getOrThrow: (key: string) => secrets[key],
} as unknown as ConfigService);

interface FakeRequest {
  headers: Record<string, string | undefined>;
  user?: { userId: string; role: Role };
}

const contextFor = (request: FakeRequest): ExecutionContext =>
  ({
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const buildGuard = (isPublic: boolean): JwtAuthGuard => {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);
  return new JwtAuthGuard(tokens, reflector);
};

describe('JwtAuthGuard', () => {
  it('lets a public route through without a token', async () => {
    await expect(buildGuard(true).canActivate(contextFor({ headers: {} }))).resolves.toBe(true);
  });

  it('attaches the user to the request for a valid token', async () => {
    const token = await tokens.signAccess('user-1', Role.EMERGENCY_RESPONDER);
    const request: FakeRequest = { headers: { authorization: `Bearer ${token}` } };

    await expect(buildGuard(false).canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({ userId: 'user-1', role: Role.EMERGENCY_RESPONDER });
  });

  it('refuses a missing or malformed authorization header', async () => {
    const guard = buildGuard(false);
    for (const authorization of [undefined, '', 'Token abc', 'bearer abc', 'Bearer']) {
      await expect(guard.canActivate(contextFor({ headers: { authorization } }))).rejects.toThrow(
        UnauthorizedException,
      );
    }
  });

  it('refuses a refresh token presented as a bearer token', async () => {
    const { token } = await tokens.signRefresh('user-1');
    await expect(
      buildGuard(false).canActivate(contextFor({ headers: { authorization: `Bearer ${token}` } })),
    ).rejects.toThrow(UnauthorizedException);
  });
});
