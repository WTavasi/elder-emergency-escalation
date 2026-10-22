import type { ConfigService } from '@nestjs/config';
import type { PushProvider } from '../../notification-service/providers/push.provider';
import type { DirectSmsService } from '../../notification-service/services/direct-sms.service';
import { SMS_LIMIT } from '../../notification-service/services/notification-content';
import { CheckInMessenger } from './check-in-messenger.service';

const GRACE = {
  name: 'Grace Wanjiru',
  phone: '+254700000010',
  pushToken: 'token-1',
  timezone: 'Africa/Nairobi',
};
// Nine in the morning in Nairobi.
const MORNING = new Date('2026-10-22T06:00:00Z');

function build(options: { delivered?: boolean; pushFails?: boolean; replies?: boolean } = {}) {
  const push = {
    send: options.pushFails
      ? jest.fn().mockRejectedValue(new Error('offline'))
      : jest.fn().mockResolvedValue({ delivered: options.delivered ?? true }),
  };
  const sms = { send: jest.fn().mockResolvedValue(true) };
  const config = {
    get: (key: string) => (key === 'SMS_INBOUND_TOKEN' && options.replies ? 'secret' : undefined),
  };
  const messenger = new CheckInMessenger(
    push as unknown as PushProvider,
    sms as unknown as DirectSmsService,
    config as unknown as ConfigService,
  );
  const text = (): string => sms.send.mock.calls[0][1] as string;
  return { messenger, push, sms, text };
}

describe('CheckInMessenger', () => {
  it('asks by push first, greeting by first name in the elder’s time of day', async () => {
    const t = build();

    await expect(t.messenger.ask(GRACE, 'check-in-1', false, MORNING)).resolves.toBe('push');

    const message = t.push.send.mock.calls[0][0];
    expect(message.title).toBe('Good morning, Grace');
    // Nothing personal in the payload, which travels through a third party.
    expect(message.data).toEqual({ type: 'check-in', checkInId: 'check-in-1' });
    expect(t.sms.send).not.toHaveBeenCalled();
  });

  it('texts when the push is refused', async () => {
    const t = build({ delivered: false });
    await expect(t.messenger.ask(GRACE, 'check-in-1', false, MORNING)).resolves.toBe('sms');
    expect(t.text()).toContain('Good morning, Grace');
  });

  it('texts when the push fails outright', async () => {
    const t = build({ pushFails: true });
    await expect(t.messenger.ask(GRACE, 'check-in-1', false, MORNING)).resolves.toBe('sms');
  });

  it('texts an elder with no push address, which for a basic phone is every time', async () => {
    const t = build();
    await t.messenger.ask({ ...GRACE, pushToken: null }, 'check-in-1', false, MORNING);
    expect(t.push.send).not.toHaveBeenCalled();
    expect(t.sms.send).toHaveBeenCalledWith(GRACE.phone, expect.any(String));
  });

  it('asks for a reply of 1 only when replies can be received', async () => {
    const withReplies = build({ replies: true });
    await withReplies.messenger.ask({ ...GRACE, pushToken: null }, 'c', false, MORNING);
    expect(withReplies.text()).toContain('Reply 1 if you are');

    const without = build();
    await without.messenger.ask({ ...GRACE, pushToken: null }, 'c', false, MORNING);
    expect(without.text()).not.toContain('Reply 1');
    expect(without.text()).toContain('Open MzaziCare');
  });

  it('says so when it is the reminder, and stays inside one text', async () => {
    const t = build({ replies: true });
    await t.messenger.ask({ ...GRACE, pushToken: null }, 'c', true, MORNING);
    expect(t.text()).toContain('you have not answered yet');
    expect(t.text().length).toBeLessThanOrEqual(SMS_LIMIT);
  });

  it('reports when the elder could not be reached at all', async () => {
    const t = build();
    t.sms.send.mockResolvedValue(false);
    await expect(t.messenger.ask({ ...GRACE, pushToken: null }, 'c', false, MORNING)).resolves.toBe(
      'none',
    );
  });
});
