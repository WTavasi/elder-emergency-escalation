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
vi.mock('../state/OpenAlerts', () => ({
  useOpenAlerts: () => ({ alerts: [{}, {}, {}] }),
  useOpenAlertsIfAny: () => ({ alerts: [] }),
}));
vi.mock('../hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

const { Layout } = await import('./Layout');

function renderShell() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<p>Board</p>} />
          <Route path="history" element={<p>History page</p>} />
          <Route path="policy" element={<input aria-label="A field on the page" />} />
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

describe('the keyboard', () => {
  it('goes to a section on G then its key', async () => {
    renderShell();
    await userEvent.keyboard('gh');
    expect(screen.getByText('History page')).toBeInTheDocument();
  });

  it('leaves the keys alone while somebody is typing', async () => {
    renderShell();
    await userEvent.keyboard('gp');
    const field = screen.getByLabelText('A field on the page');
    await userEvent.click(field);
    await userEvent.keyboard('gh');
    expect(screen.queryByText('History page')).not.toBeInTheDocument();
    expect(field).toHaveValue('gh');
  });

  it('opens the search on Command-K and from the sidebar, and closes it again', async () => {
    renderShell();
    await userEvent.keyboard('{Meta>}k{/Meta}');
    expect(screen.getByRole('dialog', { name: 'Search' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Search' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(screen.getByRole('dialog', { name: 'Search' })).toBeInTheDocument();
  });
});
