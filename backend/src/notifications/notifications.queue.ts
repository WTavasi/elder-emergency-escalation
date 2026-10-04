import type { JobsOptions } from 'bullmq';

export const NOTIFICATIONS_QUEUE = 'notifications';
export const DELIVER_JOB = 'deliver';

export interface DeliverJobData {
  notificationId: string;
}

/**
 * Three attempts with exponential backoff.
 *
 * Sending is the one part of this system that talks to somebody else's network, so it
 * is the one part that fails transiently. Retrying matters, but not for long: an
 * emergency notification that has been retried for a minute has already been overtaken
 * by the escalation timer, and the SMS fallback is the better answer by then.
 */
export const DELIVER_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 86_400 },
};
