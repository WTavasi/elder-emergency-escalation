import type { PushProvider } from './push.provider';
import { sendToEvery } from './push-fanout';

const message = { title: 'Grace needs help', body: 'Open MzaziCare.', data: { eventId: 'e1' } };

function provider(answers: Record<string, 'ok' | 'gone' | 'down'>) {
  const send = jest.fn(({ token }: { token: string }) => {
    const answer = answers[token] ?? 'gone';
    if (answer === 'down') return Promise.reject(new Error('timeout'));
    return Promise.resolve(
      answer === 'ok'
        ? { delivered: true, providerMessageId: `id-${token}` }
        : { delivered: false, error: 'not registered' },
    );
  });
  return { push: { name: 'test', send } as unknown as PushProvider, send };
}

describe('sending to every phone', () => {
  it('counts it delivered if any phone took it, and reports the phones that are gone', async () => {
    const { push, send } = provider({ old: 'gone', new: 'ok' });
    const result = await sendToEvery(push, ['old', 'new'], message);

    expect(send).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ delivered: true, providerMessageId: 'id-new', rejected: ['old'] });
  });

  it('retries when no phone took it and one failure was only a timeout', async () => {
    const { push } = provider({ a: 'gone', b: 'down' });
    await expect(sendToEvery(push, ['a', 'b'], message)).rejects.toThrow('timeout');
  });

  it('fails for good, naming every gone phone, when every phone refused', async () => {
    const { push } = provider({ a: 'gone', b: 'gone' });
    await expect(sendToEvery(push, ['a', 'b'], message)).resolves.toEqual({
      delivered: false,
      error: 'not registered',
      rejected: ['a', 'b'],
    });
  });

  it('asks with no address when there is no phone, so the SMS fallback runs as before', async () => {
    const { push, send } = provider({});
    await sendToEvery(push, [], message);
    expect(send).toHaveBeenCalledWith({ ...message, token: '' });
  });
});
