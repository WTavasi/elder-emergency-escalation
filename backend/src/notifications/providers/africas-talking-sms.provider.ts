import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { redactPhone } from '../../common/redaction';
import type { DeliveryResult } from './push.provider';
import type { SmsMessage, SmsProvider } from './sms.provider';

/**
 * Minimal shape of fetch that this provider needs.
 *
 * Declared rather than imported so the tests can hand in a stub without pulling in DOM
 * type definitions, and so nothing here depends on a global that may or may not exist.
 */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

interface AfricasTalkingRecipient {
  statusCode?: number;
  status?: string;
  messageId?: string;
  number?: string;
}

interface AfricasTalkingResponse {
  SMSMessageData?: {
    Message?: string;
    Recipients?: AfricasTalkingRecipient[];
  };
}

/**
 * Africa's Talking SMS, over their HTTP API directly.
 *
 * Their Node SDK would work, but this is one form-encoded POST and one response to
 * interpret, and going direct keeps the failure handling explicit: which replies mean
 * "give up" and which mean "try again" is the whole contract a provider has to honour,
 * and it is easier to get right, and to test, when it is written out.
 */
@Injectable()
export class AfricasTalkingSmsProvider implements SmsProvider {
  readonly name = 'africastalking';

  private readonly logger = new Logger(AfricasTalkingSmsProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
  ) {}

  async send(message: SmsMessage): Promise<DeliveryResult> {
    const username = this.config.getOrThrow<string>('AT_USERNAME');
    const apiKey = this.config.getOrThrow<string>('AT_API_KEY');
    const senderId = this.config.get<string>('AT_SENDER_ID');

    const body = new URLSearchParams({
      username,
      to: message.phone,
      message: message.text,
    });

    // The sandbox rejects a custom sender id, and a live account without a registered
    // one falls back to a shared shortcode. Either way, omitting it is correct when
    // none is configured.
    if (senderId) body.set('from', senderId);

    // Node's fetch has no default timeout, so a connection that opens and then stalls
    // would hold this job until the queue's lock expired, minutes later. In an
    // emergency the fallback message is the last channel there is, so an unbounded
    // wait is the worst possible failure: nothing is sent and nothing is reported.
    //
    // An abort rejects, which the processor treats as transient and retries. That is
    // the right reading: a gateway that did not answer in time may well answer the
    // next attempt.
    const timeoutMs = this.config.get<number>('PROVIDER_TIMEOUT_MS', 10_000) ?? 10_000;

    let response;
    try {
      response = await this.fetchImpl(
        `${AfricasTalkingSmsProvider.baseUrl(username)}/version1/messaging`,
        {
          method: 'POST',
          headers: {
            apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: body.toString(),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
    } catch (error: unknown) {
      // Rethrown with the cause named, so a timeout is distinguishable from a DNS or
      // TLS failure when the delivery log is read back.
      const reason =
        error instanceof Error && error.name === 'TimeoutError'
          ? `no response within ${timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : 'unknown network failure';
      // The original is attached, so the underlying network fault is still
      // recoverable from the log rather than replaced by our summary of it.
      throw new Error(`Africa's Talking request failed: ${reason}`, { cause: error });
    }

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);

      // Their problem, so it is worth trying again. Ours, so it is not.
      if (response.status >= 500 || response.status === 429) {
        throw new Error(`Africa's Talking returned ${response.status}: ${detail}`);
      }
      return { delivered: false, error: `HTTP ${response.status}: ${detail}` };
    }

    const payload = (await response.json()) as AfricasTalkingResponse;
    const recipient = payload.SMSMessageData?.Recipients?.[0];

    if (!recipient) {
      // A 200 with no recipient means the request was understood and refused, which
      // their message explains. Most often an unregistered sender id or no credit.
      return {
        delivered: false,
        error: payload.SMSMessageData?.Message ?? 'no recipient in response',
      };
    }

    const status = recipient.statusCode ?? 0;

    // 100-102 mean processed, sent or queued: accepted for delivery. 500-502 are their
    // gateway failing, which is worth a retry. Everything else, such as an invalid
    // number or an empty balance, will fail again identically.
    if (status >= 100 && status <= 102) {
      this.logger.log(`SMS accepted for ${redactPhone(message.phone)} (${recipient.status})`);
      return { delivered: true, providerMessageId: recipient.messageId };
    }

    if (status >= 500) {
      throw new Error(`Africa's Talking gateway error ${status}: ${recipient.status ?? 'unknown'}`);
    }

    return { delivered: false, error: `${recipient.status ?? 'rejected'} (${status})` };
  }

  /** The sandbox has its own host, and the username is how you are in it. */
  static baseUrl(username: string): string {
    return username === 'sandbox'
      ? 'https://api.sandbox.africastalking.com'
      : 'https://api.africastalking.com';
  }
}
