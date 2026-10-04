import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  DELIVER_JOB,
  DELIVER_JOB_OPTIONS,
  NOTIFICATIONS_QUEUE,
  type DeliverJobData,
} from './notifications.queue';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue<DeliverJobData>,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Hands already-recorded notifications to the queue.
   *
   * The rows are written by whoever decided to notify, inside their transaction, so a
   * dispatch that commits is always visible in the audit trail even if the queue is
   * unavailable. This only schedules the sending.
   */
  async enqueue(notificationIds: string[]): Promise<void> {
    if (notificationIds.length === 0) return;

    await this.queue.addBulk(
      notificationIds.map((notificationId) => ({
        name: DELIVER_JOB,
        data: { notificationId },
        opts: DELIVER_JOB_OPTIONS,
      })),
    );
  }

  /**
   * Tells everyone who was already alerted that the elder withdrew it.
   *
   * Sending nothing would leave a caregiver believing an emergency is still running,
   * and the point of the cancellation notice is that they can call to check rather than
   * assume. Only people who were actually told are told again.
   */
  async notifyCancellation(eventId: string): Promise<void> {
    const alreadyNotified = await this.prisma.notification.findMany({
      where: { eventId, channel: NotificationChannel.PUSH },
      distinct: ['recipientId'],
      select: { recipientId: true, tier: true },
    });

    if (alreadyNotified.length === 0) return;

    const created = await Promise.all(
      alreadyNotified.map((notification) =>
        this.prisma.notification.create({
          data: {
            eventId,
            recipientId: notification.recipientId,
            channel: NotificationChannel.PUSH,
            status: NotificationStatus.QUEUED,
            tier: notification.tier,
          },
          select: { id: true },
        }),
      ),
    );

    await this.enqueue(created.map((notification) => notification.id));
    this.logger.log(`Cancellation notice queued for ${created.length} recipient(s) of ${eventId}`);
  }
}
