/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  // Every test file talks to the same real local Postgres instance, and
  // several create a fresh `pg.Pool` per test. Jest's default worker
  // count (CPU-core-based) lets too many test files' pools overlap at
  // once, spiking connection/lock contention on that one shared
  // database — reproduced as intermittent `deadlock detected` errors
  // and cascading 5s hook timeouts under full parallelism (ticket #24).
  // Capped, not disabled (`--runInBand`), so the suite still benefits
  // from real parallelism at a level the local instance handles fine.
  maxWorkers: 4,
};
