import { parseTimerKey, timerKey } from './escalation.keys';

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
