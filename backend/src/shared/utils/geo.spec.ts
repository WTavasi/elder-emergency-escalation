import { distanceInMetres, isWithinMetres } from './geo';

const kileleshwa = { latitude: -1.2833, longitude: 36.7833 };
const westlands = { latitude: -1.268, longitude: 36.811 };

describe('distanceInMetres', () => {
  it('is zero for the same point', () => {
    expect(distanceInMetres(kileleshwa, kileleshwa)).toBe(0);
  });

  it('measures a known Nairobi separation to within a few percent', () => {
    // Kileleshwa to Westlands is roughly 3.3 km.
    const metres = distanceInMetres(kileleshwa, westlands);
    expect(metres).toBeGreaterThan(3000);
    expect(metres).toBeLessThan(3700);
  });

  it('is symmetric', () => {
    expect(distanceInMetres(kileleshwa, westlands)).toBe(distanceInMetres(westlands, kileleshwa));
  });

  it('handles a small displacement, which is the case that actually matters', () => {
    // About 0.0009 degrees of latitude is roughly 100 metres.
    const nearby = { latitude: kileleshwa.latitude + 0.0009, longitude: kileleshwa.longitude };
    const metres = distanceInMetres(kileleshwa, nearby);
    expect(metres).toBeGreaterThan(80);
    expect(metres).toBeLessThan(120);
  });

  it('works across the equator and the meridian', () => {
    expect(
      distanceInMetres({ latitude: -1, longitude: 0 }, { latitude: 1, longitude: 0 }),
    ).toBeGreaterThan(220_000);
  });

  it('answers the away-from-home question', () => {
    const nextDoor = { latitude: kileleshwa.latitude + 0.0005, longitude: kileleshwa.longitude };
    expect(isWithinMetres(kileleshwa, nextDoor, 250)).toBe(true);
    expect(isWithinMetres(kileleshwa, westlands, 250)).toBe(false);
  });
});
