import { describe, expect, it } from 'vitest';
import type { AlertSummary } from '../../shared/api/types';
import { heldRows } from './Board';

const alert = (eventId: string, name: string): AlertSummary => ({
  eventId,
  state: 'NOTIFIED',
  severity: 'ELEVATED',
  severityScore: 40,
  currentTier: 1,
  outcome: null,
  outcomeNote: null,
  elder: { id: `elder-${eventId}`, name, phone: null, addressLabel: null },
  acknowledgedBy: null,
  latitude: null,
  longitude: null,
  addressLabel: null,
  triggeredAt: '2026-11-20T09:00:00.000Z',
  acknowledgedAt: null,
  resolvedAt: null,
  deadlineAt: null,
  responderRequestedAt: null,
  responseSeconds: null,
});

const grace = alert('a', 'Grace Wanjiru');
const peter = alert('b', 'Peter Kamau');
const mary = alert('c', 'Mary Achieng');

describe('the board while the list is pointed at', () => {
  it('shows the live order when nothing is held', () => {
    const { rows, waiting } = heldRows([peter, grace], null, new Map());
    expect(rows.map((row) => row.alert.elder.name)).toEqual(['Peter Kamau', 'Grace Wanjiru']);
    expect(waiting).toBe(0);
  });

  it('keeps the held order, updates rows in place and counts a new one rather than inserting it', () => {
    const answered = { ...grace, state: 'ACKNOWLEDGED' as const };
    const { rows, waiting } = heldRows(
      [mary, answered, peter],
      ['a', 'b'],
      new Map([
        ['a', grace],
        ['b', peter],
      ]),
    );

    expect(rows.map((row) => row.alert.elder.name)).toEqual(['Grace Wanjiru', 'Peter Kamau']);
    expect(rows[0]!.alert.state).toBe('ACKNOWLEDGED');
    expect(waiting).toBe(1);
  });

  it('keeps a row closed meanwhile in its place, marked as gone', () => {
    const { rows } = heldRows(
      [peter],
      ['a', 'b'],
      new Map([
        ['a', grace],
        ['b', peter],
      ]),
    );

    expect(rows).toEqual([
      { alert: grace, gone: true },
      { alert: peter, gone: false },
    ]);
  });
});
