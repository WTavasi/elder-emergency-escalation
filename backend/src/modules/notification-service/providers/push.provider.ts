export interface PushMessage {
  token: string;
  title: string;
  body: string;
  /**
   * Small key-value payload the app reads to open the right screen. Deliberately holds
   * no personal data: it travels through a third-party push service, and the app can
   * fetch anything it needs from this API using the event id.
   */
  data: Record<string, string>;
}

export interface DeliveryResult {
  delivered: boolean;
  providerMessageId?: string;
  /** Why it failed, in words safe to store. Never includes credentials. */
  error?: string;
}

/**
 * The contract every push provider honours.
 *
 * Returning `delivered: false` means a permanent failure, such as an unregistered
 * device, and the caller moves straight to the SMS fallback. Throwing means a transient
 * failure, such as a network timeout, and the job is retried. Getting that distinction
 * wrong either burns retries on a dead token or gives up on a working one.
 */
export interface PushProvider {
  readonly name: string;
  send(message: PushMessage): Promise<DeliveryResult>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
