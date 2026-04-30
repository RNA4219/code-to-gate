import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/performance/**/*.test.ts', 'src/__tests__/real-repos/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'coverage/**', '.qh*/**', '.test-temp/**', 'fixtures/**/node_modules/**'],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 2,
        maxThreads: 4,
      },
    },
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
