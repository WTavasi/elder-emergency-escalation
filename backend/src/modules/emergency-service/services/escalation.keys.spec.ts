import {
  parseReviewKey,
  parseServiceKey,
  parseStationKey,
  parseTimerKey,
  reviewKey,
  serviceKey,
  stationKey,
  timerKey,
} from './escalation.keys';

describe('timer keys', () => {
  it('round-trips an event and tier', () => {
    const key = timerKey('7f1c9e2a-0000-4000-8000-000000000001', 2);
    expect(key).toBe('escalation:timer:7f1c9e2a-0000-4000-8000-000000000001:2');
    expect(parseTimerKey(key)).toEqual({
      eventId: '7f1c9e2a-0000-4000-8000-000000000001',
      tier: 2,
    });
  });

  it('ignores keys that belong to something else', () => {
    for (const key of [
      'session:abc:1',
      'escalation:timer:abc',
      'escalation:timer:abc:2:extra',
      'escalation:timer::2',
      'escalation:timer:abc:zero',
      'escalation:timer:abc:0',
      'escalation:timer:abc:-1',
      '',
    ]) {
      expect(parseTimerKey(key)).toBeNull();
    }
  });
});

describe('severity review keys', () => {
  it('round-trips an event', () => {
    expect(parseReviewKey(reviewKey('event-1'))).toBe('event-1');
  });

  it('is never mistaken for a tier timer, nor a tier timer for it', () => {
    expect(parseTimerKey(reviewKey('event-1'))).toBeNull();
    expect(parseReviewKey(timerKey('event-1', 2))).toBeNull();
    expect(parseReviewKey('session:abc')).toBeNull();
  });

  it('reads a station wait back to its emergency, and nothing else as one', () => {
    expect(parseStationKey(stationKey('event-1'))).toBe('event-1');
    expect(parseStationKey(reviewKey('event-1'))).toBeNull();
    expect(parseStationKey(timerKey('event-1', 3))).toBeNull();
    expect(parseTimerKey(stationKey('event-1'))).toBeNull();
  });

  it('reads the wait before a service is asked back to its emergency', () => {
    expect(parseServiceKey(serviceKey('event-1'))).toBe('event-1');
    expect(parseServiceKey(stationKey('event-1'))).toBeNull();
    expect(parseStationKey(serviceKey('event-1'))).toBeNull();
  });
});
