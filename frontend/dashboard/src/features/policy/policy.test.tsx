import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../../shared/api/client';
import type { Policy as PolicyData, PolicyRule } from '../../shared/api/types';
import { Policy } from './Policy';

const at = '2026-11-10T08:00:00.000Z';
const rule = (
  severity: PolicyRule['severity'],
  tier: number,
  timeoutSeconds: number | null,
): PolicyRule => ({
  severity,
  tier,
  responderRole: (['CAREGIVER', 'FAMILY_MEMBER', 'EMERGENCY_RESPONDER'] as const)[tier - 1]!,
  timeoutSeconds,
  dispatchMode: 'SEQUENTIAL',
  smsFallbackImmediate: false,
  last: timeoutSeconds === null,
  updatedAt: at,
});

const policy: PolicyData = {
  escalationRules: (['STANDARD', 'ELEVATED', 'CRITICAL'] as const).flatMap((severity) => [
    rule(severity, 1, 120),
    rule(severity, 2, 180),
    rule(severity, 3, null),
  ]),
  severityFactors: [
    {
      key: 'care_level',
      label: 'Declared care level of the elder',
      description: null,
      weight: 30,
      enabled: true,
      measured: true,
      updatedAt: at,
    },
  ],
  bands: { elevatedFrom: 35, criticalFrom: 60, fromConfiguration: true, setAt: null, setBy: null },
  maxScore: 100,
  limits: {
    timeoutSeconds: { min: 15, max: 3600 },
    weight: { min: 0, max: 100 },
    threshold: { min: 1, max: 100 },
  },
  changes: [
    {
      id: 'c1',
      area: 'escalation_rule',
      target: 'CRITICAL tier 1',
      before: { timeoutSeconds: 60, dispatchMode: 'SEQUENTIAL', smsFallbackImmediate: false },
      after: { timeoutSeconds: 45, dispatchMode: 'SEQUENTIAL', smsFallbackImmediate: false },
      at,
      by: { id: 'a1', name: 'Asha Njeri' },
    },
    {
      id: 'c2',
      area: 'severity_factor',
      target: 'care_level',
      before: { weight: 30, enabled: true },
      after: { weight: 50, enabled: true },
      at,
      by: { id: 'a1', name: 'Asha Njeri' },
    },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe('the escalation policy editor', () => {
  it('shows each chain, the weights, the bands and who changed what', async () => {
    vi.spyOn(api.escalationPolicy, 'get').mockResolvedValue(policy);
    render(<Policy />);

    expect(await screen.findByText('Standard alerts')).toBeInTheDocument();
    expect(screen.getByText('Critical alerts')).toBeInTheDocument();
    expect(screen.getAllByText('End of the chain')).toHaveLength(3);
    expect(screen.getByLabelText('Declared care level of the elder weight')).toHaveValue(30);
    expect(screen.getByLabelText('High from')).toHaveValue(35);
    expect(screen.getByText('Critical tier 1: time limit 60 s → 45 s')).toBeInTheDocument();
    expect(
      screen.getByText('Declared care level of the elder: weight 30 → 50'),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Asha Njeri/)).toHaveLength(2);
  });

  it('gathers edits, saves them together from the bar, and says when they apply', async () => {
    vi.spyOn(api.escalationPolicy, 'get').mockResolvedValue(policy);
    const update = vi.spyOn(api.escalationPolicy, 'updateRule').mockResolvedValue(policy);
    render(<Policy />);

    const field = await screen.findByLabelText('Critical tier 1 time limit in seconds');
    await userEvent.clear(field);
    await userEvent.type(field, '45');

    // The edited row says so in words, and the bar counts what is waiting.
    expect(within(field.closest('tr')!).getByText('Edited')).toBeInTheDocument();
    const bar = screen.getByRole('region', { name: 'Unsaved changes' });
    expect(bar).toHaveTextContent('1 unsaved change');
    await userEvent.click(within(bar).getByRole('button', { name: 'Save changes' }));

    expect(update).toHaveBeenCalledWith('CRITICAL', 1, {
      timeoutSeconds: 45,
      dispatchMode: 'SEQUENTIAL',
      smsFallbackImmediate: false,
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Critical tier 1 saved. They apply from the next alert.',
    );
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).not.toBeInTheDocument();
  });

  it('puts every field back on Discard', async () => {
    vi.spyOn(api.escalationPolicy, 'get').mockResolvedValue(policy);
    render(<Policy />);

    const weight = await screen.findByLabelText('Declared care level of the elder weight');
    await userEvent.clear(weight);
    await userEvent.type(weight, '40');
    await userEvent.click(screen.getByLabelText('Text Standard tier 2 at once'));
    expect(screen.getByRole('region', { name: 'Unsaved changes' })).toHaveTextContent(
      '2 unsaved changes',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(weight).toHaveValue(30);
    expect(screen.queryByText('Edited')).not.toBeInTheDocument();
  });

  it("shows the server's reason when a change is refused, in its own section", async () => {
    vi.spyOn(api.escalationPolicy, 'get').mockResolvedValue(policy);
    vi.spyOn(api.escalationPolicy, 'updateBands').mockRejectedValue(
      new ApiError(400, 'High must start below Critical.'),
    );
    render(<Policy />);

    const high = await screen.findByLabelText('High from');
    await userEvent.clear(high);
    await userEvent.type(high, '70');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    // Shown in the bands section, where the field is, not at the top; the edit stays.
    const bands = screen.getByRole('region', { name: /Where each band starts/ });
    expect(
      await within(bands).findByText(
        'The bands could not be saved. High must start below Critical.',
      ),
    ).toBeInTheDocument();
    expect(high).toHaveValue(70);
    expect(screen.getByRole('region', { name: 'Unsaved changes' })).toBeInTheDocument();
  });

  it('shows no save bar until something changes', async () => {
    vi.spyOn(api.escalationPolicy, 'get').mockResolvedValue(policy);
    render(<Policy />);

    await screen.findByText('Standard alerts');
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });
});
