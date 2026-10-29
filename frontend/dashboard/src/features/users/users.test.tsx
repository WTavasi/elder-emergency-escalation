import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../shared/api/client';
import type { UserRow } from '../../shared/api/types';
import { AuthProvider } from '../../shared/state/AuthContext';
import { Users } from './Users';

const mary: UserRow = {
  id: 'mary',
  name: 'Mary Otieno',
  phone: '+254700000020',
  email: 'mary@example.com',
  role: 'CAREGIVER',
  createdAt: '2026-10-28T08:00:00.000Z',
  deactivatedAt: null,
  coverage: null,
  chainPlaces: 4,
  chainSize: 0,
};

const grace: UserRow = {
  ...mary,
  id: 'grace',
  name: 'Grace Wanjiru',
  phone: '+254700000010',
  email: null,
  role: 'ELDER',
  chainPlaces: 0,
  chainSize: 4,
};

afterEach(() => vi.restoreAllMocks());

async function renderUsers() {
  vi.spyOn(api.users, 'list').mockResolvedValue({
    items: [mary, { ...grace, deactivatedAt: '2026-10-28T09:00:00.000Z' }],
    total: 2,
    page: 1,
    pageSize: 25,
  });
  render(
    <MemoryRouter>
      <AuthProvider>
        <Users />
      </AuthProvider>
    </MemoryRouter>,
  );
  await screen.findByText('Mary Otieno');
}

describe('the users list', () => {
  it("says in words how many elders a carer looks after, and how big an elder's chain is", async () => {
    await renderUsers();
    expect(screen.getByText('4 elders')).toBeInTheDocument();
    expect(screen.getByText('4 people')).toBeInTheDocument();
  });

  it('marks only the exception: a deactivated account, never an active one', async () => {
    await renderUsers();
    const list = within(screen.getByRole('table'));
    expect(list.getByText('Deactivated')).toBeInTheDocument();
    expect(list.queryByText('Active')).not.toBeInTheDocument();
  });

  it('opens an account when its row is pressed', async () => {
    await renderUsers();
    await userEvent.click(screen.getByText('mary@example.com'));
    expect(await screen.findByRole('dialog', { name: 'Edit Mary Otieno' })).toBeInTheDocument();
  });

  it('shows the boxes to tick only after Select, and then a row press ticks it', async () => {
    await renderUsers();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    await userEvent.click(screen.getByText('mary@example.com'));

    expect(screen.getByRole('checkbox', { name: 'Select Mary Otieno' })).toBeChecked();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
