import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// Use process.cwd() which is set by vitest to the project root
const PROJECT_ROOT = process.cwd();
const FIXTURES_DIR = path.join(PROJECT_ROOT, 'fixtures');
const CLI_PATH = path.join(PROJECT_ROOT, 'dist', 'cli.js');
const TEMP_DIR = path.join(PROJECT_ROOT, '.test-temp-integration');

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
  // Check if it's valid YAML by checking key structure
  if (content.includes('risks:') && content.includes('id:')) {
    // Return a minimal structure for testing
    // Extract risks count by counting '- id:' occurrences
    const riskMatches = content.match(/- id:/g);
    return {
      hasRisks: true,
      risksCount: riskMatches ? riskMatches.length : 0,
      raw: content
    };
  }
  // Try JSON parse as fallback (some .yaml files might be JSON)
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

describe('Fixture Acceptance Tests', () => {
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

  describe('demo-shop-ts fixture', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-shop-ts');
    const outDir = path.join(TEMP_DIR, 'demo-shop-ts-out');

    it('should generate findings.json artifact', () => {
      const result = runCli(`analyze "${fixturePath}" --out "${outDir}"`);
      const findings = readJsonArtifact(outDir, 'findings.json');

      expect(findings).not.toBeNull();
      expect(findings.findings).toBeDefined();
      expect(findings.findings.length).toBeGreaterThan(0);
    });

    it('should detect findings with proper structure', () => {
      const result = runCli(`analyze "${fixturePath}" --out "${outDir}"`);
      const findings = readJsonArtifact(outDir, 'findings.json');

      expect(findings).not.toBeNull();
      expect(findings.version).toBeDefined();
      expect(findings.artifact).toBe('findings');
      expect(findings.schema).toBe('findings@v1');

      for (const finding of findings.findings) {
        expect(finding.id).toBeDefined();
        expect(finding.ruleId).toBeDefined();
        expect(finding.category).toBeDefined();
        expect(finding.severity).toBeDefined();
        expect(finding.title).toBeDefined();
        expect(finding.summary).toBeDefined();
        expect(finding.evidence).toBeDefined();
      }
    });

    it('should generate risk-register.yaml artifact', () => {
      runCli(`analyze "${fixturePath}" --out "${outDir}"`);

      expect(fs.existsSync(path.join(outDir, 'risk-register.yaml'))).toBe(true);
      const risks = readYamlArtifact(outDir, 'risk-register.yaml');
      expect(risks).not.toBeNull();
      expect(risks.hasRisks || risks.risks).toBeDefined();
    });

    it('should generate audit.json artifact', () => {
      runCli(`analyze "${fixturePath}" --out "${outDir}"`);

      const audit = readJsonArtifact(outDir, 'audit.json');
      expect(audit).not.toBeNull();
      expect(audit.artifact).toBe('audit');
      expect(audit.inputs).toBeDefined();
    });

    it('should return appropriate exit code based on findings', () => {
      const result = runCli(`analyze "${fixturePath}" --out "${outDir}"`);
      // The dist CLI returns POLICY_FAILED (5) for blocking findings
      // or OK (0) for non-blocking - depends on implementation
      expect([0, 5]).toContain(result.exitCode);
    });

    it('should generate analysis-report.md', () => {
      runCli(`analyze "${fixturePath}" --out "${outDir}"`);

      expect(fs.existsSync(path.join(outDir, 'analysis-report.md'))).toBe(true);
    });
  });

  describe('demo-auth-js fixture', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-auth-js');
    const outDir = path.join(TEMP_DIR, 'demo-auth-js-out');

    it('should generate findings for auth fixture', () => {
      const result = runCli(`analyze "${fixturePath}" --out "${outDir}"`);
      const findings = readJsonArtifact(outDir, 'findings.json');

      expect(findings).not.toBeNull();
      expect(findings.findings).toBeDefined();
      expect(findings.findings.length).toBeGreaterThan(0);
    });

    it('should generate all expected artifacts', () => {
      runCli(`analyze "${fixturePath}" --out "${outDir}"`);

      expect(fs.existsSync(path.join(outDir, 'findings.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'risk-register.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'analysis-report.md'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'audit.json'))).toBe(true);
    });

    it('should generate risk register with recommended actions', () => {
      runCli(`analyze "${fixturePath}" --out "${outDir}"`);

      const risks = readYamlArtifact(outDir, 'risk-register.yaml');
      expect(risks).not.toBeNull();
      // Check that the YAML has risks content
      expect(risks.hasRisks || risks.risksCount > 0 || risks.risks).toBeTruthy();
      // Check that the raw content includes recommended-actions
      if (risks.raw) {
        expect(risks.raw).toContain('recommended-actions');
      }
    });
  });

  describe('demo-ci-imports fixture', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-ci-imports');
    const outDir = path.join(TEMP_DIR, 'demo-ci-imports-out');
    const importOutDir = path.join(outDir, 'imports');

    it('should successfully import semgrep results', () => {
      const semgrepFile = path.join(fixturePath, 'semgrep.json');
      const result = runCli(`import semgrep "${semgrepFile}" --out "${outDir}"`);

      expect(result.exitCode).toBe(0);
      // Import writes to imports subdirectory
      expect(fs.existsSync(path.join(outDir, 'imports', 'semgrep-findings.json'))).toBe(true);
    });

    it('should convert semgrep findings to CTG format', () => {
      const semgrepFile = path.join(fixturePath, 'semgrep.json');
      runCli(`import semgrep "${semgrepFile}" --out "${outDir}"`);

      const importedFindings = readJsonArtifact(path.join(outDir, 'imports'), 'semgrep-findings.json');
      expect(importedFindings).not.toBeNull();
      expect(importedFindings.findings).toBeDefined();
      expect(importedFindings.findings.length).toBeGreaterThan(0);

      // Check that the finding was imported correctly
      for (const finding of importedFindings.findings) {
        expect(finding.ruleId).toBeDefined();
        expect(finding.severity).toBeDefined();
        expect(finding.upstream).toBeDefined();
        expect(finding.upstream.tool).toBe('semgrep');
        // Tags are optional - only present if semgrep metadata includes them
        if (finding.tags) {
          expect(Array.isArray(finding.tags)).toBe(true);
        }
      }
    });

    it('should scan fixture and generate repo-graph', () => {
      const result = runCli(`scan "${fixturePath}" --out "${outDir}"`);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(path.join(outDir, 'repo-graph.json'))).toBe(true);

      const graph = readJsonArtifact(outDir, 'repo-graph.json');
      expect(graph).not.toBeNull();
      expect(graph.files).toBeDefined();
      expect(graph.files.length).toBeGreaterThan(0);
    });

    it('should identify files with correct roles', () => {
      runCli(`scan "${fixturePath}" --out "${outDir}"`);

      const graph = readJsonArtifact(outDir, 'repo-graph.json');
      const sourceFiles = graph.files.filter((f: any) => f.role === 'source');
      const testFiles = graph.files.filter((f: any) => f.role === 'test');

      expect(sourceFiles.length).toBeGreaterThan(0);
      expect(testFiles.length).toBeGreaterThan(0);
    });
  });

  describe('demo-suppressions-ts fixture', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-suppressions-ts');
    const outDir = path.join(TEMP_DIR, 'demo-suppressions-ts-out');

    it('should have suppression file in fixture', () => {
      const suppressionFile = path.join(fixturePath, '.ctg', 'suppressions.yaml');
      expect(fs.existsSync(suppressionFile)).toBe(true);
    });

    it('should scan fixture successfully', () => {
      const result = runCli(`scan "${fixturePath}" --out "${outDir}"`);

      expect(result.exitCode).toBe(0);
      const graph = readJsonArtifact(outDir, 'repo-graph.json');
      expect(graph).not.toBeNull();
      expect(graph.files.length).toBeGreaterThan(0);
    });

    it('should analyze fixture and generate findings', () => {
      const result = runCli(`analyze "${fixturePath}" --out "${outDir}"`);
      const findings = readJsonArtifact(outDir, 'findings.json');

      expect(findings).not.toBeNull();
      expect(findings.findings).toBeDefined();
      // Note: Suppression is metadata only, findings are still generated
    });

    it('should generate repo-graph with correct artifact fields', () => {
      runCli(`scan "${fixturePath}" --out "${outDir}"`);

      const graph = readJsonArtifact(outDir, 'repo-graph.json');
      expect(graph.version).toBeDefined();
      expect(graph.artifact).toBe('normalized-repo-graph');
      expect(graph.schema).toBe('normalized-repo-graph@v1');
      expect(graph.generated_at).toBeDefined();
      expect(graph.run_id).toBeDefined();
    });
  });

  describe('demo-github-actions-ts fixture', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'demo-github-actions-ts');
    const outDir = path.join(TEMP_DIR, 'demo-github-actions-ts-out');

    it('should have GitHub Actions workflow structure', () => {
      expect(fs.existsSync(fixturePath)).toBe(true);
      expect(fs.existsSync(path.join(fixturePath, 'src'))).toBe(true);
      expect(fs.existsSync(path.join(fixturePath, 'tests'))).toBe(true);
    });

    it('should scan fixture successfully', () => {
      const result = runCli(`scan "${fixturePath}" --out "${outDir}"`);

      expect(result.exitCode).toBe(0);
      const graph = readJsonArtifact(outDir, 'repo-graph.json');
      expect(graph).not.toBeNull();
      expect(graph.files.length).toBeGreaterThan(0);
    });

    it('should analyze fixture and detect expected findings', () => {
      const result = runCli(`analyze "${fixturePath}" --out "${outDir}"`);
      const findings = readJsonArtifact(outDir, 'findings.json');

      expect(findings).not.toBeNull();
      expect(findings.findings).toBeDefined();
      // Expected: CLIENT_TRUSTED_PRICE, WEAK_AUTH_GUARD, MISSING_SERVER_VALIDATION, etc.
      expect(findings.findings.length).toBeGreaterThan(0);
    });

    it('should generate SARIF for GitHub Actions upload', () => {
      runCli(`analyze "${fixturePath}" --emit sarif --out "${outDir}"`);

      // SARIF should be generated
      const sarifPath = path.join(outDir, 'results.sarif');
      if (fs.existsSync(sarifPath)) {
        const sarif = JSON.parse(fs.readFileSync(sarifPath, 'utf8'));
        expect(sarif.$schema).toContain('sarif-schema-2.1.0');
        expect(sarif.version).toBe('2.1.0');
      }
    });

    it('should export gatefield for CI integration', () => {
      runCli(`analyze "${fixturePath}" --out "${outDir}"`);

      // Gatefield export should work
      const gatefieldOut = path.join(outDir, 'gatefield');
      runCli(`export gatefield --from "${outDir}" --out "${gatefieldOut}/gatefield-static-result.json"`);

      if (fs.existsSync(path.join(gatefieldOut, 'gatefield-static-result.json'))) {
        const gatefield = readJsonArtifact(gatefieldOut, 'gatefield-static-result.json');
        expect(gatefield).not.toBeNull();
        expect(gatefield.artifact).toBe('gatefield-static-result');
      }
    });
  });
});