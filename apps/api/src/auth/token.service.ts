import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Role } from '@prisma/client';
import { toSeconds } from '../common/duration';

export interface AccessPayload {
  sub: string;
  role: Role;
  typ: 'access';
}

export interface RefreshPayload {
  sub: string;
  jti: string;
  typ: 'refresh';
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  signAccess(userId: string, role: Role): Promise<string> {
    const payload: AccessPayload = { sub: userId, role, typ: 'access' };
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: toSeconds(this.config.getOrThrow<string>('JWT_ACCESS_TTL')),
    });
  }

  async signRefresh(userId: string): Promise<{ token: string; jti: string }> {
    const jti = randomUUID();
    const payload: RefreshPayload = { sub: userId, jti, typ: 'refresh' };
    const token = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: toSeconds(this.config.getOrThrow<string>('JWT_REFRESH_TTL')),
    });
    return { token, jti };
  }

  async verifyAccess(token: string): Promise<AccessPayload> {
    const payload = await this.verify<AccessPayload>(token, 'JWT_ACCESS_SECRET');
    // Without this check a refresh token would be accepted as an access token, since
    // both are signed JWTs carrying a subject.
    if (payload.typ !== 'access') throw new UnauthorizedException('Wrong token type');
    return payload;
  }

  async verifyRefresh(token: string): Promise<RefreshPayload> {
    const payload = await this.verify<RefreshPayload>(token, 'JWT_REFRESH_SECRET');
    if (payload.typ !== 'refresh') throw new UnauthorizedException('Wrong token type');
    return payload;
  }

  private async verify<T extends object>(token: string, secretKey: string): Promise<T> {
    try {
      return await this.jwt.verifyAsync<T>(token, {
        secret: this.config.getOrThrow<string>(secretKey),
      });
    } catch {
      // Never report why: expired, malformed and wrong-signature are all one answer.
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
