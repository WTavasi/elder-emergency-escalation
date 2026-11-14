/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Decorators in class-validator, class-transformer and Nest all read metadata at
  // import time. main.ts loads this in the running app; tests need it too.
  setupFiles: ['reflect-metadata'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  collectCoverageFrom: ['**/*.ts', '!**/*.module.ts', '!main.ts'],
  coverageDirectory: '../coverage',
  // json-summary is what CI reads to put the figures on the run's summary page.
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  clearMocks: true,
};
