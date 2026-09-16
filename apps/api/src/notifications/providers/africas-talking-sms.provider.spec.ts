import { AfricasTalkingSmsProvider, type FetchLike } from './africas-talking-sms.provider';
import type { ConfigService } from '@nestjs/config';

const buildConfig = (overrides: Record<string, string> = {}) => {
  const values: Record<string, string> = {
    AT_USERNAME: 'sandbox',
    AT_API_KEY: 'atsk_test_key',
    AT_SENDER_ID: '',
    ...overrides,
  };
  return {
    getOrThrow: (key: string) => values[key],
    // The real ConfigService returns the fallback for a key it does not hold, and a
    // stub that returns undefined instead hides bugs that only appear in production.
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as unknown as ConfigService;
};

const reply = (status: number, body: unknown, ok = status < 400) =>
  ({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  }) as Awaited<ReturnType<FetchLike>>;

const accepted = {
  SMSMessageData: {
    Message: 'Sent to 1/1 Total Cost: KES 0.0000',
    Recipients: [
      { statusCode: 101, status: 'Success', messageId: 'ATXid_abc', number: '+254700000020' },
    ],
  },
};

const message = { phone: '+254700000020', text: 'MzaziCare: Grace Wanjiru needs help.' };

describe('AfricasTalkingSmsProvider', () => {
  it('posts a form-encoded request with the API key in the header', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(reply(201, accepted)) as jest.MockedFunction<FetchLike>;
    const result = await new AfricasTalkingSmsProvider(buildConfig(), fetchImpl).send(message);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.sandbox.africastalking.com/version1/messaging');
    expect(init.headers.apiKey).toBe('atsk_test_key');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(init.body).toContain('username=sandbox');
    expect(init.body).toContain('to=%2B254700000020');
    expect(result).toEqual({ delivered: true, providerMessageId: 'ATXid_abc' });
  });

  it('uses the live host for any username other than sandbox', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(reply(201, accepted)) as jest.MockedFunction<FetchLike>;
    await new AfricasTalkingSmsProvider(buildConfig({ AT_USERNAME: 'mzazicare' }), fetchImpl).send(
      message,
    );

    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.africastalking.com/version1/messaging');
  });

  it('omits the sender id when none is configured, and sends it when one is', async () => {
    const withoutSender = jest
      .fn()
      .mockResolvedValue(reply(201, accepted)) as jest.MockedFunction<FetchLike>;
    await new AfricasTalkingSmsProvider(buildConfig(), withoutSender).send(message);
    expect(withoutSender.mock.calls[0][1].body).not.toContain('from=');

    const withSender = jest
      .fn()
      .mockResolvedValue(reply(201, accepted)) as jest.MockedFunction<FetchLike>;
    await new AfricasTalkingSmsProvider(
      buildConfig({ AT_SENDER_ID: 'MZAZICARE' }),
      withSender,
    ).send(message);
    expect(withSender.mock.calls[0][1].body).toContain('from=MZAZICARE');
  });

  it('treats every accepted status code as delivered', async () => {
    for (const statusCode of [100, 101, 102]) {
      const fetchImpl = jest.fn().mockResolvedValue(
        reply(201, {
          SMSMessageData: { Recipients: [{ statusCode, status: 'Success', messageId: 'id' }] },
        }),
      ) as jest.MockedFunction<FetchLike>;

      const result = await new AfricasTalkingSmsProvider(buildConfig(), fetchImpl).send(message);
      expect(result.delivered).toBe(true);
    }
  });

  it('treats a rejected recipient as permanent, so the caller stops rather than retrying', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      reply(201, {
        SMSMessageData: { Recipients: [{ statusCode: 403, status: 'InvalidPhoneNumber' }] },
      }),
    ) as jest.MockedFunction<FetchLike>;

    const result = await new AfricasTalkingSmsProvider(buildConfig(), fetchImpl).send(message);
    expect(result).toEqual({ delivered: false, error: 'InvalidPhoneNumber (403)' });
  });

  it('treats a gateway failure as transient, so the job retries', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      reply(201, {
        SMSMessageData: { Recipients: [{ statusCode: 501, status: 'GatewayError' }] },
      }),
    ) as jest.MockedFunction<FetchLike>;

    await expect(
      new AfricasTalkingSmsProvider(buildConfig(), fetchImpl).send(message),
    ).rejects.toThrow(/gateway error 501/);
  });

  it('explains a 200 that carried no recipient, which is how a refusal arrives', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        reply(201, { SMSMessageData: { Message: 'Insufficient balance', Recipients: [] } }),
      ) as jest.MockedFunction<FetchLike>;

    const result = await new AfricasTalkingSmsProvider(buildConfig(), fetchImpl).send(message);
    expect(result).toEqual({ delivered: false, error: 'Insufficient balance' });
  });

  it('gives up on a bad request and retries a server error', async () => {
    const badKey = jest
      .fn()
      .mockResolvedValue(reply(401, 'Unauthorized', false)) as jest.MockedFunction<FetchLike>;
    const result = await new AfricasTalkingSmsProvider(buildConfig(), badKey).send(message);
    expect(result.delivered).toBe(false);
    expect(result.error).toContain('401');

    const theirFault = jest
      .fn()
      .mockResolvedValue(
        reply(503, 'Service Unavailable', false),
      ) as jest.MockedFunction<FetchLike>;
    await expect(
      new AfricasTalkingSmsProvider(buildConfig(), theirFault).send(message),
    ).rejects.toThrow(/returned 503/);

    const rateLimited = jest
      .fn()
      .mockResolvedValue(reply(429, 'Too Many Requests', false)) as jest.MockedFunction<FetchLike>;
    await expect(
      new AfricasTalkingSmsProvider(buildConfig(), rateLimited).send(message),
    ).rejects.toThrow(/returned 429/);
  });

  it('lets a network failure through so the queue can retry it', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValue(new Error('ENOTFOUND')) as jest.MockedFunction<FetchLike>;
    await expect(
      new AfricasTalkingSmsProvider(buildConfig(), fetchImpl).send(message),
    ).rejects.toThrow('ENOTFOUND');
  });

  describe('timeouts', () => {
    it("gives the request a deadline, because Node's fetch has none of its own", async () => {
      const fetchImpl = jest.fn().mockResolvedValue(reply(200, accepted));
      await new AfricasTalkingSmsProvider(buildConfig(), fetchImpl).send(message);

      const init = fetchImpl.mock.calls[0][1] as { signal?: AbortSignal };
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('reports a timeout as a throw, so the queue retries rather than giving up', async () => {
      const aborted = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
      const fetchImpl = jest.fn().mockRejectedValue(aborted);

      // A gateway that did not answer in time may well answer the next attempt, and an
      // SMS fallback is the last channel there is.
      await expect(
        new AfricasTalkingSmsProvider(buildConfig(), fetchImpl).send(message),
      ).rejects.toThrow('no response within');
    });
  });
});
