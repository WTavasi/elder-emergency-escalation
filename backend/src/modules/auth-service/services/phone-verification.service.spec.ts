import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../../db/prisma.service';
import type { RedisService } from '../../../shared/redis/redis.service';
import type { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import {
  MAX_ATTEMPTS,
  MAX_SENDS_PER_HOUR,
  PhoneVerificationService,
} from './phone-verification.service';

/**
 * Just enough of Redis for this service, in memory. Lifetimes are recorded but never
 * expire on their own; a test that needs expiry deletes the key, which is what Redis
 * does when a lifetime runs out.
 */
function fakeRedis() {
  const strings = new Map<string, string>();
  const hashes = new Map<string, Record<string, string>>();
  const client = {
    set: jest.fn((key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && strings.has(key)) return Promise.resolve(null);
      strings.set(key, value);
      return Promise.resolve('OK');
    }),
    incr: jest.fn((key: string) => {
      const next = Number(strings.get(key) ?? 0) + 1;
      strings.set(key, String(next));
      return Promise.resolve(next);
    }),
    expire: jest.fn(() => Promise.resolve(1)),
    hget: jest.fn((key: string, field: string) =>
      Promise.resolve(hashes.get(key)?.[field] ?? null),
    ),
    hincrby: jest.fn((key: string, field: string, by: number) => {
      const hash = hashes.get(key) ?? {};
      hash[field] = String(Number(hash[field] ?? 0) + by);
      hashes.set(key, hash);
      return Promise.resolve(Number(hash[field]));
    }),
    del: jest.fn((key: string) => {
      hashes.delete(key);
      strings.delete(key);
      return Promise.resolve(1);
    }),
    multi: jest.fn(() => {
      const steps: (() => void)[] = [];
      const chain = {
        hset: (key: string, values: Record<string, string>) => {
          steps.push(() => hashes.set(key, { ...values }));
          return chain;
        },
        expire: () => chain,
        exec: () => {
          steps.forEach((step) => step());
          return Promise.resolve([]);
        },
      };
      return chain;
    }),
  };
  return { client, strings, hashes };
}

const PHONE = '+254712345678';

function build(existingAccount = false) {
  const redis = fakeRedis();
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(existingAccount ? { id: 'u1' } : null) },
  };
  const sms = { send: jest.fn().mockResolvedValue(true) };
  const config = { get: (_key: string, fallback: unknown) => fallback } as unknown as ConfigService;
  const service = new PhoneVerificationService(
    redis as unknown as RedisService,
    prisma as unknown as PrismaService,
    sms as unknown as DirectSmsService,
    config,
  );
  return { service, redis, sms };
}

/** The code inside the SMS the service sent, which is the only place it appears. */
const codeFrom = (sms: { send: jest.Mock }): string =>
  /^(\d{6}) is your MzaziCare code/.exec(sms.send.mock.calls[0][1] as string)?.[1] ?? '';

describe('PhoneVerificationService', () => {
  it('sends a six-digit code and stores only its hash', async () => {
    const { service, redis, sms } = build();
    await service.start(PHONE);

    const code = codeFrom(sms);
    expect(code).toMatch(/^\d{6}$/);
    const stored = redis.hashes.get(`verify:code:${PHONE}`);
    expect(stored?.hash).toBe(PhoneVerificationService.hash(PHONE, code));
    expect(JSON.stringify(stored)).not.toContain(code);
  });

  it('accepts the right code once, and not a second time', async () => {
    const { service, sms } = build();
    await service.start(PHONE);
    const code = codeFrom(sms);

    await expect(service.consume(PHONE, code)).resolves.toBeUndefined();
    await expect(service.consume(PHONE, code)).rejects.toThrow(BadRequestException);
  });

  it('refuses a wrong code, and throws the code away after too many guesses', async () => {
    const { service, sms } = build();
    await service.start(PHONE);
    const code = codeFrom(sms);
    const wrong = code === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await expect(service.consume(PHONE, wrong)).rejects.toThrow(BadRequestException);
    }
    // The right code no longer works either: the guesses used it up.
    await expect(service.consume(PHONE, code)).rejects.toThrow(BadRequestException);
  });

  it('tells a registered number that somebody tried, and sends no code', async () => {
    const { service, redis, sms } = build(true);
    await service.start(PHONE);

    expect(sms.send).toHaveBeenCalledTimes(1);
    expect(sms.send.mock.calls[0][1]).toContain('already has one');
    expect(redis.hashes.has(`verify:code:${PHONE}`)).toBe(false);
  });

  it('sends nothing a second time inside the cooldown', async () => {
    const { service, sms } = build();
    await service.start(PHONE);
    await service.start(PHONE);
    expect(sms.send).toHaveBeenCalledTimes(1);
  });

  it('stops sending to one number after the hourly limit', async () => {
    const { service, redis, sms } = build();
    for (let send = 0; send < MAX_SENDS_PER_HOUR + 2; send++) {
      redis.strings.delete(`verify:cooldown:${PHONE}`);
      await service.start(PHONE);
    }
    expect(sms.send).toHaveBeenCalledTimes(MAX_SENDS_PER_HOUR);
  });

  it('gives the same answer for a number that was never sent a code', async () => {
    const { service } = build();
    await expect(service.consume(PHONE, '123456')).rejects.toThrow(
      'That code is wrong or has expired. Ask for a new one.',
    );
  });
});
