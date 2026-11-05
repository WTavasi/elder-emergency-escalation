import { driftOf, nudgeAfterMinutes, rhythmOf } from './check-in-rhythm';

describe('check-in rhythm', () => {
  it('waits for five answers before it trusts a rhythm', () => {
    expect(rhythmOf([1, 2, 3, 4])).toBeNull();
    expect(rhythmOf([1, 2, 3, 4, 20])).toEqual({ answers: 5, usualMinutes: 3, slowMinutes: 20 });
  });

  it('nudges a quick answerer early, when the silence is already unusual for them', () => {
    const quick = rhythmOf([1, 1, 2, 2, 3, 2, 1]);
    // Twice their slow answer (3), but never sooner than five minutes.
    expect(nudgeAfterMinutes(quick, 30)).toBe(6);
    expect(nudgeAfterMinutes(rhythmOf([0, 0, 1, 1, 1]), 30)).toBe(5);
  });

  it('never reminds later than half way, whatever the rhythm', () => {
    expect(nudgeAfterMinutes(rhythmOf([10, 12, 14, 15, 20]), 30)).toBe(15);
    expect(nudgeAfterMinutes(null, 30)).toBe(15);
  });

  it('notices answers drifting much later than the weeks before', () => {
    const before = { delays: [2, 3, 2, 4, 3, 2, 3], missed: 0, asked: 28 };
    expect(driftOf({ delays: [15, 20, 18, 25], missed: 0, asked: 7 }, before)).toMatchObject({
      later: true,
      moreMissed: false,
      usualBefore: 3,
      usualNow: 18,
    });
  });

  it('notices more missed than usual', () => {
    const before = { delays: [2, 3, 2, 4, 3, 2, 3], missed: 1, asked: 28 };
    expect(driftOf({ delays: [2, 3, 2, 3, 2], missed: 2, asked: 7 }, before)).toMatchObject({
      moreMissed: true,
      later: false,
      missedNow: 2,
    });
  });

  it('says nothing about a normal week, or with too little to compare', () => {
    const before = { delays: [2, 3, 2, 4, 3, 2, 3], missed: 1, asked: 28 };
    expect(driftOf({ delays: [3, 2, 4, 3, 2, 5, 3], missed: 0, asked: 7 }, before)).toBeNull();
    expect(
      driftOf(
        { delays: [30, 40, 50], missed: 0, asked: 3 },
        { delays: [1, 2], missed: 0, asked: 2 },
      ),
    ).toBeNull();
  });
});
