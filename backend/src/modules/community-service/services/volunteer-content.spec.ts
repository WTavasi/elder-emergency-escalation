import { Severity } from '@prisma/client';
import { SMS_LIMIT } from '../../notification-service/services/notification-content';
import { roughDistance, volunteerMessages } from './volunteer-content';

describe('what volunteers are told', () => {
  it('rounds the distance, so it says how far and not where', () => {
    expect(roughDistance(287)).toBe('about 300 m');
    expect(roughDistance(10)).toBe('about 50 m');
    expect(roughDistance(1240)).toBe('about 1.2 km');
    expect(roughDistance(2000)).toBe('about 2 km');
  });

  it('an urgent ask says so, and offers the reply digits only when replies are read', () => {
    const urgent = volunteerMessages.ask('event-1', 600, Severity.CRITICAL, true);
    expect(urgent.title).toMatch(/^Urgent/);
    expect(urgent.sms).toContain('Reply 1');
    expect(urgent.data).toEqual({ type: 'volunteer-call', eventId: 'event-1' });

    const plain = volunteerMessages.ask('event-1', 600, Severity.STANDARD, false);
    expect(plain.title).not.toMatch(/Urgent/);
    expect(plain.sms).not.toContain('Reply');
  });

  it('every message fits one text', () => {
    const messages = [
      volunteerMessages.ask('e', 4800, Severity.CRITICAL, true).sms,
      volunteerMessages.stillNeeded('e', 4800).sms,
      volunteerMessages.covered('e').sms,
      volunteerMessages.over('e', true, 'Wilhelmina Nyakerario Moraa').sms,
      volunteerMessages.acceptedByText(
        'Wilhelmina Nyakerario Moraa Kemunto',
        'Off Kirichwa Road, Kileleshwa, Nairobi County, Kenya',
        '+254700000010',
      ),
      volunteerMessages.toTheCircle('Joseph Kamau Mwangi', 'Grace Wanjiru', 4800).sms,
    ];
    for (const sms of messages) expect(sms.length).toBeLessThanOrEqual(SMS_LIMIT);
  });

  it('the circle is told the volunteer goes beside them, not instead of them', () => {
    const message = volunteerMessages.toTheCircle('Joseph Kamau', 'Grace Wanjiru', 600);
    expect(message.body).toContain('Joseph Kamau');
    expect(message.body).toContain('Nothing else changes');
  });
});
