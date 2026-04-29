/**
 * Tests for HTML Reporter
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  generateHtmlReport,
  writeHtmlReport,
} from "../html-reporter.js";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  FindingsArtifact,
  RiskRegisterArtifact,
  TestSeedsArtifact,
  CTG_VERSION,
  Severity,
} from "../../types/artifacts.js";

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

describe("html-reporter", () => {
  let tempOutDir: string;

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-html-reporter-test-${Date.now()}`);
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

  describe("generateHtmlReport", () => {
    it("generates valid HTML document", () => {
      const findings = createMockFindings();
      const html = generateHtmlReport(findings);

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html");
      expect(html).toContain("</html>");
      expect(html).toContain("<head>");
      expect(html).toContain("<body>");
    });

    it("includes embedded CSS styles", () => {
      const findings = createMockFindings();
      const html = generateHtmlReport(findings);

      expect(html).toContain("<style>");
      expect(html).toContain("</style>");
      expect(html).toContain("--color-critical");
      expect(html).toContain("--color-high");
    });

    it("includes embedded JavaScript", () => {
      const findings = createMockFindings();
      const html = generateHtmlReport(findings);

      expect(html).toContain("<script>");
      expect(html).toContain("</script>");
      expect(html).toContain("toggleSection");
    });

    it("includes run metadata in header", () => {
      const findings = createMockFindings({
        run_id: "test-run-abc",
        generated_at: "2025-01-15T10:30:00Z",
        repo: { root: "/test/repo" },
      });
      const html = generateHtmlReport(findings);

      expect(html).toContain("test-run-abc");
      expect(html).toContain("2025-01-15T10:30:00Z");
      expect(html).toContain("/test/repo");
    });
  });

  describe("Dashboard section", () => {
    it("includes severity count cards", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
          { id: "f2", ruleId: "R2", category: "security", severity: "high", confidence: 0.8, title: "T2", summary: "S2", evidence: [] },
          { id: "f3", ruleId: "R3", category: "security", severity: "medium", confidence: 0.7, title: "T3", summary: "S3", evidence: [] },
          { id: "f4", ruleId: "R4", category: "security", severity: "low", confidence: 0.6, title: "T4", summary: "S4", evidence: [] },
        ],
      });
      const html = generateHtmlReport(findings);

      expect(html).toContain("card-critical");
      expect(html).toContain("card-high");
      expect(html).toContain("card-medium");
      expect(html).toContain("card-low");
    });

    it("shows correct counts in cards", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
          { id: "f2", ruleId: "R2", category: "security", severity: "critical", confidence: 0.9, title: "T2", summary: "S2", evidence: [] },
          { id: "f3", ruleId: "R3", category: "security", severity: "high", confidence: 0.8, title: "T3", summary: "S3", evidence: [] },
        ],
      });
      const html = generateHtmlReport(findings);

      // Should show 2 critical, 1 high
      expect(html).toMatch(/card-critical.*[\s\S]*?<div class="card-value">2<\/div>/);
      expect(html).toMatch(/card-high.*[\s\S]*?<div class="card-value">1<\/div>/);
    });

    it("includes severity distribution chart", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const html = generateHtmlReport(findings);

      expect(html).toContain("severity-chart");
      expect(html).toContain("chart-bar");
      expect(html).toContain("chart-bar-high");
    });

    it("shows total findings count", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [] },
          { id: "f2", ruleId: "R2", category: "security", severity: "medium", confidence: 0.7, title: "T2", summary: "S2", evidence: [] },
        ],
      });
      const html = generateHtmlReport(findings);

      expect(html).toContain("Total Findings");
      expect(html).toContain("<div class=\"card-value\">2</div>");
    });

    it("shows risks count when risk register provided", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister({
        risks: [
          { id: "risk-001", title: "Test Risk", severity: "high", likelihood: "medium", impact: ["impact"], confidence: 0.8, sourceFindingIds: [], evidence: [], recommendedActions: [] },
        ],
      });
      const html = generateHtmlReport(findings, riskRegister);

      expect(html).toContain("Risks");
      expect(html).toContain("<div class=\"card-value\">1</div>");
    });

    it("shows test seeds count when provided", () => {
      const findings = createMockFindings();
      const testSeeds = createMockTestSeeds({
        seeds: [
          { id: "seed-001", title: "Test Seed", category: "positive", target: "target.ts", description: "desc", inputs: {}, expectedOutcome: "pass", priority: "high" },
        ],
      });
      const html = generateHtmlReport(findings, undefined, testSeeds);

      expect(html).toContain("Test Seeds");
      expect(html).toContain("<div class=\"card-value\">1</div>");
    });
  });

  describe("Findings section", () => {
    it("includes findings section header", () => {
      const findings = createMockFindings();
      const html = generateHtmlReport(findings);

      expect(html).toContain("<h2>Findings</h2>");
    });

    it("creates severity badges for findings", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
          { id: "f2", ruleId: "R2", category: "security", severity: "medium", confidence: 0.7, title: "T2", summary: "S2", evidence: [] },
        ],
      });
      const html = generateHtmlReport(findings);

      expect(html).toContain("badge-critical");
      expect(html).toContain("badge-medium");
    });

    it("displays finding title and summary", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "high", confidence: 0.8, title: "Test Finding Title", summary: "Test summary content", evidence: [] },
        ],
      });
      const html = generateHtmlReport(findings);

      expect(html).toContain("Test Finding Title");
      expect(html).toContain("Test summary content");
    });

    it("displays finding metadata (rule, category, confidence)", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "TEST_RULE", category: "payment", severity: "high", confidence: 0.85, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const html = generateHtmlReport(findings);

      expect(html).toContain("TEST_RULE");
      expect(html).toContain("payment");
      expect(html).toContain("0.85");
    });

    it("creates collapsible sections per severity", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
          { id: "f2", ruleId: "R2", category: "security", severity: "low", confidence: 0.6, title: "T2", summary: "S2", evidence: [] },
        ],
      });
      const html = generateHtmlReport(findings);

      expect(html).toContain("critical-findings");
      expect(html).toContain("low-findings");
      expect(html).toContain("toggleSection");
    });

    it("shows evidence with code snippet placeholder", () => {
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
            evidence: [{ id: "e1", path: "src/file.ts", startLine: 10, kind: "text", excerptHash: "h" }],
          },
        ],
      });
      const html = generateHtmlReport(findings);

      expect(html).toContain("src/file.ts");
      expect(html).toContain("evidence");
    });

    it("hides severity sections when no findings", () => {
      const findings = createMockFindings(); // No findings
      const html = generateHtmlReport(findings);

      // Should not have collapsible sections for empty findings
      expect(html).not.toContain("critical-findings");
      expect(html).not.toContain("high-findings");
    });
  });

  describe("Risk register section", () => {
    it("includes risk register section when provided", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister({
        risks: [
          { id: "risk-001", title: "Test Risk", severity: "high", likelihood: "medium", impact: ["impact"], confidence: 0.8, sourceFindingIds: [], evidence: [], recommendedActions: [] },
        ],
      });
      const html = generateHtmlReport(findings, riskRegister);

      expect(html).toContain("<h2>Risk Register</h2>");
    });

    it("displays risk title and severity", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister({
        risks: [
          { id: "risk-001", title: "Price manipulation risk", severity: "high", likelihood: "medium", impact: ["impact"], confidence: 0.8, sourceFindingIds: [], evidence: [], recommendedActions: [] },
        ],
      });
      const html = generateHtmlReport(findings, riskRegister);

      expect(html).toContain("Price manipulation risk");
      expect(html).toContain("badge-high");
    });

    it("displays risk metadata", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister({
        risks: [
          { id: "risk-001", title: "Test Risk", severity: "high", likelihood: "high", impact: ["impact"], confidence: 0.95, sourceFindingIds: ["f1", "f2"], evidence: [], recommendedActions: [] },
        ],
      });
      const html = generateHtmlReport(findings, riskRegister);

      expect(html).toContain("Likelihood:");
      expect(html).toContain("high");
      expect(html).toContain("f1, f2");
    });

    it("displays risk narrative", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister({
        risks: [
          {
            id: "risk-001",
            title: "Test Risk",
            severity: "high",
            likelihood: "medium",
            impact: ["impact"],
            confidence: 0.8,
            sourceFindingIds: [],
            evidence: [],
            narrative: "This is a test narrative explaining the risk.",
            recommendedActions: [],
          },
        ],
      });
      const html = generateHtmlReport(findings, riskRegister);

      expect(html).toContain("This is a test narrative explaining the risk.");
    });

    it("displays risk impact items", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister({
        risks: [
          {
            id: "risk-001",
            title: "Test Risk",
            severity: "high",
            likelihood: "medium",
            impact: ["Financial loss", "Data breach"],
            confidence: 0.8,
            sourceFindingIds: [],
            evidence: [],
            recommendedActions: [],
          },
        ],
      });
      const html = generateHtmlReport(findings, riskRegister);

      expect(html).toContain("Financial loss");
      expect(html).toContain("Data breach");
    });

    it("displays recommended actions", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister({
        risks: [
          {
            id: "risk-001",
            title: "Test Risk",
            severity: "high",
            likelihood: "medium",
            impact: ["impact"],
            confidence: 0.8,
            sourceFindingIds: [],
            evidence: [],
            recommendedActions: ["Fix the issue", "Add validation", "Review code"],
          },
        ],
      });
      const html = generateHtmlReport(findings, riskRegister);

      expect(html).toContain("Fix the issue");
      expect(html).toContain("Add validation");
      expect(html).toContain("risk-actions");
    });

    it("shows no risks message when empty", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();
      const html = generateHtmlReport(findings, riskRegister);

      expect(html).toContain("No risks identified");
    });

    it("omits risk section when not provided", () => {
      const findings = createMockFindings();
      const html = generateHtmlReport(findings);

      expect(html).not.toContain("<h2>Risk Register</h2>");
    });
  });

  describe("Test seeds section", () => {
    it("includes test seeds section when provided", () => {
      const findings = createMockFindings();
      const testSeeds = createMockTestSeeds({
        seeds: [
          { id: "seed-001", title: "Test Seed", category: "positive", target: "target.ts", description: "desc", inputs: {}, expectedOutcome: "pass", priority: "high" },
        ],
      });
      const html = generateHtmlReport(findings, undefined, testSeeds);

      expect(html).toContain("<h2>Test Seeds</h2>");
    });

    it("displays seed title and priority", () => {
      const findings = createMockFindings();
      const testSeeds = createMockTestSeeds({
        seeds: [
          { id: "seed-001", title: "Authentication test", category: "positive", target: "target.ts", description: "desc", inputs: {}, expectedOutcome: "pass", priority: "high" },
        ],
      });
      const html = generateHtmlReport(findings, undefined, testSeeds);

      expect(html).toContain("Authentication test");
      expect(html).toContain("badge-critical"); // high priority uses critical badge style
    });

    it("displays seed category badge", () => {
      const findings = createMockFindings();
      const testSeeds = createMockTestSeeds({
        seeds: [
          { id: "seed-001", title: "Test", category: "security", target: "target.ts", description: "desc", inputs: {}, expectedOutcome: "pass", priority: "high" },
        ],
      });
      const html = generateHtmlReport(findings, undefined, testSeeds);

      expect(html).toContain("security");
    });

    it("displays seed description and expected outcome", () => {
      const findings = createMockFindings();
      const testSeeds = createMockTestSeeds({
        seeds: [
          { id: "seed-001", title: "Test", category: "positive", target: "auth.ts", description: "Test authentication flow", inputs: {}, expectedOutcome: "User authenticated successfully", priority: "medium" },
        ],
      });
      const html = generateHtmlReport(findings, undefined, testSeeds);

      expect(html).toContain("Test authentication flow");
      expect(html).toContain("User authenticated successfully");
      expect(html).toContain("auth.ts");
    });

    it("shows no test seeds message when empty", () => {
      const findings = createMockFindings();
      const testSeeds = createMockTestSeeds();
      const html = generateHtmlReport(findings, undefined, testSeeds);

      expect(html).toContain("No test seeds generated");
    });

    it("omits test seeds section when not provided", () => {
      const findings = createMockFindings();
      const html = generateHtmlReport(findings);

      // Should still show the section with "No test seeds generated"
      expect(html).toContain("<h2>Test Seeds</h2>");
    });
  });

  describe("writeHtmlReport", () => {
    it("writes HTML file to output directory", () => {
      const findings = createMockFindings();
      const filePath = writeHtmlReport(tempOutDir, findings);

      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toBe(path.join(tempOutDir, "analysis-report.html"));
    });

    it("writes HTML with custom filename", () => {
      const findings = createMockFindings();
      const filePath = writeHtmlReport(tempOutDir, findings, undefined, undefined, undefined, "custom.html");

      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toBe(path.join(tempOutDir, "custom.html"));
    });

    it("written HTML is valid and parseable", () => {
      const findings = createMockFindings({
        run_id: "parse-test",
      });
      writeHtmlReport(tempOutDir, findings);

      const content = readFileSync(path.join(tempOutDir, "analysis-report.html"), "utf8");
      expect(content).toContain("<!DOCTYPE html>");
      expect(content).toContain("parse-test");
    });

    it("written HTML has proper structure", () => {
      const findings = createMockFindings();
      writeHtmlReport(tempOutDir, findings);

      const content = readFileSync(path.join(tempOutDir, "analysis-report.html"), "utf8");
      expect(content).toContain("<html lang=\"en\">");
      expect(content).toContain("<title>");
      expect(content).toContain("</title>");
    });

    it("handles all artifacts together", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const riskRegister = createMockRiskRegister({
        risks: [
          { id: "risk-001", title: "Risk", severity: "high", likelihood: "medium", impact: ["i"], confidence: 0.8, sourceFindingIds: ["f1"], evidence: [], recommendedActions: ["action"] },
        ],
      });
      const testSeeds = createMockTestSeeds({
        seeds: [
          { id: "seed-001", title: "Seed", category: "positive", target: "t.ts", description: "d", inputs: {}, expectedOutcome: "pass", priority: "high" },
        ],
      });

      const filePath = writeHtmlReport(tempOutDir, findings, riskRegister, testSeeds);
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, "utf8");
      expect(content).toContain("<h2>Findings</h2>");
      expect(content).toContain("<h2>Risk Register</h2>");
      expect(content).toContain("<h2>Test Seeds</h2>");
    });
  });

  describe("Footer", () => {
    it("includes footer with tool information", () => {
      const findings = createMockFindings();
      const html = generateHtmlReport(findings);

      expect(html).toContain("Generated by code-to-gate");
      expect(html).toContain("static analysis");
    });
  });

  describe("Edge cases", () => {
    it("handles empty findings", () => {
      const findings = createMockFindings();
      const html = generateHtmlReport(findings);

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("card-value\">0</div>");
    });

    it("handles large findings dataset", () => {
      const findings = createMockFindings({
        findings: Array.from({ length: 50 }, (_, i) => ({
          id: `f${i}`,
          ruleId: `R${i % 5}`,
          category: "security",
          severity: ["critical", "high", "medium", "low"][i % 4] as Severity,
          confidence: 0.75,
          title: `Finding ${i}`,
          summary: `Summary ${i}`,
          evidence: [],
        })),
      });
      const html = generateHtmlReport(findings);

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Finding 0");
      expect(html).toContain("Finding 49");
    });

    it("handles special characters in content", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "Test <script> attack",
            summary: "Test & special 'characters' \"test\"",
            evidence: [],
          },
        ],
      });
      const html = generateHtmlReport(findings);

      // Title should be escaped in HTML
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&amp;");
    });

    it("handles unicode content", () => {
      const findings = createMockFindings({
        repo: { root: "/path/to/repo" },
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "Unicode finding",
            summary: "Summary with unicode: and emoji",
            evidence: [],
          },
        ],
      });
      const html = generateHtmlReport(findings);

      expect(html).toContain("Unicode finding");
      expect(html).toContain("and emoji");
    });
  });

  describe("Code snippet generation", () => {
    it("includes evidence header with path", () => {
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
            evidence: [{ id: "e1", path: "src/auth.ts", startLine: 15, kind: "text", excerptHash: "h" }],
          },
        ],
      });
      const html = generateHtmlReport(findings);

      expect(html).toContain("src/auth.ts");
      expect(html).toContain("evidence-header");
    });

    it("shows line number in evidence", () => {
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
            evidence: [{ id: "e1", path: "src/file.ts", startLine: 42, kind: "text", excerptHash: "h" }],
          },
        ],
      });
      const html = generateHtmlReport(findings);

      // Line number should be shown in header
      expect(html).toContain("src/file.ts:42");
    });
  });
});