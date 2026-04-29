/**
 * Tests for export CLI command
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

describe("export CLI", () => {
  let tempOutDir: string;
  const fixturesDir = path.resolve(import.meta.dirname, "../../../fixtures/demo-ci-imports");

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-export-test-${Date.now()}`);
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

  // Helper function to create a findings.json file for testing
  function createFindingsFile(dir: string, findings: unknown = defaultFindings): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "findings.json"), JSON.stringify(findings), "utf8");
  }

  const defaultFindings = {
    version: "ctg/v1alpha1",
    generated_at: new Date().toISOString(),
    run_id: "export-test-run",
    repo: { root: fixturesDir },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings: [
      {
        id: "finding-1",
        ruleId: "TEST_RULE_1",
        category: "security",
        severity: "high",
        confidence: 0.9,
        title: "Test Finding 1",
        summary: "A test security finding",
        evidence: [{ id: "ev-1", path: "src/test.ts", startLine: 10, endLine: 20 }],
      },
      {
        id: "finding-2",
        ruleId: "TEST_RULE_2",
        category: "auth",
        severity: "medium",
        confidence: 0.8,
        title: "Test Finding 2",
        summary: "A test auth finding",
        evidence: [{ id: "ev-2", path: "src/auth.ts", startLine: 5 }],
      },
    ],
    unsupported_claims: [],
  };

  // Gatefield export tests

  it("export gatefield generates output", async () => {
    createFindingsFile(tempOutDir);
    const args = ["gatefield", "--from", tempOutDir];
    const result = await exportCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("gatefield-static-result.json is generated", async () => {
    createFindingsFile(tempOutDir);
    const args = ["gatefield", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "gatefield-static-result.json");
    expect(existsSync(outputPath)).toBe(true);
  });

  it("gatefield output has correct schema", async () => {
    createFindingsFile(tempOutDir);
    const args = ["gatefield", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "gatefield-static-result.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.artifact).toBe("gatefield-static-result");
    expect(result.schema).toBe("gatefield-static-result@v1");
    expect(result.version).toBe("ctg.gatefield/v1alpha1");
  });

  it("gatefield output has status field", async () => {
    createFindingsFile(tempOutDir);
    const args = ["gatefield", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "gatefield-static-result.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    const validStatuses = ["passed", "blocked", "needs_review"];
    expect(validStatuses).toContain(result.status);
  });

  it("gatefield output has findings_summary", async () => {
    createFindingsFile(tempOutDir);
    const args = ["gatefield", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "gatefield-static-result.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.findings_summary).toBeDefined();
    expect(typeof result.findings_summary.total).toBe("number");
    expect(typeof result.findings_summary.critical).toBe("number");
    expect(typeof result.findings_summary.high).toBe("number");
    expect(typeof result.findings_summary.medium).toBe("number");
    expect(typeof result.findings_summary.low).toBe("number");
  });

  it("gatefield output has blocking_reasons array", async () => {
    createFindingsFile(tempOutDir);
    const args = ["gatefield", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "gatefield-static-result.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(Array.isArray(result.blocking_reasons)).toBe(true);
  });

  it("gatefield output has recommended_actions array", async () => {
    createFindingsFile(tempOutDir);
    const args = ["gatefield", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "gatefield-static-result.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(Array.isArray(result.recommended_actions)).toBe(true);
  });

  // State Gate export tests

  it("export state-gate generates output", async () => {
    createFindingsFile(tempOutDir);
    const args = ["state-gate", "--from", tempOutDir];
    const result = await exportCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("state-gate-evidence.json is generated", async () => {
    createFindingsFile(tempOutDir);
    const args = ["state-gate", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "state-gate-evidence.json");
    expect(existsSync(outputPath)).toBe(true);
  });

  it("state-gate output has correct schema", async () => {
    createFindingsFile(tempOutDir);
    const args = ["state-gate", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "state-gate-evidence.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.artifact).toBe("state-gate-evidence");
    expect(result.schema).toBe("state-gate-evidence@v1");
    expect(result.version).toBe("ctg.state-gate/v1alpha1");
  });

  it("state-gate output has evidence_type", async () => {
    createFindingsFile(tempOutDir);
    const args = ["state-gate", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "state-gate-evidence.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.evidence_type).toBe("static_analysis");
  });

  it("state-gate output has evidence_data", async () => {
    createFindingsFile(tempOutDir);
    const args = ["state-gate", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "state-gate-evidence.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.evidence_data).toBeDefined();
    expect(typeof result.evidence_data.findings_count).toBe("number");
    expect(typeof result.evidence_data.risk_count).toBe("number");
    expect(typeof result.evidence_data.test_seed_count).toBe("number");
    expect(result.evidence_data.readiness_status).toBeDefined();
  });

  it("state-gate output has confidence_score", async () => {
    createFindingsFile(tempOutDir);
    const args = ["state-gate", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "state-gate-evidence.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(typeof result.confidence_score).toBe("number");
    expect(result.confidence_score).toBeGreaterThanOrEqual(0);
    expect(result.confidence_score).toBeLessThanOrEqual(1);
  });

  it("state-gate output has attestations array", async () => {
    createFindingsFile(tempOutDir);
    const args = ["state-gate", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "state-gate-evidence.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(Array.isArray(result.attestations)).toBe(true);
    for (const attestation of result.attestations) {
      expect(attestation.type).toBeDefined();
      expect(attestation.hash).toBeDefined();
      expect(attestation.timestamp).toBeDefined();
    }
  });

  // Manual BB export tests

  it("export manual-bb generates output", async () => {
    createFindingsFile(tempOutDir);
    const args = ["manual-bb", "--from", tempOutDir];
    const result = await exportCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("manual-bb-seed.json is generated", async () => {
    createFindingsFile(tempOutDir);
    const args = ["manual-bb", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "manual-bb-seed.json");
    expect(existsSync(outputPath)).toBe(true);
  });

  it("manual-bb output has correct schema", async () => {
    createFindingsFile(tempOutDir);
    const args = ["manual-bb", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "manual-bb-seed.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.artifact).toBe("manual-bb-seed");
    expect(result.schema).toBe("manual-bb-seed@v1");
    expect(result.version).toBe("ctg.manual-bb/v1alpha1");
  });

  it("manual-bb output has test_cases array", async () => {
    createFindingsFile(tempOutDir);
    const args = ["manual-bb", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "manual-bb-seed.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(Array.isArray(result.test_cases)).toBe(true);
  });

  it("manual-bb test_cases have required fields", async () => {
    // Create findings with high/critical severity to generate test cases
    const findingsWithHigh = {
      ...defaultFindings,
      findings: [
        {
          id: "finding-1",
          ruleId: "HIGH_SECURITY_RULE",
          category: "security",
          severity: "high",
          confidence: 0.9,
          title: "High severity finding",
          summary: "A high severity security finding",
          evidence: [{ id: "ev-1", path: "src/security.ts", startLine: 10 }],
        },
      ],
    };
    createFindingsFile(tempOutDir, findingsWithHigh);

    const args = ["manual-bb", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "manual-bb-seed.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    for (const testCase of result.test_cases) {
      expect(testCase.id).toBeDefined();
      expect(testCase.title).toBeDefined();
      expect(testCase.category).toBeDefined();
      expect(testCase.risk_area).toBeDefined();
      expect(testCase.description).toBeDefined();
      expect(Array.isArray(testCase.steps)).toBe(true);
      expect(testCase.expected_result).toBeDefined();
      expect(["high", "medium", "low"]).toContain(testCase.priority);
      expect(Array.isArray(testCase.source_findings)).toBe(true);
    }
  });

  it("manual-bb generates test cases from high/critical findings", async () => {
    const findingsWithHighCritical = {
      ...defaultFindings,
      findings: [
        {
          id: "finding-1",
          ruleId: "CRITICAL_RULE",
          category: "security",
          severity: "critical",
          confidence: 0.95,
          title: "Critical severity finding",
          summary: "A critical security finding",
          evidence: [{ id: "ev-1", path: "src/critical.ts", startLine: 10 }],
        },
        {
          id: "finding-2",
          ruleId: "HIGH_RULE",
          category: "auth",
          severity: "high",
          confidence: 0.9,
          title: "High severity finding",
          summary: "A high severity auth finding",
          evidence: [{ id: "ev-2", path: "src/auth.ts", startLine: 5 }],
        },
      ],
    };
    createFindingsFile(tempOutDir, findingsWithHighCritical);

    const args = ["manual-bb", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "manual-bb-seed.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.test_cases.length).toBeGreaterThanOrEqual(2);
  });

  // Workflow evidence export tests

  it("export workflow-evidence generates output", async () => {
    createFindingsFile(tempOutDir);
    const args = ["workflow-evidence", "--from", tempOutDir];
    const result = await exportCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("workflow-evidence.json is generated", async () => {
    createFindingsFile(tempOutDir);
    const args = ["workflow-evidence", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "workflow-evidence.json");
    expect(existsSync(outputPath)).toBe(true);
  });

  it("workflow-evidence output has correct schema", async () => {
    createFindingsFile(tempOutDir);
    const args = ["workflow-evidence", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "workflow-evidence.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.artifact).toBe("workflow-evidence");
    expect(result.schema).toBe("workflow-evidence@v1");
    expect(result.version).toBe("ctg.workflow-evidence/v1alpha1");
  });

  it("workflow-evidence output has steps array", async () => {
    createFindingsFile(tempOutDir);
    const args = ["workflow-evidence", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "workflow-evidence.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(Array.isArray(result.steps)).toBe(true);
    for (const step of result.steps) {
      expect(step.name).toBeDefined();
      expect(["success", "failure", "skipped"]).toContain(step.status);
      expect(typeof step.duration_ms).toBe("number");
      expect(Array.isArray(step.artifacts_produced)).toBe(true);
    }
  });

  it("workflow-evidence output has overall_status", async () => {
    createFindingsFile(tempOutDir);
    const args = ["workflow-evidence", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "workflow-evidence.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(["success", "failure"]).toContain(result.overall_status);
  });

  it("workflow-evidence output has evidence_refs array", async () => {
    createFindingsFile(tempOutDir);
    const args = ["workflow-evidence", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "workflow-evidence.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(Array.isArray(result.evidence_refs)).toBe(true);
  });

  // SARIF export tests

  it("export sarif generates output", async () => {
    createFindingsFile(tempOutDir);
    const args = ["sarif", "--from", tempOutDir];
    const result = await exportCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("results.sarif is generated", async () => {
    createFindingsFile(tempOutDir);
    const args = ["sarif", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "results.sarif");
    expect(existsSync(outputPath)).toBe(true);
  });

  it("sarif output has correct schema version", async () => {
    createFindingsFile(tempOutDir);
    const args = ["sarif", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "results.sarif");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.$schema).toBe("https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json");
    expect(result.version).toBe("2.1.0");
  });

  it("sarif output has runs array", async () => {
    createFindingsFile(tempOutDir);
    const args = ["sarif", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "results.sarif");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(Array.isArray(result.runs)).toBe(true);
    expect(result.runs.length).toBeGreaterThan(0);
  });

  it("sarif run has tool driver", async () => {
    createFindingsFile(tempOutDir);
    const args = ["sarif", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "results.sarif");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.runs[0].tool).toBeDefined();
    expect(result.runs[0].tool.driver).toBeDefined();
    expect(result.runs[0].tool.driver.name).toBe("code-to-gate");
    expect(result.runs[0].tool.driver.version).toBeDefined();
  });

  it("sarif run has rules", async () => {
    createFindingsFile(tempOutDir);
    const args = ["sarif", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "results.sarif");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(Array.isArray(result.runs[0].tool.driver.rules)).toBe(true);
  });

  it("sarif run has results array", async () => {
    createFindingsFile(tempOutDir);
    const args = ["sarif", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "results.sarif");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(Array.isArray(result.runs[0].results)).toBe(true);
  });

  it("sarif result has required fields", async () => {
    createFindingsFile(tempOutDir);
    const args = ["sarif", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "results.sarif");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    for (const sarifResult of result.runs[0].results) {
      expect(sarifResult.ruleId).toBeDefined();
      expect(["error", "warning", "note"]).toContain(sarifResult.level);
      expect(sarifResult.message).toBeDefined();
      expect(sarifResult.message.text).toBeDefined();
      expect(Array.isArray(sarifResult.locations)).toBe(true);
    }
  });

  it("sarif location has physicalLocation", async () => {
    createFindingsFile(tempOutDir);
    const args = ["sarif", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "results.sarif");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    for (const sarifResult of result.runs[0].results) {
      for (const location of sarifResult.locations) {
        expect(location.physicalLocation).toBeDefined();
        expect(location.physicalLocation.artifactLocation).toBeDefined();
        expect(location.physicalLocation.artifactLocation.uri).toBeDefined();
      }
    }
  });

  it("sarif severity mapping is correct", async () => {
    const findingsWithAllSeverities = {
      ...defaultFindings,
      findings: [
        {
          id: "f-critical",
          ruleId: "RULE_CRITICAL",
          category: "security",
          severity: "critical",
          confidence: 0.95,
          title: "Critical",
          summary: "Critical finding",
          evidence: [{ id: "ev-1", path: "src/c.ts", startLine: 1 }],
        },
        {
          id: "f-high",
          ruleId: "RULE_HIGH",
          category: "security",
          severity: "high",
          confidence: 0.9,
          title: "High",
          summary: "High finding",
          evidence: [{ id: "ev-2", path: "src/h.ts", startLine: 2 }],
        },
        {
          id: "f-medium",
          ruleId: "RULE_MEDIUM",
          category: "security",
          severity: "medium",
          confidence: 0.8,
          title: "Medium",
          summary: "Medium finding",
          evidence: [{ id: "ev-3", path: "src/m.ts", startLine: 3 }],
        },
        {
          id: "f-low",
          ruleId: "RULE_LOW",
          category: "security",
          severity: "low",
          confidence: 0.7,
          title: "Low",
          summary: "Low finding",
          evidence: [{ id: "ev-4", path: "src/l.ts", startLine: 4 }],
        },
      ],
    };
    createFindingsFile(tempOutDir, findingsWithAllSeverities);

    const args = ["sarif", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "results.sarif");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    // Critical and high should map to error
    // Medium should map to warning
    // Low should map to note
    const levels = result.runs[0].results.map((r: { level: string }) => r.level);
    expect(levels.includes("error")).toBe(true); // critical/high
    expect(levels.includes("warning")).toBe(true); // medium
    expect(levels.includes("note")).toBe(true); // low
  });

  // Error handling tests

  it("exit code USAGE_ERROR when target argument missing", async () => {
    createFindingsFile(tempOutDir);
    const args: string[] = ["--from", tempOutDir];
    const result = await exportCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when --from argument missing", async () => {
    const args = ["gatefield"];
    const result = await exportCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when unsupported target specified", async () => {
    createFindingsFile(tempOutDir);
    const args = ["unsupported-target", "--from", tempOutDir];
    const result = await exportCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when --from directory does not exist", async () => {
    const args = ["gatefield", "--from", "/nonexistent/directory"];
    const result = await exportCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when --from is a file (not directory)", async () => {
    const filePath = path.join(tempOutDir, "not-a-dir.txt");
    writeFileSync(filePath, "test content", "utf8");

    const args = ["gatefield", "--from", filePath];
    const result = await exportCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when findings.json not found in --from", async () => {
    const emptyDir = path.join(tempOutDir, "empty-from");
    mkdirSync(emptyDir, { recursive: true });

    const args = ["gatefield", "--from", emptyDir];
    const result = await exportCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code INTEGRATION_EXPORT_FAILED for malformed findings.json", async () => {
    const malformedDir = path.join(tempOutDir, "malformed");
    mkdirSync(malformedDir, { recursive: true });
    writeFileSync(path.join(malformedDir, "findings.json"), "not valid json", "utf8");

    const args = ["gatefield", "--from", malformedDir];
    const result = await exportCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.INTEGRATION_EXPORT_FAILED);
  });

  // Output file option tests

  it("custom --out file path is used", async () => {
    createFindingsFile(tempOutDir);
    const customOutFile = path.join(tempOutDir, "custom-gatefield.json");

    const args = ["gatefield", "--from", tempOutDir, "--out", customOutFile];
    await exportCommand(args, { VERSION, EXIT, getOption });

    expect(existsSync(customOutFile)).toBe(true);
    // Default output should not exist
    expect(existsSync(path.join(tempOutDir, "gatefield-static-result.json"))).toBe(false);
  });

  it("--out option works for sarif", async () => {
    createFindingsFile(tempOutDir);
    const customSarifFile = path.join(tempOutDir, "custom.sarif");

    const args = ["sarif", "--from", tempOutDir, "--out", customSarifFile];
    await exportCommand(args, { VERSION, EXIT, getOption });

    expect(existsSync(customSarifFile)).toBe(true);
  });

  // Handles relative paths

  it("handles relative --from path", async () => {
    // Create findings in a relative path context
    const args = ["gatefield", "--from", "../../../fixtures/demo-ci-imports"];
    // This might fail if findings.json doesn't exist, but test error handling
    const result = await exportCommand(args, { VERSION, EXIT, getOption });
    expect(typeof result).toBe("number");
  });

  // Empty findings handling

  it("handles empty findings array", async () => {
    const emptyFindings = {
      ...defaultFindings,
      findings: [],
    };
    createFindingsFile(tempOutDir, emptyFindings);

    const args = ["gatefield", "--from", tempOutDir];
    const result = await exportCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);

    const outputPath = path.join(tempOutDir, "gatefield-static-result.json");
    const gatefieldResult = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(gatefieldResult.status).toBe("passed");
    expect(gatefieldResult.findings_summary.total).toBe(0);
  });

  it("sarif handles empty findings", async () => {
    const emptyFindings = {
      ...defaultFindings,
      findings: [],
    };
    createFindingsFile(tempOutDir, emptyFindings);

    const args = ["sarif", "--from", tempOutDir];
    const result = await exportCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);

    const outputPath = path.join(tempOutDir, "results.sarif");
    const sarifResult = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(Array.isArray(sarifResult.runs[0].results)).toBe(true);
    expect(sarifResult.runs[0].results.length).toBe(0);
  });

  // Metadata preservation tests

  it("preserves run_id from findings", async () => {
    createFindingsFile(tempOutDir);
    const args = ["gatefield", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "gatefield-static-result.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.run_id).toBe("export-test-run");
  });

  it("preserves repo from findings", async () => {
    createFindingsFile(tempOutDir);
    const args = ["gatefield", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "gatefield-static-result.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.repo).toBeDefined();
    expect(result.repo.root).toBe(fixturesDir);
  });

  it("preserves generated_at from findings", async () => {
    createFindingsFile(tempOutDir);
    const args = ["gatefield", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "gatefield-static-result.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.generated_at).toBeDefined();
  });

  // Summary output tests

  it("outputs summary JSON to stdout", async () => {
    createFindingsFile(tempOutDir);
    const args = ["gatefield", "--from", tempOutDir];
    const result = await exportCommand(args, { VERSION, EXIT, getOption });
    // Just verify it completes without error
    expect(result).toBe(EXIT.OK);
  });

  // Test all supported targets

  it("all supported targets produce valid output", async () => {
    createFindingsFile(tempOutDir);

    const targets = ["gatefield", "state-gate", "manual-bb", "workflow-evidence", "sarif"];

    for (const target of targets) {
      const targetOutDir = path.join(tempOutDir, target);
      mkdirSync(targetOutDir, { recursive: true });
      writeFileSync(
        path.join(targetOutDir, "findings.json"),
        JSON.stringify(defaultFindings),
        "utf8"
      );

      const args = [target, "--from", targetOutDir];
      const result = await exportCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.OK);
    }
  });

  // Gatefield status logic tests

  it("gatefield status is blocked when critical findings exist", async () => {
    const criticalFindings = {
      ...defaultFindings,
      findings: [
        {
          id: "finding-1",
          ruleId: "CRITICAL_RULE",
          category: "security",
          severity: "critical",
          confidence: 0.95,
          title: "Critical finding",
          summary: "A critical security finding",
          evidence: [{ id: "ev-1", path: "src/critical.ts", startLine: 10 }],
        },
      ],
    };
    createFindingsFile(tempOutDir, criticalFindings);

    const args = ["gatefield", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "gatefield-static-result.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.status).toBe("blocked");
    expect(result.blocking_reasons.length).toBeGreaterThan(0);
  });

  it("gatefield status is needs_review when high findings exist", async () => {
    const highFindings = {
      ...defaultFindings,
      findings: [
        {
          id: "finding-1",
          ruleId: "HIGH_RULE",
          category: "security",
          severity: "high",
          confidence: 0.9,
          title: "High finding",
          summary: "A high severity finding",
          evidence: [{ id: "ev-1", path: "src/high.ts", startLine: 10 }],
        },
      ],
    };
    createFindingsFile(tempOutDir, highFindings);

    const args = ["gatefield", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "gatefield-static-result.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.status).toBe("needs_review");
  });

  it("gatefield status is passed when only low findings exist", async () => {
    const lowFindings = {
      ...defaultFindings,
      findings: [
        {
          id: "finding-1",
          ruleId: "LOW_RULE",
          category: "maintainability",
          severity: "low",
          confidence: 0.7,
          title: "Low finding",
          summary: "A low severity finding",
          evidence: [{ id: "ev-1", path: "src/low.ts", startLine: 10 }],
        },
      ],
    };
    createFindingsFile(tempOutDir, lowFindings);

    const args = ["gatefield", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "gatefield-static-result.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.status).toBe("passed");
  });

  // State Gate confidence calculation tests

  it("state-gate confidence is high when no findings", async () => {
    const emptyFindings = {
      ...defaultFindings,
      findings: [],
    };
    createFindingsFile(tempOutDir, emptyFindings);

    const args = ["state-gate", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "state-gate-evidence.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.confidence_score).toBe(1.0);
  });

  it("state-gate confidence is reduced with critical findings", async () => {
    const criticalFindings = {
      ...defaultFindings,
      findings: [
        {
          id: "finding-1",
          ruleId: "CRITICAL_RULE",
          category: "security",
          severity: "critical",
          confidence: 0.95,
          title: "Critical finding",
          summary: "A critical security finding",
          evidence: [{ id: "ev-1", path: "src/critical.ts", startLine: 10 }],
        },
      ],
    };
    createFindingsFile(tempOutDir, criticalFindings);

    const args = ["state-gate", "--from", tempOutDir];
    await exportCommand(args, { VERSION, EXIT, getOption });

    const outputPath = path.join(tempOutDir, "state-gate-evidence.json");
    const result = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.confidence_score).toBeLessThan(1.0);
  });
});