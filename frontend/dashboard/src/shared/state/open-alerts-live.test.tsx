import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlertSummary, EmergencySnapshot } from '../api/types';

// The live connection, replaced so the test can play messages into the board.
const live: {
  onUpdate?: (snapshot: EmergencySnapshot) => void;
  onReconnect?: () => void;
} = {};
vi.mock('../api/realtime', () => ({
  useRealtime: (
    _token: string | null,
    onUpdate: (snapshot: EmergencySnapshot) => void,
    onReconnect?: () => void,
  ) => {
    live.onUpdate = onUpdate;
    live.onReconnect = onReconnect;
    return 'live';
  },
}));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ session: { accessToken: 'token' } }) }));
vi.mock('../hooks/useServiceHealth', () => ({
  useServiceHealth: () => ({ health: 'ok', down: [] }),
}));

const { api } = await import('../api/client');
const { OpenAlertsProvider, useOpenAlerts } = await import('./OpenAlerts');

const summary = (id: string, name: string): AlertSummary => ({
  eventId: id,
  state: 'NOTIFIED',
  severity: 'STANDARD',
  severityScore: 20,
  currentTier: 1,
  outcome: null,
  outcomeNote: null,
  elder: { id: `elder-${id}`, name, phone: null, addressLabel: null },
  acknowledgedBy: null,
  latitude: null,
  longitude: null,
  addressLabel: null,
  triggeredAt: '2026-11-09T09:00:00.000Z',
  acknowledgedAt: null,
  resolvedAt: null,
  deadlineAt: null,
  responderRequestedAt: null,
  responseSeconds: null,
});

const snapshot = (id: string, state: EmergencySnapshot['state']): EmergencySnapshot =>
  ({
    eventId: id,
    elderlyId: `elder-${id}`,
    state,
    severity: 'STANDARD',
    trigger: 'PANIC',
    currentTier: 1,
    acknowledgedBy: null,
    triggeredAt: '2026-11-09T09:00:00.000Z',
    deadlineAt: null,
    arrivedAt: null,
  }) as EmergencySnapshot;

function Board() {
  const { alerts, arrived } = useOpenAlerts();
  return (
    <ul>
      {(alerts ?? []).map((alert) => (
        <li key={alert.eventId} data-arrived={arrived.has(alert.eventId)}>
          {alert.elder.name}
        </li>
      ))}
    </ul>
  );
}

beforeEach(() => {
  live.onUpdate = undefined;
  live.onReconnect = undefined;
});
afterEach(() => vi.restoreAllMocks());

describe('the open board, kept live', () => {
  it('shows a new emergency the moment its message arrives, marked as just arrived', async () => {
    const load = vi
      .spyOn(api, 'alerts')
      .mockResolvedValueOnce([summary('a', 'Grace Wanjiru')])
      .mockResolvedValueOnce([summary('a', 'Grace Wanjiru'), summary('b', 'Joseph Kimani')]);
    render(
      <OpenAlertsProvider>
        <Board />
      </OpenAlertsProvider>,
    );
    expect(await screen.findByText('Grace Wanjiru')).toBeInTheDocument();

    act(() => live.onUpdate?.(snapshot('b', 'TRIGGERED')));

    const joseph = await screen.findByText('Joseph Kimani');
    await waitFor(() => expect(joseph).toHaveAttribute('data-arrived', 'true'));
    expect(screen.getByText('Grace Wanjiru')).toHaveAttribute('data-arrived', 'false');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('takes the mark off after a moment, even when the board changes in between', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.spyOn(api, 'alerts')
        .mockResolvedValueOnce([summary('a', 'Grace Wanjiru')])
        .mockResolvedValueOnce([summary('a', 'Grace Wanjiru'), summary('b', 'Joseph Kimani')]);
      render(
        <OpenAlertsProvider>
          <Board />
        </OpenAlertsProvider>,
      );
      await screen.findByText('Grace Wanjiru');
      act(() => live.onUpdate?.(snapshot('b', 'TRIGGERED')));
      const joseph = await screen.findByText('Joseph Kimani');
      await waitFor(() => expect(joseph).toHaveAttribute('data-arrived', 'true'));

      // Another change to the board before the mark would have gone.
      act(() => live.onUpdate?.({ ...snapshot('a', 'NOTIFIED'), currentTier: 2 }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_100);
      });
      expect(screen.getByText('Joseph Kimani')).toHaveAttribute('data-arrived', 'false');
    } finally {
      vi.useRealTimers();
    }
  });

  it('takes an emergency off the moment it is closed, without asking the server', async () => {
    const load = vi
      .spyOn(api, 'alerts')
      .mockResolvedValue([summary('a', 'Grace Wanjiru'), summary('b', 'Joseph Kimani')]);
    render(
      <OpenAlertsProvider>
        <Board />
      </OpenAlertsProvider>,
    );
    expect(await screen.findByText('Joseph Kimani')).toBeInTheDocument();

    act(() => live.onUpdate?.(snapshot('b', 'RESOLVED')));

    await waitFor(() => expect(screen.queryByText('Joseph Kimani')).not.toBeInTheDocument());
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('ignores a closed emergency it never showed', async () => {
    const load = vi.spyOn(api, 'alerts').mockResolvedValue([summary('a', 'Grace Wanjiru')]);
    render(
      <OpenAlertsProvider>
        <Board />
      </OpenAlertsProvider>,
    );
    await screen.findByText('Grace Wanjiru');
    act(() => live.onUpdate?.(snapshot('z', 'CANCELLED')));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('fetches the board again when the connection comes back, to catch what was missed', async () => {
    const load = vi
      .spyOn(api, 'alerts')
      .mockResolvedValueOnce([summary('a', 'Grace Wanjiru')])
      .mockResolvedValueOnce([summary('a', 'Grace Wanjiru'), summary('c', 'Esther Muthoni')]);
    render(
      <OpenAlertsProvider>
        <Board />
      </OpenAlertsProvider>,
    );
    await screen.findByText('Grace Wanjiru');

    act(() => live.onReconnect?.());

    expect(await screen.findByText('Esther Muthoni')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
