import { ProviderTimeoutError, withTimeout } from './with-timeout';

describe('withTimeout', () => {
  it('passes a result straight through when the work finishes in time', async () => {
    await expect(withTimeout(Promise.resolve('sent'), 50, 'provider')).resolves.toBe('sent');
  });

  it('passes the original failure through rather than masking it as a timeout', async () => {
    const failure = new Error('invalid token');

    await expect(withTimeout(Promise.reject(failure), 50, 'provider')).rejects.toBe(failure);
  });

  it('rejects when the work outlasts the budget, so the caller retries', async () => {
    const stalled = new Promise((resolve) => setTimeout(resolve, 200));

    // Rejecting rather than resolving is the point: a provider that never answered has
    // not delivered anything, and the queue treats a throw as worth another attempt.
    await expect(withTimeout(stalled, 20, 'Firebase')).rejects.toBeInstanceOf(ProviderTimeoutError);
  });

  it('names what timed out and how long it waited', async () => {
    const stalled = new Promise((resolve) => setTimeout(resolve, 200));

    await expect(withTimeout(stalled, 20, 'Firebase')).rejects.toThrow(
      'Firebase did not respond within 20ms',
    );
  });
});
