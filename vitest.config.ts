import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'coverage/**', '.qh*/**', '.test-temp/**', 'fixtures/**/node_modules/**'],
    maxWorkers: 1,
    testTimeout: 60000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/adapters/**/*.ts', 'src/reporters/**/*.ts', 'src/rules/**/*.ts', 'src/cli/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**/*.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70
      }
    }
  }
});
