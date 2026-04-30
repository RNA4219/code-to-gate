/**
 * Tests for Markdown Reporter
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  generateAnalysisReport,
  writeAnalysisReportMd,
} from "../markdown-reporter.js";
import { existsSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import type { FindingsArtifact, RiskRegisterArtifact, Finding, RiskSeed } from "../../types/artifacts.js";

describe("markdown-reporter", () => {
  let tempOutDir: string;

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-md-reporter-test-${Date.now()}`);
    mkdirSync(tempOutDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
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

  const createMockRiskRegister = (): RiskRegisterArtifact => ({
    version: "ctg/v1alpha1",
    generated_at: "2025-01-01T00:00:00Z",
    run_id: "run-001",
    repo: { root: "/test/repo" },
    tool: {
      name: "code-to-gate",
      version: "0.1.0",
      plugin_versions: [],
    },
    artifact: "risk-register",
    schema: "risk-register@v1",
    completeness: "complete",
    risks: [],
  });

  describe("generateAnalysisReport", () => {
    it("generates report with header", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();

      const report = generateAnalysisReport(findings, riskRegister, "/test/repo");

      expect(report).toContain("# code-to-gate Analysis Report");
    });

    it("includes generated_at timestamp", () => {
      const findings = createMockFindings();
      findings.generated_at = "2025-06-15T10:30:00Z";
      const riskRegister = createMockRiskRegister();

      const report = generateAnalysisReport(findings, riskRegister, "/test/repo");

      expect(report).toContain("2025-06-15T10:30:00Z");
    });

    it("includes run_id", () => {
      const findings = createMockFindings();
      findings.run_id = "test-run-123";
      const riskRegister = createMockRiskRegister();

      const report = generateAnalysisReport(findings, riskRegister, "/test/repo");

      expect(report).toContain("test-run-123");
    });

    it("includes repository root", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();

      const report = generateAnalysisReport(findings, riskRegister, "/path/to/my/repo");

      expect(report).toContain("/path/to/my/repo");
    });

    it("includes Summary section", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();

      const report = generateAnalysisReport(findings, riskRegister, "/test/repo");

      expect(report).toContain("## Summary");
    });

    it("includes summary table with metrics", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();

      const report = generateAnalysisReport(findings, riskRegister, "/test/repo");

      expect(report).toContain("| Metric | Count |");
      expect(report).toContain("| Total Findings |");
      expect(report).toContain("| Critical |");
      expect(report).toContain("| High |");
      expect(report).toContain("| Medium |");
      expect(report).toContain("| Low |");
      expect(report).toContain("| Total Risks |");
    });

    it("includes All Findings table when findings exist", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-001",
        ruleId: "TEST_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "Test Finding",
        summary: "Test finding summary",
        evidence: [],
      });
      const riskRegister = createMockRiskRegister();

      const report = generateAnalysisReport(findings, riskRegister, "/test/repo");

      expect(report).toContain("## All Findings");
      expect(report).toContain("| ID | Rule | Category | Domain | Severity | Title | Evidence | Review Flags | LLM |");
      expect(report).toContain("finding-001");
      expect(report).toContain("TEST_RULE");
      expect(report).toContain("Test Finding");
    });

    it("includes High-Priority Risks section when high risks exist", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();
      riskRegister.risks.push({
        id: "risk-001",
        title: "Critical Security Risk",
        severity: "critical",
        likelihood: "high",
        impact: ["Data breach"],
        confidence: 0.9,
        sourceFindingIds: ["finding-001"],
        evidence: [],
        recommendedActions: ["Fix the issue"],
      });

      const report = generateAnalysisReport(findings, riskRegister, "/test/repo");

      expect(report).toContain("## High-Priority Risks");
    });

    it("includes Risk Narratives section when risks exist", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();
      riskRegister.risks.push({
        id: "risk-001",
        title: "Test Risk",
        severity: "medium",
        likelihood: "medium",
        impact: ["Test impact"],
        confidence: 0.75,
        sourceFindingIds: ["finding-001"],
        evidence: [],
        recommendedActions: ["Test action"],
        narrative: "This is a test narrative for the risk.",
      });

      const report = generateAnalysisReport(findings, riskRegister, "/test/repo");

      expect(report).toContain("## Risk Narratives");
      expect(report).toContain("### risk-001: Test Risk");
      expect(report).toContain("This is a test narrative for the risk.");
    });

    it("includes Recommended Actions Summary section", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();

      const report = generateAnalysisReport(findings, riskRegister, "/test/repo");

      expect(report).toContain("## Recommended Actions Summary");
    });

    it("includes footer", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();

      const report = generateAnalysisReport(findings, riskRegister, "/test/repo");

      expect(report).toContain("*This report was generated by code-to-gate. Findings are based on static analysis of the repository.*");
    });
  });

  describe("writeAnalysisReportMd", () => {
    it("writes analysis-report.md to output directory", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();

      const filePath = writeAnalysisReportMd(tempOutDir, findings, riskRegister, "/test/repo");
      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toBe(path.join(tempOutDir, "analysis-report.md"));
    });

    it("written markdown is valid text", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();

      writeAnalysisReportMd(tempOutDir, findings, riskRegister, "/test/repo");
      const content = readFileSync(path.join(tempOutDir, "analysis-report.md"), "utf8");

      expect(content.length).toBeGreaterThan(0);
      expect(content).toContain("# code-to-gate Analysis Report");
    });

    it("written markdown includes severity badges", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-critical-001",
        ruleId: "CRITICAL_RULE",
        category: "auth",
        severity: "critical",
        confidence: 0.95,
        title: "Critical Issue",
        summary: "Critical finding summary",
        evidence: [],
      });
      findings.findings.push({
        id: "finding-high-001",
        ruleId: "HIGH_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "High Issue",
        summary: "High finding summary",
        evidence: [],
      });

      const riskRegister = createMockRiskRegister();

      writeAnalysisReportMd(tempOutDir, findings, riskRegister, "/test/repo");
      const content = readFileSync(path.join(tempOutDir, "analysis-report.md"), "utf8");

      expect(content).toContain("**CRITICAL**");
      expect(content).toContain("**HIGH**");
    });

    it("written markdown includes impact and actions", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();
      riskRegister.risks.push({
        id: "risk-001",
        title: "Test Risk",
        severity: "high",
        likelihood: "medium",
        impact: ["Financial loss", "Data exposure"],
        confidence: 0.85,
        sourceFindingIds: ["finding-001"],
        evidence: [],
        recommendedActions: ["Implement validation", "Add logging"],
      });

      writeAnalysisReportMd(tempOutDir, findings, riskRegister, "/test/repo");
      const content = readFileSync(path.join(tempOutDir, "analysis-report.md"), "utf8");

      expect(content).toContain("**Impact**:");
      expect(content).toContain("- Financial loss");
      expect(content).toContain("**Recommended Actions**:");
      expect(content).toContain("- Implement validation");
    });

    it("written markdown includes tool version", () => {
      const findings = createMockFindings();
      findings.tool.version = "0.2.0";
      const riskRegister = createMockRiskRegister();

      writeAnalysisReportMd(tempOutDir, findings, riskRegister, "/test/repo");
      const content = readFileSync(path.join(tempOutDir, "analysis-report.md"), "utf8");

      expect(content).toContain("code-to-gate v0.2.0");
    });
  });

  describe("markdown report content validation", () => {
    it("counts findings correctly in summary", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-001",
        ruleId: "RULE1",
        category: "auth",
        severity: "critical",
        confidence: 0.95,
        title: "Finding 1",
        summary: "Summary 1",
        evidence: [],
      });
      findings.findings.push({
        id: "finding-002",
        ruleId: "RULE2",
        category: "payment",
        severity: "high",
        confidence: 0.85,
        title: "Finding 2",
        summary: "Summary 2",
        evidence: [],
      });
      findings.findings.push({
        id: "finding-003",
        ruleId: "RULE3",
        category: "testing",
        severity: "medium",
        confidence: 0.75,
        title: "Finding 3",
        summary: "Summary 3",
        evidence: [],
      });

      const riskRegister = createMockRiskRegister();

      const report = generateAnalysisReport(findings, riskRegister, "/test/repo");

      expect(report).toContain("| Total Findings | 3 |");
      expect(report).toContain("| Critical | 1 |");
      expect(report).toContain("| High | 1 |");
      expect(report).toContain("| Medium | 1 |");
    });

    it("formats category correctly", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-001",
        ruleId: "PAYMENT_RULE",
        category: "payment",
        severity: "high",
        confidence: 0.85,
        title: "Payment Issue",
        summary: "Payment finding summary",
        evidence: [],
      });

      const riskRegister = createMockRiskRegister();

      const report = generateAnalysisReport(findings, riskRegister, "/test/repo");

      expect(report).toContain("payment");
    });

    it("includes confidence in risk narratives", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();
      riskRegister.risks.push({
        id: "risk-001",
        title: "Test Risk",
        severity: "high",
        likelihood: "medium",
        impact: ["Test impact"],
        confidence: 0.85,
        sourceFindingIds: ["finding-001"],
        evidence: [],
        recommendedActions: ["Test action"],
      });

      const report = generateAnalysisReport(findings, riskRegister, "/test/repo");

      expect(report).toContain("**Confidence**: 0.85");
    });

    it("formats multiple risks correctly", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();
      riskRegister.risks.push({
        id: "risk-001",
        title: "Risk One",
        severity: "high",
        likelihood: "high",
        impact: ["Impact 1"],
        confidence: 0.9,
        sourceFindingIds: ["finding-001"],
        evidence: [],
        recommendedActions: ["Action 1"],
      });
      riskRegister.risks.push({
        id: "risk-002",
        title: "Risk Two",
        severity: "medium",
        likelihood: "low",
        impact: ["Impact 2"],
        confidence: 0.7,
        sourceFindingIds: ["finding-002"],
        evidence: [],
        recommendedActions: ["Action 2"],
      });

      const report = generateAnalysisReport(findings, riskRegister, "/test/repo");

      expect(report).toContain("### risk-001: Risk One");
      expect(report).toContain("### risk-002: Risk Two");
    });

    it("shows unsupported_claims count in summary", () => {
      const findings = createMockFindings();
      findings.unsupported_claims.push({
        id: "claim-001",
        claim: "Test claim",
        reason: "missing_evidence",
        sourceSection: "Test section",
      });
      const riskRegister = createMockRiskRegister();

      const report = generateAnalysisReport(findings, riskRegister, "/test/repo");

      expect(report).toContain("| Unsupported Claims | 1 |");
    });

    it("includes domain context and false-positive review checkpoints", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-auth-001",
        ruleId: "WEAK_AUTH_GUARD",
        category: "auth",
        severity: "high",
        confidence: 0.65,
        title: "Weak auth guard",
        summary: "Admin route has weak guard",
        evidence: [{ id: "e1", path: "src/auth/admin.ts", kind: "text" }],
        tags: ["domain:auth", "fp-review", "fp-review:low-confidence", "llm-reviewed"],
      });
      const riskRegister = createMockRiskRegister();

      const report = generateAnalysisReport(findings, riskRegister, "/test/repo");

      expect(report).toContain("## Domain Context");
      expect(report).toContain("Authentication and authorization");
      expect(report).toContain("## False-Positive Review");
      expect(report).toContain("low-confidence");
      expect(report).toContain("reflected");
    });

    it("lists unsupported claims with LLM source", () => {
      const findings = createMockFindings();
      findings.unsupported_claims.push({
        id: "unsupported-llm-001",
        claim: "The repository uses an unknown payment gateway",
        reason: "missing_evidence",
        sourceSection: "llm:deterministic",
      });
      const riskRegister = createMockRiskRegister();

      const report = generateAnalysisReport(findings, riskRegister, "/test/repo");

      expect(report).toContain("## Unsupported Claims");
      expect(report).toContain("llm:deterministic");
      expect(report).toContain("unknown payment gateway");
    });
  });
});
