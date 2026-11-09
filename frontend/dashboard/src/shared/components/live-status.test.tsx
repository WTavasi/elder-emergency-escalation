import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LiveStatus } from './parts';

describe('whether the board is live', () => {
  it('says Live while connected and the server is working, with no refresh button', () => {
    render(
      <LiveStatus state="live" health="ok" down={[]} updatedAt={Date.now()} onRetry={() => {}} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Live');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('names what is down when the server says so', () => {
    render(
      <LiveStatus
        state="live"
        health="problem"
        down={['redis']}
        updatedAt={null}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Service problem: Redis down');
  });

  it('says it is offline and reconnecting, and offers to try at once', async () => {
    const retry = vi.fn();
    render(
      <LiveStatus state="offline" health="unknown" down={[]} updatedAt={null} onRetry={retry} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Offline, reconnecting');
    await userEvent.click(screen.getByRole('button', { name: 'Try now' }));
    expect(retry).toHaveBeenCalled();
  });

  it('says Connecting while it starts', () => {
    render(
      <LiveStatus
        state="connecting"
        health="unknown"
        down={[]}
        updatedAt={null}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Connecting');
  });
});
