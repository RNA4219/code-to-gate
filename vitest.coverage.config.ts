import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/__tests__/smoke/**/*.test.ts',
      'src/cli/__tests__/**/*.test.ts',
      'src/config/__tests__/**/*.test.ts',
      'src/evaluation/__tests__/**/*.test.ts',
      'src/reporters/__tests__/**/*.test.ts',
      'src/rules/__tests__/**/*.test.ts',
      'src/suppression/__tests__/**/*.test.ts',
    ],
    exclude: ['node_modules/**', 'dist/**', 'coverage/**', '.qh*/**', '.test-temp/**', 'fixtures/**/node_modules/**'],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 2,
        maxThreads: 4,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/cli/**/*.ts', 'src/config/**/*.ts', 'src/evaluation/**/*.ts', 'src/reporters/**/*.ts', 'src/rules/**/*.ts', 'src/suppression/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**/*.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70
      }
    }
  },
});
