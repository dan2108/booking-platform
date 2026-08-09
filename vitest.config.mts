import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // DB tests share one database and clean up after themselves, so they run
    // in a single file-thread rather than racing each other's fixtures.
    // The concurrency test still uses real parallel connections inside itself.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
