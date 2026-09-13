/**
 * Redaction for anything that might be written to a log.
 *
 * This system holds phone numbers, coordinates and credentials. The design rule is
 * that application logs carry no personal data, so log lines are metadata only, and
 * anything that does have to be logged goes through here first.
 */

const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|apikey|api_key/i;
const LOCATION_KEY = /lat(itude)?|lon(g|gitude)?|coordinate/i;
const PHONE_KEY = /phone|msisdn|mobile/i;

/** Keeps the country code and the last two digits: +254700000010 -> +254******10 */
export function redactPhone(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 6) return '***';
  const head = trimmed.startsWith('+') ? trimmed.slice(0, 4) : trimmed.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(trimmed.length - head.length - 2, 1))}${trimmed.slice(-2)}`;
}

/** Coordinates truncated to about 11 km, enough to say "Nairobi" and no more. */
export function coarsenCoordinate(value: number): number {
  return Math.round(value * 10) / 10;
}

export function redact(input: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth limit]';
  if (input === null || input === undefined) return input;

  if (Array.isArray(input)) return input.map((item) => redact(item, depth + 1));

  if (input instanceof Date) return input.toISOString();

  if (typeof input === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key)) {
        output[key] = '[redacted]';
      } else if (PHONE_KEY.test(key) && typeof value === 'string') {
        output[key] = redactPhone(value);
      } else if (LOCATION_KEY.test(key) && typeof value === 'number') {
        output[key] = coarsenCoordinate(value);
      } else {
        output[key] = redact(value, depth + 1);
      }
    }
    return output;
  }

  return input;
}
