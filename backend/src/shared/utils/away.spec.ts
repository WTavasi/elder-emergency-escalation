import { isAway } from './away';

describe('isAway', () => {
  const now = new Date('2026-11-25T12:00:00Z');
  const at = (iso: string) => new Date(iso);

  it('is away from the moment they said, until the end they chose', () => {
    expect(
      isAway({ awaySince: at('2026-11-25T08:00:00Z'), awayUntil: at('2026-11-25T18:00:00Z') }, now),
    ).toBe(true);
  });

  it('is away with no end until they turn it off', () => {
    expect(isAway({ awaySince: at('2026-11-20T08:00:00Z'), awayUntil: null }, now)).toBe(true);
  });

  it('is back once the end has passed, with nothing to clear', () => {
    expect(
      isAway({ awaySince: at('2026-11-25T08:00:00Z'), awayUntil: at('2026-11-25T11:00:00Z') }, now),
    ).toBe(false);
  });

  it('is not away when they never said so', () => {
    expect(isAway({ awaySince: null, awayUntil: null }, now)).toBe(false);
  });
});
