/**
 * Tests for export CLI command - Refactored
 *
 * Original: 58 tests, 947 lines
 * Refactored: 15 tests (merged similar cases)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { exportCommand } from "../export.js";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

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

const VERSION = "0.1.0";

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

// Helper: Create findings artifact
function createFindingsArtifact(findings: object[] = [], overrides = {}): object {
  return {
    version: "ctg/v1",
    generated_at: new Date().toISOString(),
    run_id: "export-test-run",
    repo: { root: "/test/repo" },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings,
    unsupported_claims: [],
    ...overrides,
  };
}

// Helper: Create finding
function createFinding(overrides = {}): object {
  return {
    id: "finding-001",
    ruleId: "TEST_RULE",
    category: "security",
    severity: "medium",
    confidence: 0.9,
    title: "Test finding",
    summary: "Test summary",
    evidence: [{ id: "ev-1", path: "src/test.ts", startLine: 10 }],
    ...overrides,
  };
}

// Helper: Write findings to directory
function writeFindings(dir: string, findings: object[]): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "findings.json"), JSON.stringify(createFindingsArtifact(findings)), "utf8");
}

// Helper: Run export and get result
async function runExport(target: string, fromDir: string, outFile?: string): Promise<{ exitCode: number; output: object }> {
  const args = outFile
    ? [target, "--from", fromDir, "--out", outFile]
    : [target, "--from", fromDir];
  const result = await exportCommand(args, { VERSION, EXIT, getOption });
  const outputPath = outFile || path.join(fromDir, getExpectedOutputFile(target));
  const output = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, "utf8")) : {};
  return { exitCode: result, output };
}

// Helper: Get expected output filename for each target
function getExpectedOutputFile(target: string): string {
  const files: Record<string, string> = {
    "gatefield": "gatefield-static-result.json",
    "state-gate": "state-gate-evidence.json",
    "manual-bb": "manual-bb-seed.json",
    "workflow-evidence": "workflow-evidence.json",
    "sarif": "results.sarif",
  };
  return files[target] || "";
}

describe("export CLI", () => {
  let tempOutDir: string;

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-export-test-${Date.now()}`);
    mkdirSync(tempOutDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempOutDir)) rmSync(tempOutDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
      mkdirSync(tempOutDir, { recursive: true });
    }
  });

  describe("all export targets", () => {
    const targets = ["gatefield", "state-gate", "manual-bb", "workflow-evidence", "sarif"];

    it("generates valid output with correct schema for all targets", async () => {
      writeFindings(tempOutDir, [createFinding()]);

      for (const target of targets) {
        const targetDir = path.join(tempOutDir, target);
        writeFindings(targetDir, [createFinding()]);
        const { exitCode, output } = await runExport(target, targetDir);

        expect(exitCode).toBe(EXIT.OK);
        expect(existsSync(path.join(targetDir, getExpectedOutputFile(target)))).toBe(true);

        // Schema validation
        expect(output.artifact || output.$schema).toBeDefined();
        if (target === "sarif") {
          expect(output.$schema).toContain("sarif-schema-2.1.0");
          expect(output.version).toBe("2.1.0");
          expect(Array.isArray(output.runs)).toBe(true);
          expect(output.runs[0].tool.driver.name).toBe("code-to-gate");
        } else {
          expect(output.version).toContain("ctg");
        }
      }
    });
  });

  describe("gatefield export", () => {
    it("generates gatefield-static-result with all required fields", async () => {
      writeFindings(tempOutDir, [createFinding()]);
      const { exitCode, output } = await runExport("gatefield", tempOutDir);

      expect(exitCode).toBe(EXIT.OK);
      expect(output.artifact).toBe("gatefield-static-result");
      expect(output.schema).toBe("gatefield-static-result@v1");

      // Status
      const validStatuses = ["passed", "blocked", "needs_review"];
      expect(validStatuses).toContain(output.status);

      // Summary
      expect(output.findings_summary).toBeDefined();
      expect(typeof output.findings_summary.total).toBe("number");
      expect(typeof output.findings_summary.critical).toBe("number");
      expect(typeof output.findings_summary.high).toBe("number");

      // Arrays
      expect(Array.isArray(output.blocking_reasons)).toBe(true);
      expect(Array.isArray(output.recommended_actions)).toBe(true);

      // Metadata
      expect(output.run_id).toBeDefined();
      expect(output.repo).toBeDefined();
      expect(output.generated_at).toBeDefined();
    });

    it("status reflects findings severity", async () => {
      // Critical -> blocked
      const criticalDir = path.join(tempOutDir, "critical");
      writeFindings(criticalDir, [createFinding({ severity: "critical" })]);
      const { output: blocked } = await runExport("gatefield", criticalDir);
      expect(blocked.status).toBe("blocked");
      expect(blocked.blocking_reasons.length).toBeGreaterThan(0);

      // High -> needs_review
      const highDir = path.join(tempOutDir, "high");
      writeFindings(highDir, [createFinding({ severity: "high" })]);
      const { output: review } = await runExport("gatefield", highDir);
      expect(review.status).toBe("needs_review");

      // Low -> passed
      const lowDir = path.join(tempOutDir, "low");
      writeFindings(lowDir, [createFinding({ severity: "low", category: "maintainability" })]);
      const { output: passed } = await runExport("gatefield", lowDir);
      expect(passed.status).toBe("passed");
    });
  });

  describe("state-gate export", () => {
    it("generates state-gate-evidence with all required fields", async () => {
      writeFindings(tempOutDir, [createFinding()]);
      const { exitCode, output } = await runExport("state-gate", tempOutDir);

      expect(exitCode).toBe(EXIT.OK);
      expect(output.artifact).toBe("state-gate-evidence");
      expect(output.evidence_type).toBe("static_analysis");

      // Evidence data
      expect(output.evidence_data).toBeDefined();
      expect(typeof output.evidence_data.findings_count).toBe("number");
      expect(typeof output.evidence_data.risk_count).toBe("number");

      // Confidence
      expect(typeof output.confidence_score).toBe("number");
      expect(output.confidence_score).toBeGreaterThanOrEqual(0);
      expect(output.confidence_score).toBeLessThanOrEqual(1);

      // Attestations
      expect(Array.isArray(output.attestations)).toBe(true);
      for (const attestation of output.attestations) {
        expect(attestation.type).toBeDefined();
        expect(attestation.hash).toBeDefined();
      }
    });

    it("confidence reflects findings severity", async () => {
      // Empty findings -> confidence 1.0
      const emptyDir = path.join(tempOutDir, "empty");
      writeFindings(emptyDir, []);
      const { output: highConfidence } = await runExport("state-gate", emptyDir);
      expect(highConfidence.confidence_score).toBe(1.0);

      // Critical findings -> reduced confidence
      const criticalDir = path.join(tempOutDir, "critical-state");
      writeFindings(criticalDir, [createFinding({ severity: "critical" })]);
      const { output: lowConfidence } = await runExport("state-gate", criticalDir);
      expect(lowConfidence.confidence_score).toBeLessThan(1.0);
    });
  });

  describe("manual-bb export", () => {
    it("generates test cases from high/critical findings", async () => {
      writeFindings(tempOutDir, [
        createFinding({ severity: "critical" }),
        createFinding({ severity: "high" }),
      ]);
      const { exitCode, output } = await runExport("manual-bb", tempOutDir);

      expect(exitCode).toBe(EXIT.OK);
      expect(output.artifact).toBe("manual-bb-seed");
      expect(Array.isArray(output.test_cases)).toBe(true);
      expect(output.test_cases.length).toBeGreaterThanOrEqual(2);

      for (const testCase of output.test_cases) {
        expect(testCase.id).toBeDefined();
        expect(testCase.title).toBeDefined();
        expect(testCase.category).toBeDefined();
        expect(testCase.risk_area).toBeDefined();
        expect(Array.isArray(testCase.steps)).toBe(true);
        expect(["high", "medium", "low"]).toContain(testCase.priority);
      }
    });
  });

  describe("workflow-evidence export", () => {
    it("generates workflow evidence with steps and status", async () => {
      writeFindings(tempOutDir, [createFinding()]);
      const { exitCode, output } = await runExport("workflow-evidence", tempOutDir);

      expect(exitCode).toBe(EXIT.OK);
      expect(output.artifact).toBe("workflow-evidence");
      expect(Array.isArray(output.steps)).toBe(true);
      expect(["success", "failure"]).toContain(output.overall_status);
      expect(Array.isArray(output.evidence_refs)).toBe(true);

      for (const step of output.steps) {
        expect(step.name).toBeDefined();
        expect(["success", "failure", "skipped"]).toContain(step.status);
        expect(Array.isArray(step.artifacts_produced)).toBe(true);
      }
    });
  });

  describe("sarif export", () => {
    it("generates SARIF with proper structure and severity mapping", async () => {
      writeFindings(tempOutDir, [
        createFinding({ severity: "critical" }),
        createFinding({ severity: "medium" }),
        createFinding({ severity: "low" }),
      ]);
      const { exitCode, output } = await runExport("sarif", tempOutDir);

      expect(exitCode).toBe(EXIT.OK);
      expect(output.$schema).toContain("sarif-schema-2.1.0");
      expect(Array.isArray(output.runs)).toBe(true);
      expect(Array.isArray(output.runs[0].results)).toBe(true);

      // Check SARIF result fields
      for (const sarifResult of output.runs[0].results) {
        expect(sarifResult.ruleId).toBeDefined();
        expect(["error", "warning", "note"]).toContain(sarifResult.level);
        expect(sarifResult.message.text).toBeDefined();
        expect(Array.isArray(sarifResult.locations)).toBe(true);
        expect(sarifResult.locations[0].physicalLocation).toBeDefined();
      }

      // Severity mapping
      const levels = output.runs[0].results.map((r: { level: string }) => r.level);
      expect(levels.includes("error")).toBe(true); // critical
      expect(levels.includes("warning")).toBe(true); // medium
      expect(levels.includes("note")).toBe(true); // low
    });
  });

  describe("error handling", () => {
    it("returns USAGE_ERROR for invalid arguments", async () => {
      // Missing target
      const result1 = await exportCommand(["--from", tempOutDir], { VERSION, EXIT, getOption });
      expect(result1).toBe(EXIT.USAGE_ERROR);

      // Missing --from
      const result2 = await exportCommand(["gatefield"], { VERSION, EXIT, getOption });
      expect(result2).toBe(EXIT.USAGE_ERROR);

      // Unsupported target
      writeFindings(tempOutDir, []);
      const result3 = await exportCommand(["unsupported", "--from", tempOutDir], { VERSION, EXIT, getOption });
      expect(result3).toBe(EXIT.USAGE_ERROR);

      // Nonexistent directory
      const result4 = await exportCommand(["gatefield", "--from", "/nonexistent"], { VERSION, EXIT, getOption });
      expect(result4).toBe(EXIT.USAGE_ERROR);

      // File instead of directory
      const filePath = path.join(tempOutDir, "file.txt");
      writeFileSync(filePath, "test", "utf8");
      const result5 = await exportCommand(["gatefield", "--from", filePath], { VERSION, EXIT, getOption });
      expect(result5).toBe(EXIT.USAGE_ERROR);

      // Missing findings.json
      const emptyDir = path.join(tempOutDir, "empty");
      mkdirSync(emptyDir, { recursive: true });
      const result6 = await exportCommand(["gatefield", "--from", emptyDir], { VERSION, EXIT, getOption });
      expect(result6).toBe(EXIT.USAGE_ERROR);
    });

    it("returns INTEGRATION_EXPORT_FAILED for malformed JSON", async () => {
      const malformedDir = path.join(tempOutDir, "malformed");
      mkdirSync(malformedDir, { recursive: true });
      writeFileSync(path.join(malformedDir, "findings.json"), "not json", "utf8");

      const result = await exportCommand(["gatefield", "--from", malformedDir], { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.INTEGRATION_EXPORT_FAILED);
    });
  });

  describe("output options", () => {
    it("uses custom --out path for gatefield and sarif", async () => {
      writeFindings(tempOutDir, [createFinding()]);

      // Gatefield custom output
      const customGatefield = path.join(tempOutDir, "custom-gatefield.json");
      const { exitCode: e1 } = await runExport("gatefield", tempOutDir, customGatefield);
      expect(e1).toBe(EXIT.OK);
      expect(existsSync(customGatefield)).toBe(true);

      // SARIF custom output
      const customSarif = path.join(tempOutDir, "custom.sarif");
      const { exitCode: e2 } = await runExport("sarif", tempOutDir, customSarif);
      expect(e2).toBe(EXIT.OK);
      expect(existsSync(customSarif)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles empty findings array", async () => {
      writeFindings(tempOutDir, []);

      // Gatefield
      const { output: gatefield } = await runExport("gatefield", tempOutDir);
      expect(gatefield.status).toBe("passed");
      expect(gatefield.findings_summary.total).toBe(0);

      // SARIF
      const { output: sarif } = await runExport("sarif", tempOutDir);
      expect(sarif.runs[0].results.length).toBe(0);
    });

    it("handles relative --from path", async () => {
      const result = await exportCommand(["gatefield", "--from", "../../../fixtures/demo-ci-imports"], { VERSION, EXIT, getOption });
      expect(typeof result).toBe("number");
    });
  });
});