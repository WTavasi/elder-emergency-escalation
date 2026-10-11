import { describe, expect, it } from 'vitest';
import { COUNTRIES } from './countries';
import { flagOf } from './country';
import { DEFAULT_COUNTRY, readPhone } from './read-phone';

const country = (iso: string) => COUNTRIES.find((c) => c.iso === iso)!;

describe('readPhone', () => {
  it.each(['0712345678', '712345678', '0712 345 678', '+254 712 345 678', '00254712345678'])(
    'reads "%s" as +254712345678 with Kenya chosen',
    (typed) => {
      expect(readPhone(country('KE'), typed).e164).toBe('+254712345678');
    },
  );

  it('says when a number is too short, naming the country', () => {
    expect(readPhone(country('KE'), '0712').problem).toBe('That number is too short for Kenya.');
  });

  it('keeps the leading zero where the country has no trunk prefix', () => {
    expect(readPhone(country('IT'), '0612345678').e164).toBe('+390612345678');
  });

  it('starts on Kenya', () => {
    expect(DEFAULT_COUNTRY.iso).toBe('KE');
  });

  it('draws a flag from the ISO code', () => {
    expect(flagOf('KE')).toBe('🇰🇪');
  });
});
