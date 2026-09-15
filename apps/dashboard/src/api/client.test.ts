import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The refresh path is the part of the client that can misbehave invisibly: a loop
 * against the API, or a console that stays signed in while every request is refused.
 * Both are tested here by counting what fetch was actually asked to do.
 */
describe('api client', () => {
  const session = {
    user: { id: 'u1', name: 'Ops', phone: '+254700000000', email: null, role: 'ADMINISTRATOR' },
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
  };

  const json = (body: unknown, status = 200): Response =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(JSON.stringify(body)),
      json: () => Promise.resolve(body),
    }) as Response;

  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
  });

  it('sends the access token as a bearer credential', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json([]));
    vi.stubGlobal('fetch', fetchMock);

    const { api } = await import('./client');
    fetchMock.mockResolvedValueOnce(json(session));
    await api.signIn('+254700000000', 'secret');
    await api.alerts({ open: true });

    const headers = fetchMock.mock.calls[1]![1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer access-1');
  });

  it('refreshes once after a 401 and replays the original request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json({ message: 'expired' }, 401))
      .mockResolvedValueOnce(json({ ...session, accessToken: 'access-2' }))
      .mockResolvedValueOnce(json([{ eventId: 'e1' }]));
    vi.stubGlobal('fetch', fetchMock);

    const { api } = await import('./client');
    await api.signIn('+254700000000', 'secret');
    const alerts = await api.alerts();

    expect(alerts).toEqual([{ eventId: 'e1' }]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const replay = fetchMock.mock.calls[3]![1].headers as Headers;
    expect(replay.get('Authorization')).toBe('Bearer access-2');
  });

  it('gives up rather than looping when the refresh itself is refused', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json({ message: 'expired' }, 401))
      .mockResolvedValueOnce(json({ message: 'no' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    const { api, getSession } = await import('./client');
    await api.signIn('+254700000000', 'secret');

    await expect(api.alerts()).rejects.toThrow();
    // Sign-in, the refused request, the refused refresh. Nothing more.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getSession()).toBeNull();
  });

  it('does not retry a failed sign-in, which would rotate nothing and leak an attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ message: 'Phone number or password is incorrect' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    const { api } = await import('./client');

    await expect(api.signIn('+254700000000', 'wrong')).rejects.toThrow(
      'Phone number or password is incorrect',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('builds a query string only from the filters that were set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json([]));
    vi.stubGlobal('fetch', fetchMock);

    const { api } = await import('./client');
    await api.alerts({ state: ['ESCALATED', 'NOTIFIED'], limit: 25 });

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/alerts?state=ESCALATED%2CNOTIFIED&limit=25');
  });

  it('asks for nothing at all when no filter was given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json([]));
    vi.stubGlobal('fetch', fetchMock);

    const { api } = await import('./client');
    await api.alerts();

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/alerts');
  });
});
