import { FcmPushProvider, type FcmMessaging } from './fcm-push.provider';

const buildMessaging = () => {
  const messaging = { send: jest.fn() };
  return { messaging: messaging as unknown as FcmMessaging, raw: messaging };
};

const message = {
  token: 'device-token-abc',
  title: 'Grace needs help',
  body: 'Grace Wanjiru raised an emergency alert at Kileleshwa, Nairobi.',
  data: { eventId: 'event-1', state: 'NOTIFIED', tier: '1', action: 'respond' },
};

const withCode = (code: string): Error => Object.assign(new Error(code), { code });

describe('FcmPushProvider', () => {
  it('sends at high priority, which is what wakes a sleeping phone', async () => {
    const { messaging, raw } = buildMessaging();
    raw.send.mockResolvedValue('projects/mzazicare/messages/123');

    const result = await new FcmPushProvider(messaging).send(message);

    const sent = raw.send.mock.calls[0][0] as {
      android: { priority: string };
      apns: { headers: Record<string, string> };
      data: Record<string, string>;
    };
    expect(sent.android.priority).toBe('high');
    expect(sent.apns.headers['apns-priority']).toBe('10');
    expect(sent.data).toEqual(message.data);
    expect(result).toEqual({
      delivered: true,
      providerMessageId: 'projects/mzazicare/messages/123',
    });
  });

  it('refuses an empty token without calling Firebase at all', async () => {
    const { messaging, raw } = buildMessaging();
    const result = await new FcmPushProvider(messaging).send({ ...message, token: '' });

    expect(raw.send).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: false, error: 'no registered device' });
  });

  it('treats a dead token as permanent, so the caller moves to SMS immediately', async () => {
    for (const code of [
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token',
      'messaging/invalid-argument',
      'messaging/sender-id-mismatch',
    ]) {
      const { messaging, raw } = buildMessaging();
      raw.send.mockRejectedValue(withCode(code));

      const result = await new FcmPushProvider(messaging).send(message);
      expect(result).toEqual({ delivered: false, error: code });
    }
  });

  it('treats quota and network trouble as transient, so the job retries', async () => {
    for (const error of [
      withCode('messaging/server-unavailable'),
      withCode('messaging/quota-exceeded'),
      new Error('socket hang up'),
    ]) {
      const { messaging, raw } = buildMessaging();
      raw.send.mockRejectedValue(error);

      await expect(new FcmPushProvider(messaging).send(message)).rejects.toThrow();
    }
  });
});
