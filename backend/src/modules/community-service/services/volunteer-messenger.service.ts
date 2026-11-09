import { Inject, Injectable, Logger } from '@nestjs/common';
import { redactPhone } from '../../../shared/utils/redaction';
import {
  PUSH_PROVIDER,
  type PushProvider,
} from '../../notification-service/providers/push.provider';
import { pushTokensOf } from '../../../shared/utils/push-targets';
import { sendToEvery } from '../../notification-service/providers/push-fanout';
import { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import type { VolunteerMessage } from './volunteer-content';

/**
 * A person to reach: their number, and their push addresses, either already gathered or as
 * the database returns them (PUSH_TARGETS_SELECT).
 */
export interface Reachable {
  phone: string;
  pushTokens?: string[];
  pushToken?: string | null;
  devices?: { pushToken: string | null }[];
}

/**
 * Sends one message to one person: a push first, a text when there is no push address
 * or the push fails. Outside the notification queue on purpose. The queue writes each
 * message from the emergency itself, with the elder's name and address, and makes
 * everybody it sends to a participant who can open the emergency. A volunteer is neither
 * until they accept.
 */
@Injectable()
export class VolunteerMessenger {
  private readonly logger = new Logger(VolunteerMessenger.name);

  constructor(
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    private readonly sms: DirectSmsService,
  ) {}

  async send(person: Reachable, message: VolunteerMessage): Promise<'push' | 'sms' | 'none'> {
    const tokens = person.pushTokens ?? pushTokensOf(person);
    if (tokens.length > 0) {
      try {
        const result = await sendToEvery(this.push, tokens, {
          title: message.title,
          body: message.body,
          data: message.data,
        });
        if (result.delivered) return 'push';
      } catch (error) {
        this.logger.warn(
          `Volunteer push failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }
    const sent = await this.sms.send(person.phone, message.sms);
    if (!sent) this.logger.warn(`Could not reach ${redactPhone(person.phone)} at all`);
    return sent ? 'sms' : 'none';
  }
}
