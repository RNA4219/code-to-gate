import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '.qh*/**',
      '.test-temp/**',
      'fixtures/**/node_modules/**',
      'src/__tests__/performance/**',
      'src/__tests__/real-repos/**',
    ],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 2,
        maxThreads: 4,
      },
    },
    testTimeout: 60000,
    hookTimeout: 60000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/adapters/**/*.ts', 'src/reporters/**/*.ts', 'src/rules/**/*.ts', 'src/cli/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**/*.ts'],
      thresholds: {
        lines: 45,
        functions: 50,
        branches: 50,
        statements: 45
      }
    }
  }
});
