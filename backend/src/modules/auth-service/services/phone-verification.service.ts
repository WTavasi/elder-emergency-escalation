import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../../db/prisma.service';
import { RedisService } from '../../../shared/redis/redis.service';
import { redactPhone } from '../../../shared/utils/redaction';
import { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import { accountMessages } from '../../notification-service/services/notification-content';

/** Wrong guesses allowed against one code before it is thrown away. */
export const MAX_ATTEMPTS = 5;
/** Codes one number can be sent in an hour, however many people ask. */
export const MAX_SENDS_PER_HOUR = 5;
/** The shortest gap between two codes to one number. */
export const RESEND_COOLDOWN_SECONDS = 30;

export const WRONG_CODE = 'That code is wrong or has expired. Ask for a new one.';

/**
 * What a code is for. Each is stored under its own key and checked against that key
 * alone, so one never stands in for another.
 *
 * - signup: to a number with no account.
 * - reset: to an active account, for a new password.
 * - signin: to an active elder's account, which signs them in with no password.
 * - change: to a number with no account, which a signed-in person is moving theirs to.
 * - pair: never sent. A caregiver is shown it and types it into the elder's phone.
 */
export type CodePurpose = 'signup' | 'reset' | 'signin' | 'change' | 'pair';

/** What a pairing code shown to a caregiver lasts. Long enough to walk across a room. */
export const PAIRING_TTL_SECONDS = 600;

/**
 * Proving that whoever is signing up holds the phone number they typed.
 *
 * Without it anybody could create an account with somebody else's number, and that
 * person would then be unable to sign up and could be added to emergency chains they
 * never agreed to. A six-digit code sent by SMS is the proof.
 *
 * The answer to "send me a code" is the same whether or not the number already has an
 * account, so this endpoint cannot be used to find out who is registered. A registered
 * number is sent a message saying somebody tried, instead of a code.
 *
 * Codes live in Redis with a lifetime, never in the database, and only as a hash, so a
 * Redis snapshot holds nothing that can be typed into the app. Each code allows a few
 * wrong guesses before it is discarded, which keeps guessing a million combinations out
 * of reach, and each number is limited in how many codes it can be sent, which keeps
 * the SMS bill out of an attacker's hands.
 */
@Injectable()
export class PhoneVerificationService {
  private readonly logger = new Logger(PhoneVerificationService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly sms: DirectSmsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Sends a code, or quietly does nothing. Never says which.
   *
   * The cooldown and the hourly limit are shared by both purposes, because they protect
   * the phone and the SMS bill, and neither cares what the code was for.
   */
  async start(phone: string, purpose: CodePurpose = 'signup'): Promise<void> {
    // Every way this can end without sending a code says why, here in the server's log.
    // The caller is told nothing either way, so this explains a missing text to whoever
    // runs the server without telling an outsider which numbers are registered.
    const who = redactPhone(phone);
    const cooldownKey = `verify:cooldown:${phone}`;
    const countKey = `verify:count:${phone}`;

    // SET NX is the cooldown and the lock in one: a second request inside the gap does
    // nothing, including two arriving at once.
    const fresh = await this.redis.client.set(
      cooldownKey,
      '1',
      'EX',
      RESEND_COOLDOWN_SECONDS,
      'NX',
    );
    if (fresh !== 'OK') {
      this.logger.log(
        `No code sent to ${who}: asked again within ${RESEND_COOLDOWN_SECONDS}s of the last one`,
      );
      return;
    }

    const sends = await this.redis.client.incr(countKey);
    if (sends === 1) await this.redis.client.expire(countKey, 3600);
    if (sends > MAX_SENDS_PER_HOUR) {
      this.logger.warn(
        `No code sent to ${who}: ${MAX_SENDS_PER_HOUR} codes already sent in the last hour. ` +
          'For local testing, npm run dev:clear-limits -w @mzazicare/api resets this.',
      );
      return;
    }

    const existing = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true, deactivatedAt: true, role: true },
    });
    if (purpose === 'signup' && existing) {
      await this.sms.send(phone, accountMessages.alreadyRegistered());
      this.logger.log(
        `No code sent to ${who}: it already has an account, so it was told that instead`,
      );
      return;
    }
    // Nobody to reset. Nothing is sent: the number belongs to somebody with no account,
    // who did not ask and has nothing to protect, and a message would only cost money.
    // A deactivated account is treated as none: its password cannot be reset into use.
    if (purpose === 'reset' && (!existing || existing.deactivatedAt)) {
      this.logger.log(`No reset code sent to ${who}: no active account has that number`);
      return;
    }
    // Signing in by code is for elders only. Everyone else has a password they chose,
    // and a code by text alone is a weaker proof than that: it is only as safe as the
    // SIM. For an elder the trade is worth it, because a forgotten password somebody
    // else set up is what keeps them from the panic button.
    if (
      purpose === 'signin' &&
      (!existing || existing.deactivatedAt || existing.role !== Role.ELDER)
    ) {
      this.logger.log(`No sign-in code sent to ${who}: no active elder has that number`);
      return;
    }
    // The caller already checked, and was told; this is the race between that check and
    // now, when somebody else took the number.
    if (purpose === 'change' && existing) {
      this.logger.log(`No change code sent to ${who}: it already has an account`);
      return;
    }

    const ttl = this.ttlSeconds();
    const code = await this.store(phone, purpose, ttl);

    const minutes = Math.round(ttl / 60);
    const delivered = await this.sms.send(
      phone,
      PhoneVerificationService.message(purpose, code, minutes),
    );
    const what = PhoneVerificationService.label(purpose);
    if (delivered) {
      this.logger.log(`${what} code sent to ${who}`);
    } else {
      // The provider's own reason is logged just above, by the SMS service.
      this.logger.warn(`${what} code for ${who} was not delivered`);
    }
  }

  /**
   * A code for a caregiver to read out or type into the elder's phone, returned rather
   * than sent. Not limited like a text, because it costs nothing and reaches nobody; the
   * attempts on it are limited the same way. Asking again replaces the last one.
   */
  async issuePairing(phone: string): Promise<{ code: string; expiresInSeconds: number }> {
    const code = await this.store(phone, 'pair', PAIRING_TTL_SECONDS);
    this.logger.log(`Pairing code made for ${redactPhone(phone)}`);
    return { code, expiresInSeconds: PAIRING_TTL_SECONDS };
  }

  /**
   * Checks a code and uses it up. Throws the same message for a wrong code, an expired
   * one and a number that was never sent one, because telling them apart would tell a
   * guesser which numbers are worth guessing at.
   *
   * Given more than one purpose, the code may be any of them, which is how an elder's
   * one code box takes either a code by text or one from their caregiver. Every guess
   * counts against each code that is waiting, so two codes give no extra guesses.
   * Returns the purpose that matched.
   */
  async consume(
    phone: string,
    code: string,
    purpose: CodePurpose | CodePurpose[] = 'signup',
  ): Promise<CodePurpose> {
    const purposes = Array.isArray(purpose) ? purpose : [purpose];
    const given = Buffer.from(PhoneVerificationService.hash(phone, code), 'hex');

    for (const each of purposes) {
      const key = PhoneVerificationService.codeKey(phone, each);
      const stored = await this.redis.client.hget(key, 'hash');
      if (!stored) continue;

      const attempts = await this.redis.client.hincrby(key, 'attempts', 1);
      if (attempts > MAX_ATTEMPTS) {
        await this.redis.client.del(key);
        continue;
      }

      const expected = Buffer.from(stored, 'hex');
      if (given.length === expected.length && timingSafeEqual(given, expected)) {
        // Used once. A code that worked cannot be replayed for a second account.
        await this.redis.client.del(key);
        return each;
      }
    }
    throw new BadRequestException(WRONG_CODE);
  }

  /** A fresh six-digit code, stored as a hash under its purpose with a lifetime. */
  private async store(phone: string, purpose: CodePurpose, ttl: number): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const key = PhoneVerificationService.codeKey(phone, purpose);
    await this.redis.client
      .multi()
      .hset(key, { hash: PhoneVerificationService.hash(phone, code), attempts: '0' })
      .expire(key, ttl)
      .exec();
    return code;
  }

  private static message(purpose: CodePurpose, code: string, minutes: number): string {
    switch (purpose) {
      case 'reset':
        return accountMessages.resetCode(code, minutes);
      case 'signin':
        return accountMessages.signInCode(code, minutes);
      case 'change':
        return accountMessages.changeNumberCode(code, minutes);
      default:
        return accountMessages.verificationCode(code, minutes);
    }
  }

  private static label(purpose: CodePurpose): string {
    switch (purpose) {
      case 'reset':
        return 'Password reset';
      case 'signin':
        return 'Sign-in';
      case 'change':
        return 'Number change';
      default:
        return 'Sign-up';
    }
  }

  private ttlSeconds(): number {
    return this.config.get<number>('VERIFICATION_CODE_TTL_SECONDS', 600);
  }

  private static codeKey(phone: string, purpose: CodePurpose): string {
    // signup keeps the key it has always had, so codes already sent still work.
    return `${purpose === 'signup' ? 'verify' : purpose}:code:${phone}`;
  }

  /** Salted with the number, so the same code for two numbers never hashes alike. */
  static hash(phone: string, code: string): string {
    return createHash('sha256').update(`${phone}:${code}`).digest('hex');
  }
}
