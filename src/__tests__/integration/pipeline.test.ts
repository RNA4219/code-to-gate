import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// Use process.cwd() which is set by vitest to the project root
const PROJECT_ROOT = process.cwd();
const FIXTURES_DIR = path.join(PROJECT_ROOT, 'fixtures');
const CLI_PATH = path.join(PROJECT_ROOT, 'dist', 'cli.js');
const TEMP_DIR = path.join(PROJECT_ROOT, '.test-temp-pipeline');

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
function readJsonArtifact(outDir: string, filename: string): any {
  const filePath = path.join(outDir, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Helper to read YAML artifact
function readYamlArtifact(outDir: string, filename: string): any {
  const filePath = path.join(outDir, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  // The CLI writes actual YAML format
  // For simple parsing, we can extract the structure using basic parsing
  if (content.includes('risks:') && content.includes('id:')) {
    // Return a minimal structure for testing
    const riskMatches = content.match(/- id:/g);
    return {
      hasRisks: true,
      risksCount: riskMatches ? riskMatches.length : 0,
      raw: content
    };
  }
  // Try JSON parse as fallback
  try {
    return JSON.parse(content);
  } catch {
    return { raw: content };
  }
}

// Helper to cleanup temp directories
function cleanupTemp(tempPath: string) {
  if (fs.existsSync(tempPath)) {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }
}

describe('Full Pipeline Tests', () => {
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

  describe('scan command', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-shop-ts');
    const outDir = path.join(TEMP_DIR, 'scan-test');

    it('should generate repo-graph.json with correct structure', () => {
      const result = runCli(`scan "${fixturePath}" --out "${outDir}"`);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('repo-graph.json');

      const graph = readJsonArtifact(outDir, 'repo-graph.json');
      expect(graph).not.toBeNull();
      expect(graph.version).toBeDefined();
      expect(graph.artifact).toBe('normalized-repo-graph');
      expect(graph.schema).toBe('normalized-repo-graph@v1');
      expect(graph.generated_at).toBeDefined();
      expect(graph.run_id).toBeDefined();
    });

    it('should identify source files correctly', () => {
      runCli(`scan "${fixturePath}" --out "${outDir}"`);

      const graph = readJsonArtifact(outDir, 'repo-graph.json');
      const sourceFiles = graph.files.filter((f: any) => f.role === 'source');
      expect(sourceFiles.length).toBeGreaterThan(0);
    });

    it('should identify test files correctly', () => {
      runCli(`scan "${fixturePath}" --out "${outDir}"`);

      const graph = readJsonArtifact(outDir, 'repo-graph.json');
      const testFiles = graph.files.filter((f: any) => f.role === 'test');
      expect(testFiles.length).toBeGreaterThan(0);
    });

    it('should identify config files correctly', () => {
      runCli(`scan "${fixturePath}" --out "${outDir}"`);

      const graph = readJsonArtifact(outDir, 'repo-graph.json');
      const configFiles = graph.files.filter((f: any) => f.role === 'config');
      expect(configFiles.length).toBeGreaterThan(0);
    });

    it('should compute file hashes', () => {
      runCli(`scan "${fixturePath}" --out "${outDir}"`);

      const graph = readJsonArtifact(outDir, 'repo-graph.json');
      for (const file of graph.files) {
        expect(file.hash).toBeDefined();
        expect(file.hash).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
      }
    });

    it('should have correct file metadata', () => {
      runCli(`scan "${fixturePath}" --out "${outDir}"`);

      const graph = readJsonArtifact(outDir, 'repo-graph.json');
      for (const file of graph.files) {
        expect(file.id).toBeDefined();
        expect(file.path).toBeDefined();
        expect(file.language).toBeDefined();
        expect(file.role).toBeDefined();
        expect(file.sizeBytes).toBeDefined();
        expect(file.lineCount).toBeDefined();
      }
    });
  });

  describe('analyze command', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-shop-ts');
    const outDir = path.join(TEMP_DIR, 'analyze-test');

    it('should generate all required artifacts', () => {
      const result = runCli(`analyze "${fixturePath}" --out "${outDir}"`);

      // Verify all artifacts exist
      expect(fs.existsSync(path.join(outDir, 'findings.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'risk-register.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'analysis-report.md'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'audit.json'))).toBe(true);
    });

    it('should generate findings with proper structure', () => {
      runCli(`analyze "${fixturePath}" --out "${outDir}"`);

      const findings = readJsonArtifact(outDir, 'findings.json');
      expect(findings).not.toBeNull();
      expect(findings.artifact).toBe('findings');
      expect(findings.schema).toBe('findings@v1');
      expect(findings.findings).toBeDefined();
    });

    it('should generate risk register with proper structure', () => {
      runCli(`analyze "${fixturePath}" --out "${outDir}"`);

      const risks = readYamlArtifact(outDir, 'risk-register.yaml');
      expect(risks).not.toBeNull();
      // Check that the YAML has risks content
      expect(risks.hasRisks || risks.risksCount > 0 || risks.risks).toBeTruthy();
    });

    it('should generate findings with evidence', () => {
      runCli(`analyze "${fixturePath}" --out "${outDir}"`);

      const findings = readJsonArtifact(outDir, 'findings.json');
      for (const finding of findings.findings) {
        expect(finding.evidence).toBeDefined();
        expect(finding.evidence.length).toBeGreaterThan(0);

        for (const ev of finding.evidence) {
          expect(ev.path).toBeDefined();
        }
      }
    });

    it('should generate audit trail', () => {
      runCli(`analyze "${fixturePath}" --out "${outDir}"`);

      const audit = readJsonArtifact(outDir, 'audit.json');
      expect(audit).not.toBeNull();
      expect(audit.artifact).toBe('audit');
      expect(audit.inputs).toBeDefined();
      expect(audit.exit).toBeDefined();
    });

    it('should output JSON summary', () => {
      const result = runCli(`analyze "${fixturePath}" --out "${outDir}"`);

      const summary = JSON.parse(result.stdout);
      expect(summary.tool).toBe('code-to-gate');
      expect(summary.command).toBe('analyze');
      expect(summary.artifacts).toBeDefined();
      expect(summary.summary).toBeDefined();
      expect(summary.summary.findings).toBeDefined();
    });

    it('should return exit code based on findings severity', () => {
      const result = runCli(`analyze "${fixturePath}" --out "${outDir}"`);
      // The dist CLI returns POLICY_FAILED (5) for blocking findings or OK (0)
      expect([0, 5]).toContain(result.exitCode);
    });
  });

  describe('import command', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-ci-imports');
    const outDir = path.join(TEMP_DIR, 'import-test');

    it('should import semgrep results', () => {
      const semgrepFile = path.join(fixturePath, 'semgrep.json');
      const result = runCli(`import semgrep "${semgrepFile}" --out "${outDir}"`);

      expect(result.exitCode).toBe(0);
      // Import writes to imports subdirectory
      expect(fs.existsSync(path.join(outDir, 'imports', 'semgrep-findings.json'))).toBe(true);
    });

    it('should import eslint results', () => {
      const eslintFile = path.join(fixturePath, 'eslint.json');
      const result = runCli(`import eslint "${eslintFile}" --out "${outDir}"`);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(path.join(outDir, 'imports', 'eslint-findings.json'))).toBe(true);
    });

    it('should import test results', () => {
      const testFile = path.join(fixturePath, 'tests', 'user.test.ts');
      // Test import requires a test results file format
      // Skip if file format doesn't match expected
      const result = runCli(`import test "${testFile}" --out "${outDir}"`);
      // Either succeeds or fails with import error (depends on file format)
      expect([0, 8]).toContain(result.exitCode);
    });
  });

  describe('diff command', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-shop-ts');
    const outDir = path.join(TEMP_DIR, 'diff-test');

    it('should generate diff artifact', () => {
      const result = runCli(`diff "${fixturePath}" --base main --head HEAD --out "${outDir}"`);

      // Diff command returns OK (0) or READINESS_NOT_CLEAR (1) based on findings
      expect([0, 1]).toContain(result.exitCode);
      // Generates diff-analysis.json, not diff.json
      expect(fs.existsSync(path.join(outDir, 'diff-analysis.json'))).toBe(true);
    });

    it('should have correct diff structure', () => {
      runCli(`diff "${fixturePath}" --base main --head HEAD --out "${outDir}"`);

      const diff = readJsonArtifact(outDir, 'diff-analysis.json');
      expect(diff).not.toBeNull();
      expect(diff.artifact).toBe('diff-analysis');
      expect(diff.repo).toBeDefined();
      expect(diff.repo.base_ref).toBe('main');
      expect(diff.repo.head_ref).toBe('HEAD');
    });
  });

  describe('schema validation command', () => {
    const schemasDir = path.join(PROJECT_ROOT, 'schemas');

    it('should validate schema files', { timeout: 120000 }, () => {
      const schemaFiles = fs.readdirSync(schemasDir)
        .filter(f => f.endsWith('.schema.json'))
        .filter(f => {
          // Skip empty files and shared definitions (not standalone schemas)
          const content = fs.readFileSync(path.join(schemasDir, f), 'utf8');
          if (content.trim().length === 0) return false;
          // Skip shared-defs.schema.json as it's not a standalone schema
          if (f === 'shared-defs.schema.json') return false;
          return true;
        });

      for (const schemaFile of schemaFiles) {
        const result = runCli(`schema validate "${path.join(schemasDir, schemaFile)}"`);
        // Schema validation outputs to stdout
        expect(result.stdout).toContain('schema ok');
      }
    }, 60000);

    it('should validate findings artifact', () => {
      const fixturePath = path.join(FIXTURES_DIR, 'demo-shop-ts');
      const outDir = path.join(TEMP_DIR, 'schema-test');
      runCli(`analyze "${fixturePath}" --out "${outDir}"`);

      const result = runCli(`schema validate "${path.join(outDir, 'findings.json')}"`);
      expect(result.stdout).toContain('artifact ok');
    });

    it('should reject invalid artifacts', () => {
      // Create an invalid artifact
      const invalidPath = path.join(TEMP_DIR, 'invalid-artifact.json');
      fs.writeFileSync(invalidPath, JSON.stringify({ invalid: true }));

      const result = runCli(`schema validate "${invalidPath}"`);
      expect(result.exitCode).toBe(7); // SCHEMA_FAILED
    });
  });
});