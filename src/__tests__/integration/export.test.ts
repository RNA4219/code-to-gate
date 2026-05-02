import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const PROJECT_ROOT = process.cwd();
const FIXTURES_DIR = path.join(PROJECT_ROOT, 'fixtures');
const CLI_PATH = path.join(PROJECT_ROOT, 'dist', 'cli.js');
const TEMP_DIR = path.join(PROJECT_ROOT, '.test-temp-export');

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

function readArtifact(filePath: string): any {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function cleanupTemp(tempPath: string) {
  if (fs.existsSync(tempPath)) {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }
}

describe('Export Pipeline Tests', () => {
  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(`CLI not found at ${CLI_PATH}. Run 'npm run build' first.`);
    }
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    cleanupTemp(TEMP_DIR);
  });

  // === V1 Schema Tests (P0-02/P0-03) ===

  describe('gatefield v1 export', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-shop-ts');
    const analyzeOutDir = path.join(TEMP_DIR, 'gatefield-v1-source');
    const exportOutFile = path.join(TEMP_DIR, 'gatefield-v1-output.json');

    beforeAll(() => {
      runCli(`analyze "${fixturePath}" --out "${analyzeOutDir}"`);
    });

    it('should generate gatefield v1 artifact', () => {
      const result = runCli(`export gatefield --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(exportOutFile)).toBe(true);
    });

    it('should have correct v1 version and producer', () => {
      runCli(`export gatefield --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const gatefield = readArtifact(exportOutFile);
      expect(gatefield.version).toBe('ctg.gatefield/v1');
      expect(gatefield.producer).toBe('code-to-gate');
    });

    it('should have artifact_hash', () => {
      runCli(`export gatefield --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const gatefield = readArtifact(exportOutFile);
      expect(gatefield.artifact_hash).toBeDefined();
      expect(gatefield.artifact_hash).toMatch(/^sha256:/);
    });

    it('should have signals array', () => {
      runCli(`export gatefield --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const gatefield = readArtifact(exportOutFile);
      expect(gatefield.signals).toBeDefined();
      expect(Array.isArray(gatefield.signals)).toBe(true);
      if (gatefield.signals.length > 0) {
        for (const signal of gatefield.signals) {
          expect(signal.id).toBeDefined();
          expect(signal.kind).toBeDefined();
          expect(['sast', 'secret', 'quality', 'test_gap', 'release_risk']).toContain(signal.kind);
          expect(signal.severity).toBeDefined();
          expect(signal.confidence).toBeDefined();
          expect(signal.finding_id).toBeDefined();
          expect(Array.isArray(signal.evidence)).toBe(true);
        }
      }
    });

    it('should have non_binding_gate_hint', () => {
      runCli(`export gatefield --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const gatefield = readArtifact(exportOutFile);
      expect(gatefield.non_binding_gate_hint).toBeDefined();
      expect(['pass', 'hold', 'block']).toContain(gatefield.non_binding_gate_hint);
    });

    it('should have valid status', () => {
      runCli(`export gatefield --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const gatefield = readArtifact(exportOutFile);
      expect(['passed', 'warning', 'blocked_input', 'failed']).toContain(gatefield.status);
    });
  });

  describe('state-gate v1 export', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-shop-ts');
    const analyzeOutDir = path.join(TEMP_DIR, 'state-gate-v1-source');
    const exportOutFile = path.join(TEMP_DIR, 'state-gate-v1-output.json');

    beforeAll(() => {
      runCli(`analyze "${fixturePath}" --out "${analyzeOutDir}"`);
    });

    it('should generate state-gate v1 artifact', () => {
      const result = runCli(`export state-gate --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(exportOutFile)).toBe(true);
    });

    it('should have correct v1 version and producer', () => {
      runCli(`export state-gate --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const stateGate = readArtifact(exportOutFile);
      expect(stateGate.version).toBe('ctg.state-gate/v1');
      expect(stateGate.producer).toBe('code-to-gate');
    });

    it('should have artifact_hash', () => {
      runCli(`export state-gate --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const stateGate = readArtifact(exportOutFile);
      expect(stateGate.artifact_hash).toBeDefined();
      expect(stateGate.artifact_hash).toMatch(/^sha256:/);
    });

    it('should have release_readiness object', () => {
      runCli(`export state-gate --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const stateGate = readArtifact(exportOutFile);
      expect(stateGate.release_readiness).toBeDefined();
      expect(stateGate.release_readiness.status).toBeDefined();
      expect(['passed', 'passed_with_risk', 'needs_review', 'blocked_input', 'failed']).toContain(stateGate.release_readiness.status);
      expect(stateGate.release_readiness.summary).toBeDefined();
      expect(Array.isArray(stateGate.release_readiness.failed_conditions)).toBe(true);
    });

    it('should have evidence_refs array', () => {
      runCli(`export state-gate --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const stateGate = readArtifact(exportOutFile);
      expect(stateGate.evidence_refs).toBeDefined();
      expect(Array.isArray(stateGate.evidence_refs)).toBe(true);
      for (const ref of stateGate.evidence_refs) {
        expect(ref.artifact).toBeDefined();
        expect(ref.path).toBeDefined();
        expect(ref.hash).toBeDefined();
      }
    });

    it('should have approval_relevance', () => {
      runCli(`export state-gate --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const stateGate = readArtifact(exportOutFile);
      expect(stateGate.approval_relevance).toBeDefined();
      expect(stateGate.approval_relevance.requires_human_attention).toBeDefined();
      expect(Array.isArray(stateGate.approval_relevance.reasons)).toBe(true);
    });
  });

  describe('manual-bb v1 export', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-shop-ts');
    const analyzeOutDir = path.join(TEMP_DIR, 'manual-bb-v1-source');
    const exportOutFile = path.join(TEMP_DIR, 'manual-bb-v1-output.json');

    beforeAll(() => {
      runCli(`analyze "${fixturePath}" --out "${analyzeOutDir}"`);
    });

    it('should generate manual-bb v1 artifact', () => {
      const result = runCli(`export manual-bb --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(exportOutFile)).toBe(true);
    });

    it('should have correct v1 version and producer', () => {
      runCli(`export manual-bb --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const manualBb = readArtifact(exportOutFile);
      expect(manualBb.version).toBe('ctg.manual-bb/v1');
      expect(manualBb.producer).toBe('code-to-gate');
    });

    it('should have scope object', () => {
      runCli(`export manual-bb --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const manualBb = readArtifact(exportOutFile);
      expect(manualBb.scope).toBeDefined();
      expect(manualBb.scope.repo).toBeDefined();
      expect(Array.isArray(manualBb.scope.changed_files)).toBe(true);
      expect(Array.isArray(manualBb.scope.affected_entrypoints)).toBe(true);
    });

    it('should have risk_seeds array', () => {
      runCli(`export manual-bb --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const manualBb = readArtifact(exportOutFile);
      expect(manualBb.risk_seeds).toBeDefined();
      expect(Array.isArray(manualBb.risk_seeds)).toBe(true);
      if (manualBb.risk_seeds.length > 0) {
        for (const seed of manualBb.risk_seeds) {
          expect(seed.id).toBeDefined();
          expect(seed.title).toBeDefined();
          expect(seed.severity).toBeDefined();
          expect(Array.isArray(seed.evidence)).toBe(true);
          expect(Array.isArray(seed.suggested_test_intents)).toBe(true);
        }
      }
    });

    it('should have invariant_seeds array', () => {
      runCli(`export manual-bb --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const manualBb = readArtifact(exportOutFile);
      expect(manualBb.invariant_seeds).toBeDefined();
      expect(Array.isArray(manualBb.invariant_seeds)).toBe(true);
    });

    it('should have known_gaps array', () => {
      runCli(`export manual-bb --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const manualBb = readArtifact(exportOutFile);
      expect(manualBb.known_gaps).toBeDefined();
      expect(Array.isArray(manualBb.known_gaps)).toBe(true);
    });
  });

  describe('workflow-evidence v1 export', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-shop-ts');
    const analyzeOutDir = path.join(TEMP_DIR, 'workflow-v1-source');
    const exportOutFile = path.join(TEMP_DIR, 'workflow-v1-output.json');

    beforeAll(() => {
      runCli(`analyze "${fixturePath}" --out "${analyzeOutDir}"`);
    });

    it('should generate workflow v1 artifact', () => {
      const result = runCli(`export workflow-evidence --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(exportOutFile)).toBe(true);
    });

    it('should have correct v1 version and producer', () => {
      runCli(`export workflow-evidence --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const workflow = readArtifact(exportOutFile);
      expect(workflow.version).toBe('ctg.workflow-evidence/v1');
      expect(workflow.producer).toBe('code-to-gate');
    });

    it('should have evidence_type', () => {
      runCli(`export workflow-evidence --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const workflow = readArtifact(exportOutFile);
      expect(workflow.evidence_type).toBeDefined();
      expect(['release-readiness', 'pr-risk-scan', 'quality-scan']).toContain(workflow.evidence_type);
    });

    it('should have subject object', () => {
      runCli(`export workflow-evidence --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const workflow = readArtifact(exportOutFile);
      expect(workflow.subject).toBeDefined();
      expect(workflow.subject.repo).toBeDefined();
    });

    it('should have artifacts array', () => {
      runCli(`export workflow-evidence --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const workflow = readArtifact(exportOutFile);
      expect(workflow.artifacts).toBeDefined();
      expect(Array.isArray(workflow.artifacts)).toBe(true);
      for (const artifact of workflow.artifacts) {
        expect(artifact.name).toBeDefined();
        expect(artifact.path).toBeDefined();
        expect(artifact.hash).toBeDefined();
        expect(artifact.schema).toBeDefined();
      }
    });

    it('should have summary object', () => {
      runCli(`export workflow-evidence --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1`);
      const workflow = readArtifact(exportOutFile);
      expect(workflow.summary).toBeDefined();
      expect(workflow.summary.status).toBeDefined();
      expect(workflow.summary.critical_count).toBeDefined();
      expect(workflow.summary.high_count).toBeDefined();
      expect(workflow.summary.needs_review).toBeDefined();
    });
  });

  // === Legacy v1alpha1 Tests (backward compatibility) ===

  describe('gatefield v1alpha1 export (legacy)', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-shop-ts');
    const analyzeOutDir = path.join(TEMP_DIR, 'gatefield-legacy-source');
    const exportOutFile = path.join(TEMP_DIR, 'gatefield-legacy-output.json');

    beforeAll(() => {
      runCli(`analyze "${fixturePath}" --out "${analyzeOutDir}"`);
    });

    it('should generate gatefield-static-result artifact with v1alpha1', () => {
      const result = runCli(`export gatefield --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1alpha1`);
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(exportOutFile)).toBe(true);
    });

    it('should have correct v1alpha1 version', () => {
      runCli(`export gatefield --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1alpha1`);
      const gatefield = readArtifact(exportOutFile);
      expect(gatefield.version).toBe('ctg.gatefield/v1alpha1');
    });

    it('should include findings_summary', () => {
      runCli(`export gatefield --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1alpha1`);
      const gatefield = readArtifact(exportOutFile);
      expect(gatefield.findings_summary).toBeDefined();
      expect(gatefield.findings_summary.total).toBeDefined();
    });

    it('should show deprecation warning', () => {
      const result = runCli(`export gatefield --from "${analyzeOutDir}" --out "${exportOutFile}" --schema-version v1alpha1`);
      const summary = JSON.parse(result.stdout.split('\n').find(line => line.includes('warning')) || '{}');
      expect(summary.warning).toContain('deprecated');
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
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('unsupported target');
    });

    it('should fail when missing --from argument', () => {
      const outFile = path.join(TEMP_DIR, 'missing-from.json');
      const result = runCli(`export gatefield --out "${outFile}"`);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('usage:');
    });

    it('should fail when --from directory does not exist', () => {
      const outFile = path.join(TEMP_DIR, 'missing-dir.json');
      const result = runCli(`export gatefield --from "${path.join(TEMP_DIR, 'nonexistent')}" --out "${outFile}"`);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('not found');
    });

    it('should fail when findings.json is missing', () => {
      const emptyDir = path.join(TEMP_DIR, 'empty-dir');
      fs.mkdirSync(emptyDir, { recursive: true });
      const outFile = path.join(TEMP_DIR, 'missing-findings.json');
      const result = runCli(`export gatefield --from "${emptyDir}" --out "${outFile}"`);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('core artifact not found');
    });

    it('should fail for unsupported schema version', () => {
      const outFile = path.join(TEMP_DIR, 'bad-version.json');
      const result = runCli(`export gatefield --from "${analyzeOutDir}" --out "${outFile}" --schema-version v2`);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('unsupported schema version');
    });
  });
});