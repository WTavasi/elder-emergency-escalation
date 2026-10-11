import { Inject, Injectable, Logger } from '@nestjs/common';
import { redactPhone } from '../../../shared/utils/redaction';
import { SMS_PROVIDER, type SmsProvider } from '../providers/sms.provider';

/**
 * An SMS sent straight away, outside the notification queue.
 *
 * The queue is for emergency notifications, which have a database row, a tier, retries
 * and a fallback. A sign-up code or a "you were added" message has none of those: it
 * belongs to nobody's emergency, and a code that arrives after a retry minutes later is
 * worse than one that fails now and can be asked for again. So these go directly, and
 * the caller is told whether the provider accepted the message.
 */
@Injectable()
export class DirectSmsService {
  private readonly logger = new Logger(DirectSmsService.name);

  constructor(@Inject(SMS_PROVIDER) private readonly sms: SmsProvider) {}

  async send(phone: string, text: string): Promise<boolean> {
    try {
      const result = await this.sms.send({ phone, text });
      if (!result.delivered) {
        this.logger.warn(`SMS to ${redactPhone(phone)} refused: ${result.error ?? 'no reason'}`);
      }
      return result.delivered;
    } catch (error) {
      this.logger.warn(
        `SMS to ${redactPhone(phone)} failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return false;
    }
  }
}
