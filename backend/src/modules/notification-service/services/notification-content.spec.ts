import { AlertTrigger, EventState, Severity } from '@prisma/client';
import {
  accountMessages,
  capSms,
  composeNotification,
  REPLY_ASK,
  SMS_LIMIT,
} from './notification-content';

const base = {
  severity: Severity.STANDARD,
  tier: 1,
  elderName: 'Grace Wanjiru',
  addressLabel: 'Kileleshwa, Nairobi',
  eventId: 'event-1',
};

const forState = (state: EventState, overrides = {}) =>
  composeNotification({ ...base, state, ...overrides });

describe('composeNotification', () => {
  it('names the person and the place on a first alert', () => {
    const message = forState(EventState.TRIGGERED);
    expect(message.title).toBe('Grace needs help');
    expect(message.body).toContain('Kileleshwa, Nairobi');
    expect(message.data.action).toBe('respond');
  });

  it('says plainly that nobody has responded when escalating', () => {
    const message = forState(EventState.ESCALATED);
    expect(message.title).toMatch(/Still unanswered/);
    expect(message.body).toContain('Nobody has responded');
  });

  it('never reads as a fresh call for help once somebody is with the elder', () => {
    const message = forState(EventState.ON_SCENE);
    expect(message.title).toBe('Someone is with Grace');
    expect(message.body).toContain('No action needed');
    expect(message.data.action).toBe('view');
  });

  it('tells the caregiver a cancellation may be a mistake and invites a call', () => {
    const message = forState(EventState.CANCELLED);
    expect(message.title).toBe('Grace cancelled the alert');
    expect(message.body).toMatch(/Call to check/);
    expect(message.body).toMatch(/reopen/);
    expect(message.data.action).toBe('confirm_cancellation');
  });

  it('works without an address rather than printing an empty place', () => {
    const message = forState(EventState.TRIGGERED, { addressLabel: null });
    expect(message.body).not.toContain('undefined');
    expect(message.body).not.toContain(' at .');
    expect(message.body).toBe(
      'Grace Wanjiru raised an emergency alert. Open MzaziCare to respond.',
    );
  });

  it('carries no personal data in the push payload', () => {
    const payload = JSON.stringify(forState(EventState.TRIGGERED).data);
    expect(payload).not.toContain('Grace');
    expect(payload).not.toContain('Kileleshwa');
    expect(Object.keys(forState(EventState.TRIGGERED).data).sort()).toEqual([
      'action',
      'eventId',
      'state',
      'tier',
    ]);
  });

  it('makes no claim the system cannot keep', () => {
    for (const state of Object.values(EventState)) {
      const message = forState(state);
      const text = `${message.title} ${message.body} ${message.sms}`.toLowerCase();
      for (const forbidden of ['guarantee', '24/7', 'monitoring', 'ambulance is', 'will arrive']) {
        expect(text).not.toContain(forbidden);
      }
    }
  });

  it('points an SMS reader at emergency services, since they have no app open', () => {
    expect(forState(EventState.TRIGGERED).sms).toContain('999');
    expect(forState(EventState.ESCALATED).sms).toContain('999');
  });

  it('keeps every SMS inside one segment', () => {
    for (const state of Object.values(EventState)) {
      expect(forState(state).sms.length).toBeLessThanOrEqual(SMS_LIMIT);
    }
  });

  it('keeps a very long name and address inside one segment', () => {
    const message = forState(EventState.TRIGGERED, {
      elderName: 'Wilhelmina Nyakerario Moraa Kemunto Nyaboke',
      addressLabel: 'Off Kirichwa Road, Kileleshwa, Nairobi County, Kenya',
    });
    expect(message.sms.length).toBeLessThanOrEqual(SMS_LIMIT);
    expect(message.sms).toContain('MzaziCare');
  });
});

