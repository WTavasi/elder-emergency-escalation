import { EventState, Severity } from '@prisma/client';
import { capSms, composeNotification, SMS_LIMIT } from './notification-content';

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
