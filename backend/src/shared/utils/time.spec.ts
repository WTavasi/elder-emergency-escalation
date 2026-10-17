import { isNight, localParts } from './time';

describe('localParts', () => {
  it('converts UTC into the elder timezone', () => {
    // 21:30 UTC is 00:30 the next day in Nairobi, which is a Tuesday.
    const parts = localParts(new Date('2026-09-14T21:30:00Z'), 'Africa/Nairobi');
    expect(parts.hour).toBe(0);
    expect(parts.minutesOfDay).toBe(30);
    expect(parts.dayOfWeek).toBe(2);
  });

  it('reads a daytime moment correctly', () => {
    const parts = localParts(new Date('2026-09-14T11:00:00Z'), 'Africa/Nairobi');
    expect(parts.hour).toBe(14);
    expect(parts.minutesOfDay).toBe(840);
    expect(parts.dayOfWeek).toBe(1);
  });

  it('falls back to UTC for an unusable timezone rather than throwing', () => {
    const parts = localParts(new Date('2026-09-14T11:00:00Z'), 'Not/AZone');
    expect(parts.hour).toBe(11);
  });
});

describe('isNight', () => {
  it('wraps across midnight', () => {
    expect(isNight(23, 22, 6)).toBe(true);
    expect(isNight(2, 22, 6)).toBe(true);
    expect(isNight(22, 22, 6)).toBe(true);
    expect(isNight(6, 22, 6)).toBe(false);
    expect(isNight(14, 22, 6)).toBe(false);
  });

  it('handles a range that does not wrap', () => {
    expect(isNight(3, 1, 5)).toBe(true);
    expect(isNight(6, 1, 5)).toBe(false);
  });
});
