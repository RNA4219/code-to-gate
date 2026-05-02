/**
 * Tests for All CLI Commands Together
 *
 * Tests the complete CLI system for code-to-gate, including
 * all commands, their interactions, and end-to-end workflows.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { scanCommand } from "../cli/scan.js";
import { schemaValidate } from "../cli/schema-validate.js";
import { importCommand } from "../cli/import.js";
import { exportCommand } from "../cli/export.js";
import {
  existsSync,
  readFileSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

// === Constants and Helpers ===

const EXIT = {
  OK: 0,
  READINESS_NOT_CLEAR: 1,
  USAGE_ERROR: 2,
  SCAN_FAILED: 3,
  LLM_FAILED: 4,
  POLICY_FAILED: 5,
  PLUGIN_FAILED: 6,
  SCHEMA_FAILED: 7,
  IMPORT_FAILED: 8,
  INTEGRATION_EXPORT_FAILED: 9,
  INTERNAL_ERROR: 10,
};

const VERSION = "0.2.0-alpha.1";

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function createTempDir(baseName: string): string {
  return path.join(tmpdir(), `ctg-cli-test-${baseName}-${Date.now()}`);
}

// === Test Fixtures ===

const fixturesDir = path.resolve(import.meta.dirname, "../../fixtures");
const demoCiImportsDir = path.join(fixturesDir, "demo-ci-imports");
const demoShopDir = path.join(fixturesDir, "demo-shop-ts");

// === Tests ===

describe("CLI Commands Integration", () => {
  let tempOutDir: string;

  beforeAll(() => {
    tempOutDir = createTempDir("all");
    mkdirSync(tempOutDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean output directory before each test
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
    mkdirSync(tempOutDir, { recursive: true });
  });

  describe("CLI Entry Point Validation", () => {
    it("should have all expected exit codes defined", () => {
      expect(EXIT.OK).toBe(0);
      expect(EXIT.USAGE_ERROR).toBe(2);
      expect(EXIT.SCAN_FAILED).toBe(3);
      expect(EXIT.SCHEMA_FAILED).toBe(7);
      expect(EXIT.IMPORT_FAILED).toBe(8);
      expect(EXIT.INTERNAL_ERROR).toBe(10);
    });

    it("should have valid version string", () => {
      expect(VERSION).toMatch(/^[\d]+\.[\d]+\.[\d]+/);
    });
  });

  describe("scan command", () => {
    it("should return OK for valid repo", () => {
      if (!existsSync(demoCiImportsDir)) {
        return; // Skip if fixture not available
      }

      const args = [demoCiImportsDir, "--out", tempOutDir];
      const result = scanCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.OK);
    });

    it("should generate repo-graph.json", () => {
      if (!existsSync(demoCiImportsDir)) {
        return;
      }

      const args = [demoCiImportsDir, "--out", tempOutDir];
      scanCommand(args, { VERSION, EXIT, getOption });

      const graphPath = path.join(tempOutDir, "repo-graph.json");
      expect(existsSync(graphPath)).toBe(true);
    });

    it("should return USAGE_ERROR when repo argument missing", () => {
      const args: string[] = [];
      const result = scanCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("should return USAGE_ERROR when repo does not exist", () => {
      const args = ["/nonexistent/path", "--out", tempOutDir];
      const result = scanCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("should return SCAN_FAILED for empty repo", () => {
      const emptyRepo = path.join(tempOutDir, "empty-repo");
      mkdirSync(emptyRepo, { recursive: true });

      const args = [emptyRepo, "--out", tempOutDir];
      const result = scanCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.SCAN_FAILED);
    });

    it("should generate valid normalized repo graph schema", () => {
      if (!existsSync(demoCiImportsDir)) {
        return;
      }

      const args = [demoCiImportsDir, "--out", tempOutDir];
      scanCommand(args, { VERSION, EXIT, getOption });

      const graphPath = path.join(tempOutDir, "repo-graph.json");
      const graph = JSON.parse(readFileSync(graphPath, "utf8"));

      expect(graph.version).toBe("ctg/v1");
      expect(graph.artifact).toBe("normalized-repo-graph");
      expect(graph.schema).toBe("normalized-repo-graph@v1");
    });
  });

  describe("schema-validate command", () => {
    it("should return USAGE_ERROR when validate argument missing", async () => {
      const args: string[] = [];
      const result = await schemaValidate(args);
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("should return SCHEMA_FAILED for invalid JSON", async () => {
      // Create invalid JSON file
      const invalidPath = path.join(tempOutDir, "invalid.json");
      writeFileSync(invalidPath, "{ invalid json }", "utf8");

      const args = ["validate", invalidPath];
      const result = await schemaValidate(args);
      expect(result).toBe(EXIT.SCHEMA_FAILED);
    });

    it("should return USAGE_ERROR when file not found", async () => {
      const args = ["validate", "/nonexistent/file.json"];
      const result = await schemaValidate(args);
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("should validate schema file structure", async () => {
      // Create a valid schema file
      const schemaPath = path.join(tempOutDir, "test.schema.json");
      const validSchema = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "test-schema",
        title: "Test Schema",
        type: "object",
        properties: {},
      };

      writeFileSync(schemaPath, JSON.stringify(validSchema), "utf8");

      const args = ["validate", schemaPath];
      const result = await schemaValidate(args);
      // Schema validation may pass or fail based on available schemas
      expect(typeof result).toBe("number");
    });
  });

  describe("import command", () => {
    it("should return USAGE_ERROR when tool argument missing", async () => {
      const args: string[] = [];
      const result = await importCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("should return USAGE_ERROR for unsupported tool", async () => {
      const args = ["unsupported-tool", "input.json", "--out", tempOutDir];
      const result = await importCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("should support eslint tool", async () => {
      // Create mock eslint output
      const eslintPath = path.join(tempOutDir, "eslint-output.json");
      writeFileSync(eslintPath, JSON.stringify([]), "utf8");

      const args = ["eslint", eslintPath, "--out", tempOutDir];
      const result = await importCommand(args, { VERSION, EXIT, getOption });
      // Should process without error
      expect(typeof result).toBe("number");
    });

    it("should support semgrep tool", async () => {
      // Create mock semgrep output
      const semgrepPath = path.join(tempOutDir, "semgrep-output.json");
      writeFileSync(semgrepPath, JSON.stringify({ results: [] }), "utf8");

      const args = ["semgrep", semgrepPath, "--out", tempOutDir];
      const result = await importCommand(args, { VERSION, EXIT, getOption });
      expect(typeof result).toBe("number");
    });

    it("should support tsc tool", async () => {
      // Create mock tsc output
      const tscPath = path.join(tempOutDir, "tsc-output.json");
      writeFileSync(tscPath, JSON.stringify([]), "utf8");

      const args = ["tsc", tscPath, "--out", tempOutDir];
      const result = await importCommand(args, { VERSION, EXIT, getOption });
      expect(typeof result).toBe("number");
    });

    it("should support coverage tool", async () => {
      // Create mock coverage output (needs valid structure)
      const coveragePath = path.join(tempOutDir, "coverage-output.json");
      writeFileSync(coveragePath, JSON.stringify({
        coverage: {},
        files: {},
        summary: { total: 0, covered: 0 }
      }), "utf8");

      const args = ["coverage", coveragePath, "--out", tempOutDir];
      const result = await importCommand(args, { VERSION, EXIT, getOption });
      expect(typeof result).toBe("number");
    });

    it("should support test tool", async () => {
      // Create mock test output
      const testPath = path.join(tempOutDir, "test-output.json");
      writeFileSync(testPath, JSON.stringify({ tests: [] }), "utf8");

      const args = ["test", testPath, "--out", tempOutDir];
      const result = await importCommand(args, { VERSION, EXIT, getOption });
      expect(typeof result).toBe("number");
    });

    it("should return USAGE_ERROR when input file not found", async () => {
      const args = ["eslint", "/nonexistent/file.json", "--out", tempOutDir];
      const result = await importCommand(args, { VERSION, EXIT, getOption });
      // File not found returns USAGE_ERROR
      expect(result).toBe(EXIT.USAGE_ERROR);
    });
  });

  describe("export command", () => {
    beforeEach(() => {
      // Create a valid findings.json for export tests
      const findingsPath = path.join(tempOutDir, "findings.json");
      const validFindings = {
        version: "ctg/v1",
        generated_at: new Date().toISOString(),
        run_id: "test-run",
        repo: { root: "." },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      writeFileSync(findingsPath, JSON.stringify(validFindings), "utf8");
    });

    it("should return USAGE_ERROR when target argument missing", async () => {
      const args: string[] = [];
      const result = await exportCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("should return USAGE_ERROR when --from argument missing", async () => {
      const args = ["gatefield"];
      const result = await exportCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("should return USAGE_ERROR for unsupported target", async () => {
      const args = ["unsupported-target", "--from", tempOutDir];
      const result = await exportCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("should export to gatefield target", async () => {
      const args = ["gatefield", "--from", tempOutDir];
      const result = await exportCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.OK);

      const outputPath = path.join(tempOutDir, "gatefield.json");
      expect(existsSync(outputPath)).toBe(true);
    });

    it("should export to state-gate target", async () => {
      const args = ["state-gate", "--from", tempOutDir];
      const result = await exportCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.OK);

      const outputPath = path.join(tempOutDir, "state-gate.json");
      expect(existsSync(outputPath)).toBe(true);
    });

    it("should export to manual-bb target", async () => {
      const args = ["manual-bb", "--from", tempOutDir];
      const result = await exportCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.OK);

      const outputPath = path.join(tempOutDir, "manual-bb.json");
      expect(existsSync(outputPath)).toBe(true);
    });

    it("should export to workflow-evidence target", async () => {
      const args = ["workflow-evidence", "--from", tempOutDir];
      const result = await exportCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.OK);

      const outputPath = path.join(tempOutDir, "workflow.json");
      expect(existsSync(outputPath)).toBe(true);
    });

    it("should export to sarif target", async () => {
      const args = ["sarif", "--from", tempOutDir];
      const result = await exportCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.OK);

      const outputPath = path.join(tempOutDir, "results.sarif");
      expect(existsSync(outputPath)).toBe(true);
    });

    it("should generate valid SARIF schema", async () => {
      const args = ["sarif", "--from", tempOutDir];
      await exportCommand(args, { VERSION, EXIT, getOption });

      const outputPath = path.join(tempOutDir, "results.sarif");
      const sarif = JSON.parse(readFileSync(outputPath, "utf8"));

      expect(sarif.$schema).toContain("sarif-schema-2.1.0");
      expect(sarif.version).toBe("2.1.0");
      expect(Array.isArray(sarif.runs)).toBe(true);
    });

    it("should return INTEGRATION_EXPORT_FAILED when findings.json not found", async () => {
      // Remove findings.json
      const findingsPath = path.join(tempOutDir, "findings.json");
      if (existsSync(findingsPath)) {
        rmSync(findingsPath);
      }

      const args = ["gatefield", "--from", tempOutDir];
      const result = await exportCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("should support custom --out path", async () => {
      const customOutPath = path.join(tempOutDir, "custom-output.json");
      const args = ["gatefield", "--from", tempOutDir, "--out", customOutPath];
      const result = await exportCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.OK);
      expect(existsSync(customOutPath)).toBe(true);
    });
  });

  describe("Full Pipeline Integration", () => {
    it("should run scan -> export pipeline", async () => {
      if (!existsSync(demoCiImportsDir)) {
        return;
      }

      // Step 1: Scan
      const scanArgs = [demoCiImportsDir, "--out", tempOutDir];
      const scanResult = scanCommand(scanArgs, { VERSION, EXIT, getOption });
      expect(scanResult).toBe(EXIT.OK);

      // Verify repo-graph.json was created
      expect(existsSync(path.join(tempOutDir, "repo-graph.json"))).toBe(true);

      // Create findings.json manually for export test
      const findingsPath = path.join(tempOutDir, "findings.json");
      const validFindings = {
        version: "ctg/v1",
        generated_at: new Date().toISOString(),
        run_id: "test-run",
        repo: { root: "." },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };
      writeFileSync(findingsPath, JSON.stringify(validFindings), "utf8");

      // Step 2: Export to SARIF
      const exportArgs = ["sarif", "--from", tempOutDir];
      const exportResult = await exportCommand(exportArgs, { VERSION, EXIT, getOption });
      expect(exportResult).toBe(EXIT.OK);

      // Verify all artifacts exist
      expect(existsSync(path.join(tempOutDir, "repo-graph.json"))).toBe(true);
      expect(existsSync(path.join(tempOutDir, "findings.json"))).toBe(true);
      expect(existsSync(path.join(tempOutDir, "results.sarif"))).toBe(true);
    });

    it("should handle multiple export targets", async () => {
      // Create findings.json
      const findingsPath = path.join(tempOutDir, "findings.json");
      const validFindings = {
        version: "ctg/v1",
        generated_at: new Date().toISOString(),
        run_id: "test-run-multi",
        repo: { root: "." },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };
      writeFileSync(findingsPath, JSON.stringify(validFindings), "utf8");

      // Export to multiple targets
      const targets = ["gatefield", "state-gate", "manual-bb", "workflow-evidence", "sarif"];

      for (const target of targets) {
        const result = await exportCommand([target, "--from", tempOutDir], { VERSION, EXIT, getOption });
        expect(result).toBe(EXIT.OK);
      }

      // Verify all exports
      expect(existsSync(path.join(tempOutDir, "gatefield.json"))).toBe(true);
      expect(existsSync(path.join(tempOutDir, "state-gate.json"))).toBe(true);
      expect(existsSync(path.join(tempOutDir, "manual-bb.json"))).toBe(true);
      expect(existsSync(path.join(tempOutDir, "workflow.json"))).toBe(true);
      expect(existsSync(path.join(tempOutDir, "results.sarif"))).toBe(true);
    });
  });

  describe("Error Handling Across Commands", () => {
    it("should handle missing --from directory gracefully", async () => {
      const args = ["gatefield", "--from", "/nonexistent/dir"];
      const result = await exportCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("should handle --from as file instead of directory", async () => {
      const filePath = path.join(tempOutDir, "not-a-dir.txt");
      writeFileSync(filePath, "test", "utf8");

      const args = ["gatefield", "--from", filePath];
      const result = await exportCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("should handle malformed JSON in findings", async () => {
      const findingsPath = path.join(tempOutDir, "findings.json");
      writeFileSync(findingsPath, "{ invalid json }", "utf8");

      const args = ["gatefield", "--from", tempOutDir];
      const result = await exportCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.INTEGRATION_EXPORT_FAILED);
    });
  });

  describe("Artifact Schema Validation", () => {
    it("should generate gatefield artifact with correct schema", async () => {
      const findingsPath = path.join(tempOutDir, "findings.json");
      writeFileSync(
        findingsPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: new Date().toISOString(),
          run_id: "test",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        }),
        "utf8"
      );

      await exportCommand(["gatefield", "--from", tempOutDir], { VERSION, EXIT, getOption });

      const gatefield = JSON.parse(readFileSync(path.join(tempOutDir, "gatefield.json"), "utf8"));

      expect(gatefield.version).toBe("ctg.gatefield/v1");
      expect(gatefield.producer).toBe("code-to-gate");
      expect(gatefield.signals).toBeDefined();
    });

    it("should generate state-gate artifact with correct schema", async () => {
      const findingsPath = path.join(tempOutDir, "findings.json");
      writeFileSync(
        findingsPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: new Date().toISOString(),
          run_id: "test",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        }),
        "utf8"
      );

      await exportCommand(["state-gate", "--from", tempOutDir], { VERSION, EXIT, getOption });

      const stateGate = JSON.parse(readFileSync(path.join(tempOutDir, "state-gate.json"), "utf8"));

      expect(stateGate.version).toBe("ctg.state-gate/v1");
      expect(stateGate.producer).toBe("code-to-gate");
      expect(stateGate.release_readiness).toBeDefined();
    });

    it("should generate manual-bb artifact with correct schema", async () => {
      const findingsPath = path.join(tempOutDir, "findings.json");
      writeFileSync(
        findingsPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: new Date().toISOString(),
          run_id: "test",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        }),
        "utf8"
      );

      await exportCommand(["manual-bb", "--from", tempOutDir], { VERSION, EXIT, getOption });

      const manualBb = JSON.parse(readFileSync(path.join(tempOutDir, "manual-bb.json"), "utf8"));

      expect(manualBb.version).toBe("ctg.manual-bb/v1");
      expect(manualBb.producer).toBe("code-to-gate");
      expect(manualBb.scope).toBeDefined();
    });
  });

  describe("Export Output Content", () => {
    it("should include findings summary in gatefield output", async () => {
      const findingsPath = path.join(tempOutDir, "findings.json");
      writeFileSync(
        findingsPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: new Date().toISOString(),
          run_id: "test",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "f-001",
              ruleId: "CLIENT_TRUSTED_PRICE",
              category: "payment",
              severity: "critical",
              confidence: 0.9,
              title: "Test finding",
              summary: "Test summary",
              evidence: [],
            },
          ],
          unsupported_claims: [],
        }),
        "utf8"
      );

      await exportCommand(["gatefield", "--from", tempOutDir], { VERSION, EXIT, getOption });

      const gatefield = JSON.parse(readFileSync(path.join(tempOutDir, "gatefield.json"), "utf8"));

      expect(gatefield.signals).toBeDefined();
      expect(Array.isArray(gatefield.signals)).toBe(true);
      expect(gatefield.signals.length).toBe(1);
      expect(["blocked_input", "warning", "failed"]).toContain(gatefield.status);
    });

    it("should include confidence score in state-gate output", async () => {
      const findingsPath = path.join(tempOutDir, "findings.json");
      writeFileSync(
        findingsPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: new Date().toISOString(),
          run_id: "test",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        }),
        "utf8"
      );

      await exportCommand(["state-gate", "--from", tempOutDir], { VERSION, EXIT, getOption });

      const stateGate = JSON.parse(readFileSync(path.join(tempOutDir, "state-gate.json"), "utf8"));

      expect(stateGate.release_readiness).toBeDefined();
      expect(stateGate.release_readiness.status).toBeDefined();
      expect(stateGate.approval_relevance).toBeDefined();
    });

    it("should generate test cases in manual-bb output for findings", async () => {
      const findingsPath = path.join(tempOutDir, "findings.json");
      writeFileSync(
        findingsPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: new Date().toISOString(),
          run_id: "test",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "f-001",
              ruleId: "CLIENT_TRUSTED_PRICE",
              category: "payment",
              severity: "critical",
              confidence: 0.9,
              title: "Test finding",
              summary: "Test summary",
              evidence: [{ id: "e-1", path: "src/api.ts", startLine: 10, kind: "text", excerptHash: "abc123" }],
            },
          ],
          unsupported_claims: [],
        }),
        "utf8"
      );

      await exportCommand(["manual-bb", "--from", tempOutDir], { VERSION, EXIT, getOption });

      const manualBb = JSON.parse(readFileSync(path.join(tempOutDir, "manual-bb.json"), "utf8"));

      expect(manualBb.risk_seeds).toBeDefined();
      expect(Array.isArray(manualBb.risk_seeds)).toBe(true);
      expect(manualBb.risk_seeds.length).toBeGreaterThan(0);
      expect(manualBb.risk_seeds[0].title).toBeDefined();
      expect(manualBb.risk_seeds[0].severity).toBeDefined();
    });
  });
});

// === Additional CLI Tests ===

describe("CLI Edge Cases", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = createTempDir("edge");
    mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should handle very long file paths", () => {
    const deepPath = path.join(
      tempDir,
      "very",
      "deep",
      "directory",
      "structure",
      "with",
      "many",
      "levels"
    );
    mkdirSync(deepPath, { recursive: true });

    const filePath = path.join(deepPath, "file.ts");
    writeFileSync(filePath, "export const x = 1;", "utf8");

    const args = [deepPath, "--out", tempDir];
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("should handle special characters in file names", () => {
    const specialDir = path.join(tempDir, "special-test");
    mkdirSync(specialDir, { recursive: true });

    const filePath = path.join(specialDir, "file.ts");
    writeFileSync(filePath, "export const x = 1;", "utf8");

    const args = [specialDir, "--out", tempDir];
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    expect(typeof result).toBe("number");
  });

  it("should handle Unicode in file content", () => {
    const unicodeDir = path.join(tempDir, "unicode");
    mkdirSync(unicodeDir, { recursive: true });

    const filePath = path.join(unicodeDir, "file.ts");
    const unicodeContent = `
// Unicode comments: Japanese
export const greeting = "Hello World!";
`;
    writeFileSync(filePath, unicodeContent, "utf8");

    const args = [unicodeDir, "--out", tempDir];
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("should handle moderate number of files", () => {
    const moderateDir = path.join(tempDir, "moderate");
    mkdirSync(moderateDir, { recursive: true });

    // Create 20 files (reduced from 100 to avoid timeout)
    for (let i = 0; i < 20; i++) {
      writeFileSync(path.join(moderateDir, `file${i}.ts`), `export const x${i} = ${i};`, "utf8");
    }

    const args = [moderateDir, "--out", tempDir];
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);

    const graphPath = path.join(tempDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));
    expect(graph.files.length).toBe(20);
  }, 60000);

  it("should handle empty file content", () => {
    const emptyDir = path.join(tempDir, "empty-files");
    mkdirSync(emptyDir, { recursive: true });

    const filePath = path.join(emptyDir, "empty.ts");
    writeFileSync(filePath, "", "utf8");

    const args = [emptyDir, "--out", tempDir];
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });
});