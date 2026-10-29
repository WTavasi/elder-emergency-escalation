import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { AlertSummary } from '../api/types';
import { AlertRow } from './parts';

const alert: AlertSummary = {
  eventId: 'event-1',
  state: 'NOTIFIED',
  severity: 'CRITICAL',
  severityScore: 60,
  currentTier: 2,
  outcome: null,
  outcomeNote: null,
  elder: { id: 'elder-1', name: 'Grace Wanjiru', phone: null, addressLabel: null },
  acknowledgedBy: null,
  latitude: -1.28,
  longitude: 36.78,
  addressLabel: 'Kileleshwa, Nairobi',
  triggeredAt: '2026-10-29T09:00:00.000Z',
  acknowledgedAt: null,
  resolvedAt: null,
  deadlineAt: null,
  responderRequestedAt: null,
  responseSeconds: null,
};

function renderRow(row: AlertSummary) {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <table>
              <tbody>
                <AlertRow alert={row} live />
              </tbody>
            </table>
          }
        />
        <Route path="/emergencies/:id" element={<p>The emergency page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('a row in the emergency list', () => {
  it('marks an emergency nobody has answered with a dot, said in words too', () => {
    renderRow(alert);
    expect(screen.getByText('Nobody has answered.')).toBeInTheDocument();
  });

  it('has no dot once somebody has taken it on', () => {
    renderRow({
      ...alert,
      state: 'ACKNOWLEDGED',
      acknowledgedBy: { id: 'carer-1', name: 'Mary Otieno', role: 'CAREGIVER' },
    });
    expect(screen.queryByText('Nobody has answered.')).not.toBeInTheDocument();
  });

  it('opens the emergency when pressed anywhere on the row, not only on the name', async () => {
    renderRow(alert);

    await userEvent.click(screen.getByText('Kileleshwa, Nairobi'));

    expect(screen.getByText('The emergency page')).toBeInTheDocument();
  });

  it('keeps the name a link, for the keyboard and a new tab', () => {
    renderRow(alert);
    expect(screen.getByRole('link', { name: 'Grace Wanjiru' })).toHaveAttribute(
      'href',
      '/emergencies/event-1',
    );
  });
});
