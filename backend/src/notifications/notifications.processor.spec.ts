import {
  AuditAction,
  EventState,
  NotificationChannel,
  NotificationStatus,
  Severity,
} from '@prisma/client';
import type { Job } from 'bullmq';
import { NotificationsProcessor } from './notifications.processor';
import type { NotificationsService } from './notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PushProvider } from './providers/push.provider';
import type { SmsProvider } from './providers/sms.provider';

const notification = (overrides: Record<string, unknown> = {}) => ({
  id: 'notification-1',
  eventId: 'event-1',
  recipientId: 'caregiver-1',
  channel: NotificationChannel.PUSH,
  status: NotificationStatus.QUEUED,
  tier: 1,
  recipient: { phone: '+254700000020', pushToken: 'device-token-abc' },
  event: {
    state: EventState.NOTIFIED,
    severity: Severity.STANDARD,
    alertAddressLabel: 'Kileleshwa, Nairobi',
    elder: { name: 'Grace Wanjiru' },
  },
  ...overrides,
});

const job = (attemptsMade = 0, attempts = 3): Job<{ notificationId: string }> =>
  ({
    data: { notificationId: 'notification-1' },
    attemptsMade,
    opts: { attempts },
  }) as unknown as Job<{ notificationId: string }>;

const buildPrisma = (stored: unknown = notification()) => {
  const prisma = {
    notification: {
      findUnique: jest.fn().mockResolvedValue(stored),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'notification-sms' }),
      update: jest.fn().mockResolvedValue({}),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  return { prisma: prisma as unknown as PrismaService, raw: prisma };
};

const buildProviders = () => {
  const push = { name: 'test-push', send: jest.fn() };
  const sms = { name: 'test-sms', send: jest.fn() };
  return {
    push: push as unknown as PushProvider,
    sms: sms as unknown as SmsProvider,
    raw: { push, sms },
  };
};

const buildNotifications = () => {
  const service = { enqueue: jest.fn().mockResolvedValue(undefined) };
  return { service: service as unknown as NotificationsService, raw: service };
};

