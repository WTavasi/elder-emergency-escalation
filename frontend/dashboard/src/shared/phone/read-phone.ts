import type { Country } from './country';
import { COUNTRIES } from './countries';

const kenya = COUNTRIES.find((c) => c.iso === 'KE');
if (!kenya) throw new Error('The generated country list has no Kenya; regenerate it.');

/** Kenya, where nearly everybody using this starts. */
export const DEFAULT_COUNTRY: Country = kenya;

const E164 = /^\+[1-9]\d{7,14}$/;

export type PhoneReading = { e164: string; problem: null } | { e164: null; problem: string };

/**
 * A number as people type it, in the international format the API accepts. The same
 * rules as the app: a number with its own + or 00 is taken as given; otherwise the
 * trunk prefix is dropped when the number is long enough to carry one, and the calling
 * code is added. 0712 345 678 with Kenya chosen becomes +254712345678.
 */
export function readPhone(country: Country, typed: string): PhoneReading {
  const trimmed = typed.trim();
  if (!trimmed) return { e164: null, problem: 'Enter a phone number.' };

  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+') || trimmed.startsWith('00')) {
    if (trimmed.startsWith('00')) digits = digits.slice(2);
    const full = `+${digits}`;
    return E164.test(full)
      ? { e164: full, problem: null }
      : { e164: null, problem: 'That does not look like a full international number.' };
  }

  if (
    country.trunk &&
    digits.startsWith(country.trunk) &&
    digits.length - country.trunk.length >= country.min
  ) {
    digits = digits.slice(country.trunk.length);
  }
  if (digits.length < country.min) {
    return { e164: null, problem: `That number is too short for ${country.name}.` };
  }
  if (digits.length > country.max) {
    return { e164: null, problem: `That number is too long for ${country.name}.` };
  }

  const full = `+${country.dial}${digits}`;
  return E164.test(full)
    ? { e164: full, problem: null }
    : { e164: null, problem: `That does not look like a ${country.name} number.` };
}
