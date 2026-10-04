import { isInsideCoverWindow, isNight, localParts } from './time';

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

describe('isInsideCoverWindow', () => {
  const weekdayDaytime = { daysOfWeek: [1, 2, 3, 4, 5], startMinute: 8 * 60, endMinute: 17 * 60 };

  it('accepts a weekday afternoon', () => {
    expect(isInsideCoverWindow(weekdayDaytime, { hour: 14, minutesOfDay: 840, dayOfWeek: 1 })).toBe(
      true,
    );
  });

  it('rejects the same time on a Sunday', () => {
    expect(isInsideCoverWindow(weekdayDaytime, { hour: 14, minutesOfDay: 840, dayOfWeek: 0 })).toBe(
      false,
    );
  });

  it('rejects a weekday night', () => {
    expect(isInsideCoverWindow(weekdayDaytime, { hour: 2, minutesOfDay: 120, dayOfWeek: 2 })).toBe(
      false,
    );
  });

  it('treats an undeclared window as no cover', () => {
    expect(
      isInsideCoverWindow(
        { daysOfWeek: [1], startMinute: null, endMinute: null },
        { hour: 14, minutesOfDay: 840, dayOfWeek: 1 },
      ),
    ).toBe(false);
  });

  it('supports an overnight window', () => {
    const overnight = { daysOfWeek: [], startMinute: 20 * 60, endMinute: 6 * 60 };
    expect(isInsideCoverWindow(overnight, { hour: 23, minutesOfDay: 1380, dayOfWeek: 3 })).toBe(
      true,
    );
    expect(isInsideCoverWindow(overnight, { hour: 4, minutesOfDay: 240, dayOfWeek: 3 })).toBe(true);
    expect(isInsideCoverWindow(overnight, { hour: 12, minutesOfDay: 720, dayOfWeek: 3 })).toBe(
      false,
    );
  });
});
