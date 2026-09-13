import { validateEnv } from './env.schema';

const valid = {
  DATABASE_URL: 'postgresql://mzazicare:mzazicare@localhost:5433/mzazicare',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
};

describe('validateEnv', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = validateEnv({ ...valid });
    expect(env.PORT).toBe(3000);
    expect(env.CANCEL_GRACE_WINDOW).toBe(10);
    expect(env.SEVERITY_CRITICAL_FROM).toBe(60);
  });

  it('converts numeric strings, since every env value arrives as text', () => {
    const env = validateEnv({ ...valid, PORT: '4000', ESCALATION_TIER1_TIMEOUT: '90' });
    expect(env.PORT).toBe(4000);
    expect(env.ESCALATION_TIER1_TIMEOUT).toBe(90);
  });

  it('treats an empty string as unset so a blank line falls back to the default', () => {
    expect(validateEnv({ ...valid, PORT: '' }).PORT).toBe(3000);
  });

  it('refuses a short signing secret and names the variable', () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('never echoes a secret value in the error message', () => {
    const secret = 'x'.repeat(10);
    try {
      validateEnv({ ...valid, JWT_ACCESS_SECRET: secret });
      throw new Error('expected validation to fail');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('[redacted]');
      expect(message).not.toContain(secret);
    }
  });

  it('refuses a missing database url', () => {
    const { DATABASE_URL: _omitted, ...withoutDb } = valid;
    expect(() => validateEnv(withoutDb)).toThrow(/DATABASE_URL/);
  });
});
