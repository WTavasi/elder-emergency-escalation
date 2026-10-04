import type { ConfigService } from '@nestjs/config';
import { NotificationStatus } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import type { PrismaService } from '../prisma/prisma.service';

interface PrismaMock {
  emergencyEvent: { groupBy: jest.Mock; count: jest.Mock; findMany: jest.Mock };
  auditLog: { findMany: jest.Mock };
  notification: { groupBy: jest.Mock };
}

const at = (triggered: string, acknowledged: string) => ({
  triggeredAt: new Date(triggered),
  acknowledgedAt: new Date(acknowledged),
});

const buildPrisma = (): PrismaMock => ({
  emergencyEvent: {
    groupBy: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
  },
  auditLog: { findMany: jest.fn().mockResolvedValue([]) },
  notification: { groupBy: jest.fn().mockResolvedValue([]) },
});

const build = (prisma: PrismaMock, target = 300): DashboardService =>
  new DashboardService(
    prisma as unknown as PrismaService,
    {
      get: (_key: string, fallback: number) => target ?? fallback,
    } as unknown as ConfigService,
  );

describe('DashboardService', () => {
  describe('response times', () => {
    it('reports nothing rather than zero when no emergency has been acknowledged', async () => {
      const overview = await build(buildPrisma()).overview();

      expect(overview.responseTimes.sampleSize).toBe(0);
      expect(overview.responseTimes.medianSeconds).toBeNull();
      expect(overview.responseTimes.meanSeconds).toBeNull();
    });

    it('takes the middle value for an odd sample', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findMany.mockResolvedValue([
        at('2026-01-01T00:00:00Z', '2026-01-01T00:00:10Z'),
        at('2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z'),
        at('2026-01-01T00:00:00Z', '2026-01-01T00:00:30Z'),
      ]);

      const { responseTimes } = await build(prisma).overview();

      expect(responseTimes.sampleSize).toBe(3);
      expect(responseTimes.medianSeconds).toBe(30);
    });

    it('averages the two middle values for an even sample', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findMany.mockResolvedValue([
        at('2026-01-01T00:00:00Z', '2026-01-01T00:00:10Z'),
        at('2026-01-01T00:00:00Z', '2026-01-01T00:00:20Z'),
        at('2026-01-01T00:00:00Z', '2026-01-01T00:00:40Z'),
        at('2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z'),
      ]);

      const { responseTimes } = await build(prisma).overview();

      expect(responseTimes.medianSeconds).toBe(30);
    });

    it('resists the outlier that would distort the mean', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findMany.mockResolvedValue([
        at('2026-01-01T00:00:00Z', '2026-01-01T00:00:10Z'),
        at('2026-01-01T00:00:00Z', '2026-01-01T00:00:20Z'),
        at('2026-01-01T00:00:00Z', '2026-01-01T08:00:00Z'),
      ]);

      const { responseTimes } = await build(prisma).overview();

      // The median still describes the usual case; the mean does not. Reporting both
      // is the point, so the two are asserted to disagree.
      expect(responseTimes.medianSeconds).toBe(20);
      expect(responseTimes.meanSeconds).toBeGreaterThan(9000);
    });

    it('measures the target as a percentage of the sample', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.findMany.mockResolvedValue([
        at('2026-01-01T00:00:00Z', '2026-01-01T00:00:10Z'),
        at('2026-01-01T00:00:00Z', '2026-01-01T00:20:00Z'),
      ]);

      const { responseTimes } = await build(prisma, 300).overview();

      expect(responseTimes.targetSeconds).toBe(300);
      expect(responseTimes.withinTargetPercent).toBe(50);
    });
  });

  describe('channel reliability', () => {
    it('counts an acknowledged message as delivered', async () => {
      const prisma = buildPrisma();
      prisma.notification.groupBy.mockResolvedValue([
        { channel: 'PUSH', status: NotificationStatus.DELIVERED, _count: { _all: 6 } },
        { channel: 'PUSH', status: NotificationStatus.ACKNOWLEDGED, _count: { _all: 2 } },
        { channel: 'PUSH', status: NotificationStatus.FAILED, _count: { _all: 2 } },
      ]);

      const { channels } = await build(prisma).overview();
      const push = channels.find((row) => row.channel === 'PUSH');

      expect(push).toEqual({
        channel: 'PUSH',
        attempted: 10,
        delivered: 8,
        failed: 2,
        successRatePercent: 80,
      });
    });

    it('reports each channel separately, so the fallback can be judged on its own', async () => {
      const prisma = buildPrisma();
      prisma.notification.groupBy.mockResolvedValue([
        { channel: 'PUSH', status: NotificationStatus.FAILED, _count: { _all: 4 } },
        { channel: 'SMS', status: NotificationStatus.DELIVERED, _count: { _all: 4 } },
      ]);

      const { channels } = await build(prisma).overview();

      expect(channels.find((row) => row.channel === 'PUSH')?.successRatePercent).toBe(0);
      expect(channels.find((row) => row.channel === 'SMS')?.successRatePercent).toBe(100);
    });
  });

  describe('escalation profile', () => {
    it('counts an event once however many tiers it climbed', async () => {
      const prisma = buildPrisma();
      prisma.emergencyEvent.count.mockResolvedValue(10);
      prisma.auditLog.findMany.mockResolvedValue([{ eventId: 'a' }, { eventId: 'b' }]);

      const { escalation } = await build(prisma).overview();

      expect(prisma.auditLog.findMany.mock.calls[0][0].distinct).toEqual(['eventId']);
      expect(escalation.escalatedCount).toBe(2);
      expect(escalation.escalationRatePercent).toBe(20);
    });

    it('reports no rate rather than zero when nothing has closed yet', async () => {
      const { escalation } = await build(buildPrisma()).overview();

      expect(escalation.escalationRatePercent).toBeNull();
    });
  });
});
