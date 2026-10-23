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
import { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import { accountMessages } from '../../notification-service/services/notification-content';
import { PasswordService } from './password.service';
import { GoogleIdentityService } from './google-identity.service';
import { PhoneVerificationService, WRONG_CODE } from './phone-verification.service';
import { TokenService } from './token.service';
import type { LoginDto } from '../validation/login.dto';
import type { RegisterDto } from '../validation/register.dto';
import type { ResetPasswordDto } from '../validation/reset-password.dto';
import type { ChangePasswordDto } from '../validation/change-password.dto';
import type { UpdateProfileDto } from '../validation/update-profile.dto';
import type { CodeSignInDto } from '../validation/code-sign-in.dto';
import type { ChangePhoneDto, StartPhoneChangeDto } from '../validation/change-phone.dto';

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
    private readonly sms: DirectSmsService,
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

  /**
   * Signing out also stops this phone being sent anybody's emergencies: a phone left
   * signed out on a table must not keep receiving alerts for the account that left it.
   */
  async logout(userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshTokenHash: null,
        refreshTokenUpdatedAt: now,
        pushToken: null,
        pushTokenUpdatedAt: now,
      },
    });
  }

  /**
   * Where push notifications for this account go. One device per account, matching the
   * one-session model, so the newest registration wins. A token already held by another
   * account means the phone changed hands, and the previous account loses it: alerts for
   * one person must never arrive on somebody else's phone.
   */
  async registerPushToken(userId: string, token: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { pushToken: token, id: { not: userId } },
        data: { pushToken: null, pushTokenUpdatedAt: now },
      });
      await tx.user.update({
        where: { id: userId },
        data: { pushToken: token, pushTokenUpdatedAt: now },
      });
    });
  }

  async clearPushToken(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pushToken: null, pushTokenUpdatedAt: new Date() },
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
   * Sends an elder a sign-in code, and nobody else anything. Answered the same either
   * way, like every other code request.
   */
  async startCodeSignIn(phone: string): Promise<void> {
    await this.verification.start(phone, 'signin');
  }

  /**
   * Signs an elder in with a code: one sent by text, or one their caregiver made.
   *
   * Elders only, checked again here because a pairing code is made for an elder but the
   * account could have changed since. Anything else that is wrong reads as a wrong code.
   */
  async signInWithCode(dto: CodeSignInDto): Promise<AuthResult> {
    const how = await this.verification.consume(dto.phone, dto.code, ['signin', 'pair']);

    const user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (!user || user.deactivatedAt || user.role !== Role.ELDER) {
      throw new BadRequestException(WRONG_CODE);
    }
    this.logger.log(
      `Elder ${redactPhone(user.phone)} signed in with ${how === 'pair' ? "a caregiver's" : 'a texted'} code`,
    );
    return this.issue(user);
  }

  /**
   * The first half of moving an account to a new number: a code to that number.
   *
   * Unlike the public code requests this one can say what is wrong, because the caller is
   * signed in and has, where they have one, just given their password.
   */
  async startPhoneChange(userId: string, dto: StartPhoneChangeDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Account no longer exists');

    if (user.role !== Role.ELDER) {
      if (!dto.password || !this.passwords.verify(dto.password, user.passwordHash)) {
        throw new BadRequestException('Your current password is not right');
      }
    }
    if (dto.phone === user.phone) {
      throw new BadRequestException('That is already the number on your account');
    }
    const taken = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      select: { id: true },
    });
    if (taken) throw new ConflictException('Another account already uses that number');

    await this.verification.start(dto.phone, 'change');
  }

  /**
   * The second half: the code from the new number moves the account there.
   *
   * New tokens are issued, which ends any other session, as a password change does. The
   * old number is told by text, so a change its holder did not make is noticed. Places
   * in a chain that were waiting for the new number are taken, as at sign-up.
   */
  async changePhone(userId: string, dto: ChangePhoneDto): Promise<AuthResult> {
    await this.verification.consume(dto.phone, dto.code, 'change');

    const before = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!before) throw new UnauthorizedException('Account no longer exists');

    let updated: User;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const moved = await tx.user.update({ where: { id: userId }, data: { phone: dto.phone } });
        const places = await claimInvitations(tx, moved);
        if (places > 0) {
          this.logger.log(
            `Account ${moved.id} took ${places} chain place(s) waiting for its new number`,
          );
        }
        return moved;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Another account already uses that number');
      }
      throw error;
    }

    this.logger.log(
      `Number changed from ${redactPhone(before.phone)} to ${redactPhone(dto.phone)}; other sessions end`,
    );
    await this.sms.send(before.phone, accountMessages.numberChanged());
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
      this.tokens.signRefresh(user.id, user.role),
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
