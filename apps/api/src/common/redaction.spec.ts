import { coarsenCoordinate, redact, redactPhone } from './redaction';

describe('redaction', () => {
  it('keeps a phone number recognisable without being identifying', () => {
    expect(redactPhone('+254700000010')).toBe('+254*******10');
    expect(redactPhone('0712')).toBe('***');
  });

  it('coarsens coordinates to roughly a city', () => {
    expect(coarsenCoordinate(-1.2833)).toBe(-1.3);
    expect(coarsenCoordinate(36.7833)).toBe(36.8);
  });

  it('removes secrets at any depth', () => {
    const input = {
      user: { phone: '+254700000010', passwordHash: 'scrypt$16384$8$1$abc$def' },
      auth: { accessToken: 'eyJhbGciOi' },
      event: { alertLatitude: -1.283312, alertLongitude: 36.783399 },
    };

    expect(redact(input)).toEqual({
      user: { phone: '+254*******10', passwordHash: '[redacted]' },
      auth: { accessToken: '[redacted]' },
      event: { alertLatitude: -1.3, alertLongitude: 36.8 },
    });
  });

  it('leaves ordinary values alone and survives arrays and nulls', () => {
    expect(redact({ state: 'TRIGGERED', tier: 2, resolvedAt: null, tiers: [1, 2, 3] })).toEqual({
      state: 'TRIGGERED',
      tier: 2,
      resolvedAt: null,
      tiers: [1, 2, 3],
    });
  });
});
