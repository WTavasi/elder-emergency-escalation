import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../state/AuthContext', () => ({
  useAuth: () => ({
    session: { accessToken: 't', user: { name: 'Asha Njeri', role: 'ADMINISTRATOR' } },
    signOut: vi.fn(),
  }),
}));
vi.mock('../state/OpenAlerts', () => ({ useOpenAlerts: () => ({ alerts: [{}, {}, {}] }) }));
vi.mock('../hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

const { Layout } = await import('./Layout');

function renderShell() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<p>Board</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => localStorage.clear());

describe('the sidebar', () => {
  it('collapses to a rail of icons, keeping every name for a screen reader, and back', async () => {
    const { container } = renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse the sidebar' }));

    expect(container.querySelector('.shell--rail')).not.toBeNull();
    // Still there, by name, for a screen reader; shown on hover as a tooltip.
    expect(screen.getByRole('link', { name: /History/ })).toHaveAttribute('title', 'History');
    expect(screen.getByLabelText('3 open')).toBeInTheDocument();
    expect(screen.queryByText('MzaziCare')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Expand the sidebar' }));
    expect(container.querySelector('.shell--rail')).toBeNull();
    expect(screen.getByText('MzaziCare')).toBeInTheDocument();
  });

  it('remembers being collapsed', async () => {
    const first = renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse the sidebar' }));
    first.unmount();

    const { container } = renderShell();
    expect(container.querySelector('.shell--rail')).not.toBeNull();
  });
});
