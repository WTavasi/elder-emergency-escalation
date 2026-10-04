import { NotificationChannel } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { DELIVER_JOB } from './notifications.queue';
import type { PrismaService } from '../prisma/prisma.service';
import type { Queue } from 'bullmq';

const buildQueue = () => {
  const queue = { addBulk: jest.fn().mockResolvedValue([]) };
  return { queue: queue as unknown as Queue, raw: queue };
};

const buildPrisma = () => {
  const prisma = {
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(() => Promise.resolve({ id: 'new-notification' })),
    },
  };
  return { prisma: prisma as unknown as PrismaService, raw: prisma };
};

describe('NotificationsService', () => {
  describe('enqueue', () => {
    it('queues one delivery job per notification, with retries configured', async () => {
      const { queue, raw } = buildQueue();
      await new NotificationsService(queue, buildPrisma().prisma).enqueue(['a', 'b']);

      const jobs = raw.addBulk.mock.calls[0][0] as Array<{
        name: string;
        data: { notificationId: string };
        opts: { attempts: number };
      }>;
      expect(jobs).toHaveLength(2);
      expect(jobs[0].name).toBe(DELIVER_JOB);
      expect(jobs.map((item) => item.data.notificationId)).toEqual(['a', 'b']);
      expect(jobs[0].opts.attempts).toBe(3);
    });

    it('does not touch the queue for an empty list', async () => {
      const { queue, raw } = buildQueue();
      await new NotificationsService(queue, buildPrisma().prisma).enqueue([]);
      expect(raw.addBulk).not.toHaveBeenCalled();
    });
  });

  describe('notifyCancellation', () => {
    it('tells each person who was already alerted, once', async () => {
      const { queue, raw: queueRaw } = buildQueue();
      const { prisma, raw } = buildPrisma();
      raw.notification.findMany.mockResolvedValue([
        { recipientId: 'caregiver-1', tier: 1 },
        { recipientId: 'family-1', tier: 2 },
      ]);

      await new NotificationsService(queue, prisma).notifyCancellation('event-1');

      expect(raw.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId: 'event-1', channel: NotificationChannel.PUSH },
          distinct: ['recipientId'],
        }),
      );
      expect(raw.notification.create).toHaveBeenCalledTimes(2);
      expect(queueRaw.addBulk.mock.calls[0][0]).toHaveLength(2);
    });

    it('stays silent when nobody had been alerted yet', async () => {
      const { queue, raw: queueRaw } = buildQueue();
      const { prisma, raw } = buildPrisma();

      await new NotificationsService(queue, prisma).notifyCancellation('event-1');

      expect(raw.notification.create).not.toHaveBeenCalled();
      expect(queueRaw.addBulk).not.toHaveBeenCalled();
    });
  });
});
