import type { DeliveryResult, PushMessage, PushProvider } from './push.provider';

export interface FanoutResult extends DeliveryResult {
  /** Addresses the push service refused for good: no longer registered. To be forgotten. */
  rejected: string[];
}

/**
 * One message to every phone a person is signed in on.
 *
 * Delivered if any phone took it. A phone the service refuses for good is reported, so its
 * address can be forgotten. If none took it and at least one failure was transient, that
 * error is thrown, so the job is retried as it would be for a single phone. With no phone
 * at all, the provider is asked with no address, which it refuses the way it always has,
 * and the SMS fallback runs.
 */
export async function sendToEvery(
  push: PushProvider,
  tokens: string[],
  message: Omit<PushMessage, 'token'>,
): Promise<FanoutResult> {
  if (tokens.length === 0) {
    return { ...(await push.send({ ...message, token: '' })), rejected: [] };
  }

  const outcomes = await Promise.allSettled(
    tokens.map((token) => push.send({ ...message, token })),
  );
  const delivered = outcomes.find(
    (o): o is PromiseFulfilledResult<DeliveryResult> =>
      o.status === 'fulfilled' && o.value.delivered,
  );
  const rejected = tokens.filter((_, i) => {
    const outcome = outcomes[i];
    return outcome?.status === 'fulfilled' && !outcome.value.delivered;
  });

  if (delivered) {
    return { delivered: true, providerMessageId: delivered.value.providerMessageId, rejected };
  }

  const transient = outcomes.find((o): o is PromiseRejectedResult => o.status === 'rejected');
  if (transient) throw transient.reason;

  const firstRefusal = outcomes.find(
    (o): o is PromiseFulfilledResult<DeliveryResult> => o.status === 'fulfilled',
  );
  return { delivered: false, error: firstRefusal?.value.error ?? 'rejected', rejected };
}
