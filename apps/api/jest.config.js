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
  clearMocks: true,
};
