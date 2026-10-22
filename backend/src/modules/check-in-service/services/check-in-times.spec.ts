import {
  dueTimesOn,
  formatTime,
  isTimeZone,
  parseTime,
  partOfDay,
  wallClock,
  zonedInstant,
} from './check-in-times';

describe('check-in times', () => {
  it('reads a time of day as minutes after midnight', () => {
    expect(parseTime('09:00')).toBe(540);
    expect(parseTime(' 7:30 ')).toBe(450);
    expect(parseTime('23:59')).toBe(1439);
  });

  it('refuses anything that is not a time of day', () => {
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('9:60')).toBeNull();
    expect(parseTime('nine')).toBeNull();
    expect(parseTime('')).toBeNull();
  });

  it('writes minutes back as a time of day', () => {
    expect(formatTime(540)).toBe('09:00');
    expect(formatTime(1205)).toBe('20:05');
  });

  it('knows a real time zone from a made-up one', () => {
    expect(isTimeZone('Africa/Nairobi')).toBe(true);
    expect(isTimeZone('Mars/Olympus')).toBe(false);
  });

  it('places nine in the morning in Nairobi three hours before UTC', () => {
    expect(zonedInstant(2026, 10, 22, 540, 'Africa/Nairobi').toISOString()).toBe(
      '2026-10-22T06:00:00.000Z',
    );
  });

  it('lands on the right side of a change of the clocks', () => {
    // London moves to summer time on 29 March 2026 and back on 25 October 2026.
    expect(zonedInstant(2026, 3, 29, 540, 'Europe/London').toISOString()).toBe(
      '2026-03-29T08:00:00.000Z',
    );
    expect(zonedInstant(2026, 10, 25, 540, 'Europe/London').toISOString()).toBe(
      '2026-10-25T09:00:00.000Z',
    );
  });

  it('works out the day by the elder’s clock, not the server’s', () => {
    // 22:30 UTC is already 01:30 the next day in Nairobi.
    const now = new Date('2026-10-22T22:30:00Z');
    expect(wallClock(now, 'Africa/Nairobi').day).toBe(23);
    expect(dueTimesOn(now, [540, 1080], 'Africa/Nairobi').map((d) => d.toISOString())).toEqual([
      '2026-10-23T06:00:00.000Z',
      '2026-10-23T15:00:00.000Z',
    ]);
  });

  it('greets by the elder’s own time of day', () => {
    expect(partOfDay(new Date('2026-10-22T06:00:00Z'), 'Africa/Nairobi')).toBe('morning');
    expect(partOfDay(new Date('2026-10-22T11:00:00Z'), 'Africa/Nairobi')).toBe('afternoon');
    expect(partOfDay(new Date('2026-10-22T16:00:00Z'), 'Africa/Nairobi')).toBe('evening');
  });
});
