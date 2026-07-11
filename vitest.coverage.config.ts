import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/__tests__/smoke/**/*.test.ts',
      'src/__tests__/plugin/**/*.test.ts',
      'src/__tests__/cli-all.test.ts',
      'src/__tests__/evaluation.test.ts',
      'src/__tests__/rules-all.test.ts',
      'src/cli/__tests__/**/*.test.ts',
      'src/config/__tests__/**/*.test.ts',
      'src/evaluation/__tests__/**/*.test.ts',
      'src/reporters/__tests__/**/*.test.ts',
      'src/rules/__tests__/**/*.test.ts',
      'src/suppression/__tests__/**/*.test.ts',
      'src/plugin/__tests__/**/*.test.ts',
      'src/evidence/__tests__/**/*.test.ts',
    ],
    exclude: ['node_modules/**', 'dist/**', 'coverage/**', '.qh*/**', '.test-temp/**', 'fixtures/**/node_modules/**'],
    pool: 'threads',
    singleThread: false,
    minThreads: 2,
    maxThreads: 4,
    testTimeout: 120000,
    hookTimeout: 120000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: ['src/cli/**/*.ts', 'src/config/**/*.ts', 'src/evaluation/**/*.ts', 'src/reporters/**/*.ts', 'src/rules/**/*.ts', 'src/suppression/**/*.ts', 'src/plugin/**/*.ts', 'src/evidence/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**/*.ts',
        'src/cli/llm-health.ts',
        'src/cli/viewer.ts',
        'src/config/config-loader.ts',
        'src/config/config-schema.ts',
        'src/config/index.ts',
        'src/config/policy-loader.ts',
        'src/evaluation/fn-evaluator.ts',
        'src/evaluation/index.ts',
        'src/reporters/index.ts',
        'src/suppression/index.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    }
  },
});
