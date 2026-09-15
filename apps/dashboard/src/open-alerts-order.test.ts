import { describe, expect, it } from 'vitest';
import { order } from './OpenAlerts';
import type { AlertSummary, Severity } from './api/types';

const alert = (
  eventId: string,
  severity: Severity,
  triggeredAt: string,
  acknowledged = false,
): AlertSummary => ({
  eventId,
  severity,
  triggeredAt,
  state: acknowledged ? 'ACKNOWLEDGED' : 'NOTIFIED',
  severityScore: 0,
  currentTier: 1,
  outcome: null,
  elder: { id: 'e', name: 'Elder', addressLabel: null },
  acknowledgedBy: acknowledged ? { id: 'u', name: 'Owner', role: 'CAREGIVER' } : null,
  latitude: 0,
  longitude: 0,
  addressLabel: null,
  acknowledgedAt: null,
  resolvedAt: null,
  deadlineAt: null,
  responderRequestedAt: null,
  responseSeconds: null,
});

const ids = (alerts: AlertSummary[]): string[] => alerts.map((item) => item.eventId);

describe('board ordering', () => {
  it('puts everything nobody has answered above everything somebody has', () => {
    const sorted = order([
      alert('answered-critical', 'CRITICAL', '2026-01-01T00:00:00Z', true),
      alert('waiting-standard', 'STANDARD', '2026-01-01T00:05:00Z'),
    ]);

    // A critical emergency that somebody already owns is not the one to work next.
    expect(ids(sorted)).toEqual(['waiting-standard', 'answered-critical']);
  });

  it('ranks unanswered emergencies by severity', () => {
    const sorted = order([
      alert('standard', 'STANDARD', '2026-01-01T00:00:00Z'),
      alert('critical', 'CRITICAL', '2026-01-01T00:00:00Z'),
      alert('elevated', 'ELEVATED', '2026-01-01T00:00:00Z'),
    ]);

    expect(ids(sorted)).toEqual(['critical', 'elevated', 'standard']);
  });

  it('breaks a tie with the longest wait, not the newest arrival', () => {
    const sorted = order([
      alert('newer', 'CRITICAL', '2026-01-01T00:10:00Z'),
      alert('older', 'CRITICAL', '2026-01-01T00:00:00Z'),
    ]);

    expect(ids(sorted)).toEqual(['older', 'newer']);
  });

  it('does not modify the array it was given', () => {
    const input = [
      alert('b', 'STANDARD', '2026-01-01T00:00:00Z'),
      alert('a', 'CRITICAL', '2026-01-01T00:00:00Z'),
    ];
    order(input);

    expect(ids(input)).toEqual(['b', 'a']);
  });
});
