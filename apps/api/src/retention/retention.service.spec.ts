import type { ConfigService } from '@nestjs/config';
import { EventState } from '@prisma/client';
import { RetentionService } from './retention.service';
import type { PrismaService } from '../prisma/prisma.service';

interface PrismaMock {
  emergencyEvent: { deleteMany: jest.Mock };
  auditLog: { deleteMany: jest.Mock };
}

const buildPrisma = (): PrismaMock => ({
  emergencyEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  auditLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
});

const build = (prisma: PrismaMock, settings: Record<string, unknown> = {}): RetentionService =>
  new RetentionService(
    prisma as unknown as PrismaService,
    {
      get: (key: string, fallback: unknown) => settings[key] ?? fallback,
    } as unknown as ConfigService,
  );

const NOW = new Date('2026-09-16T12:00:00.000Z');

describe('RetentionService', () => {
  describe('what it deletes', () => {
    it('only ever deletes an emergency that reached a closed state', async () => {
      const prisma = buildPrisma();
      await build(prisma).sweep(NOW);

      const where = prisma.emergencyEvent.deleteMany.mock.calls[0][0].where as {
        state: { in: EventState[] };
      };

      expect(where.state.in).toEqual([EventState.RESOLVED, EventState.CANCELLED]);
      // An emergency nobody ever closed is a failure worth keeping the evidence of.
      expect(where.state.in).not.toContain(EventState.TRIGGERED);
      expect(where.state.in).not.toContain(EventState.ESCALATED);
      expect(where.state.in).not.toContain(EventState.ACKNOWLEDGED);
    });

    it('measures the window from when the emergency closed, not when it was raised', async () => {
      const prisma = buildPrisma();
      await build(prisma, { RETENTION_RESOLVED_EVENT_DAYS: 30 }).sweep(NOW);

      const where = prisma.emergencyEvent.deleteMany.mock.calls[0][0].where as {
        resolvedAt: { lt: Date; not: null };
      };

      expect(where.resolvedAt.lt).toEqual(new Date('2026-08-17T12:00:00.000Z'));
      expect(where).not.toHaveProperty('triggeredAt');
    });

    it('applies the audit window separately from the emergency window', async () => {
      const prisma = buildPrisma();
      await build(prisma, {
        RETENTION_RESOLVED_EVENT_DAYS: 30,
        RETENTION_AUDIT_LOG_DAYS: 10,
      }).sweep(NOW);

      const where = prisma.auditLog.deleteMany.mock.calls[0][0].where as {
        occurredAt: { lt: Date };
      };

      expect(where.occurredAt.lt).toEqual(new Date('2026-09-06T12:00:00.000Z'));
    });

    it('deletes the emergencies first, so the cascade does the bulk of the work', async () => {
      const prisma = buildPrisma();
      await build(prisma).sweep(NOW);

      const events = prisma.emergencyEvent.deleteMany.mock.invocationCallOrder[0];
      const logs = prisma.auditLog.deleteMany.mock.invocationCallOrder[0];

      expect(events).toBeLessThan(logs);
    });
  });

  describe('what it reports', () => {
    it('returns the counts and the cutoffs it used', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.deleteMany.mockResolvedValue({ count: 4 });
      prisma.auditLog.deleteMany.mockResolvedValue({ count: 17 });

      const outcome = await build(prisma, { RETENTION_RESOLVED_EVENT_DAYS: 365 }).sweep(NOW);

      expect(outcome.eventsDeleted).toBe(4);
      expect(outcome.auditLogsDeleted).toBe(17);
      expect(outcome.ranAt).toBe(NOW.toISOString());
      expect(outcome.eventCutoff).toBe('2025-09-16T12:00:00.000Z');
    });
  });

  describe('scheduling', () => {
    it('does not schedule anything when retention is switched off', () => {
      const service = build(buildPrisma(), { RETENTION_ENABLED: false });
      const setInterval = jest.spyOn(global, 'setInterval');

      service.onModuleInit();

      expect(setInterval).not.toHaveBeenCalled();
      setInterval.mockRestore();
    });

    it('stops its timer on shutdown rather than leaving it attached', () => {
      const service = build(buildPrisma(), { RETENTION_INTERVAL_HOURS: 1 });
      const clearInterval = jest.spyOn(global, 'clearInterval');

      service.onModuleInit();
      service.onModuleDestroy();

      expect(clearInterval).toHaveBeenCalled();
      clearInterval.mockRestore();
    });
  });
});
