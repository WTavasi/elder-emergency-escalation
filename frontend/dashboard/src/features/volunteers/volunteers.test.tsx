import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../shared/api/client';
import type { VolunteerApplication } from '../../shared/api/types';
import { Volunteers } from './Volunteers';

const waiting: VolunteerApplication = {
  id: 'vol-1',
  name: 'Joseph Kamau',
  phone: '+254711000001',
  email: null,
  status: 'PENDING',
  training: ['FIRST_AID', 'COMMUNITY_HEALTH_PROMOTER'],
  note: null,
  area: { label: 'Kileleshwa, Nairobi', latitude: -1.28, longitude: 36.78 },
  radiusKm: 1,
  available: false,
  appliedAt: '2026-10-22T09:00:00.000Z',
  reviewedAt: null,
  reviewedBy: null,
  reviewNote: null,
  accepted: 0,
  arrived: 0,
  deactivated: false,
};

afterEach(() => vi.restoreAllMocks());

describe('the volunteer vetting queue', () => {
  it('shows who is waiting, what they can do and where', async () => {
    const list = vi.spyOn(api.volunteers, 'list').mockResolvedValue([waiting]);
    render(<Volunteers />);

    expect(await screen.findByText('Joseph Kamau')).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith('PENDING');
    expect(screen.getByText('First aid, Community Health Promoter')).toBeInTheDocument();
    expect(screen.getByText('Kileleshwa, Nairobi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('approves in one press', async () => {
    vi.spyOn(api.volunteers, 'list').mockResolvedValue([waiting]);
    const review = vi
      .spyOn(api.volunteers, 'review')
      .mockResolvedValue({ ...waiting, status: 'APPROVED' });
    render(<Volunteers />);

    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(review).toHaveBeenCalledWith('vol-1', 'approve', undefined);
    expect(await screen.findByRole('status')).toHaveTextContent('Joseph Kamau is approved');
  });

  it('not approving needs a reason, which is sent with it', async () => {
    vi.spyOn(api.volunteers, 'list').mockResolvedValue([waiting]);
    const review = vi
      .spyOn(api.volunteers, 'review')
      .mockResolvedValue({ ...waiting, status: 'REJECTED' });
    render(<Volunteers />);

    await userEvent.click(await screen.findByRole('button', { name: 'Do not approve' }));
    const confirm = screen.getAllByRole('button', { name: 'Do not approve' }).at(-1)!;
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Why/), 'Could not confirm the training card');
    await userEvent.click(confirm);

    await waitFor(() =>
      expect(review).toHaveBeenCalledWith('vol-1', 'reject', 'Could not confirm the training card'),
    );
  });
});
