import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../shared/api/client';
import type { ChainView, UserRow } from '../../shared/api/types';
import { ChainOrder } from './ChainOrder';

const grace: UserRow = {
  id: 'elder-1',
  name: 'Grace Wanjiru',
  phone: '+254700000010',
  email: null,
  role: 'ELDER',
  createdAt: '2026-10-01T00:00:00.000Z',
  deactivatedAt: null,
  coverage: null,
  chainPlaces: 0,
  chainSize: 4,
};

const chain: ChainView = {
  elderId: 'elder-1',
  elderName: 'Grace Wanjiru',
  canEdit: false,
  canReorder: true,
  personTiers: [1, 2],
  entries: [
    {
      id: 'a1',
      tier: 1,
      name: 'Mary Otieno',
      phone: '+254700000020',
      role: 'CAREGIVER',
      status: 'member',
      removable: false,
      movable: true,
    },
    {
      id: 'a2',
      tier: 2,
      name: 'Aisha Wanjiru',
      phone: '+254700000030',
      role: 'FAMILY_MEMBER',
      status: 'member',
      removable: false,
      movable: true,
    },
    {
      id: 'a3',
      tier: 3,
      name: 'Kileleshwa Response Unit',
      phone: '+254700000040',
      role: 'EMERGENCY_RESPONDER',
      status: 'member',
      removable: false,
      movable: false,
    },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe('who is asked first, in the console', () => {
  it('lists the people who can be moved, not the emergency services', async () => {
    vi.spyOn(api.chains, 'get').mockResolvedValue(chain);
    render(<ChainOrder elder={grace} onClose={() => {}} onSaved={() => {}} />);

    expect(await screen.findByLabelText('Group for Mary Otieno')).toHaveValue('1');
    expect(screen.getByLabelText('Group for Aisha Wanjiru')).toHaveValue('2');
    expect(screen.queryByText('Kileleshwa Response Unit')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save order' })).toBeDisabled();
  });

  it('saves the whole order at once', async () => {
    vi.spyOn(api.chains, 'get').mockResolvedValue(chain);
    const reorder = vi.spyOn(api.chains, 'reorder').mockResolvedValue(chain);
    const onSaved = vi.fn();
    render(<ChainOrder elder={grace} onClose={() => {}} onSaved={onSaved} />);

    await userEvent.selectOptions(await screen.findByLabelText('Group for Aisha Wanjiru'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Save order' }));

    expect(reorder).toHaveBeenCalledWith('elder-1', { a1: 1, a2: 1 });
    expect(onSaved).toHaveBeenCalledWith(expect.stringContaining('new order'));
  });
});
