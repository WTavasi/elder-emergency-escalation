import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
 * What a code is for. A sign-up code goes only to a number with no account, and a
 * reset code only to a number with one, so the two never stand in for each other: each
 * is stored under its own key and checked against that key alone.
 */
export type CodePurpose = 'signup' | 'reset';

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
    if (fresh !== 'OK') return;

    const sends = await this.redis.client.incr(countKey);
    if (sends === 1) await this.redis.client.expire(countKey, 3600);
    if (sends > MAX_SENDS_PER_HOUR) {
      this.logger.warn(`Code limit reached for ${redactPhone(phone)}`);
      return;
    }

    const existing = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (purpose === 'signup' && existing) {
      await this.sms.send(phone, accountMessages.alreadyRegistered());
      return;
    }
    // Nobody to reset. Nothing is sent: the number belongs to somebody with no account,
    // who did not ask and has nothing to protect, and a message would only cost money.
    if (purpose === 'reset' && !existing) return;

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const ttl = this.ttlSeconds();
    await this.redis.client
      .multi()
      .hset(PhoneVerificationService.codeKey(phone, purpose), {
        hash: PhoneVerificationService.hash(phone, code),
        attempts: '0',
      })
      .expire(PhoneVerificationService.codeKey(phone, purpose), ttl)
      .exec();

    const minutes = Math.round(ttl / 60);
    await this.sms.send(
      phone,
      purpose === 'reset'
        ? accountMessages.resetCode(code, minutes)
        : accountMessages.verificationCode(code, minutes),
    );
    this.logger.log(
      `${purpose === 'reset' ? 'Password reset' : 'Sign-up'} code sent to ${redactPhone(phone)}`,
    );
  }

  /**
   * Checks a code and uses it up. Throws the same message for a wrong code, an expired
   * one and a number that was never sent one, because telling them apart would tell a
   * guesser which numbers are worth guessing at.
   */
  async consume(phone: string, code: string, purpose: CodePurpose = 'signup'): Promise<void> {
    const key = PhoneVerificationService.codeKey(phone, purpose);
    const stored = await this.redis.client.hget(key, 'hash');
    if (!stored) throw new BadRequestException(WRONG_CODE);

    const attempts = await this.redis.client.hincrby(key, 'attempts', 1);
    if (attempts > MAX_ATTEMPTS) {
      await this.redis.client.del(key);
      throw new BadRequestException(WRONG_CODE);
    }

    const given = Buffer.from(PhoneVerificationService.hash(phone, code), 'hex');
    const expected = Buffer.from(stored, 'hex');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new BadRequestException(WRONG_CODE);
    }

    // Used once. A code that worked cannot be replayed for a second account.
    await this.redis.client.del(key);
  }

  private ttlSeconds(): number {
    return this.config.get<number>('VERIFICATION_CODE_TTL_SECONDS', 600);
  }

  private static codeKey(phone: string, purpose: CodePurpose): string {
    return purpose === 'reset' ? `reset:code:${phone}` : `verify:code:${phone}`;
  }

  /** Salted with the number, so the same code for two numbers never hashes alike. */
  static hash(phone: string, code: string): string {
    return createHash('sha256').update(`${phone}:${code}`).digest('hex');
  }
}
