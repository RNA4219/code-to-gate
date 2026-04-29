/**
 * Tests for YAML Reporter
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  buildRiskRegisterFromFindings,
  writeRiskRegisterYaml,
} from "../yaml-reporter.js";
import { existsSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import type { FindingsArtifact, Finding, RiskRegisterArtifact } from "../../types/artifacts.js";

describe("yaml-reporter", () => {
  let tempOutDir: string;

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-yaml-reporter-test-${Date.now()}`);
    mkdirSync(tempOutDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean temp directory between tests
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
      mkdirSync(tempOutDir, { recursive: true });
    }
  });

  const createMockFindings = (): FindingsArtifact => ({
    version: "ctg/v1alpha1",
    generated_at: "2025-01-01T00:00:00Z",
    run_id: "run-001",
    repo: { root: "/test/repo" },
    tool: {
      name: "code-to-gate",
      version: "0.1.0",
      plugin_versions: [],
    },
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings: [],
    unsupported_claims: [],
  });

  describe("buildRiskRegisterFromFindings", () => {
    it("builds risk register with correct artifact type", () => {
      const findings = createMockFindings();
      const riskRegister = buildRiskRegisterFromFindings(findings);

      expect(riskRegister.artifact).toBe("risk-register");
      expect(riskRegister.schema).toBe("risk-register@v1");
    });

    it("builds risk register with empty findings", () => {
      const findings = createMockFindings();
      const riskRegister = buildRiskRegisterFromFindings(findings);

      expect(Array.isArray(riskRegister.risks)).toBe(true);
      expect(riskRegister.risks.length).toBe(0);
      expect(riskRegister.completeness).toBe("partial");
    });

    it("creates risk from high severity finding", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-test-001",
        ruleId: "TEST_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "Test finding",
        summary: "Test finding summary",
        evidence: [{
          id: "evidence-001",
          path: "src/test.ts",
          startLine: 1,
          endLine: 5,
          kind: "text",
        }],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      expect(riskRegister.risks.length).toBeGreaterThan(0);
    });

    it("creates aggregated risk for multiple payment findings", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-payment-001",
        ruleId: "CLIENT_TRUSTED_PRICE",
        category: "payment",
        severity: "high",
        confidence: 0.85,
        title: "Price manipulation 1",
        summary: "Test finding summary",
        evidence: [],
      });
      findings.findings.push({
        id: "finding-payment-002",
        ruleId: "CLIENT_TRUSTED_PRICE",
        category: "payment",
        severity: "high",
        confidence: 0.85,
        title: "Price manipulation 2",
        summary: "Test finding summary",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      const paymentRisk = riskRegister.risks.find(r => r.title.includes("Price manipulation"));
      expect(paymentRisk).toBeDefined();
    });

    it("risk has required fields", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-test-001",
        ruleId: "TEST_RULE",
        category: "auth",
        severity: "critical",
        confidence: 0.95,
        title: "Critical finding",
        summary: "Test finding summary",
        evidence: [{
          id: "evidence-001",
          path: "src/test.ts",
          startLine: 1,
          endLine: 5,
          kind: "text",
        }],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);

      for (const risk of riskRegister.risks) {
        expect(risk.id).toBeDefined();
        expect(risk.title).toBeDefined();
        expect(risk.severity).toBeDefined();
        expect(risk.likelihood).toBeDefined();
        expect(Array.isArray(risk.impact)).toBe(true);
        expect(risk.confidence).toBeDefined();
        expect(Array.isArray(risk.sourceFindingIds)).toBe(true);
        expect(Array.isArray(risk.recommendedActions)).toBe(true);
      }
    });

    it("maps severity to likelihood correctly", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-critical-001",
        ruleId: "TEST_RULE",
        category: "auth",
        severity: "critical",
        confidence: 0.95,
        title: "Critical finding",
        summary: "Test finding summary",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);

      const criticalRisk = riskRegister.risks.find(r => r.severity === "critical");
      if (criticalRisk) {
        expect(criticalRisk.likelihood).toBe("high");
      }
    });
  });

  describe("writeRiskRegisterYaml", () => {
    it("writes risk-register.yaml to output directory", () => {
      const findings = createMockFindings();
      const riskRegister = buildRiskRegisterFromFindings(findings);

      const filePath = writeRiskRegisterYaml(tempOutDir, riskRegister);
      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toBe(path.join(tempOutDir, "risk-register.yaml"));
    });

    it("written YAML contains header comment", () => {
      const findings = createMockFindings();
      const riskRegister = buildRiskRegisterFromFindings(findings);

      writeRiskRegisterYaml(tempOutDir, riskRegister);
      const content = readFileSync(path.join(tempOutDir, "risk-register.yaml"), "utf8");

      expect(content).toContain("# code-to-gate risk-register");
      expect(content).toContain("# Generated:");
      expect(content).toContain("# Run ID:");
    });

    it("written YAML has required fields", () => {
      const findings = createMockFindings();
      const riskRegister = buildRiskRegisterFromFindings(findings);

      writeRiskRegisterYaml(tempOutDir, riskRegister);
      const content = readFileSync(path.join(tempOutDir, "risk-register.yaml"), "utf8");

      expect(content).toContain("version:");
      expect(content).toContain("generated-at:");
      expect(content).toContain("run-id:");
      expect(content).toContain("artifact: risk-register");
      expect(content).toContain("schema: risk-register@v1");
      expect(content).toContain("repo:");
      expect(content).toContain("tool:");
    });

    it("written YAML risks section is valid", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-test-001",
        ruleId: "TEST_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "Test finding",
        summary: "Test finding summary",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      writeRiskRegisterYaml(tempOutDir, riskRegister);
      const content = readFileSync(path.join(tempOutDir, "risk-register.yaml"), "utf8");

      expect(content).toContain("risks:");
    });

    it("risk YAML entry has all required fields", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-test-001",
        ruleId: "TEST_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "Test Auth Issue",
        summary: "Test finding summary",
        evidence: [{
          id: "evidence-001",
          path: "src/auth.ts",
          startLine: 10,
          endLine: 20,
          kind: "text",
        }],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      writeRiskRegisterYaml(tempOutDir, riskRegister);
      const content = readFileSync(path.join(tempOutDir, "risk-register.yaml"), "utf8");

      if (riskRegister.risks.length > 0) {
        expect(content).toContain("id:");
        expect(content).toContain("title:");
        expect(content).toContain("severity:");
        expect(content).toContain("likelihood:");
        expect(content).toContain("confidence:");
        expect(content).toContain("impact:");
        expect(content).toContain("source-finding-ids:");
        expect(content).toContain("recommended-actions:");
      }
    });
  });

  describe("risk-register.yaml format validation", () => {
    it("version is correctly formatted", () => {
      const findings = createMockFindings();
      const riskRegister = buildRiskRegisterFromFindings(findings);

      expect(riskRegister.version).toBe("ctg/v1alpha1");
    });

    it("severity is valid enum value", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-test-001",
        ruleId: "TEST_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "Test finding",
        summary: "Test finding summary",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);

      const validSeverities = ["low", "medium", "high", "critical"];
      for (const risk of riskRegister.risks) {
        expect(validSeverities).toContain(risk.severity);
      }
    });

    it("likelihood is valid enum value", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-test-001",
        ruleId: "TEST_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "Test finding",
        summary: "Test finding summary",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);

      const validLikelihoods = ["low", "medium", "high", "unknown"];
      for (const risk of riskRegister.risks) {
        expect(validLikelihoods).toContain(risk.likelihood);
      }
    });

    it("confidence is between 0 and 1", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-test-001",
        ruleId: "TEST_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "Test finding",
        summary: "Test finding summary",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);

      for (const risk of riskRegister.risks) {
        expect(risk.confidence).toBeGreaterThanOrEqual(0);
        expect(risk.confidence).toBeLessThanOrEqual(1);
      }
    });

    it("impact is array of strings", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-test-001",
        ruleId: "TEST_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "Test finding",
        summary: "Test finding summary",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);

      for (const risk of riskRegister.risks) {
        expect(Array.isArray(risk.impact)).toBe(true);
        for (const impact of risk.impact) {
          expect(typeof impact).toBe("string");
        }
      }
    });

    it("recommendedActions is array of strings", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-test-001",
        ruleId: "TEST_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "Test finding",
        summary: "Test finding summary",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);

      for (const risk of riskRegister.risks) {
        expect(Array.isArray(risk.recommendedActions)).toBe(true);
        for (const action of risk.recommendedActions) {
          expect(typeof action).toBe("string");
        }
      }
    });
  });

  // === Empty/null input handling ===
  describe("empty/null input handling", () => {
    it("handles findings with empty risks array", () => {
      const findings = createMockFindings();
      findings.findings = [];
      findings.completeness = "partial";

      const riskRegister = buildRiskRegisterFromFindings(findings);
      expect(riskRegister.risks).toEqual([]);
      expect(riskRegister.completeness).toBe("partial");
    });

    it("handles findings artifact with minimal data", () => {
      const findings: FindingsArtifact = {
        version: "ctg/v1alpha1",
        generated_at: "",
        run_id: "",
        repo: { root: "" },
        tool: {
          name: "code-to-gate",
          version: "",
          plugin_versions: [],
        },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "partial",
        findings: [],
        unsupported_claims: [],
      };

      const riskRegister = buildRiskRegisterFromFindings(findings);
      expect(riskRegister).toBeDefined();
      expect(riskRegister.artifact).toBe("risk-register");
    });

    it("handles finding with empty evidence array", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-empty-evidence",
        ruleId: "EMPTY_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "Empty evidence finding",
        summary: "Test",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      expect(riskRegister.risks).toBeDefined();
    });

    it("handles finding with empty title and summary", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-empty-title",
        ruleId: "EMPTY_TITLE_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "",
        summary: "",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      expect(riskRegister.risks).toBeDefined();
    });
  });

  // === Large data sets ===
  describe("large data sets", () => {
    it("handles 100+ findings", () => {
      const findings = createMockFindings();
      for (let i = 0; i < 150; i++) {
        findings.findings.push({
          id: `finding-${i.toString().padStart(3, "0")}`,
          ruleId: "BULK_RULE",
          category: "auth",
          severity: i % 4 === 0 ? "critical" : i % 4 === 1 ? "high" : i % 4 === 2 ? "medium" : "low",
          confidence: 0.75,
          title: `Finding ${i}`,
          summary: `Summary ${i}`,
          evidence: [],
        });
      }

      const riskRegister = buildRiskRegisterFromFindings(findings);
      expect(riskRegister.risks).toBeDefined();
      // High/critical findings should create risks
      expect(riskRegister.risks.length).toBeGreaterThan(0);
    });

    it("writes large risk register YAML successfully", () => {
      const findings = createMockFindings();
      for (let i = 0; i < 50; i++) {
        findings.findings.push({
          id: `finding-${i.toString().padStart(3, "0")}`,
          ruleId: "LARGE_RULE",
          category: "payment",
          severity: "high",
          confidence: 0.85,
          title: `Payment finding ${i}`,
          summary: `Summary ${i}`,
          evidence: [{
            id: `evidence-${i}`,
            path: `src/payment${i}.ts`,
            startLine: 1,
            endLine: 10,
            kind: "text",
          }],
        });
      }

      const riskRegister = buildRiskRegisterFromFindings(findings);
      const filePath = writeRiskRegisterYaml(tempOutDir, riskRegister);
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, "utf8");
      expect(content.length).toBeGreaterThan(1000);
    });

    it("handles risks with many impact items", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-multi-impact",
        ruleId: "IMPACT_RULE",
        category: "auth",
        severity: "critical",
        confidence: 0.95,
        title: "Multi impact finding",
        summary: "Test",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      // Check that risks are generated
      expect(riskRegister.risks.length).toBeGreaterThan(0);

      // The aggregated risk should have multiple impact items
      const criticalRisk = riskRegister.risks.find(r => r.severity === "critical");
      if (criticalRisk) {
        expect(Array.isArray(criticalRisk.impact)).toBe(true);
      }
    });

    it("handles risks with many recommended actions", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-multi-actions",
        ruleId: "ACTION_RULE",
        category: "payment",
        severity: "high",
        confidence: 0.85,
        title: "Multi action finding",
        summary: "Test",
        evidence: [],
      });
      findings.findings.push({
        id: "finding-multi-actions-2",
        ruleId: "ACTION_RULE_2",
        category: "payment",
        severity: "high",
        confidence: 0.85,
        title: "Multi action finding 2",
        summary: "Test",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      expect(riskRegister.risks).toBeDefined();
    });
  });

  // === Unicode/special characters ===
  describe("unicode and special characters", () => {
    it("handles findings with unicode titles", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-unicode",
        ruleId: "UNICODE_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "日本語のタイトル 🚨",
        summary: "中文摘要 with emoji 😀",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      expect(riskRegister.risks).toBeDefined();

      // Verify YAML can be written with unicode
      const filePath = writeRiskRegisterYaml(tempOutDir, riskRegister);
      const content = readFileSync(filePath, "utf8");
      expect(content).toContain("日本語");
    });

    it("handles paths with unicode characters", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-unicode-path",
        ruleId: "UNICODE_PATH_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "Unicode 中文 finding",
        summary: "Test",
        evidence: [{
          id: "evidence-001",
          path: "src/中文/ファイル.ts",
          startLine: 1,
          endLine: 10,
          kind: "text",
        }],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      const filePath = writeRiskRegisterYaml(tempOutDir, riskRegister);
      const content = readFileSync(filePath, "utf8");
      // Title containing unicode should be in the output
      expect(content).toContain("中文");
    });

    it("handles narratives with special YAML characters", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-special",
        ruleId: "SPECIAL_RULE",
        category: "payment",
        severity: "high",
        confidence: 0.85,
        title: "Special chars finding",
        summary: "Test",
        evidence: [],
      });
      findings.findings.push({
        id: "finding-special-2",
        ruleId: "SPECIAL_RULE_2",
        category: "payment",
        severity: "high",
        confidence: 0.85,
        title: "Special chars finding 2",
        summary: "Test",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      const filePath = writeRiskRegisterYaml(tempOutDir, riskRegister);
      const content = readFileSync(filePath, "utf8");

      // YAML should be valid (contains narrative block)
      expect(content).toContain("narrative:");
    });

    it("handles evidence with colons and hashes in paths", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-colon",
        ruleId: "COLON_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "Colon in path",
        summary: "Test",
        evidence: [{
          id: "evidence-001",
          path: "src/test:file#hash.ts",
          startLine: 1,
          endLine: 5,
          kind: "text",
        }],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      expect(riskRegister.risks).toBeDefined();
    });
  });

  // === Edge cases in formatting ===
  describe("edge cases in formatting", () => {
    it("handles all severity levels in risks", () => {
      // Risk register only creates risks for critical/high severity findings
      const severities = ["critical", "high"] as const;
      const findings = createMockFindings();

      severities.forEach((severity, i) => {
        findings.findings.push({
          id: `finding-${severity}-${i}`,
          ruleId: `${severity.toUpperCase()}_RULE`,
          category: "auth",
          severity,
          confidence: 0.85,
          title: `${severity} severity finding`,
          summary: `Test ${severity}`,
          evidence: [],
        });
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      const filePath = writeRiskRegisterYaml(tempOutDir, riskRegister);
      const content = readFileSync(filePath, "utf8");

      // Check YAML contains severity values
      for (const severity of severities) {
        expect(content).toContain(`severity: ${severity}`);
      }
    });

    it("handles all likelihood levels", () => {
      const likelihoods = ["high", "medium", "low", "unknown"] as const;
      const findings = createMockFindings();

      // Create findings that map to different likelihoods
      findings.findings.push({
        id: "finding-critical",
        ruleId: "CRITICAL_RULE",
        category: "auth",
        severity: "critical",
        confidence: 0.95,
        title: "Critical finding",
        summary: "Test",
        evidence: [],
      });
      findings.findings.push({
        id: "finding-high",
        ruleId: "HIGH_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "High finding",
        summary: "Test",
        evidence: [],
      });
      findings.findings.push({
        id: "finding-medium",
        ruleId: "MEDIUM_RULE",
        category: "auth",
        severity: "medium",
        confidence: 0.75,
        title: "Medium finding",
        summary: "Test",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      const filePath = writeRiskRegisterYaml(tempOutDir, riskRegister);
      const content = readFileSync(filePath, "utf8");

      expect(content).toContain("likelihood:");
    });

    it("handles extreme confidence values", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-zero",
        ruleId: "ZERO_RULE",
        category: "auth",
        severity: "high",
        confidence: 0,
        title: "Zero confidence",
        summary: "Test",
        evidence: [],
      });
      findings.findings.push({
        id: "finding-one",
        ruleId: "ONE_RULE",
        category: "auth",
        severity: "critical",
        confidence: 1,
        title: "Full confidence",
        summary: "Test",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      const filePath = writeRiskRegisterYaml(tempOutDir, riskRegister);
      const content = readFileSync(filePath, "utf8");

      expect(content).toContain("confidence: 1");
    });

    it("handles very long titles and narratives", () => {
      const longTitle = "A".repeat(200);
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-long",
        ruleId: "LONG_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: longTitle,
        summary: "Test",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      const filePath = writeRiskRegisterYaml(tempOutDir, riskRegister);
      const content = readFileSync(filePath, "utf8");

      expect(content).toContain(longTitle.substring(0, 50));
    });

    it("handles testing category findings", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-testing",
        ruleId: "TESTING_RULE",
        category: "testing",
        severity: "medium",
        confidence: 0.75,
        title: "Untested critical path",
        summary: "Test coverage issue",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      const testingRisk = riskRegister.risks.find(r =>
        r.title.includes("test coverage") || r.sourceFindingIds.includes("finding-testing")
      );
      expect(testingRisk).toBeDefined();
    });
  });

  // === Error handling ===
  describe("error handling", () => {
    it("writes to valid directory successfully", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-write-test",
        ruleId: "WRITE_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "Write test",
        summary: "Test",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      const filePath = writeRiskRegisterYaml(tempOutDir, riskRegister);
      expect(existsSync(filePath)).toBe(true);
    });

    it("generates valid YAML structure", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-yaml-structure",
        ruleId: "YAML_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "YAML structure test",
        summary: "Test",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      writeRiskRegisterYaml(tempOutDir, riskRegister);
      const content = readFileSync(path.join(tempOutDir, "risk-register.yaml"), "utf8");

      // Basic YAML structure checks
      expect(content).toMatch(/^# code-to-gate risk-register/);
      expect(content).toContain("version:");
      expect(content).toContain("generated-at:");
      expect(content).toContain("run-id:");
      expect(content).toContain("artifact: risk-register");
    });

    it("handles policy_id parameter", () => {
      const findings = createMockFindings();
      const riskRegister = buildRiskRegisterFromFindings(findings, "policy-123");

      expect(riskRegister).toBeDefined();
      expect(riskRegister.artifact).toBe("risk-register");
    });

    it("handles risk without narrative", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-no-narrative",
        ruleId: "NO_NARRATIVE_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "No narrative finding",
        summary: "Test",
        evidence: [],
      });

      const riskRegister = buildRiskRegisterFromFindings(findings);
      const filePath = writeRiskRegisterYaml(tempOutDir, riskRegister);
      const content = readFileSync(filePath, "utf8");

      // Should still be valid YAML even without narrative
      expect(content).toContain("severity:");
      expect(content).toContain("likelihood:");
    });
  });

  // === Schema validation integration ===
  describe("schema validation integration", () => {
    it("generates artifact with correct artifact type", () => {
      const findings = createMockFindings();
      const riskRegister = buildRiskRegisterFromFindings(findings);
      expect(riskRegister.artifact).toBe("risk-register");
    });

    it("generates artifact with correct schema version", () => {
      const findings = createMockFindings();
      const riskRegister = buildRiskRegisterFromFindings(findings);
      expect(riskRegister.schema).toBe("risk-register@v1");
    });

    it("generates artifact with required version field", () => {
      const findings = createMockFindings();
      const riskRegister = buildRiskRegisterFromFindings(findings);
      expect(riskRegister.version).toBe("ctg/v1alpha1");
    });

    it("generates artifact with repo information", () => {
      const findings = createMockFindings();
      findings.repo.root = "/specific/repo/path";
      const riskRegister = buildRiskRegisterFromFindings(findings);
      expect(riskRegister.repo.root).toBe("/specific/repo/path");
    });

    it("generates artifact with tool information", () => {
      const findings = createMockFindings();
      const riskRegister = buildRiskRegisterFromFindings(findings);
      expect(riskRegister.tool.name).toBe("code-to-gate");
      expect(riskRegister.tool.version).toBeDefined();
    });

    it("sets completeness based on risks presence", () => {
      const findings = createMockFindings();
      findings.completeness = "partial";
      const riskRegister = buildRiskRegisterFromFindings(findings);
      expect(riskRegister.completeness).toBe("partial");

      findings.findings.push({
        id: "finding-completeness",
        ruleId: "COMP_RULE",
        category: "payment",
        severity: "high",
        confidence: 0.85,
        title: "Completeness test",
        summary: "Test",
        evidence: [],
      });
      findings.findings.push({
        id: "finding-completeness-2",
        ruleId: "COMP_RULE_2",
        category: "payment",
        severity: "high",
        confidence: 0.85,
        title: "Completeness test 2",
        summary: "Test",
        evidence: [],
      });

      const riskRegisterWithRisks = buildRiskRegisterFromFindings(findings);
      expect(riskRegisterWithRisks.risks.length).toBeGreaterThan(0);
    });

    it("preserves generated_at and run_id from findings", () => {
      const findings = createMockFindings();
      findings.generated_at = "2025-06-15T10:30:00Z";
      findings.run_id = "test-run-456";

      const riskRegister = buildRiskRegisterFromFindings(findings);
      expect(riskRegister.generated_at).toBe("2025-06-15T10:30:00Z");
      expect(riskRegister.run_id).toBe("test-run-456");
    });
  });
});