describe('composeNotification, replying by text', () => {
  const replying = (state: EventState, overrides = {}) =>
    composeNotification({ ...base, state, replyByText: true, ...overrides });

  it('asks for 1 or 2 on a first alert and on an escalation', () => {
    expect(replying(EventState.TRIGGERED).sms).toContain(REPLY_ASK);
    expect(replying(EventState.NOTIFIED).sms).toContain(REPLY_ASK);
    expect(replying(EventState.ESCALATED).sms).toContain(REPLY_ASK);
  });

  it('asks nothing of messages that need no answer', () => {
    for (const state of [
      EventState.ACKNOWLEDGED,
      EventState.ON_SCENE,
      EventState.RESOLVED,
      EventState.CANCELLED,
    ]) {
      expect(replying(state).sms).not.toContain('Reply');
    }
  });

  it('never asks for a reply when replies cannot be read', () => {
    for (const state of Object.values(EventState)) {
      expect(forState(state).sms).not.toContain('Reply');
    }
  });

  it('still fits one segment, keeping the ask, with a long name and address', () => {
    for (const state of [EventState.TRIGGERED, EventState.ESCALATED]) {
      const message = replying(state, {
        elderName: 'Wilhelmina Nyakerario Moraa Kemunto Nyaboke',
        addressLabel: 'Off Kirichwa Road, Kileleshwa, Nairobi County, Kenya',
      });
      expect(message.sms.length).toBeLessThanOrEqual(SMS_LIMIT);
      expect(message.sms).toContain(REPLY_ASK);
    }
  });

  it('keeps 999 in the first alert', () => {
    expect(replying(EventState.TRIGGERED).sms).toContain('999');
  });
});

describe('composeNotification, a missed check-in', () => {
  const missed = (state: EventState, overrides = {}) =>
    composeNotification({
      ...base,
      state,
      trigger: AlertTrigger.MISSED_CHECK_IN,
      ...overrides,
    });

  it('says nobody answered, not that the elder raised an alert', () => {
    for (const state of [EventState.TRIGGERED, EventState.NOTIFIED, EventState.ESCALATED]) {
      const message = missed(state);
      expect(message.title).toContain('check-in');
      expect(message.body).not.toContain('raised');
      expect(message.sms).not.toContain('raised');
      expect(message.data).toMatchObject({
        action: 'respond',
        trigger: AlertTrigger.MISSED_CHECK_IN,
      });
    }
  });

  it('asks for a call first', () => {
    expect(missed(EventState.TRIGGERED).body).toContain('call');
  });

  it('offers the reply digits only when replies are read', () => {
    expect(missed(EventState.TRIGGERED, { replyByText: true }).sms).toContain(REPLY_ASK);
    expect(missed(EventState.TRIGGERED).sms).not.toContain('Reply');
  });

  it('says the elder answered when a late answer withdrew it, and still invites a call', () => {
    const message = missed(EventState.CANCELLED);
    expect(message.title).toBe('Grace answered the check-in');
    expect(message.body).toContain('Call if you want to be sure');
    expect(message.body).not.toContain('false alarm');
  });

  it('fits one segment with a long name', () => {
    for (const state of [EventState.TRIGGERED, EventState.ESCALATED, EventState.CANCELLED]) {
      const message = missed(state, {
        replyByText: true,
        elderName: 'Wilhelmina Nyakerario Moraa Kemunto Nyaboke',
      });
      expect(message.sms.length).toBeLessThanOrEqual(SMS_LIMIT);
    }
  });
});

describe('capSms', () => {
  it('prefers the full wording when it fits', () => {
    expect(capSms('short', 'shorter')).toBe('short');
  });

  it('falls back to the shorter wording rather than truncating mid-sentence', () => {
    expect(capSms('x'.repeat(200), 'the short one')).toBe('the short one');
  });

  it('trims on a word boundary only as a last resort', () => {
    const result = capSms('x'.repeat(200), `${'word '.repeat(40)}end`);
    expect(result.length).toBeLessThanOrEqual(SMS_LIMIT);
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('accountMessages', () => {
  it('keeps every account message to one SMS', () => {
    const long = 'Wanjiku Mwangi-Odhiambo Kamau';
    for (const text of [
      accountMessages.verificationCode('123456', 10),
      accountMessages.alreadyRegistered(),
      accountMessages.addedToChain(long, long),
      accountMessages.invitedToChain(long, long),
    ]) {
      expect(text.length).toBeLessThanOrEqual(SMS_LIMIT);
    }
  });

  it('puts the code first, so a notification preview shows it', () => {
    expect(accountMessages.verificationCode('042317', 10).startsWith('042317 ')).toBe(true);
  });

  it('carries no link, because an unexpected link in an SMS looks like phishing', () => {
    expect(accountMessages.invitedToChain('Mary Otieno', 'Grace Wanjiru')).not.toMatch(
      /https?:|www\./,
    );
  });
});
