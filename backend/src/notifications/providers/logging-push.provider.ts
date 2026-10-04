import { Injectable, Logger } from '@nestjs/common';
import { redactPhone } from '../../common/redaction';
import type { DeliveryResult, PushMessage, PushProvider } from './push.provider';

/**
 * Development push provider. Writes what would have been sent and reports success.
 *
 * This exists so the whole escalation chain, including the SMS fallback, can be
 * exercised before any Firebase credentials exist. An account with no registered device
 * is refused here exactly as Firebase would refuse it, which means the fallback path
 * runs naturally in development rather than only in production.
 */
@Injectable()
export class LoggingPushProvider implements PushProvider {
  readonly name = 'logging-push';

  private readonly logger = new Logger(LoggingPushProvider.name);

  send(message: PushMessage): Promise<DeliveryResult> {
    if (!message.token) {
      return Promise.resolve({ delivered: false, error: 'no registered device' });
    }

    this.logger.log(`PUSH to ${message.token.slice(0, 8)}…: "${message.title}" — ${message.body}`);
    return Promise.resolve({
      delivered: true,
      providerMessageId: `logging-${Date.now()}`,
    });
  }
}

@Injectable()
export class LoggingSmsProvider {
  readonly name = 'logging-sms';

  private readonly logger = new Logger(LoggingSmsProvider.name);

  send(message: { phone: string; text: string }): Promise<DeliveryResult> {
    this.logger.log(`SMS to ${redactPhone(message.phone)}: ${message.text}`);
    return Promise.resolve({ delivered: true, providerMessageId: `logging-${Date.now()}` });
  }
}
