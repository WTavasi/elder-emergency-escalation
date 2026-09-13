import { RedisService } from './redis.service';

describe('keyspace expiry flags', () => {
  describe('publishesExpiry', () => {
    it('accepts the configurations that actually deliver expiry events', () => {
      for (const flags of ['Ex', 'ExK', 'KEA', 'EA', 'gxE', 'AKE']) {
        expect(RedisService.publishesExpiry(flags)).toBe(true);
      }
    });

    it('rejects the configurations that quietly do not', () => {
      // Empty is the Redis default. Kx publishes to the keyspace channel rather than
      // the keyevent channel, which is not what the listener subscribes to. E alone
      // carries no expiry class.
      for (const flags of ['', 'Kx', 'E', 'KEg', 'x']) {
        expect(RedisService.publishesExpiry(flags)).toBe(false);
      }
    });
  });

  describe('withExpiryFlags', () => {
    it('adds what is missing to an empty configuration', () => {
      expect(RedisService.withExpiryFlags('').split('').sort().join('')).toBe('Ex');
    });

    it('keeps flags another application may depend on', () => {
      const result = RedisService.withExpiryFlags('Kg$');
      for (const flag of ['K', 'g', '$', 'E', 'x']) {
        expect(result).toContain(flag);
      }
    });

    it('does not add x when A already covers every class', () => {
      expect(RedisService.withExpiryFlags('KA')).not.toContain('x');
      expect(RedisService.withExpiryFlags('KA')).toContain('E');
    });

    it('is idempotent', () => {
      expect(RedisService.withExpiryFlags('Ex')).toBe('Ex');
    });
  });
});
