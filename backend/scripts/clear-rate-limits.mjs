#!/usr/bin/env node
/**
 * Clears the API's rate-limit counters in a local Redis.
 *
 * For a long testing session. Sign-in allows 20 attempts in five minutes from one
 * address, and a full Postman run uses about nine, so running the collection a few
 * times in a row reaches the limit. Waiting works too; this saves the wait without
 * switching the limits off.
 *
 * Clears only counters: the per-route request counts and the sign-up code cooldown and
 * hourly count. Codes already sent, sessions, timers and the delivery queue are left
 * alone. Refuses to touch any Redis that is not on this machine.
 *
 * Usage: npm run dev:clear-limits -w @mzazicare/api
 */
import Redis from 'ioredis';

const url = process.env.REDIS_URL;
if (!url) {
  console.error('REDIS_URL is not set. Run this through npm so backend/.env is loaded.');
  process.exit(1);
}

const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
  console.error(`Refusing to clear counters on ${host}. This is for a local Redis only.`);
  process.exit(1);
}

const redis = new Redis(url, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  // One attempt. A script that keeps reconnecting to a Redis that is not running just
  // looks frozen.
  retryStrategy: () => null,
});
// Reported once, below, in words; without this ioredis also prints its own stack trace.
redis.on('error', () => {});

try {
  await redis.connect();
} catch (error) {
  console.error(`Could not reach Redis: ${error instanceof Error ? error.message : error}`);
  console.error('Is Docker running? Start it with: docker compose up -d');
  process.exit(1);
}

const patterns = ['ratelimit:*', 'verify:cooldown:*', 'verify:count:*'];
let cleared = 0;

for (const pattern of patterns) {
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = next;
    if (keys.length > 0) cleared += await redis.del(...keys);
  } while (cursor !== '0');
}

// Counts only. The keys hold phone numbers and addresses, which have no place in a
// terminal that may be shared or recorded.
console.log(`Cleared ${cleared} counter(s). Sign-in and sign-up limits start again from zero.`);
await redis.quit();
