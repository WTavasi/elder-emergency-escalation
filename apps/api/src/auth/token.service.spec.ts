import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { TokenService } from './token.service';

const secrets: Record<string, string> = {
  JWT_ACCESS_SECRET: 'access-secret-that-is-long-enough-for-tests',
  JWT_REFRESH_SECRET: 'refresh-secret-that-is-long-enough-for-tests',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
};

const config = { getOrThrow: (key: string) => secrets[key] } as unknown as ConfigService;

describe('TokenService', () => {
  const service = new TokenService(new JwtService({}), config);

  it('round-trips an access token with the role in it', async () => {
    const token = await service.signAccess('user-1', Role.CAREGIVER);
    const payload = await service.verifyAccess(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe(Role.CAREGIVER);
    expect(payload.typ).toBe('access');
  });

  it('issues a unique identifier per refresh token', async () => {
    const first = await service.signRefresh('user-1');
    const second = await service.signRefresh('user-1');
    expect(first.jti).not.toBe(second.jti);
    expect((await service.verifyRefresh(first.token)).jti).toBe(first.jti);
  });

  it('refuses a refresh token presented as an access token', async () => {
    const { token } = await service.signRefresh('user-1');
    await expect(service.verifyAccess(token)).rejects.toThrow(UnauthorizedException);
  });

  it('refuses an access token presented as a refresh token', async () => {
    const token = await service.signAccess('user-1', Role.ELDER);
    await expect(service.verifyRefresh(token)).rejects.toThrow(UnauthorizedException);
  });

  it('refuses a tampered or foreign token without saying why', async () => {
    const token = await service.signAccess('user-1', Role.ELDER);
    await expect(service.verifyAccess(`${token}x`)).rejects.toThrow('Invalid or expired token');
    await expect(service.verifyAccess('nonsense')).rejects.toThrow('Invalid or expired token');

    const foreign = await new JwtService({}).signAsync(
      { sub: 'user-1', typ: 'access' },
      { secret: 'a-completely-different-signing-secret' },
    );
    await expect(service.verifyAccess(foreign)).rejects.toThrow('Invalid or expired token');
  });

  it('rejects an expired token', async () => {
    const expired = await new JwtService({}).signAsync(
      { sub: 'user-1', role: Role.ELDER, typ: 'access' },
      { secret: secrets.JWT_ACCESS_SECRET, expiresIn: '-1s' },
    );
    await expect(service.verifyAccess(expired)).rejects.toThrow(UnauthorizedException);
  });
});
