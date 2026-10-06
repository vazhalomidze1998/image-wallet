/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setupEnv.ts'],
  clearMocks: true,
  // All test files share one database, so they must not run in parallel.
  maxWorkers: 1,
};
