import { defineConfig } from 'vitest/config';

process.env.GIT_CONFIG_COUNT ??= '1';
process.env.GIT_CONFIG_KEY_0 ??= 'core.autocrlf';
process.env.GIT_CONFIG_VALUE_0 ??= 'false';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*tree-sitter*.test.ts'],
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
