import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import { toSeconds } from '../../../shared/utils/duration';

export interface AccessPayload {
  sub: string;
  role: Role;
  typ: 'access';
  /** The device session it belongs to. Absent on tokens issued before devices existed. */
  sid?: string;
}

export interface RefreshPayload {
  sub: string;
  jti: string;
  typ: 'refresh';
  /** The device session it belongs to. Absent on tokens issued before devices existed. */
  sid?: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  signAccess(userId: string, role: Role, sid?: string): Promise<string> {
    const payload: AccessPayload = { sub: userId, role, typ: 'access', ...(sid ? { sid } : {}) };
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: toSeconds(this.config.getOrThrow<string>('JWT_ACCESS_TTL')),
    });
  }

  /**
   * An elder's refresh token lasts far longer than anybody else's (JWT_REFRESH_TTL_ELDER),
   * so the panic button is never behind a sign-in screen after a quiet month.
   */
  async signRefresh(
    userId: string,
    role?: Role,
    sid?: string,
  ): Promise<{ token: string; jti: string }> {
    const jti = randomUUID();
    const payload: RefreshPayload = { sub: userId, jti, typ: 'refresh', ...(sid ? { sid } : {}) };
    const lifetime =
      role === Role.ELDER
        ? this.config.get<string>('JWT_REFRESH_TTL_ELDER', '3650d')
        : this.config.getOrThrow<string>('JWT_REFRESH_TTL');
    const token = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: toSeconds(lifetime),
    });
    return { token, jti };
  }

  async verifyAccess(token: string): Promise<AccessPayload> {
    const payload = await this.verify<AccessPayload>(token, 'JWT_ACCESS_SECRET');
    // Without this check a refresh token would be accepted as an access token, since
    // both are signed JWTs carrying a subject.
    if (payload.typ !== 'access') throw new UnauthorizedException('Please sign in again.');
    return payload;
  }

  async verifyRefresh(token: string): Promise<RefreshPayload> {
    const payload = await this.verify<RefreshPayload>(token, 'JWT_REFRESH_SECRET');
    if (payload.typ !== 'refresh') throw new UnauthorizedException('Please sign in again.');
    return payload;
  }

  private async verify<T extends object>(token: string, secretKey: string): Promise<T> {
    try {
      return await this.jwt.verifyAsync<T>(token, {
        secret: this.config.getOrThrow<string>(secretKey),
      });
    } catch {
      // Never report why: expired, malformed and wrong-signature are all one answer.
      throw new UnauthorizedException('Please sign in again.');
    }
  }
}
