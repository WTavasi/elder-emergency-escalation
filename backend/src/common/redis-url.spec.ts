import { parseRedisUrl } from './redis-url';

describe('parseRedisUrl', () => {
  it('reads the local development URL', () => {
    expect(parseRedisUrl('redis://localhost:6379')).toEqual({
      host: 'localhost',
      port: 6379,
      db: 0,
    });
  });

  it('reads a managed URL with credentials, TLS and a database index', () => {
    expect(parseRedisUrl('rediss://default:s3cr3t@redis.example.com:6380/3')).toEqual({
      host: 'redis.example.com',
      port: 6380,
      username: 'default',
      password: 's3cr3t',
      db: 3,
    });
  });

  it('decodes a password containing URL-escaped characters', () => {
    expect(parseRedisUrl('redis://:p%40ss%2Fword@host:6379').password).toBe('p@ss/word');
  });

  it('defaults the port and database when they are absent', () => {
    expect(parseRedisUrl('redis://cache')).toEqual({ host: 'cache', port: 6379, db: 0 });
  });

  it('rejects anything that is not a Redis URL', () => {
    expect(() => parseRedisUrl('not a url')).toThrow(/not a valid URL/);
    expect(() => parseRedisUrl('postgres://localhost:5432/db')).toThrow(/redis:\/\//);
    expect(() => parseRedisUrl('redis://localhost:6379/two')).toThrow(/whole number/);
  });
});
