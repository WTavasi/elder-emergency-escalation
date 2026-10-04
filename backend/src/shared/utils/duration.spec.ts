import { toSeconds } from './duration';

describe('toSeconds', () => {
  it('converts each supported unit', () => {
    expect(toSeconds('45s')).toBe(45);
    expect(toSeconds('15m')).toBe(900);
    expect(toSeconds('2h')).toBe(7200);
    expect(toSeconds('30d')).toBe(2592000);
  });

  it('accepts a bare number as seconds, and tolerates spacing and case', () => {
    expect(toSeconds('900')).toBe(900);
    expect(toSeconds(' 15 m ')).toBe(900);
    expect(toSeconds('30D')).toBe(2592000);
  });

  it('rejects anything it cannot interpret, naming the value', () => {
    for (const bad of ['', 'soon', '15 minutes', '-5m', '1.5h', 'm15']) {
      expect(() => toSeconds(bad)).toThrow(/Invalid duration/);
    }
  });
});
