import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing with scrypt from the standard library.
 *
 * Chosen over bcrypt and argon2 because both are native modules that need compiling,
 * which is an avoidable failure mode on a deployment host. Parameters are stored in
 * the hash itself, so they can be raised later without invalidating existing hashes.
 *
 * Stored format:  scrypt$N$r$p$saltBase64$keyBase64
 *
 * The seed script in prisma/seed.mjs writes the same format. The compatibility test
 * in password.service.spec.ts pins that agreement, because a drift between the two
 * would lock every seeded account out silently.
 */
@Injectable()
export class PasswordService {
  private static readonly KEY_LENGTH = 64;

  private readonly params: { N: number; r: number; p: number };

  constructor(config: ConfigService) {
    this.params = {
      N: config.get<number>('SCRYPT_N', 16384),
      r: config.get<number>('SCRYPT_R', 8),
      p: config.get<number>('SCRYPT_P', 1),
    };
  }

  hash(plain: string): string {
    const salt = randomBytes(16);
    const key = scryptSync(plain, salt, PasswordService.KEY_LENGTH, this.params);
    return [
      'scrypt',
      this.params.N,
      this.params.r,
      this.params.p,
      salt.toString('base64'),
      key.toString('base64'),
    ].join('$');
  }

  /**
   * Returns false rather than throwing on a malformed hash. A corrupt stored value is
   * a failed login, not a 500, and it must not be distinguishable from a wrong password.
   */
  verify(plain: string, stored: string): boolean {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const [, nRaw, rRaw, pRaw, saltRaw, keyRaw] = parts;
    const N = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

    let expected: Buffer;
    let candidate: Buffer;
    try {
      expected = Buffer.from(keyRaw, 'base64');
      if (expected.length === 0) return false;
      candidate = scryptSync(plain, Buffer.from(saltRaw, 'base64'), expected.length, { N, r, p });
    } catch {
      return false;
    }

    return expected.length === candidate.length && timingSafeEqual(expected, candidate);
  }

  /** True when a stored hash was written with weaker parameters than the current policy. */
  needsRehash(stored: string): boolean {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return true;
    return Number(parts[1]) < this.params.N;
  }
}
