import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../shared/api/client';
import { History } from './History';

afterEach(() => vi.restoreAllMocks());

function renderHistory() {
  const page = vi.spyOn(api, 'alertPage').mockResolvedValue({ items: [], total: 0 });
  vi.spyOn(api, 'policy').mockRejectedValue(new Error('not needed here'));
  render(
    <MemoryRouter>
      <History />
    </MemoryRouter>,
  );
  return page;
}

describe('searching the history', () => {
  it('applies a filter as soon as it is chosen, with no button to press', async () => {
    const page = renderHistory();
    await waitFor(() => expect(page).toHaveBeenCalledTimes(1));

    await userEvent.selectOptions(screen.getByLabelText('Severity'), 'CRITICAL');

    await waitFor(() =>
      expect(page).toHaveBeenLastCalledWith(expect.objectContaining({ severity: ['CRITICAL'] })),
    );
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
  });

  it('searches once the typing stops', async () => {
    const page = renderHistory();
    await waitFor(() => expect(page).toHaveBeenCalledTimes(1));

    await userEvent.type(screen.getByRole('searchbox'), 'Grace');

    await waitFor(() =>
      expect(page).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Grace' })),
    );
  });

  it('offers the ranges a person usually means, and a range of their own', async () => {
    const page = renderHistory();
    await waitFor(() => expect(page).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText('Raised on or after')).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('When it was raised'), 'week');
    await waitFor(() => {
      const from = page.mock.lastCall?.[0]?.from;
      expect(from).toBeDefined();
      const days = (Date.now() - Date.parse(from as string)) / 86_400_000;
      expect(Math.round(days)).toBe(7);
    });

    await userEvent.selectOptions(screen.getByLabelText('When it was raised'), 'custom');
    expect(screen.getByLabelText('Raised on or after')).toBeInTheDocument();
    expect(screen.getByLabelText('Raised on or before')).toBeInTheDocument();
  });
});