describe('NotificationsProcessor', () => {
  it('marks a delivered push as sent and stores the provider reference', async () => {
    const { prisma, raw } = buildPrisma();
    const providers = buildProviders();
    const notifications = buildNotifications();
    providers.raw.push.send.mockResolvedValue({ delivered: true, providerMessageId: 'fcm-42' });

    await new NotificationsProcessor(
      prisma,
      notifications.service,
      providers.push,
      providers.sms,
    ).process(job());

    expect(providers.raw.push.send).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'device-token-abc', title: 'Grace needs help' }),
    );
    expect(raw.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: expect.objectContaining({
        status: NotificationStatus.SENT,
        providerMessageId: 'fcm-42',
      }),
    });
  });

  it('falls back to SMS when the push is permanently rejected', async () => {
    const { prisma, raw } = buildPrisma();
    const providers = buildProviders();
    const notifications = buildNotifications();
    providers.raw.push.send.mockResolvedValue({ delivered: false, error: 'no registered device' });

    await new NotificationsProcessor(
      prisma,
      notifications.service,
      providers.push,
      providers.sms,
    ).process(job());

    expect(raw.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: expect.objectContaining({ status: NotificationStatus.FAILED }),
    });
    expect(raw.auditLog.create.mock.calls[0][0].data.action).toBe(AuditAction.NOTIFICATION_FAILED);
    expect(raw.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: NotificationChannel.SMS, tier: 1 }),
      }),
    );
    expect(notifications.raw.enqueue).toHaveBeenCalledWith(['notification-sms']);
  });

  it('retries a transient failure instead of falling back straight away', async () => {
    const { prisma, raw } = buildPrisma();
    const providers = buildProviders();
    const notifications = buildNotifications();
    providers.raw.push.send.mockRejectedValue(new Error('socket hang up'));

    const processor = new NotificationsProcessor(
      prisma,
      notifications.service,
      providers.push,
      providers.sms,
    );

    await expect(processor.process(job(0, 3))).rejects.toThrow('socket hang up');
    expect(raw.notification.create).not.toHaveBeenCalled();
    expect(notifications.raw.enqueue).not.toHaveBeenCalled();
  });

  it('falls back once the last retry is spent', async () => {
    const { prisma, raw } = buildPrisma();
    const providers = buildProviders();
    const notifications = buildNotifications();
    providers.raw.push.send.mockRejectedValue(new Error('socket hang up'));

    const processor = new NotificationsProcessor(
      prisma,
      notifications.service,
      providers.push,
      providers.sms,
    );
    await expect(processor.process(job(2, 3))).resolves.toBeUndefined();

    expect(raw.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      data: expect.objectContaining({ status: NotificationStatus.FAILED }),
    });
    expect(notifications.raw.enqueue).toHaveBeenCalled();
  });

  it('sends the SMS wording, not the push wording, on an SMS notification', async () => {
    const { prisma } = buildPrisma(notification({ channel: NotificationChannel.SMS }));
    const providers = buildProviders();
    providers.raw.sms.send.mockResolvedValue({ delivered: true });

    await new NotificationsProcessor(
      prisma,
      buildNotifications().service,
      providers.push,
      providers.sms,
    ).process(job());

    const sent = providers.raw.sms.send.mock.calls[0][0] as { phone: string; text: string };
    expect(sent.phone).toBe('+254700000020');
    expect(sent.text).toContain('MzaziCare');
    expect(providers.raw.push.send).not.toHaveBeenCalled();
  });

  it('does not fall back from SMS, which has nowhere further to fall', async () => {
    const { prisma, raw } = buildPrisma(notification({ channel: NotificationChannel.SMS }));
    const providers = buildProviders();
    providers.raw.sms.send.mockResolvedValue({ delivered: false, error: 'invalid number' });

    await new NotificationsProcessor(
      prisma,
      buildNotifications().service,
      providers.push,
      providers.sms,
    ).process(job());

    expect(raw.notification.create).not.toHaveBeenCalled();
  });

  it('never puts two texts on one phone for the same tier', async () => {
    const { prisma, raw } = buildPrisma();
    raw.notification.findFirst.mockResolvedValue({ id: 'existing-sms' });
    const providers = buildProviders();
    providers.raw.push.send.mockResolvedValue({ delivered: false, error: 'no registered device' });

    await new NotificationsProcessor(
      prisma,
      buildNotifications().service,
      providers.push,
      providers.sms,
    ).process(job());

    expect(raw.notification.create).not.toHaveBeenCalled();
  });

  it('sends nothing for a notification the recipient has already acknowledged', async () => {
    const { prisma } = buildPrisma(notification({ status: NotificationStatus.ACKNOWLEDGED }));
    const providers = buildProviders();

    await new NotificationsProcessor(
      prisma,
      buildNotifications().service,
      providers.push,
      providers.sms,
    ).process(job());

    expect(providers.raw.push.send).not.toHaveBeenCalled();
  });

  it('does nothing when the notification has gone', async () => {
    const { prisma } = buildPrisma(null);
    const providers = buildProviders();

    await expect(
      new NotificationsProcessor(
        prisma,
        buildNotifications().service,
        providers.push,
        providers.sms,
      ).process(job()),
    ).resolves.toBeUndefined();
    expect(providers.raw.push.send).not.toHaveBeenCalled();
  });

  it('uses the cancellation wording once the event has been withdrawn', async () => {
    const { prisma } = buildPrisma(
      notification({
        event: {
          state: EventState.CANCELLED,
          severity: Severity.STANDARD,
          alertAddressLabel: 'Kileleshwa, Nairobi',
          elder: { name: 'Grace Wanjiru' },
        },
      }),
    );
    const providers = buildProviders();
    providers.raw.push.send.mockResolvedValue({ delivered: true });

    await new NotificationsProcessor(
      prisma,
      buildNotifications().service,
      providers.push,
      providers.sms,
    ).process(job());

    const sent = providers.raw.push.send.mock.calls[0][0] as { title: string; body: string };
    expect(sent.title).toBe('Grace cancelled the alert');
    expect(sent.body).toMatch(/Call to check/);
  });
});
