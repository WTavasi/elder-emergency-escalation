/**
 * Redis key naming for escalation timers.
 *
 * One key per event per tier, holding nothing of value: the key's existence is the
 * timer, and its expiry is the signal. Nothing about the emergency is stored in Redis,
 * so a Redis loss costs pending timers, which the deadline column can rebuild, and no
 * personal data at all.
 */

export const TIMER_PREFIX = 'escalation:timer';

export const timerKey = (eventId: string, tier: number): string =>
  `${TIMER_PREFIX}:${eventId}:${tier}`;

export interface ParsedTimerKey {
  eventId: string;
  tier: number;
}

/**
 * The second look at an emergency's severity, when its cancel window closes. One per
 * emergency. Under its own prefix so clearing an emergency's tier timers, which every
 * acknowledgement does, never clears it: a review is still owed to an emergency
 * somebody has taken on, for the record if nothing else.
 */
export const REVIEW_PREFIX = 'escalation:review';

export const reviewKey = (eventId: string): string => `${REVIEW_PREFIX}:${eventId}`;

/** The emergency a review key belongs to, or null for any other key. */
export function parseReviewKey(key: string): string | null {
  const parts = key.split(':');
  if (parts.length !== 3) return null;
  if (`${parts[0]}:${parts[1]}` !== REVIEW_PREFIX) return null;
  return parts[2] || null;
}

/** Returns null for any key that is not one of ours, including other apps' keys. */
export function parseTimerKey(key: string): ParsedTimerKey | null {
  const parts = key.split(':');
  if (parts.length !== 4) return null;
  if (`${parts[0]}:${parts[1]}` !== TIMER_PREFIX) return null;

  const tier = Number(parts[3]);
  if (!Number.isInteger(tier) || tier < 1) return null;
  if (!parts[2]) return null;

  return { eventId: parts[2], tier };
}
