import { describe, expect, it } from 'vitest';
import type { AuditEntry, ChainMember, DeliveryAttempt } from '../api/types';
import { afterTheAlert, timelineSentence } from './timeline';

const chain: ChainMember[] = [
  { responderId: 'mary', name: 'Mary Otieno', role: 'CAREGIVER', priorityOrder: 1 },
  { responderId: 'aisha', name: 'Aisha Wanjiru', role: 'FAMILY_MEMBER', priorityOrder: 2 },
  { responderId: 'brian', name: 'Brian Wanjiru', role: 'FAMILY_MEMBER', priorityOrder: 2 },
];

const deliveries: DeliveryAttempt[] = [
  {
    id: 'notification-1',
    channel: 'PUSH',
    status: 'FAILED',
    tier: 1,
    recipient: { id: 'mary', name: 'Mary Otieno', role: 'CAREGIVER' },
    failureReason: 'no registered device',
    sentAt: null,
    deliveredAt: null,
    acknowledgedAt: null,
  },
];

function entry(action: string, detail: unknown = null, actor = false): AuditEntry {
  return {
    id: action,
    action,
    previousState: null,
    newState: null,
    actor: actor ? { id: 'grace', name: 'Grace Wanjiru', role: 'ELDER' } : null,
    detail,
    occurredAt: '2026-10-29T09:00:00.000Z',
    secondsFromTrigger: 0,
  };
}

const say = (item: AuditEntry) => timelineSentence(item, { chain, deliveries });

describe('the record of an emergency, in sentences', () => {
  it('says who asked for help, and how', () => {
    expect(say(entry('EVENT_CREATED', null, true))).toBe('Grace Wanjiru asked for help');
    expect(say(entry('EVENT_CREATED', { via: 'sms' }, true))).toBe(
      'Grace Wanjiru asked for help, by text',
    );
    expect(say(entry('EVENT_CREATED', { trigger: 'MISSED_CHECK_IN' }))).toBe(
      'The daily check-in went unanswered',
    );
  });

  it('names everybody a tier was sent to, a family of two included', () => {
    expect(say(entry('TIER_DISPATCHED', { tier: 1 }))).toBe('Sent to Mary Otieno');
    expect(say(entry('TIER_DISPATCHED', { tier: 2, recipients: 2 }))).toBe(
      'Sent to Aisha Wanjiru and Brian Wanjiru',
    );
    expect(say(entry('TIER_DISPATCHED', { tier: 3, recipients: 2 }))).toBe('Sent to 2 people');
  });

  it('says where it moved on to, or that there was nobody further', () => {
    expect(say(entry('ESCALATED', { fromTier: 1, toTier: 2 }))).toBe(
      'Nobody answered in time, so it moved on to Aisha Wanjiru and Brian Wanjiru',
    );
    expect(say(entry('ESCALATED', {}))).toBe('Nobody answered, and there is nobody further to ask');
  });

  it('says how it was scored, and whether the second scoring changed the band', () => {
    expect(say(entry('SEVERITY_EVALUATED', { score: 48, band: 'ELEVATED' }))).toBe(
      'Scored elevated, 48',
    );
    expect(
      say(
        entry('SEVERITY_EVALUATED', {
          score: 60,
          band: 'CRITICAL',
          stage: 'cancel_window_closed',
          severityBefore: 'ELEVATED',
        }),
      ),
    ).toBe('Scored again once the cancel window closed: critical, 60, was elevated');
  });

  it('names the person a message failed to reach, and why', () => {
    expect(
      say(
        entry('NOTIFICATION_FAILED', {
          notificationId: 'notification-1',
          channel: 'PUSH',
          reason: 'no registered device',
        }),
      ),
    ).toBe('A push to Mary Otieno could not be delivered: no registered device');
  });

  it('tidies an action it does not know rather than leaving a blank line', () => {
    expect(say(entry('SOMETHING_NEW'))).toBe('Something new');
  });

  it('says when, relative to the alert, in words', () => {
    expect(afterTheAlert(0)).toBe('When the alert was raised');
    expect(afterTheAlert(1)).toBe('1 second after the alert');
    expect(afterTheAlert(70)).toBe('1 minute after the alert');
    expect(afterTheAlert(7200)).toBe('2 hours after the alert');
  });
});
