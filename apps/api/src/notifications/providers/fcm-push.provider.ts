import { Injectable, Logger } from '@nestjs/common';
import { withTimeout } from '../../common/with-timeout';
import type { DeliveryResult, PushMessage, PushProvider } from './push.provider';

/** The one Firebase call this provider makes, declared so tests need no Firebase. */
export interface FcmMessaging {
  send(message: {
    token: string;
    notification: { title: string; body: string };
    data: Record<string, string>;
    android: { priority: 'high'; notification: { channelId: string; priority: 'max' } };
    apns: { headers: Record<string, string>; payload: { aps: { sound: string } } };
  }): Promise<string>;
}

/**
 * Errors that will fail identically on every retry.
 *
 * A device that has been wiped, reinstalled or simply not opened for months returns an
 * unregistered token, and no amount of retrying changes that. These become a permanent
 * failure so the caller moves to SMS immediately rather than spending three attempts
 * and six seconds first.
 */
const PERMANENT_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
  'messaging/invalid-recipient',
  'messaging/mismatched-credential',
  'messaging/sender-id-mismatch',
]);

@Injectable()
export class FcmPushProvider implements PushProvider {
  readonly name = 'fcm';

  private readonly logger = new Logger(FcmPushProvider.name);

  constructor(
    private readonly messaging: FcmMessaging,
    /**
     * Firebase's client has its own internal timeout, but it is theirs to change and
     * it covers their transport rather than this call. Bounding the wait here means
     * the guarantee belongs to this system and is visible in one place.
     */
    private readonly timeoutMs: number = 10_000,
  ) {}

  async send(message: PushMessage): Promise<DeliveryResult> {
    if (!message.token) {
      return { delivered: false, error: 'no registered device' };
    }

    try {
      const providerMessageId = await withTimeout(
        this.messaging.send({
          token: message.token,
          notification: { title: message.title, body: message.body },
          data: message.data,
          // An emergency alert is exactly what high priority exists for: it wakes a
          // device out of doze rather than waiting for the next maintenance window.
          android: {
            priority: 'high',
            notification: { channelId: 'emergencies', priority: 'max' },
          },
          apns: {
            headers: { 'apns-priority': '10' },
            payload: { aps: { sound: 'default' } },
          },
        }),
        this.timeoutMs,
        'Firebase Cloud Messaging',
      );

      return { delivered: true, providerMessageId };
    } catch (error) {
      const code = (error as { code?: string }).code ?? '';

      if (PERMANENT_ERRORS.has(code)) {
        this.logger.warn(`Push permanently rejected (${code}); falling back to SMS`);
        return { delivered: false, error: code };
      }

      // Quota, network, or Firebase having a bad day. Worth another attempt.
      throw error;
    }
  }
}
