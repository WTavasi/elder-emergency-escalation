import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { redactPhone } from '../../../shared/utils/redaction';
import {
  PUSH_PROVIDER,
  type PushProvider,
} from '../../notification-service/providers/push.provider';
import { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import { capSms } from '../../notification-service/services/notification-content';
import { partOfDay } from './check-in-times';

export interface CheckInRecipient {
  name: string;
  phone: string;
  pushToken: string | null;
  timezone: string;
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;

/**
 * Asking the elder. A push to their phone first, because the app is where "I am all
 * right" is one press; a text when there is no push address or the push fails, which
 * for an elder on a basic phone is every time.
 *
 * The words are the system's whole voice to somebody who may be alone and anxious, so
 * they greet by name in the elder's own time of day and ask one thing.
 */
@Injectable()
export class CheckInMessenger {
  private readonly logger = new Logger(CheckInMessenger.name);

  constructor(
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    private readonly sms: DirectSmsService,
    private readonly config: ConfigService,
  ) {}

  /** The first ask, or the reminder half way through the time to answer. */
  async ask(
    elder: CheckInRecipient,
    checkInId: string,
    reminder = false,
    now = new Date(),
  ): Promise<'push' | 'sms' | 'none'> {
    const first = firstName(elder.name);
    const part = partOfDay(now, elder.timezone);
    const title = reminder ? `${first}, are you all right?` : `Good ${part}, ${first}`;
    const body = reminder
      ? 'You have not answered yet. Open MzaziCare and press "I am all right".'
      : 'Are you all right? Open MzaziCare to let your family know.';

    if (elder.pushToken) {
      try {
        const result = await this.push.send({
          token: elder.pushToken,
          title,
          body,
          // No personal data: it travels through a third party. The app asks the API.
          data: { type: 'check-in', checkInId },
        });
        if (result.delivered) return 'push';
      } catch (error) {
        this.logger.warn(
          `Check-in push failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    const replies = Boolean(this.config.get<string>('SMS_INBOUND_TOKEN'));
    const text = replies
      ? capSms(
          `MzaziCare: ${reminder ? `${first}, you have not answered yet.` : `Good ${part}, ${first}.`} Are you all right? Reply 1 if you are.`,
          `MzaziCare: ${first}, are you all right? Reply 1 if you are.`,
        )
      : capSms(
          `MzaziCare: ${reminder ? `${first}, you have not answered yet.` : `Good ${part}, ${first}.`} Are you all right? Open MzaziCare to say so.`,
          `MzaziCare: ${first}, are you all right? Open MzaziCare to say so.`,
        );
    const sent = await this.sms.send(elder.phone, text);
    if (!sent) this.logger.warn(`Check-in could not reach ${redactPhone(elder.phone)} at all`);
    return sent ? 'sms' : 'none';
  }
}
