import type { DeliveryResult } from './push.provider';

export interface SmsMessage {
  /** International format, for example +254712345678. */
  phone: string;
  text: string;
}

/** Same contract as the push provider: return false for permanent, throw for transient. */
export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<DeliveryResult>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
