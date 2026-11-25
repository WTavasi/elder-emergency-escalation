import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DevOutbox } from '../../notification-service/providers/dev-outbox';
import type { RedisService } from '../../../shared/redis/redis.service';
import { DevToolsController } from '../controllers/dev-tools.controller';
import { DevToolsService } from './dev-tools.service';

function build(env: Record<string, string>) {
  const config = { get: (key: string, fallback?: string) => env[key] ?? fallback } as ConfigService;
  const outbox = new DevOutbox();
  const keys: Record<string, string[]> = {
    'ratelimit:*': ['ratelimit:login:1', 'ratelimit:login:2'],
    'verify:cooldown:*': ['verify:cooldown:+254700000099'],
    'verify:count:*': [],
    'sms-reply:*': ['sms-reply:+254700000020'],
  };
  const client = {
    scan: jest.fn((_cursor: string, _match: string, pattern: string) =>
      Promise.resolve(['0', keys[pattern]]),
    ),
    del: jest.fn((...k: string[]) => Promise.resolve(k.length)),
  };
  const service = new DevToolsService(config, outbox, { client } as unknown as RedisService);
  return { service, outbox, client, controller: new DevToolsController(service) };
}

describe('the development tools', () => {
  it('give back the texts printed for one number, newest first', () => {
    const { controller, outbox } = build({ NODE_ENV: 'development' });
    outbox.record('+254700000099', '111111 is your MzaziCare code.');
    outbox.record('+254700000088', 'not for this number');
    outbox.record('+254700000099', '222222 is your MzaziCare code.');

    expect(controller.texts('+254700000099').map((t) => t.text)).toEqual([
      '222222 is your MzaziCare code.',
      '111111 is your MzaziCare code.',
    ]);
  });

  it('keep only the last fifty texts', () => {
    const outbox = new DevOutbox();
    for (let i = 0; i < 60; i += 1) outbox.record('+254700000099', `text ${i}`);
    expect(outbox.to('+254700000099', 100)).toHaveLength(50);
    expect(outbox.to('+254700000099', 1)[0].text).toBe('text 59');
  });

  it('clear the rate-limit counters and nothing else', async () => {
    const { controller, client } = build({ NODE_ENV: 'development' });
    await expect(controller.clearLimits()).resolves.toEqual({ cleared: 4 });
    expect(client.scan.mock.calls.map((c) => c[2])).toEqual([
      'ratelimit:*',
      'verify:cooldown:*',
      'verify:count:*',
      'sms-reply:*',
    ]);
  });

  it('are not there in production, or when texts are really sent', async () => {
    const envs: Record<string, string>[] = [
      { NODE_ENV: 'production' },
      { NODE_ENV: 'development', SMS_PROVIDER: 'africastalking' },
    ];
    for (const env of envs) {
      const { controller, client } = build(env);
      expect(() => controller.texts('+254700000099')).toThrow(NotFoundException);
      await expect(controller.clearLimits()).rejects.toThrow(NotFoundException);
      expect(client.del).not.toHaveBeenCalled();
    }
  });
});
