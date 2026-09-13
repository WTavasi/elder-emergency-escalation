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
  testTimeout: 30_000,
  // One at a time: these share one database and one Redis.
  maxWorkers: 1,
};
