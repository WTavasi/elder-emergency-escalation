import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import type { UserRow } from '../api/types';

vi.mock('../state/OpenAlerts', () => ({
  useOpenAlertsIfAny: () => ({
    alerts: [
      {
        eventId: 'open-1',
        state: 'NOTIFIED',
        elder: { name: 'Grace Wanjiru' },
        triggeredAt: '2026-11-20T09:00:00.000Z',
      },
    ],
  }),
}));

const { CommandPalette } = await import('./CommandPalette');

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function renderPalette() {
  const onClose = vi.fn();
  render(
    <MemoryRouter initialEntries={['/reporting']}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <CommandPalette onClose={onClose} />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return onClose;
}

afterEach(() => vi.restoreAllMocks());

describe('the search across the console', () => {
  it('starts with the open emergencies and every section, with its shortcut', () => {
    renderPalette();

    expect(screen.getByRole('combobox')).toHaveFocus();
    expect(screen.getByRole('option', { name: /Grace Wanjiru/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Escalation policy/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Shortcut G then H')).toBeInTheDocument();
  });

  it('narrows as you type, and goes to the chosen result with the arrows and Return', async () => {
    vi.spyOn(api.users, 'list').mockResolvedValue({ items: [], total: 0 } as never);
    vi.spyOn(api, 'alertPage').mockResolvedValue({ items: [], total: 0 });
    const onClose = renderPalette();

    await userEvent.type(screen.getByRole('combobox'), 'hist');
    expect(screen.queryByRole('option', { name: /Grace Wanjiru/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^History/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/history?q=hist');
  });

  it('finds people through the API and opens their account in Users', async () => {
    const mary = { id: 'u1', name: 'Mary Otieno', role: 'CAREGIVER', phone: '+254700000001' };
    vi.spyOn(api.users, 'list').mockResolvedValue({
      items: [mary as unknown as UserRow],
      total: 1,
    } as never);
    vi.spyOn(api, 'alertPage').mockResolvedValue({ items: [], total: 0 });
    renderPalette();

    await userEvent.type(screen.getByRole('combobox'), 'mary');
    const person = await screen.findByRole('option', { name: /Mary Otieno/ });
    await userEvent.click(person);

    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent('/users?q=Mary%20Otieno'),
    );
  });

  it('closes on Escape', async () => {
    const onClose = renderPalette();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
