/**
 * CLI Smoke Tests
 *
 * Quick validation that CLI commands work at a basic level.
 * Total execution time should be under 5 seconds.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const CLI_PATH = './dist/cli.js';
const FIXTURES_DIR = './fixtures';
const TEMP_DIR = './.test-temp/smoke-cli';

describe('CLI Smoke Tests', () => {
  it('--help works and shows available commands', () => {
    const result = execSync(`node ${CLI_PATH} --help`).toString();
    expect(result).toContain('scan');
    expect(result).toContain('analyze');
    expect(result).toContain('diff');
    expect(result).toContain('import');
    expect(result).toContain('readiness');
    expect(result).toContain('export');
  });

  it('--version shows version number', () => {
    const result = execSync(`node ${CLI_PATH} --version`).toString();
    expect(result).toMatch(/\d+\.\d+\.\d+/);
  });

  it('returns error for unknown command', () => {
    let error: Error | null = null;
    try {
      execSync(`node ${CLI_PATH} unknown-command`, { encoding: 'utf-8' });
    } catch (e) {
      error = e as Error;
    }
    expect(error).not.toBeNull();
    expect((error as Error).toString()).toContain('unknown command');
  });

  it('scan command validates required args', () => {
    let error: Error | null = null;
    try {
      execSync(`node ${CLI_PATH} scan`, { encoding: 'utf-8' });
    } catch (e) {
      error = e as Error;
    }
    expect(error).not.toBeNull();
  });

  it('analyze command validates required args', () => {
    let error: Error | null = null;
    try {
      execSync(`node ${CLI_PATH} analyze`, { encoding: 'utf-8' });
    } catch (e) {
      error = e as Error;
    }
    expect(error).not.toBeNull();
  });

  it('scan command works on demo fixture', () => {
    // Ensure temp directory exists
    if (!existsSync(TEMP_DIR)) {
      mkdirSync(TEMP_DIR, { recursive: true });
    }

    const outDir = join(TEMP_DIR, 'scan-output');
    const repoPath = join(FIXTURES_DIR, 'demo-ci-imports');

    // Clean up any previous output
    if (existsSync(outDir)) {
      rmSync(outDir, { recursive: true, force: true });
    }

    const result = execSync(
      `node ${CLI_PATH} scan ${repoPath} --out ${outDir}`,
      { encoding: 'utf-8', timeout: 30000 }
    );

    // Should complete without error
    expect(result).toBeDefined();
  });
});