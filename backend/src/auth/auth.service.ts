import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Prisma, Role, type User } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { redactPhone } from '../common/redaction';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

export interface UserSummary {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: Role;

  /**
   * The elder's own registered home, and null for every other role.
   *
   * Included because raising an alert requires coordinates and the app needs a source
   * for them that cannot fail. A device location is better when it is available, but a
   * denied permission, an indoor fix that never arrives or a phone with location
   * switched off must not be able to stop somebody calling for help. The registered
   * home is the floor underneath that: always present, always the elder's own data,
   * and already known to everyone who would respond.
   */
  home: { latitude: number; longitude: number; addressLabel: string | null } | null;
}

export interface AuthResult {
  user: UserSummary;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          phone: dto.phone,
          email: dto.email ?? null,
          role: dto.role,
          passwordHash: this.passwords.hash(dto.password),
        },
      });
      return this.issue(user);
    } catch (error) {
      // P2002 is a unique constraint violation, which here means the phone or email
      // is taken. Saying which one is a small disclosure, but registration is public
      // and the person needs to know what to change.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = (error.meta?.target as string[] | undefined)?.join(', ') ?? 'phone';
        throw new ConflictException(`An account already exists with that ${target}`);
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });

    // One message and one code path for "no such account" and "wrong password", so the
    // API cannot be used to discover who is registered.
    if (!user || !this.passwords.verify(dto.password, user.passwordHash)) {
      throw new UnauthorizedException('Phone number or password is incorrect');
    }

    // Transparent upgrade if the cost parameters were raised since this hash was made.
    if (this.passwords.needsRehash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: this.passwords.hash(dto.password) },
      });
    }

    return this.issue(user);
  }

  /**
   * Rotates the refresh token on every use and stores only its hash.
   *
   * A token that verifies cryptographically but does not match the stored hash has
   * either already been used or was issued before a logout. Both mean the holder
   * should not be trusted, so the stored hash is cleared and every session for that
   * user ends.
   */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const payload = await this.tokens.verifyRefresh(refreshToken);
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException('Session has ended. Please sign in again.');
    }

    if (user.refreshTokenHash !== AuthService.fingerprint(refreshToken)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: null, refreshTokenUpdatedAt: new Date() },
      });
      this.logger.warn(`Refresh token replay for ${redactPhone(user.phone)}; all sessions revoked`);
      throw new UnauthorizedException('Session has ended. Please sign in again.');
    }

    return this.issue(user);
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null, refreshTokenUpdatedAt: new Date() },
    });
  }

  async me(userId: string): Promise<UserSummary> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Account no longer exists');
    return AuthService.summarise(user);
  }

  private async issue(user: User): Promise<AuthResult> {
    const [accessToken, refresh] = await Promise.all([
      this.tokens.signAccess(user.id, user.role),
      this.tokens.signRefresh(user.id),
    ]);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash: AuthService.fingerprint(refresh.token),
        refreshTokenUpdatedAt: new Date(),
      },
    });

    return { user: AuthService.summarise(user), accessToken, refreshToken: refresh.token };
  }

  /**
   * SHA-256 of the token, not a password hash.
   *
   * A refresh token is 200-plus bits of signed randomness rather than a guessable
   * secret, so it needs no salt or work factor: the property required is only that a
   * stolen database does not yield usable tokens.
   */
  private static fingerprint(token: string): string {
    return createHash('sha256').update(token).digest('base64');
  }

  private static summarise(user: User): UserSummary {
    // Only an elder has one, and only an elder is ever told it. A caregiver learns
    // where an emergency happened from the emergency, which records the location at
    // the moment it was raised, rather than from a standing copy of somebody's address.
    const home =
      user.role === Role.ELDER && user.homeLatitude !== null && user.homeLongitude !== null
        ? {
            latitude: Number(user.homeLatitude),
            longitude: Number(user.homeLongitude),
            addressLabel: user.homeAddressLabel,
          }
        : null;

    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role,
      home,
    };
  }
}
