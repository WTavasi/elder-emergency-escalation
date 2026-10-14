import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConsentType, Prisma, Role, type User } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../db/prisma.service';
import { PRIVACY_POLICY_VERSION } from '../../../shared/config/policy';
import { claimInvitations } from '../../../shared/utils/chain';
import { redactPhone } from '../../../shared/utils/redaction';
import { PasswordService } from './password.service';
import { GoogleIdentityService } from './google-identity.service';
import { PhoneVerificationService, WRONG_CODE } from './phone-verification.service';
import { TokenService } from './token.service';
import type { LoginDto } from '../validation/login.dto';
import type { RegisterDto } from '../validation/register.dto';
import type { ResetPasswordDto } from '../validation/reset-password.dto';
import type { ChangePasswordDto } from '../validation/change-password.dto';
import type { UpdateProfileDto } from '../validation/update-profile.dto';

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

/** Said only to somebody who got the password right, so it reveals nothing to a guesser. */
export const DEACTIVATED = 'This account has been deactivated. Ask an administrator.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly verification: PhoneVerificationService,
    private readonly google: GoogleIdentityService,
  ) {}

  /**
   * Creates an account for whoever proved they hold the phone number.
   *
   * The code is checked first and used up, so a sign-up that then fails for another
   * reason needs a new code; that is the safe way round. The account, its consent and
   * any chain places held for the number are written in one transaction.
   */
  async register(dto: RegisterDto): Promise<AuthResult> {
    await this.verification.consume(dto.phone, dto.code);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: dto.name,
            phone: dto.phone,
            email: dto.email?.trim().toLowerCase() ?? null,
            role: dto.role,
            passwordHash: this.passwords.hash(dto.password),
          },
        });

        await tx.consentRecord.create({
          data: {
            subjectId: created.id,
            grantedById: created.id,
            type: ConsentType.DATA_PROCESSING,
            policyVersion: PRIVACY_POLICY_VERSION,
            grantorRelationship: 'self',
          },
        });

        const places = await claimInvitations(tx, created);
        if (places > 0) {
          this.logger.log(`New account ${created.id} took ${places} waiting chain place(s)`);
        }
        return created;
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
    const byPhone = dto.phone !== undefined;
    const user = await this.prisma.user.findUnique({
      where: byPhone ? { phone: dto.phone } : { email: dto.email!.trim().toLowerCase() },
    });

    // One message and one code path for "no such account" and "wrong password", so the
    // API cannot be used to discover who is registered.
    if (!user || !this.passwords.verify(dto.password, user.passwordHash)) {
      throw new UnauthorizedException(
        byPhone ? 'Phone number or password is incorrect' : 'Email or password is incorrect',
      );
    }

    // Only after the password is right, so this says nothing to somebody guessing.
    if (user.deactivatedAt) throw new UnauthorizedException(DEACTIVATED);

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

    // Deactivating clears the fingerprint as well, so this is belt and braces, but it
    // lets the app say why rather than only that the session ended.
    if (user?.deactivatedAt) throw new UnauthorizedException(DEACTIVATED);

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

  /**
   * The owner changing their own name or email. A taken email is a conflict, named as
   * such: the person is signed in, so saying the address is in use discloses nothing
   * they could not learn by trying to register with it.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserSummary> {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.email !== undefined ? { email: dto.email?.trim().toLowerCase() ?? null } : {}),
        },
      });
      return AuthService.summarise(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Another account already uses that email address');
      }
      throw error;
    }
  }

  /**
   * Changing a password, which needs the current one.
   *
   * A wrong current password is a 400, not a 401: the caller is signed in, and a 401
   * would tell the app its session had expired, sending it off to refresh tokens for a
   * typing mistake.
   *
   * New tokens are issued, which replaces the stored refresh-token fingerprint, so every
   * other device holding the old password's session is signed out at its next refresh.
   * Their access tokens still work until they expire, at most one access lifetime.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Account no longer exists');

    if (!this.passwords.verify(dto.currentPassword, user.passwordHash)) {
      throw new BadRequestException('Your current password is not right');
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('Choose a password different from the current one');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: this.passwords.hash(dto.newPassword) },
    });
    this.logger.log(`Password changed for ${redactPhone(user.phone)}; other sessions end`);
    return this.issue(updated);
  }

  /**
   * Sends a password reset code to a number with an account, and nothing to one
   * without. The caller is told the same either way.
   */
  async forgotPassword(phone: string): Promise<void> {
    await this.verification.start(phone, 'reset');
  }

  /**
   * Sets a new password for whoever holds the phone, and signs them in.
   *
   * The code is the whole proof, exactly as at sign-up: whoever can read the SMS owns
   * the account. Issuing new tokens replaces the stored refresh fingerprint, so a
   * session somebody else was holding with the old password ends at its next refresh.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<AuthResult> {
    await this.verification.consume(dto.phone, dto.code, 'reset');

    const user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    // A reset code is only ever sent to an active account. One deleted or deactivated
    // since is answered like any other code that no longer works.
    if (!user || user.deactivatedAt) throw new BadRequestException(WRONG_CODE);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: this.passwords.hash(dto.newPassword) },
    });
    this.logger.log(`Password reset by code for ${redactPhone(user.phone)}; other sessions end`);
    return this.issue(updated);
  }

  /**
   * Signs an administrator in with Google, for the console.
   *
   * Google proves an email address; the account has to exist already with that address
   * and be an administrator's. Nothing is created here, and no other role can use it,
   * because every other account belongs in the app, where the phone is the handle.
   */
  async signInWithGoogle(idToken: string): Promise<AuthResult> {
    const email = await this.google.verify(idToken);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user?.deactivatedAt) throw new UnauthorizedException(DEACTIVATED);
    if (!user || user.role !== Role.ADMINISTRATOR) {
      throw new UnauthorizedException(
        'No administrator account uses this Google address. Sign in with your phone number or email.',
      );
    }
    this.logger.log(`Administrator ${redactPhone(user.phone)} signed in with Google`);
    return this.issue(user);
  }

  /** Which sign-in methods beyond a password this server offers, for the console. */
  providers(): { google: { clientId: string } | null } {
    const clientId = this.google.clientId;
    return { google: clientId ? { clientId } : null };
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
