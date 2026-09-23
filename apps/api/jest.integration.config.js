/**
 * Integration tests, run against real Postgres and Redis.
 *
 * Separate from the unit config because these need `docker compose up -d` and take
 * seconds rather than milliseconds. Run with: npm run test:integration -w @mzazicare/api
 */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: 'test/.*\\.spec\\.ts$',
  setupFiles: ['reflect-metadata'],
  // Generous. These tests wait on real Redis expiry and a real queue, and a shared CI
  // runner is slower than a developer machine by a margin nobody can predict. The
  // suite polls for its conditions, so a healthy run finishes in seconds regardless;
  // this ceiling exists so a busy runner reports the truth instead of a timeout.
  testTimeout: 60_000,
  // One at a time: these share one database and one Redis.
  maxWorkers: 1,
};
