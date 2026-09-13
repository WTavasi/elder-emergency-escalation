import { EventState } from '@prisma/client';
import { EscalationListener } from './escalation.listener';
import type { EscalationService } from './escalation.service';
import type { EscalationTimerService } from './escalation-timer.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

const buildRedis = () => {
  const handlers: Record<string, (...args: string[]) => void> = {};
  const subscriber = {
    psubscribe: jest.fn().mockResolvedValue(1),
    on: jest.fn((channel: string, handler: (...args: string[]) => void) => {
      handlers[channel] = handler;
    }),
  };
  return { redis: { subscriber } as unknown as RedisService, subscriber, handlers };
};

const buildDeps = () => {
  const escalation = { onTierTimeout: jest.fn().mockResolvedValue(undefined) };
  const timers = { arm: jest.fn().mockResolvedValue(new Date()) };
  const prisma = { emergencyEvent: { findMany: jest.fn().mockResolvedValue([]) } };
  return {
    escalation: escalation as unknown as EscalationService & { onTierTimeout: jest.Mock },
    timers: timers as unknown as EscalationTimerService & { arm: jest.Mock },
    prisma: prisma as unknown as PrismaService & { emergencyEvent: { findMany: jest.Mock } },
    raw: { escalation, timers, prisma },
  };
};

describe('EscalationListener', () => {
  describe('expiry handling', () => {
    it('escalates the event named by an expired timer key', async () => {
      const { redis } = buildRedis();
      const deps = buildDeps();
      const listener = new EscalationListener(redis, deps.prisma, deps.escalation, deps.timers);

      await listener.handleExpiry('escalation:timer:event-9:2');

      expect(deps.raw.escalation.onTierTimeout).toHaveBeenCalledWith('event-9', 2);
    });

    it('ignores expiry of keys belonging to anything else', async () => {
      const { redis } = buildRedis();
      const deps = buildDeps();
      const listener = new EscalationListener(redis, deps.prisma, deps.escalation, deps.timers);

      await listener.handleExpiry('session:abc');
      await listener.handleExpiry('bull:dispatch:42');

      expect(deps.raw.escalation.onTierTimeout).not.toHaveBeenCalled();
    });

    it('swallows a failed escalation rather than killing the subscriber', async () => {
      const { redis } = buildRedis();
      const deps = buildDeps();
      deps.raw.escalation.onTierTimeout.mockRejectedValue(new Error('database down'));
      const listener = new EscalationListener(redis, deps.prisma, deps.escalation, deps.timers);

      // One failed promotion must not take every future escalation down with it.
      await expect(listener.handleExpiry('escalation:timer:event-9:1')).resolves.toBeUndefined();
    });

    it('subscribes by pattern, so the Redis database index does not matter', async () => {
      const { redis, subscriber, handlers } = buildRedis();
      const deps = buildDeps();
      const listener = new EscalationListener(redis, deps.prisma, deps.escalation, deps.timers);

      await listener.onModuleInit();

      expect(subscriber.psubscribe).toHaveBeenCalledWith('__keyevent@*__:expired');
      handlers.pmessage(
        '__keyevent@*__:expired',
        '__keyevent@0__:expired',
        'escalation:timer:event-3:1',
      );
      expect(deps.raw.escalation.onTierTimeout).toHaveBeenCalledWith('event-3', 1);
    });
  });

  describe('recovery on boot', () => {
    it('fires escalations whose deadline passed while the API was down', async () => {
      const { redis } = buildRedis();
      const deps = buildDeps();
      deps.raw.prisma.emergencyEvent.findMany.mockResolvedValue([
        { id: 'event-1', currentTier: 1, currentTierDeadlineAt: new Date(Date.now() - 60_000) },
      ]);
      const listener = new EscalationListener(redis, deps.prisma, deps.escalation, deps.timers);

      const result = await listener.recoverPendingTimers();

      expect(result).toEqual({ fired: 1, rearmed: 0 });
      expect(deps.raw.escalation.onTierTimeout).toHaveBeenCalledWith('event-1', 1);
      expect(deps.raw.timers.arm).not.toHaveBeenCalled();
    });

    it('restores timers that still have time left, with only the remaining seconds', async () => {
      const { redis } = buildRedis();
      const deps = buildDeps();
      deps.raw.prisma.emergencyEvent.findMany.mockResolvedValue([
        { id: 'event-2', currentTier: 2, currentTierDeadlineAt: new Date(Date.now() + 90_000) },
      ]);
      const listener = new EscalationListener(redis, deps.prisma, deps.escalation, deps.timers);

      const result = await listener.recoverPendingTimers();

      expect(result).toEqual({ fired: 0, rearmed: 1 });
      const [, , seconds] = deps.raw.timers.arm.mock.calls[0] as [string, number, number];
      expect(seconds).toBeGreaterThan(85);
      expect(seconds).toBeLessThanOrEqual(90);
    });

    it('looks only at open events that are still waiting on an acknowledgement', async () => {
      const { redis } = buildRedis();
      const deps = buildDeps();
      const listener = new EscalationListener(redis, deps.prisma, deps.escalation, deps.timers);

      await listener.recoverPendingTimers();

      const where = deps.raw.prisma.emergencyEvent.findMany.mock.calls[0][0].where as {
        state: { in: EventState[] };
      };
      expect(where.state.in).toEqual([
        EventState.TRIGGERED,
        EventState.NOTIFIED,
        EventState.ESCALATED,
      ]);
      expect(where.state.in).not.toContain(EventState.ACKNOWLEDGED);
    });

    it('keeps going when one event fails to recover', async () => {
      const { redis } = buildRedis();
      const deps = buildDeps();
      deps.raw.prisma.emergencyEvent.findMany.mockResolvedValue([
        { id: 'bad', currentTier: 1, currentTierDeadlineAt: new Date(Date.now() - 1000) },
        { id: 'good', currentTier: 1, currentTierDeadlineAt: new Date(Date.now() + 60_000) },
      ]);
      deps.raw.escalation.onTierTimeout.mockRejectedValueOnce(new Error('boom'));
      const listener = new EscalationListener(redis, deps.prisma, deps.escalation, deps.timers);

      const result = await listener.recoverPendingTimers();

      expect(result).toEqual({ fired: 0, rearmed: 1 });
      expect(deps.raw.timers.arm).toHaveBeenCalled();
    });
  });
});
