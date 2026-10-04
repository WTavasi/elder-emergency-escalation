/**
 * Bounds how long we wait for somebody else's network.
 *
 * This stops *waiting*; it does not cancel the underlying request, because the client
 * being wrapped offers no way to. That distinction matters and is not a detail to
 * gloss over: a provider may still deliver a message we gave up on, so a retry after a
 * timeout can produce a duplicate. For an emergency notification that is the right
 * trade. A duplicate alert is an annoyance; a job blocked on a stalled socket is an
 * alert nobody receives and nobody is told about.
 *
 * Rejects rather than resolving, so callers that distinguish permanent from transient
 * failure read a timeout as transient and retry, which is what it is.
 */
export class ProviderTimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} did not respond within ${ms}ms`);
    this.name = 'ProviderTimeoutError';
  }
}

export function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout;

  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new ProviderTimeoutError(what, ms)), ms);
    // The timer must never keep the process alive on its own: a shutdown should not
    // wait out a provider timeout that no longer has anywhere to report.
    timer.unref();
  });

  return Promise.race([work, expiry]).finally(() => clearTimeout(timer));
}
