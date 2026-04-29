/**
 * Tests for SARIF Reporter
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  generateSarifReport,
  writeSarifReport,
  generateFullSarifReport,
  SarifLog,
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

function createMockFindings(overrides?: Partial<FindingsArtifact>): FindingsArtifact {
  const base: FindingsArtifact = {
    version: CTG_VERSION,
    generated_at: new Date().toISOString(),
    run_id: "ctg-test-run-001",
    repo: { root: "." },
    tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings: [],
    unsupported_claims: [],
  };
  return { ...base, ...overrides } as FindingsArtifact;
}

function createMockRiskRegister(overrides?: Partial<RiskRegisterArtifact>): RiskRegisterArtifact {
  const base: RiskRegisterArtifact = {
    version: CTG_VERSION,
    generated_at: new Date().toISOString(),
    run_id: "ctg-test-run-001",
    repo: { root: "." },
    tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
    artifact: "risk-register",
    schema: "risk-register@v1",
    completeness: "complete",
    risks: [],
  };
  return { ...base, ...overrides } as RiskRegisterArtifact;
}

function createMockTestSeeds(overrides?: Partial<TestSeedsArtifact>): TestSeedsArtifact {
  const base: TestSeedsArtifact = {
    version: CTG_VERSION,
    generated_at: new Date().toISOString(),
    run_id: "ctg-test-run-001",
    repo: { root: "." },
    tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
    artifact: "test-seeds",
    schema: "test-seeds@v1",
    completeness: "complete",
    seeds: [],
  };
  return { ...base, ...overrides } as TestSeedsArtifact;
}

describe("sarif-reporter", () => {
  let tempOutDir: string;

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-sarif-reporter-test-${Date.now()}`);
    mkdirSync(tempOutDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
      mkdirSync(tempOutDir, { recursive: true });
    }
  });

  describe("generateSarifReport", () => {
    it("generates SARIF with required top-level fields", () => {
      const findings = createMockFindings();
      const sarif = generateSarifReport(findings);

      expect(sarif.$schema).toBe(SARIF_SCHEMA_URL);
      expect(sarif.version).toBe("2.1.0");
      expect(Array.isArray(sarif.runs)).toBe(true);
    });

    it("generates SARIF with at least one run", () => {
      const findings = createMockFindings();
      const sarif = generateSarifReport(findings);

      expect(sarif.runs.length).toBeGreaterThanOrEqual(1);
    });

    it("generates SARIF with tool.driver", () => {
      const findings = createMockFindings();
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].tool).toBeDefined();
      expect(sarif.runs[0].tool.driver).toBeDefined();
      expect(sarif.runs[0].tool.driver.name).toBe("code-to-gate");
      expect(sarif.runs[0].tool.driver.version).toBeDefined();
    });

    it("generates SARIF with rules array", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "RULE_001",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "Rule Title",
            summary: "S1",
            evidence: [],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      expect(Array.isArray(sarif.runs[0].tool.driver.rules)).toBe(true);
    });

    it("generates SARIF with results array", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "T1",
            summary: "S1",
            evidence: [],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      expect(Array.isArray(sarif.runs[0].results)).toBe(true);
    });

    it("generates SARIF with empty results for empty findings", () => {
      const findings = createMockFindings();
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].results.length).toBe(0);
      expect(sarif.runs[0].tool.driver.rules.length).toBe(0);
    });
  });

  describe("Severity to SARIF level mapping", () => {
    it("maps critical to error", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "critical",
            confidence: 0.9,
            title: "T1",
            summary: "S1",
            evidence: [],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].results[0].level).toBe("error");
    });

    it("maps high to error", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "T1",
            summary: "S1",
            evidence: [],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].results[0].level).toBe("error");
    });

    it("maps medium to warning", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "medium",
            confidence: 0.7,
            title: "T1",
            summary: "S1",
            evidence: [],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].results[0].level).toBe("warning");
    });

    it("maps low to note", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "low",
            confidence: 0.6,
            title: "T1",
            summary: "S1",
            evidence: [],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].results[0].level).toBe("note");
    });
  });

  describe("Result structure validation", () => {
    it("has required fields in each result", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "RULE_001",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "T1",
            summary: "Result summary",
            evidence: [
              { id: "e1", path: "src/file.ts", startLine: 25, kind: "text", excerptHash: "h" },
            ],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      const result = sarif.runs[0].results[0];
      expect(result.ruleId).toBeDefined();
      expect(result.level).toBeDefined();
      expect(result.message).toBeDefined();
      expect(result.message.text).toBeDefined();
      expect(Array.isArray(result.locations)).toBe(true);
    });

    it("maps evidence path to artifactLocation.uri", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "T1",
            summary: "S1",
            evidence: [
              { id: "e1", path: "src/auth/guard.ts", startLine: 15, kind: "text", excerptHash: "h" },
            ],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe(
        "src/auth/guard.ts"
      );
    });

    it("maps evidence startLine to region.startLine", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "T1",
            summary: "S1",
            evidence: [{ id: "e1", path: "file.ts", startLine: 42, kind: "text", excerptHash: "h" }],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].results[0].locations[0].physicalLocation.region?.startLine).toBe(42);
    });

    it("defaults startLine to 1 when not specified", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "T1",
            summary: "S1",
            evidence: [{ id: "e1", path: "file.ts", kind: "text", excerptHash: "h" }],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].results[0].locations[0].physicalLocation.region?.startLine).toBe(1);
    });

    it("includes all evidence locations", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "T1",
            summary: "S1",
            evidence: [
              { id: "e1", path: "src/file1.ts", startLine: 10, kind: "text", excerptHash: "h" },
              { id: "e2", path: "src/file2.ts", startLine: 20, kind: "text", excerptHash: "h" },
            ],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].results[0].locations.length).toBe(2);
    });
  });

  describe("Rules collection", () => {
    it("collects unique rules from findings", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "RULE_A",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "Rule A Title",
            summary: "S1",
            evidence: [],
          },
          {
            id: "f2",
            ruleId: "RULE_A",
            category: "security",
            severity: "medium",
            confidence: 0.7,
            title: "Rule A Again",
            summary: "S2",
            evidence: [],
          },
          {
            id: "f3",
            ruleId: "RULE_B",
            category: "security",
            severity: "low",
            confidence: 0.6,
            title: "Rule B Title",
            summary: "S3",
            evidence: [],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      const ruleIds = sarif.runs[0].tool.driver.rules.map((r) => r.id);
      expect(ruleIds).toContain("RULE_A");
      expect(ruleIds).toContain("RULE_B");
      expect(ruleIds.length).toBe(2);
    });

    it("has shortDescription from finding title", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "RULE_XYZ",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "Security vulnerability detected",
            summary: "S1",
            evidence: [],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      const rule = sarif.runs[0].tool.driver.rules.find((r) => r.id === "RULE_XYZ");
      expect(rule?.shortDescription?.text).toBe("Security vulnerability detected");
    });

    it("has defaultConfiguration with level", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "T1",
            summary: "S1",
            evidence: [],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      for (const rule of sarif.runs[0].tool.driver.rules) {
        expect(rule.defaultConfiguration).toBeDefined();
        expect(rule.defaultConfiguration?.level).toBeDefined();
      }
    });
  });

  describe("writeSarifReport", () => {
    it("writes SARIF file to output directory", () => {
      const findings = createMockFindings();
      const filePath = writeSarifReport(tempOutDir, findings);

      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toBe(path.join(tempOutDir, "results.sarif"));
    });

    it("writes SARIF with custom filename", () => {
      const findings = createMockFindings();
      const filePath = writeSarifReport(tempOutDir, findings, { filename: "custom.sarif" });

      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toBe(path.join(tempOutDir, "custom.sarif"));
    });

    it("written SARIF is valid JSON", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "T1",
            summary: "S1",
            evidence: [],
          },
        ],
      });
      writeSarifReport(tempOutDir, findings);

      const content = readFileSync(path.join(tempOutDir, "results.sarif"), "utf8");
      const parsed = JSON.parse(content);

      expect(parsed.$schema).toBe(SARIF_SCHEMA_URL);
      expect(parsed.version).toBe("2.1.0");
    });

    it("written SARIF has newline at end", () => {
      const findings = createMockFindings();
      writeSarifReport(tempOutDir, findings);

      const content = readFileSync(path.join(tempOutDir, "results.sarif"), "utf8");
      expect(content.endsWith("\n")).toBe(true);
    });
  });

  describe("generateFullSarifReport", () => {
    it("generates SARIF with all artifacts", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "T1",
            summary: "S1",
            evidence: [],
          },
        ],
      });
      const riskRegister = createMockRiskRegister({
        risks: [
          {
            id: "risk-001",
            title: "Test Risk",
            severity: "high",
            likelihood: "medium",
            impact: ["Test impact"],
            confidence: 0.8,
            sourceFindingIds: ["f1"],
            evidence: [],
            recommendedActions: ["Action 1"],
          },
        ],
      });
      const testSeeds = createMockTestSeeds({
        seeds: [
          {
            id: "seed-001",
            title: "Test Seed",
            category: "positive",
            target: "target.ts",
            description: "Test description",
            inputs: {},
            expectedOutcome: "Pass",
            priority: "high",
          },
        ],
      });

      const sarif = generateFullSarifReport(findings, riskRegister, testSeeds);

      expect(sarif.runs[0].properties?.riskCount).toBe(1);
      expect(sarif.runs[0].properties?.testSeedCount).toBe(1);
    });

    it("generates SARIF with findings only", () => {
      const findings = createMockFindings();
      const sarif = generateFullSarifReport(findings);

      expect(sarif.$schema).toBe(SARIF_SCHEMA_URL);
      expect(sarif.runs[0].properties?.riskCount).toBeUndefined();
      expect(sarif.runs[0].properties?.testSeedCount).toBeUndefined();
    });
  });

  describe("Multiple findings handling", () => {
    it("generates correct number of results", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "T1",
            summary: "S1",
            evidence: [],
          },
          {
            id: "f2",
            ruleId: "R2",
            category: "auth",
            severity: "medium",
            confidence: 0.7,
            title: "T2",
            summary: "S2",
            evidence: [],
          },
          {
            id: "f3",
            ruleId: "R3",
            category: "validation",
            severity: "low",
            confidence: 0.6,
            title: "T3",
            summary: "S3",
            evidence: [],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].results.length).toBe(3);
    });

    it("preserves finding ruleId in results", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "CLIENT_TRUSTED_PRICE",
            category: "payment",
            severity: "critical",
            confidence: 0.9,
            title: "T1",
            summary: "S1",
            evidence: [],
          },
          {
            id: "f2",
            ruleId: "WEAK_AUTH_GUARD",
            category: "auth",
            severity: "high",
            confidence: 0.8,
            title: "T2",
            summary: "S2",
            evidence: [],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      const ruleIdsInResults = sarif.runs[0].results.map((r) => r.ruleId);
      expect(ruleIdsInResults).toContain("CLIENT_TRUSTED_PRICE");
      expect(ruleIdsInResults).toContain("WEAK_AUTH_GUARD");
    });
  });

  describe("Message structure", () => {
    it("uses finding summary as result message text", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "T1",
            summary: "Authentication weakness allows unauthorized access",
            evidence: [],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].results[0].message.text).toBe("Authentication weakness allows unauthorized access");
    });

    it("includes markdown format in message", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "Test Title",
            summary: "Test summary",
            evidence: [],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].results[0].message.markdown).toContain("Test Title");
    });
  });

  describe("Run properties", () => {
    it("includes run metadata in properties", () => {
      const findings = createMockFindings({
        run_id: "custom-run-123",
        repo: { root: "/custom/repo" },
        completeness: "partial",
      });
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].properties?.runId).toBe("custom-run-123");
      expect(sarif.runs[0].properties?.repoRoot).toBe("/custom/repo");
      expect(sarif.runs[0].properties?.completeness).toBe("partial");
    });

    it("includes invocation information", () => {
      const findings = createMockFindings({
        generated_at: "2025-01-15T10:30:00Z",
      });
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].invocations?.[0]?.executionSuccessful).toBe(true);
      expect(sarif.runs[0].invocations?.[0]?.startTimeUtc).toBe("2025-01-15T10:30:00Z");
    });

    it("includes artifacts from evidence paths", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "T1",
            summary: "S1",
            evidence: [
              { id: "e1", path: "src/file1.ts", startLine: 10, kind: "text" },
              { id: "e2", path: "src/file2.ts", startLine: 20, kind: "text" },
            ],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].artifacts?.length).toBe(2);
      const artifactUris = sarif.runs[0].artifacts?.map((a) => a.location.uri);
      expect(artifactUris).toContain("src/file1.ts");
      expect(artifactUris).toContain("src/file2.ts");
    });
  });

  describe("Edge cases", () => {
    it("handles findings with no evidence", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "T1",
            summary: "S1",
            evidence: [],
          },
        ],
      });
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].results[0].locations.length).toBe(0);
    });

    it("handles all severity levels", () => {
      const severities: Severity[] = ["critical", "high", "medium", "low"];
      const findings = createMockFindings({
        findings: severities.map((severity, i) => ({
          id: `f${i}`,
          ruleId: `R${i}`,
          category: "security",
          severity,
          confidence: 0.75,
          title: `${severity} finding`,
          summary: `Test ${severity}`,
          evidence: [],
        })),
      });
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].results.length).toBe(4);
      expect(sarif.runs[0].results[0].level).toBe("error");
      expect(sarif.runs[0].results[1].level).toBe("error");
      expect(sarif.runs[0].results[2].level).toBe("warning");
      expect(sarif.runs[0].results[3].level).toBe("note");
    });

    it("handles large findings dataset", () => {
      const findings = createMockFindings({
        findings: Array.from({ length: 100 }, (_, i) => ({
          id: `f${i}`,
          ruleId: `RULE_${i % 10}`,
          category: "security",
          severity: ["critical", "high", "medium", "low"][i % 4] as Severity,
          confidence: 0.75,
          title: `Finding ${i}`,
          summary: `Summary ${i}`,
          evidence: [{ id: `e${i}`, path: `src/file${i % 20}.ts`, startLine: i + 1, kind: "text" }],
        })),
      });
      const sarif = generateSarifReport(findings);

      expect(sarif.runs[0].results.length).toBe(100);
      expect(sarif.runs[0].tool.driver.rules.length).toBe(10);
    });
  });
});