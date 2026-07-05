import { defineConfig } from 'vitest/config';

process.env.GIT_CONFIG_COUNT ??= '1';
process.env.GIT_CONFIG_KEY_0 ??= 'core.autocrlf';
process.env.GIT_CONFIG_VALUE_0 ??= 'false';

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
      'src/**/*tree-sitter*.test.ts',
    ],
    pool: 'forks',
    fileParallelism: true,
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
