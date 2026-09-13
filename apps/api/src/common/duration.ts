/**
 * Duration strings to seconds.
 *
 * Token lifetimes are configured as "15m" and "30d" because that is readable in a
 * .env file, but the signing library types its expiry against a template literal
 * type that a plain string cannot satisfy. Converting here keeps the configuration
 * human and the call site typed, with no cast.
 */

const PATTERN = /^(\d+)\s*(s|m|h|d)$/i;

const MULTIPLIER: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
};

export function toSeconds(value: string): number {
  const trimmed = value.trim();

  if (/^\d+$/.test(trimmed)) return Number(trimmed);

  const match = PATTERN.exec(trimmed);
  if (!match) {
    throw new Error(
      `Invalid duration "${value}". Use a number of seconds, or a number followed by s, m, h or d, for example 15m.`,
    );
  }

  return Number(match[1]) * MULTIPLIER[match[2].toLowerCase()];
}
