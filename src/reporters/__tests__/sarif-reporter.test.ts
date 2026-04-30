/**
 * Tests for SARIF Reporter - Refactored
 *
 * Original: 35 tests, 796 lines
 * Refactored: 12 tests (merged similar cases)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  generateSarifReport,
  writeSarifReport,
  generateFullSarifReport,
} from "../sarif-reporter.js";
import { existsSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  FindingsArtifact,
  RiskRegisterArtifact,
  TestSeedsArtifact,
  CTG_VERSION,
  Severity,
} from "../../types/artifacts.js";

const SARIF_SCHEMA_URL = "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json";

// Helper: Create findings artifact
function createFindings(findings: object[] = [], overrides = {}): FindingsArtifact {
  return {
    version: CTG_VERSION,
    generated_at: new Date().toISOString(),
    run_id: "ctg-test-run-001",
    repo: { root: "." },
    tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings,
    unsupported_claims: [],
    ...overrides,
  } as FindingsArtifact;
}

// Helper: Create finding
function createFinding(overrides = {}): object {
  return {
    id: "finding-001",
    ruleId: "TEST_RULE",
    category: "security",
    severity: "high",
    confidence: 0.85,
    title: "Test finding",
    summary: "Test summary",
    evidence: [],
    ...overrides,
  };
}

// Helper: Create evidence
function createEvidence(path: string, startLine: number = 10): object {
  return { id: "ev-1", path, startLine, kind: "text" };
}

describe("sarif-reporter", () => {
  let tempOutDir: string;

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-sarif-test-${Date.now()}`);
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

  describe("generateSarifReport", () => {
    it("generates SARIF with required structure and all severities mapped correctly", () => {
      const findings = createFindings([
        createFinding({ ruleId: "CRIT", severity: "critical", evidence: [createEvidence("src/critical.ts", 1)] }),
        createFinding({ ruleId: "HIGH", severity: "high", evidence: [createEvidence("src/high.ts", 10)] }),
        createFinding({ ruleId: "MED", severity: "medium", evidence: [createEvidence("src/medium.ts", 20)] }),
        createFinding({ ruleId: "LOW", severity: "low", evidence: [createEvidence("src/low.ts", 30)] }),
      ]);

      const sarif = generateSarifReport(findings);

      // Top-level
      expect(sarif.$schema).toBe(SARIF_SCHEMA_URL);
      expect(sarif.version).toBe("2.1.0");
      expect(Array.isArray(sarif.runs)).toBe(true);
      expect(sarif.runs.length).toBeGreaterThanOrEqual(1);

      // Tool driver
      expect(sarif.runs[0].tool.driver.name).toBe("code-to-gate");
      expect(sarif.runs[0].tool.driver.version).toBeDefined();
      expect(Array.isArray(sarif.runs[0].tool.driver.rules)).toBe(true);
      expect(Array.isArray(sarif.runs[0].results)).toBe(true);

      // Severity mapping
      expect(sarif.runs[0].results[0].level).toBe("error"); // critical
      expect(sarif.runs[0].results[1].level).toBe("error"); // high
      expect(sarif.runs[0].results[2].level).toBe("warning"); // medium
      expect(sarif.runs[0].results[3].level).toBe("note"); // low

      // Results count
      expect(sarif.runs[0].results.length).toBe(4);
      expect(sarif.runs[0].tool.driver.rules.length).toBe(4);
    });

    it("generates empty SARIF for empty findings", () => {
      const findings = createFindings();
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].results.length).toBe(0);
      expect(sarif.runs[0].tool.driver.rules.length).toBe(0);
    });
  });

  describe("result structure", () => {
    it("has all required fields with proper evidence mapping", () => {
      const findings = createFindings([
        createFinding({
          ruleId: "RULE_001",
          summary: "Test summary text",
          evidence: [createEvidence("src/auth/guard.ts", 42)],
        }),
      ]);

      const sarif = generateSarifReport(findings);
      const result = sarif.runs[0].results[0];

      expect(result.ruleId).toBe("RULE_001");
      expect(result.level).toBe("error");
      expect(result.message.text).toBe("Test summary text");
      expect(result.message.markdown).toBeDefined();
      expect(Array.isArray(result.locations)).toBe(true);

      // Location mapping
      const location = result.locations[0].physicalLocation;
      expect(location.artifactLocation.uri).toBe("src/auth/guard.ts");
      expect(location.region?.startLine).toBe(42);
    });

    it("defaults startLine to 1 when not specified", () => {
      const findings = createFindings([
        createFinding({ evidence: [{ id: "e1", path: "file.ts", kind: "text" }] }),
      ]);
      const sarif = generateSarifReport(findings);
      expect(sarif.runs[0].results[0].locations[0].physicalLocation.region?.startLine).toBe(1);
    });

    it("includes all evidence locations and handles no evidence", () => {
      // Multiple evidence
      const findings = createFindings([
        createFinding({
          evidence: [
            createEvidence("src/file1.ts", 10),
            createEvidence("src/file2.ts", 20),
          ],
        }),
      ]);
      const sarif = generateSarifReport(findings);
      expect(sarif.runs[0].results[0].locations.length).toBe(2);

      // No evidence
      const findingsNoEvidence = createFindings([createFinding()]);
      const sarifNoEvidence = generateSarifReport(findingsNoEvidence);
      expect(sarifNoEvidence.runs[0].results[0].locations.length).toBe(0);
    });
  });

  describe("rules collection", () => {
    it("collects unique rules with proper structure", () => {
      const findings = createFindings([
        createFinding({ ruleId: "RULE_A", title: "Rule A description" }),
        createFinding({ ruleId: "RULE_A", severity: "medium" }), // duplicate
        createFinding({ ruleId: "RULE_B", title: "Rule B description" }),
      ]);

      const sarif = generateSarifReport(findings);
      const rules = sarif.runs[0].tool.driver.rules;

      expect(rules.length).toBe(2);
      const ruleIds = rules.map(r => r.id);
      expect(ruleIds).toContain("RULE_A");
      expect(ruleIds).toContain("RULE_B");

      // Rule structure
      const ruleA = rules.find(r => r.id === "RULE_A");
      expect(ruleA?.shortDescription?.text).toBe("Rule A description");
      expect(ruleA?.defaultConfiguration?.level).toBeDefined();
    });
  });

  describe("run properties", () => {
    it("includes metadata and invocation information", () => {
      const findings = createFindings([], {
        run_id: "custom-run-123",
        repo: { root: "/custom/repo" },
        generated_at: "2025-01-15T10:30:00Z",
        completeness: "partial",
      });

      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].properties?.runId).toBe("custom-run-123");
      expect(sarif.runs[0].properties?.repoRoot).toBe("/custom/repo");
      expect(sarif.runs[0].properties?.completeness).toBe("partial");
      expect(sarif.runs[0].invocations?.[0]?.executionSuccessful).toBe(true);
      expect(sarif.runs[0].invocations?.[0]?.startTimeUtc).toBe("2025-01-15T10:30:00Z");
    });

    it("includes artifacts from evidence paths", () => {
      const findings = createFindings([
        createFinding({ evidence: [createEvidence("src/file1.ts"), createEvidence("src/file2.ts")] }),
      ]);
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].artifacts?.length).toBe(2);
      const artifactUris = sarif.runs[0].artifacts?.map(a => a.location.uri);
      expect(artifactUris).toContain("src/file1.ts");
      expect(artifactUris).toContain("src/file2.ts");
    });
  });

  describe("writeSarifReport", () => {
    it("writes valid SARIF file with options", () => {
      const findings = createFindings([createFinding()]);

      // Default filename
      const filePath1 = writeSarifReport(tempOutDir, findings);
      expect(existsSync(filePath1)).toBe(true);
      expect(filePath1).toBe(path.join(tempOutDir, "results.sarif"));

      // Custom filename
      const filePath2 = writeSarifReport(tempOutDir, findings, { filename: "custom.sarif" });
      expect(existsSync(filePath2)).toBe(true);
      expect(filePath2).toBe(path.join(tempOutDir, "custom.sarif"));

      // Valid JSON
      const content = readFileSync(filePath1, "utf8");
      const parsed = JSON.parse(content);
      expect(parsed.$schema).toBe(SARIF_SCHEMA_URL);
      expect(content.endsWith("\n")).toBe(true);
    });
  });

  describe("generateFullSarifReport", () => {
    it("generates SARIF with all artifacts", () => {
      const findings = createFindings([createFinding()]);
      const riskRegister = {
        version: CTG_VERSION,
        generated_at: new Date().toISOString(),
        run_id: "run-001",
        repo: { root: "." },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "risk-register",
        schema: "risk-register@v1",
        completeness: "complete",
        risks: [{ id: "risk-001", title: "Risk", severity: "high", likelihood: "medium", impact: [], confidence: 0.8, sourceFindingIds: [], evidence: [], recommendedActions: [] }],
      } as RiskRegisterArtifact;
      const testSeeds = {
        version: CTG_VERSION,
        generated_at: new Date().toISOString(),
        run_id: "run-001",
        repo: { root: "." },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "test-seeds",
        schema: "test-seeds@v1",
        completeness: "complete",
        seeds: [{ id: "seed-001", title: "Seed", category: "positive", target: "target.ts", description: "Desc", inputs: {}, expectedOutcome: "Pass", priority: "high" }],
      } as TestSeedsArtifact;

      const sarif = generateFullSarifReport(findings, riskRegister, testSeeds);

      expect(sarif.runs[0].properties?.riskCount).toBe(1);
      expect(sarif.runs[0].properties?.testSeedCount).toBe(1);
    });

    it("generates SARIF with findings only", () => {
      const findings = createFindings();
      const sarif = generateFullSarifReport(findings);

      expect(sarif.$schema).toBe(SARIF_SCHEMA_URL);
      expect(sarif.runs[0].properties?.riskCount).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("handles large findings dataset", () => {
      const findings = createFindings(
        Array.from({ length: 100 }, (_, i) =>
          createFinding({
            id: `f${i}`,
            ruleId: `RULE_${i % 10}`,
            severity: ["critical", "high", "medium", "low"][i % 4] as Severity,
            evidence: [createEvidence(`src/file${i % 20}.ts`, i + 1)],
          })
        )
      );

      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].results.length).toBe(100);
      expect(sarif.runs[0].tool.driver.rules.length).toBe(10);
    });
  });
});