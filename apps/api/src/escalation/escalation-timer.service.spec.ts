import { EscalationTimerService } from './escalation-timer.service';
import type { RedisService } from '../redis/redis.service';

const buildRedis = () => {
  const client = {
    set: jest.fn().mockResolvedValue('OK'),
    scan: jest.fn(),
    del: jest.fn(),
    ttl: jest.fn(),
  };
  return { redis: { client } as unknown as RedisService, client };
};

describe('EscalationTimerService', () => {
  it('sets a key with the tier timeout as its lifetime', async () => {
    const { redis, client } = buildRedis();
    const deadline = await new EscalationTimerService(redis).arm('event-1', 2, 180);

    expect(client.set).toHaveBeenCalledWith('escalation:timer:event-1:2', '2', 'EX', 180);
    expect(deadline.getTime()).toBeGreaterThan(Date.now() + 179_000);
  });

  it('clears every timer for an event, paging through the scan cursor', async () => {
    const { redis, client } = buildRedis();
    client.scan
      .mockResolvedValueOnce(['17', ['escalation:timer:event-1:1']])
      .mockResolvedValueOnce(['0', ['escalation:timer:event-1:2']]);
    client.del.mockResolvedValue(1);

    const removed = await new EscalationTimerService(redis).cancelAll('event-1');

    expect(removed).toBe(2);
    expect(client.scan).toHaveBeenCalledTimes(2);
    // SCAN rather than KEYS: KEYS blocks the server, and this runs on acknowledgement.
    expect(client.scan).toHaveBeenNthCalledWith(
      1,
      '0',
      'MATCH',
      'escalation:timer:event-1:*',
      'COUNT',
      50,
    );
  });

  it('does not call del when nothing matched', async () => {
    const { redis, client } = buildRedis();
    client.scan.mockResolvedValueOnce(['0', []]);

    expect(await new EscalationTimerService(redis).cancelAll('event-1')).toBe(0);
    expect(client.del).not.toHaveBeenCalled();
  });

  it('reports remaining seconds, and null when no timer exists', async () => {
    const { redis, client } = buildRedis();
    const service = new EscalationTimerService(redis);

    client.ttl.mockResolvedValueOnce(42);
    expect(await service.secondsRemaining('event-1', 1)).toBe(42);

    // -2 means no such key, -1 means a key with no expiry. Neither is a live timer.
    client.ttl.mockResolvedValueOnce(-2);
    expect(await service.secondsRemaining('event-1', 1)).toBeNull();
  });
});
