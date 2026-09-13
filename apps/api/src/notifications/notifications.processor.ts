import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { AuditAction, NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { composeNotification } from './notification-content';
import { NOTIFICATIONS_QUEUE, type DeliverJobData } from './notifications.queue';
import { NotificationsService } from './notifications.service';
import { PUSH_PROVIDER, type PushProvider } from './providers/push.provider';
import { SMS_PROVIDER, type SmsProvider } from './providers/sms.provider';

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {
    super();
  }

  async process(job: Job<DeliverJobData>): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: job.data.notificationId },
      include: { event: { include: { elder: true } }, recipient: true },
    });

    // Gone, or already answered by the person it was sent to. Either way there is
    // nothing useful left to deliver.
    if (!notification) return;
    if (
      notification.status === NotificationStatus.DELIVERED ||
      notification.status === NotificationStatus.ACKNOWLEDGED
    ) {
      return;
    }

    const content = composeNotification({
      state: notification.event.state,
      severity: notification.event.severity,
      tier: notification.tier,
      elderName: notification.event.elder.name,
      addressLabel: notification.event.alertAddressLabel,
      eventId: notification.eventId,
    });

    const attempts = job.opts.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade + 1 >= attempts;

    try {
      const result =
        notification.channel === NotificationChannel.PUSH
          ? await this.push.send({
              token: notification.recipient.pushToken ?? '',
              title: content.title,
              body: content.body,
              data: content.data,
            })
          : await this.sms.send({ phone: notification.recipient.phone, text: content.sms });

      if (result.delivered) {
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: NotificationStatus.SENT,
            sentAt: new Date(),
            providerMessageId: result.providerMessageId ?? null,
          },
        });
        return;
      }

      // A permanent failure, such as a device that is no longer registered. Retrying
      // would only delay the fallback.
      await this.recordFailure(notification.id, notification.eventId, result.error ?? 'rejected');
      await this.fallBackToSms(notification);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown provider error';

      if (!isFinalAttempt) {
        // Transient. Let the queue retry rather than burning the fallback.
        throw error;
      }

      this.logger.error(`Giving up on notification ${notification.id} after ${attempts} attempts`);
      await this.recordFailure(notification.id, notification.eventId, reason);
      await this.fallBackToSms(notification);
    }
  }

  private async recordFailure(
    notificationId: string,
    eventId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: NotificationStatus.FAILED, failureReason: reason.slice(0, 400) },
    });

    await this.prisma.auditLog.create({
      data: {
        eventId,
        actorId: null,
        action: AuditAction.NOTIFICATION_FAILED,
        detail: {
          notificationId,
          reason: reason.slice(0, 400),
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Falls back to SMS when a push could not be delivered.
   *
   * Only once per recipient per tier: a push failing twice must not put two texts on
   * somebody's phone, and an SMS that fails has nowhere further to fall.
   */
  private async fallBackToSms(notification: {
    id: string;
    eventId: string;
    recipientId: string;
    tier: number;
    channel: NotificationChannel;
  }): Promise<void> {
    if (notification.channel !== NotificationChannel.PUSH) return;

    const existing = await this.prisma.notification.findFirst({
      where: {
        eventId: notification.eventId,
        recipientId: notification.recipientId,
        tier: notification.tier,
        channel: NotificationChannel.SMS,
      },
    });
    if (existing) return;

    const sms = await this.prisma.notification.create({
      data: {
        eventId: notification.eventId,
        recipientId: notification.recipientId,
        channel: NotificationChannel.SMS,
        status: NotificationStatus.QUEUED,
        tier: notification.tier,
      },
      select: { id: true },
    });

    await this.notifications.enqueue([sms.id]);
    this.logger.warn(`Push failed for notification ${notification.id}; SMS fallback queued`);
  }
}
