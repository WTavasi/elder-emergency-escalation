import { describe, expect, it } from 'vitest';
import { distance, formatAgo, formatDuration, humanise, timeAway } from './format';

describe('formatDuration', () => {
  it('stays in seconds below a minute, which is where most acknowledgements land', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45)).toBe('45s');
  });

  it('drops the seconds when a duration is a whole number of minutes', () => {
    expect(formatDuration(120)).toBe('2m');
    expect(formatDuration(125)).toBe('2m 5s');
  });

  it('switches to hours where seconds would stop being readable', () => {
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(5400)).toBe('1h 30m');
  });

  it('never shows a negative duration, because an overdue timer is handled separately', () => {
    expect(formatDuration(-30)).toBe('0s');
  });
});

describe('formatAgo', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const before = (seconds: number) => now - seconds * 1000;

  it('says just now, then minutes, then hours, as a person would', () => {
    expect(formatAgo(before(10), now)).toBe('just now');
    expect(formatAgo(before(4 * 60), now)).toBe('4 min ago');
    expect(formatAgo(before(2 * 3600), now)).toBe('2 h ago');
  });

  it('gives the date once it is more than a day old', () => {
    expect(formatAgo(before(3 * 86400), now)).not.toMatch(/ago/);
  });

  it('never says a time in the future, when the clocks disagree a little', () => {
    expect(formatAgo(now + 5000, now)).toBe('just now');
  });
});

describe('humanise', () => {
  it('turns an enum into something a person reads', () => {
    expect(humanise('SEVERITY_EVALUATED')).toBe('severity evaluated');
    expect(humanise('EMERGENCY_RESPONDER')).toBe('emergency responder');
  });
});

describe('timeAway', () => {
  it('says minutes the way a person would, and hours past the hour', () => {
    expect(timeAway(30)).toBe('less than a minute');
    expect(timeAway(60)).toBe('about 1 minute');
    expect(timeAway(540)).toBe('about 9 minutes');
    expect(timeAway(3600)).toBe('about 1 hour');
    expect(timeAway(4500)).toBe('about 1 hour 15 minutes');
  });
});

describe('distance', () => {
  it('keeps metres under a kilometre and one decimal above', () => {
    expect(distance(648)).toBe('650 m');
    expect(distance(4210)).toBe('4.2 km');
  });
});
