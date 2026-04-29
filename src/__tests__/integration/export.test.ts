import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// Use process.cwd() which is set by vitest to the project root
const PROJECT_ROOT = process.cwd();
const FIXTURES_DIR = path.join(PROJECT_ROOT, 'fixtures');
const CLI_PATH = path.join(PROJECT_ROOT, 'dist', 'cli.js');
const TEMP_DIR = path.join(PROJECT_ROOT, '.test-temp-export');

// Helper to run CLI commands
function runCli(args: string, cwd: string = PROJECT_ROOT): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node "${CLI_PATH}" ${args}`, {
      cwd,
      encoding: 'utf8',
      timeout: 60000,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      exitCode: error.status ?? 1,
    };
  }
}

// Helper to read JSON artifact
function readArtifact(filePath: string): any {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Helper to cleanup temp directories
function cleanupTemp(tempPath: string) {
  if (fs.existsSync(tempPath)) {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }
}

describe('Export Pipeline Tests', () => {
  beforeAll(() => {
    // Ensure CLI is built - skip build if already exists
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(`CLI not found at ${CLI_PATH}. Run 'npm run build' first.`);
    }
    // Create temp directory
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    cleanupTemp(TEMP_DIR);
  });

  describe('gatefield export', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-shop-ts');
    const analyzeOutDir = path.join(TEMP_DIR, 'gatefield-source');
    const exportOutFile = path.join(TEMP_DIR, 'gatefield-output.json');

    beforeAll(() => {
      // Run analyze first to generate source artifacts
      runCli(`analyze "${fixturePath}" --out "${analyzeOutDir}"`);
    });

    it('should generate gatefield-static-result artifact', () => {
      const result = runCli(`export gatefield --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(exportOutFile)).toBe(true);
    });

    it('should have correct version', () => {
      runCli(`export gatefield --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const gatefield = readArtifact(exportOutFile);
      expect(gatefield.version).toBe('ctg.gatefield/v1alpha1');
    });

    it('should have artifact identifier', () => {
      runCli(`export gatefield --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const gatefield = readArtifact(exportOutFile);
      expect(gatefield.artifact).toBe('gatefield-static-result');
      expect(gatefield.schema).toBe('gatefield-static-result@v1');
    });

    it('should include findings_summary', () => {
      runCli(`export gatefield --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const gatefield = readArtifact(exportOutFile);
      expect(gatefield.findings_summary).toBeDefined();
      expect(gatefield.findings_summary.total).toBeDefined();
      expect(gatefield.findings_summary.critical).toBeDefined();
      expect(gatefield.findings_summary.high).toBeDefined();
      expect(gatefield.findings_summary.medium).toBeDefined();
      expect(gatefield.findings_summary.low).toBeDefined();
    });

    it('should include status and summary', () => {
      runCli(`export gatefield --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const gatefield = readArtifact(exportOutFile);
      expect(gatefield.status).toBeDefined();
      expect(['passed', 'needs_review', 'blocked']).toContain(gatefield.status);
      expect(gatefield.summary).toBeDefined();
    });

    it('should include blocking_reasons for non-passed status', () => {
      runCli(`export gatefield --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const gatefield = readArtifact(exportOutFile);
      if (gatefield.status !== 'passed') {
        expect(gatefield.blocking_reasons).toBeDefined();
        expect(Array.isArray(gatefield.blocking_reasons)).toBe(true);
      }
    });

    it('should output JSON summary', () => {
      const result = runCli(`export gatefield --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const summary = JSON.parse(result.stdout);
      expect(summary.tool).toBe('code-to-gate');
      expect(summary.command).toBe('export');
      expect(summary.target).toBe('gatefield');
    });
  });

  describe('state-gate export', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-shop-ts');
    const analyzeOutDir = path.join(TEMP_DIR, 'state-gate-source');
    const exportOutFile = path.join(TEMP_DIR, 'state-gate-output.json');

    beforeAll(() => {
      runCli(`analyze "${fixturePath}" --out "${analyzeOutDir}"`);
    });

    it('should generate state-gate-evidence artifact', () => {
      const result = runCli(`export state-gate --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(exportOutFile)).toBe(true);
    });

    it('should have correct version', () => {
      runCli(`export state-gate --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const stateGate = readArtifact(exportOutFile);
      expect(stateGate.version).toBe('ctg.state-gate/v1alpha1');
    });

    it('should have artifact identifier', () => {
      runCli(`export state-gate --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const stateGate = readArtifact(exportOutFile);
      expect(stateGate.artifact).toBe('state-gate-evidence');
      expect(stateGate.schema).toBe('state-gate-evidence@v1');
    });

    it('should include evidence_type', () => {
      runCli(`export state-gate --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const stateGate = readArtifact(exportOutFile);
      expect(stateGate.evidence_type).toBeDefined();
    });

    it('should include evidence_data', () => {
      runCli(`export state-gate --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const stateGate = readArtifact(exportOutFile);
      expect(stateGate.evidence_data).toBeDefined();
      expect(stateGate.evidence_data.findings_count).toBeDefined();
      expect(stateGate.evidence_data.readiness_status).toBeDefined();
    });

    it('should include confidence_score', () => {
      runCli(`export state-gate --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const stateGate = readArtifact(exportOutFile);
      expect(stateGate.confidence_score).toBeDefined();
      expect(stateGate.confidence_score).toBeGreaterThanOrEqual(0);
      expect(stateGate.confidence_score).toBeLessThanOrEqual(1);
    });

    it('should include attestations', () => {
      runCli(`export state-gate --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const stateGate = readArtifact(exportOutFile);
      expect(stateGate.attestations).toBeDefined();
      expect(Array.isArray(stateGate.attestations)).toBe(true);
    });
  });

  describe('manual-bb export', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-shop-ts');
    const analyzeOutDir = path.join(TEMP_DIR, 'manual-bb-source');
    const exportOutFile = path.join(TEMP_DIR, 'manual-bb-output.json');

    beforeAll(() => {
      runCli(`analyze "${fixturePath}" --out "${analyzeOutDir}"`);
    });

    it('should generate manual-bb-seed artifact', () => {
      const result = runCli(`export manual-bb --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(exportOutFile)).toBe(true);
    });

    it('should have correct version', () => {
      runCli(`export manual-bb --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const manualBb = readArtifact(exportOutFile);
      expect(manualBb.version).toBe('ctg.manual-bb/v1alpha1');
    });

    it('should have artifact identifier', () => {
      runCli(`export manual-bb --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const manualBb = readArtifact(exportOutFile);
      expect(manualBb.artifact).toBe('manual-bb-seed');
      expect(manualBb.schema).toBe('manual-bb-seed@v1');
    });

    it('should include test_cases', () => {
      runCli(`export manual-bb --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const manualBb = readArtifact(exportOutFile);
      expect(manualBb.test_cases).toBeDefined();
      expect(Array.isArray(manualBb.test_cases)).toBe(true);

      if (manualBb.test_cases.length > 0) {
        for (const testCase of manualBb.test_cases) {
          expect(testCase.id).toBeDefined();
          expect(testCase.title).toBeDefined();
          expect(testCase.category).toBeDefined();
          expect(testCase.steps).toBeDefined();
          expect(testCase.expected_result).toBeDefined();
          expect(testCase.priority).toBeDefined();
        }
      }
    });
  });

  describe('workflow-evidence export', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-shop-ts');
    const analyzeOutDir = path.join(TEMP_DIR, 'workflow-source');
    const exportOutFile = path.join(TEMP_DIR, 'workflow-output.json');

    beforeAll(() => {
      runCli(`analyze "${fixturePath}" --out "${analyzeOutDir}"`);
    });

    it('should generate workflow-evidence artifact', () => {
      const result = runCli(`export workflow-evidence --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(exportOutFile)).toBe(true);
    });

    it('should have correct version', () => {
      runCli(`export workflow-evidence --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const workflow = readArtifact(exportOutFile);
      expect(workflow.version).toBe('ctg.workflow-evidence/v1alpha1');
    });

    it('should have artifact identifier', () => {
      runCli(`export workflow-evidence --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const workflow = readArtifact(exportOutFile);
      expect(workflow.artifact).toBe('workflow-evidence');
      expect(workflow.schema).toBe('workflow-evidence@v1');
    });

    it('should include workflow metadata', () => {
      runCli(`export workflow-evidence --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const workflow = readArtifact(exportOutFile);
      expect(workflow.workflow_run_id).toBeDefined();
      expect(workflow.workflow_name).toBeDefined();
    });

    it('should include steps', () => {
      runCli(`export workflow-evidence --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const workflow = readArtifact(exportOutFile);
      expect(workflow.steps).toBeDefined();
      expect(Array.isArray(workflow.steps)).toBe(true);

      for (const step of workflow.steps) {
        expect(step.name).toBeDefined();
        expect(step.status).toBeDefined();
        expect(['success', 'failure', 'skipped']).toContain(step.status);
        expect(step.duration_ms).toBeDefined();
      }
    });

    it('should include overall_status', () => {
      runCli(`export workflow-evidence --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const workflow = readArtifact(exportOutFile);
      expect(workflow.overall_status).toBeDefined();
      expect(['success', 'failure']).toContain(workflow.overall_status);
    });

    it('should include evidence_refs', () => {
      runCli(`export workflow-evidence --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const workflow = readArtifact(exportOutFile);
      expect(workflow.evidence_refs).toBeDefined();
      expect(Array.isArray(workflow.evidence_refs)).toBe(true);
    });
  });

  describe('sarif export', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-shop-ts');
    const analyzeOutDir = path.join(TEMP_DIR, 'sarif-source');
    const exportOutFile = path.join(TEMP_DIR, 'results.sarif.json');

    beforeAll(() => {
      runCli(`analyze "${fixturePath}" --out "${analyzeOutDir}"`);
    });

    it('should generate SARIF artifact', () => {
      const result = runCli(`export sarif --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(exportOutFile)).toBe(true);
    });

    it('should have correct SARIF version', () => {
      runCli(`export sarif --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const sarif = readArtifact(exportOutFile);
      expect(sarif.version).toBe('2.1.0');
      expect(sarif.$schema).toBeDefined();
      expect(sarif.$schema).toContain('sarif');
    });

    it('should include runs with tool driver', () => {
      runCli(`export sarif --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const sarif = readArtifact(exportOutFile);
      expect(sarif.runs).toBeDefined();
      expect(Array.isArray(sarif.runs)).toBe(true);
      expect(sarif.runs.length).toBeGreaterThan(0);

      const run = sarif.runs[0];
      expect(run.tool).toBeDefined();
      expect(run.tool.driver).toBeDefined();
      expect(run.tool.driver.name).toBe('code-to-gate');
    });

    it('should include results', () => {
      runCli(`export sarif --from "${analyzeOutDir}" --out "${exportOutFile}"`);

      const sarif = readArtifact(exportOutFile);
      expect(sarif.runs[0].results).toBeDefined();
      expect(Array.isArray(sarif.runs[0].results)).toBe(true);

      if (sarif.runs[0].results.length > 0) {
        for (const result of sarif.runs[0].results) {
          expect(result.ruleId).toBeDefined();
          expect(result.level).toBeDefined();
          expect(result.message).toBeDefined();
          expect(result.locations).toBeDefined();
        }
      }
    });
  });

  describe('export error handling', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-shop-ts');
    const analyzeOutDir = path.join(TEMP_DIR, 'error-test-source');

    beforeAll(() => {
      runCli(`analyze "${fixturePath}" --out "${analyzeOutDir}"`);
    });

    it('should fail for unknown export target', () => {
      const outFile = path.join(TEMP_DIR, 'unknown-export.json');
      const result = runCli(`export unknown-target --from "${analyzeOutDir}" --out "${outFile}"`);
      expect(result.exitCode).toBe(2); // USAGE_ERROR
      expect(result.stderr).toContain('unsupported target');
    });

    it('should fail when missing --from argument', () => {
      const outFile = path.join(TEMP_DIR, 'missing-from.json');
      const result = runCli(`export gatefield --out "${outFile}"`);
      expect(result.exitCode).toBe(2); // USAGE_ERROR
      expect(result.stderr).toContain('usage:');
    });

    it('should fail when --from directory does not exist', () => {
      const outFile = path.join(TEMP_DIR, 'missing-dir.json');
      const result = runCli(`export gatefield --from "${path.join(TEMP_DIR, 'nonexistent')}" --out "${outFile}"`);
      expect(result.exitCode).toBe(2); // USAGE_ERROR
      expect(result.stderr).toContain('not found');
    });

    it('should fail when findings.json is missing', () => {
      const emptyDir = path.join(TEMP_DIR, 'empty-dir');
      fs.mkdirSync(emptyDir, { recursive: true });
      const outFile = path.join(TEMP_DIR, 'missing-findings.json');

      const result = runCli(`export gatefield --from "${emptyDir}" --out "${outFile}"`);
      expect(result.exitCode).toBe(2); // USAGE_ERROR
      expect(result.stderr).toContain('core artifact not found');
    });
  });
});