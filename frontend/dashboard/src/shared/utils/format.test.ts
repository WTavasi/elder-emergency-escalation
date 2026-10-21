import { describe, expect, it } from 'vitest';
import { distance, formatDuration, formatOffset, humanise, timeAway } from './format';

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

describe('formatOffset', () => {
  it('signs an offset so the timeline reads as time since the alert', () => {
    expect(formatOffset(0)).toBe('0s');
    expect(formatOffset(90)).toBe('+1m 30s');
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
