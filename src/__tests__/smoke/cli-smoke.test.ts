/**
 * CLI Smoke Tests
 *
 * Quick validation that CLI commands work at a basic level.
 * Total execution time should be under 5 seconds.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT } from '../../cli/exit-codes.js';

const CLI_PATH = './dist/cli.js';
const FIXTURES_DIR = './fixtures';
const TEMP_DIR = './.test-temp/smoke-cli';

describe('CLI Smoke Tests', () => {
  it('--help works and shows available commands', () => {
    const result = execSync(`node ${CLI_PATH} --help`).toString();
    for (const command of [
      'scan',
      'analyze',
      'diff',
      'import',
      'readiness',
      'export',
      'viewer',
      'historical',
      'spec-drift',
      'rule new',
      'pack',
      'doctor',
      'test-plan',
      'ownership',
      'query',
      'explain-gate',
      'qeos matrix',
      'pr-review',
      'pr-review-publish',
      'release-pack',
      'plugin-marketplace',
      'llm-health',
      'evidence',
      'plugin-sandbox',
      'assurance inspect',
    ]) {
      expect(result).toContain(command);
    }
  });

  it('cli reference lists every command shown in --help', () => {
    const help = execSync(`node ${CLI_PATH} --help`).toString();
    const docs = readFileSync('./docs/cli-reference.md', 'utf-8');
    const commandUsages = [
      'schema validate',
      'scan',
      'analyze',
      'diff',
      'import',
      'readiness',
      'export',
      'viewer',
      'historical',
      'spec-drift',
      'rule new',
      'pack',
      'doctor',
      'test-plan',
      'ownership',
      'query',
      'explain-gate',
      'qeos matrix',
      'pr-review',
      'pr-review-publish',
      'release-pack',
      'plugin-marketplace',
      'llm-health',
      'evidence',
      'plugin-sandbox',
      'assurance inspect',
    ];

    for (const usage of commandUsages) {
      expect(help).toContain(`code-to-gate ${usage}`);
      const anchorText = usage.split(' ')[0];
      expect(docs).toContain(`### ${anchorText}`);
    }
  });

  it('cli reference documents every implemented exit code', () => {
    const docs = readFileSync('./docs/cli-reference.md', 'utf-8');

    for (const code of Object.values(EXIT)) {
      expect(docs).toContain(`| ${code} |`);
    }
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

  it('viewer command generates valid HTML from findings', () => {
    // Ensure temp directory exists
    if (!existsSync(TEMP_DIR)) {
      mkdirSync(TEMP_DIR, { recursive: true });
    }

    const analyzeDir = join(TEMP_DIR, 'viewer-analyze');
    const repoPath = join(FIXTURES_DIR, 'demo-shop-ts');
    const htmlOut = join(TEMP_DIR, 'viewer-report.html');

    // Clean up previous output
    if (existsSync(analyzeDir)) {
      rmSync(analyzeDir, { recursive: true, force: true });
    }
    if (existsSync(htmlOut)) {
      rmSync(htmlOut, { force: true });
    }

    // Generate findings artifact
    execSync(
      `node ${CLI_PATH} analyze ${repoPath} --emit all --out ${analyzeDir} --llm-mode local-only`,
      { encoding: 'utf-8', timeout: 60000 }
    );

    writeFileSync(join(analyzeDir, 'qeg-code-to-gate.json'), JSON.stringify({
      version: 'ctg.qeg-input/v1',
      producer: 'code-to-gate',
      run_id: 'viewer-smoke-qeg',
      artifact_dir: analyzeDir,
      findings_summary: {
        total: 1,
        by_severity: { high: 1 },
        by_category: { auth: 1 },
        by_rule: { WEAK_AUTH_GUARD: 1 },
      },
      readiness_status: 'needs_review',
      schema_compliance: [{ artifact: 'findings.json', status: 'ok' }],
      quality_checks_actual: [{ name: 'smoke', status: 'pass', details: 'smoke qeg evidence' }],
      artifact_hashes: [{
        artifact: 'findings',
        path: join(analyzeDir, 'findings.json'),
        hash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }],
    }, null, 2));
    writeFileSync(join(analyzeDir, 'evidence-dag.json'), JSON.stringify({
      version: 'ctg/v1',
      generated_at: '2026-07-05T00:00:00Z',
      run_id: 'viewer-smoke-qeg',
      repo: { root: repoPath },
      tool: { name: 'code-to-gate', version: '1.5.0', plugin_versions: [] },
      artifact: 'evidence-dag',
      schema: 'evidence-dag@v1',
      completeness: 'complete',
      nodes: [
        { id: 'finding:smoke-finding', type: 'finding', label: 'Smoke finding' },
        { id: 'manual-test:risk-smoke-finding', type: 'manual-test', label: 'Smoke manual test' },
      ],
      edges: [{
        id: 'finding:smoke-finding|requires_manual_oracle|manual-test:risk-smoke-finding',
        source: 'finding:smoke-finding',
        target: 'manual-test:risk-smoke-finding',
        type: 'requires_manual_oracle',
      }],
      summary: { nodeCount: 2, edgeCount: 1, findings: 1, artifacts: 0, verdicts: 0 },
    }, null, 2));

    // Generate HTML report
    execSync(
      `node ${CLI_PATH} viewer --from ${analyzeDir} --out ${htmlOut}`,
      { encoding: 'utf-8', timeout: 30000 }
    );

    // Verify HTML output
    expect(existsSync(htmlOut)).toBe(true);
    const htmlContent = readFileSync(htmlOut, 'utf-8');
    expect(htmlContent).toContain('<!DOCTYPE html>');
    expect(htmlContent).toContain('<html');
    expect(htmlContent).toContain('code-to-gate');
    expect(htmlContent).toContain('QEG Evidence');
    expect(htmlContent).toContain('Smoke manual test');
  });
});
