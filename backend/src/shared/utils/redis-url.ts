/**
 * Redis connection details from a URL.
 *
 * ioredis takes a URL, but BullMQ wants structured connection options, so the one
 * REDIS_URL in the environment is parsed here rather than configured twice. Two copies
 * of a connection string is how development and production quietly end up pointing at
 * different servers.
 */

export interface RedisConnection {
  host: string;
  port: number;
  password?: string;
  username?: string;
  db: number;
}

export function parseRedisUrl(url: string): RedisConnection {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`REDIS_URL is not a valid URL: "${url}"`);
  }

  if (!['redis:', 'rediss:'].includes(parsed.protocol)) {
    throw new Error(
      `REDIS_URL must start with redis:// or rediss://, received "${parsed.protocol}"`,
    );
  }

  const path = parsed.pathname.replace(/^\//, '');
  const db = path === '' ? 0 : Number(path);
  if (!Number.isInteger(db) || db < 0) {
    throw new Error(`REDIS_URL database index must be a whole number, received "${path}"`);
  }

  return {
    host: parsed.hostname || 'localhost',
    port: parsed.port === '' ? 6379 : Number(parsed.port),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    db,
  };
}
