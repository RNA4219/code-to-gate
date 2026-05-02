/**
 * Tests for PR Comment Generator
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  generatePrComment,
  buildTemplateData,
  renderPrCommentTemplate,
  DEFAULT_PR_COMMENT_TEMPLATE,
  type PrCommentOptions,
  type PrCommentTemplateData,
} from "../pr-comment.js";
import type {
  FindingsArtifact,
  RiskRegisterArtifact,
  TestSeedsArtifact,
  ReleaseReadinessArtifact,
  Finding,
  Severity,
} from "../../types/artifacts.js";

describe("pr-comment", () => {
  const createMockFindings = (): FindingsArtifact => ({
    version: "ctg/v1",
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

  const createMockFinding = (
    ruleId: string,
    severity: Severity,
    path: string = "src/test.ts",
    line: number = 10
  ): Finding => ({
    id: `finding-${ruleId}`,
    ruleId,
    category: "auth",
    severity,
    confidence: 0.85,
    title: `${ruleId} Issue`,
    summary: `Test finding for ${ruleId}`,
    evidence: [
      {
        id: "evidence-1",
        path,
        startLine: line,
        endLine: line,
        kind: "ast",
      },
    ],
  });

  const createMockRiskRegister = (): RiskRegisterArtifact => ({
    version: "ctg/v1",
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

  const createMockTestSeeds = (): TestSeedsArtifact => ({
    version: "ctg/v1",
    generated_at: "2025-01-01T00:00:00Z",
    run_id: "run-001",
    repo: { root: "/test/repo" },
    tool: {
      name: "code-to-gate",
      version: "0.1.0",
      plugin_versions: [],
    },
    artifact: "test-seeds",
    schema: "test-seeds@v1",
    completeness: "complete",
    seeds: [],
  });

  const createMockReadiness = (): ReleaseReadinessArtifact => ({
    version: "ctg/v1",
    generated_at: "2025-01-01T00:00:00Z",
    run_id: "run-001",
    repo: { root: "/test/repo" },
    tool: {
      name: "code-to-gate",
      version: "0.1.0",
      plugin_versions: [],
    },
    artifact: "release-readiness",
    schema: "release-readiness@v1",
    completeness: "complete",
    status: "needs_review",
    summary: "Test summary",
    blockers: [],
    warnings: [],
    passedChecks: [],
    metrics: {
      criticalFindings: 0,
      highFindings: 0,
      mediumFindings: 0,
      lowFindings: 0,
      riskCount: 0,
      testSeedCount: 0,
    },
  });

  describe("generatePrComment", () => {
    it("generates markdown with header", () => {
      const findings = createMockFindings();
      const options: PrCommentOptions = { findings };

      const comment = generatePrComment(options);
      expect(comment).toContain("## code-to-gate Analysis");
    });

    it("includes status from readiness artifact", () => {
      const findings = createMockFindings();
      const readiness = createMockReadiness();
      readiness.status = "passed";
      const options: PrCommentOptions = { findings, readiness };

      const comment = generatePrComment(options);
      expect(comment).toContain("**Status**: PASSED");
    });

    it("defaults to needs_review status without readiness", () => {
      const findings = createMockFindings();
      const options: PrCommentOptions = { findings };

      const comment = generatePrComment(options);
      expect(comment).toContain("**Status**: NEEDS_REVIEW");
    });

    it("includes summary table with severity counts", () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("RULE1", "critical"));
      findings.findings.push(createMockFinding("RULE2", "high"));
      findings.findings.push(createMockFinding("RULE3", "medium"));
      findings.findings.push(createMockFinding("RULE4", "low"));

      const options: PrCommentOptions = { findings };
      const comment = generatePrComment(options);

      expect(comment).toContain("| Critical | 1 |");
      expect(comment).toContain("| High | 1 |");
      expect(comment).toContain("| Medium | 1 |");
      expect(comment).toContain("| Low | 1 |");
    });

    it("includes risk count from risk register", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();
      riskRegister.risks.push({
        id: "risk-1",
        title: "Test Risk",
        severity: "high",
        likelihood: "medium",
        impact: ["Test impact"],
        confidence: 0.8,
        sourceFindingIds: [],
        evidence: [],
        recommendedActions: ["Test action"],
      });

      const options: PrCommentOptions = { findings, riskRegister };
      const comment = generatePrComment(options);

      expect(comment).toContain("| Risks | 1 |");
    });

    it("includes test seed count", () => {
      const findings = createMockFindings();
      const testSeeds = createMockTestSeeds();
      testSeeds.seeds.push({
        id: "seed-1",
        title: "Test Seed",
        category: "positive",
        target: "function",
        description: "Test description",
        inputs: {},
        expectedOutcome: "Success",
        priority: "high",
      });

      const options: PrCommentOptions = { findings, testSeeds };
      const comment = generatePrComment(options);

      expect(comment).toContain("| Test Seeds | 1 |");
    });

    it("sorts findings by severity (critical first)", () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("LOW_RULE", "low"));
      findings.findings.push(createMockFinding("CRITICAL_RULE", "critical"));
      findings.findings.push(createMockFinding("HIGH_RULE", "high"));

      const options: PrCommentOptions = { findings };
      const comment = generatePrComment(options);

      // Critical should appear first in key findings
      const criticalIndex = comment.indexOf("CRITICAL_RULE");
      const highIndex = comment.indexOf("HIGH_RULE");
      const lowIndex = comment.indexOf("LOW_RULE");

      expect(criticalIndex).toBeLessThan(highIndex);
      expect(highIndex).toBeLessThan(lowIndex);
    });

    it("limits findings shown by maxFindingsShown", () => {
      const findings = createMockFindings();
      for (let i = 0; i < 15; i++) {
        findings.findings.push(createMockFinding(`RULE_${i}`, "medium"));
      }

      const options: PrCommentOptions = { findings, maxFindingsShown: 5 };
      const comment = generatePrComment(options);

      expect(comment).toContain("Showing 5 of 15 findings");
    });

    it("does not show limit notice when all findings shown", () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("RULE1", "high"));

      const options: PrCommentOptions = { findings, maxFindingsShown: 10 };
      const comment = generatePrComment(options);

      expect(comment).not.toContain("Showing");
    });

    it("includes finding location with path and line", () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("TEST_RULE", "high", "src/auth.ts", 42));

      const options: PrCommentOptions = { findings };
      const comment = generatePrComment(options);

      expect(comment).toContain("src/auth.ts:42");
    });

    it("handles findings without evidence", () => {
      const findings = createMockFindings();
      findings.findings.push({
        id: "finding-no-evidence",
        ruleId: "NO_EVIDENCE_RULE",
        category: "auth",
        severity: "high",
        confidence: 0.75,
        title: "No Evidence Finding",
        summary: "Finding without evidence",
        evidence: [],
      });

      const options: PrCommentOptions = { findings };
      const comment = generatePrComment(options);

      expect(comment).toContain("NO_EVIDENCE_RULE");
    });

    it("includes recommended actions from risk register", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();
      riskRegister.risks.push({
        id: "risk-1",
        title: "Risk 1",
        severity: "high",
        likelihood: "high",
        impact: [],
        confidence: 0.9,
        sourceFindingIds: [],
        evidence: [],
        recommendedActions: ["Add validation", "Fix authentication"],
      });

      const options: PrCommentOptions = { findings, riskRegister };
      const comment = generatePrComment(options);

      expect(comment).toContain("### Recommended Actions");
      expect(comment).toContain("- Add validation");
      expect(comment).toContain("- Fix authentication");
    });

    it("deduplicates recommended actions", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();
      riskRegister.risks.push({
        id: "risk-1",
        title: "Risk 1",
        severity: "high",
        likelihood: "medium",
        impact: [],
        confidence: 0.8,
        sourceFindingIds: [],
        evidence: [],
        recommendedActions: ["Add validation", "Add validation", "Fix issue"],
      });

      const options: PrCommentOptions = { findings, riskRegister };
      const comment = generatePrComment(options);

      // Should only show unique actions
      const validationCount = (comment.match(/- Add validation/g) || []).length;
      expect(validationCount).toBe(1);
    });

    it("limits recommended actions by maxRecommendationsShown", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();
      riskRegister.risks.push({
        id: "risk-1",
        title: "Risk",
        severity: "high",
        likelihood: "medium",
        impact: [],
        confidence: 0.8,
        sourceFindingIds: [],
        evidence: [],
        recommendedActions: ["Action 1", "Action 2", "Action 3", "Action 4", "Action 5", "Action 6"],
      });

      const options: PrCommentOptions = { findings, riskRegister, maxRecommendationsShown: 3 };
      const comment = generatePrComment(options);

      expect(comment).toContain("- Action 1");
      expect(comment).toContain("- Action 2");
      expect(comment).toContain("- Action 3");
      expect(comment).not.toContain("- Action 4");
    });

    it("includes unsupported claims notice", () => {
      const findings = createMockFindings();
      findings.unsupported_claims.push({
        id: "claim-1",
        claim: "Test claim",
        reason: "missing_evidence",
        sourceSection: "test",
      });

      const options: PrCommentOptions = { findings };
      const comment = generatePrComment(options);

      expect(comment).toContain("### Unsupported Claims");
      expect(comment).toContain("1 claims could not be validated");
    });

    it("includes artifact URL when provided", () => {
      const findings = createMockFindings();
      const options: PrCommentOptions = {
        findings,
        artifactUrl: "https://example.com/report/123",
      };

      const comment = generatePrComment(options);
      expect(comment).toContain("[View full report](https://example.com/report/123)");
    });

    it("does not include artifact URL section when not provided", () => {
      const findings = createMockFindings();
      const options: PrCommentOptions = { findings };

      const comment = generatePrComment(options);
      expect(comment).not.toContain("[View full report]");
    });

    it("includes footer with tool version", () => {
      const findings = createMockFindings();
      findings.tool.version = "1.2.3";
      const options: PrCommentOptions = { findings };

      const comment = generatePrComment(options);
      expect(comment).toContain("Generated by code-to-gate v1.2.3");
    });
  });

  describe("buildTemplateData", () => {
    it("builds template data with counts", () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("CRITICAL", "critical"));
      findings.findings.push(createMockFinding("HIGH", "high"));
      findings.findings.push(createMockFinding("MEDIUM", "medium"));
      findings.findings.push(createMockFinding("LOW", "low"));

      const options: PrCommentOptions = { findings };
      const data = buildTemplateData(options);

      expect(data.criticalCount).toBe(1);
      expect(data.highCount).toBe(1);
      expect(data.mediumCount).toBe(1);
      expect(data.lowCount).toBe(1);
    });

    it("builds template data with status", () => {
      const findings = createMockFindings();
      const readiness = createMockReadiness();
      readiness.status = "passed_with_risk";

      const options: PrCommentOptions = { findings, readiness };
      const data = buildTemplateData(options);

      expect(data.status).toBe("PASSED_WITH_RISK");
    });

    it("builds template data with findings", () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("RULE_A", "high", "src/file.ts", 50));

      const options: PrCommentOptions = { findings };
      const data = buildTemplateData(options);

      expect(data.findings).toHaveLength(1);
      expect(data.findings[0].ruleId).toBe("RULE_A");
      expect(data.findings[0].severity).toBe("high");
      expect(data.findings[0].path).toBe("src/file.ts");
      expect(data.findings[0].line).toBe(50);
    });

    it("builds template data with recommendations", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();
      riskRegister.risks.push({
        id: "risk-1",
        title: "Risk",
        severity: "high",
        likelihood: "medium",
        impact: [],
        confidence: 0.8,
        sourceFindingIds: [],
        evidence: [],
        recommendedActions: ["Recommendation 1", "Recommendation 2"],
      });

      const options: PrCommentOptions = { findings, riskRegister };
      const data = buildTemplateData(options);

      expect(data.recommendations).toHaveLength(2);
      expect(data.recommendations).toContain("Recommendation 1");
    });

    it("builds template data with artifact URL", () => {
      const findings = createMockFindings();
      const options: PrCommentOptions = {
        findings,
        artifactUrl: "https://artifacts.example.com/123",
      };

      const data = buildTemplateData(options);
      expect(data.artifactUrl).toBe("https://artifacts.example.com/123");
    });

    it("limits findings in template data", () => {
      const findings = createMockFindings();
      for (let i = 0; i < 20; i++) {
        findings.findings.push(createMockFinding(`RULE_${i}`, "medium"));
      }

      const options: PrCommentOptions = { findings, maxFindingsShown: 5 };
      const data = buildTemplateData(options);

      expect(data.findings.length).toBe(5);
    });

    it("includes risk and seed counts", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();
      riskRegister.risks.push({
        id: "risk-1",
        title: "Risk",
        severity: "high",
        likelihood: "medium",
        impact: [],
        confidence: 0.8,
        sourceFindingIds: [],
        evidence: [],
        recommendedActions: [],
      });

      const testSeeds = createMockTestSeeds();
      testSeeds.seeds.push({
        id: "seed-1",
        title: "Seed",
        category: "positive",
        target: "func",
        description: "desc",
        inputs: {},
        expectedOutcome: "pass",
        priority: "high",
      });

      const options: PrCommentOptions = { findings, riskRegister, testSeeds };
      const data = buildTemplateData(options);

      expect(data.riskCount).toBe(1);
      expect(data.seedCount).toBe(1);
    });
  });

  describe("renderPrCommentTemplate", () => {
    it("replaces status placeholder", () => {
      const template = "**Status**: {{status}}";
      const data: PrCommentTemplateData = {
        status: "PASSED",
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        riskCount: 0,
        seedCount: 0,
        findings: [],
        recommendations: [],
      };

      const result = renderPrCommentTemplate(template, data);
      expect(result).toBe("**Status**: PASSED");
    });

    it("replaces count placeholders", () => {
      const template = "Critical: {{critical_count}}, High: {{high_count}}, Medium: {{medium_count}}";
      const data: PrCommentTemplateData = {
        status: "NEEDS_REVIEW",
        criticalCount: 3,
        highCount: 5,
        mediumCount: 10,
        lowCount: 20,
        riskCount: 2,
        seedCount: 4,
        findings: [],
        recommendations: [],
      };

      const result = renderPrCommentTemplate(template, data);
      expect(result).toContain("Critical: 3");
      expect(result).toContain("High: 5");
      expect(result).toContain("Medium: 10");
    });

    it("replaces risk and seed count placeholders", () => {
      const template = "Risks: {{risk_count}}, Seeds: {{seed_count}}";
      const data: PrCommentTemplateData = {
        status: "NEEDS_REVIEW",
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        riskCount: 7,
        seedCount: 12,
        findings: [],
        recommendations: [],
      };

      const result = renderPrCommentTemplate(template, data);
      expect(result).toBe("Risks: 7, Seeds: 12");
    });

    it("replaces findings section placeholder", () => {
      const template = "Findings:\n{{findings_section}}";
      const data: PrCommentTemplateData = {
        status: "NEEDS_REVIEW",
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        riskCount: 0,
        seedCount: 0,
        findings: [
          { ruleId: "RULE1", severity: "high", summary: "Test finding", path: "src/a.ts", line: 10 },
          { ruleId: "RULE2", severity: "medium", summary: "Another finding", path: "src/b.ts", line: undefined },
        ],
        recommendations: [],
      };

      const result = renderPrCommentTemplate(template, data);
      expect(result).toContain("RULE1");
      expect(result).toContain("src/a.ts:10");
      expect(result).toContain("RULE2");
      expect(result).toContain("src/b.ts");
    });

    it("replaces recommendations section placeholder", () => {
      const template = "Actions:\n{{recommendations_section}}";
      const data: PrCommentTemplateData = {
        status: "NEEDS_REVIEW",
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        riskCount: 0,
        seedCount: 0,
        findings: [],
        recommendations: ["Add tests", "Fix bug"],
      };

      const result = renderPrCommentTemplate(template, data);
      expect(result).toContain("- Add tests");
      expect(result).toContain("- Fix bug");
    });

    it("replaces artifact URL placeholder", () => {
      const template = "[View Report]({{artifact_url}})";
      const data: PrCommentTemplateData = {
        status: "NEEDS_REVIEW",
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        riskCount: 0,
        seedCount: 0,
        findings: [],
        recommendations: [],
        artifactUrl: "https://reports.example.com/abc123",
      };

      const result = renderPrCommentTemplate(template, data);
      expect(result).toBe("[View Report](https://reports.example.com/abc123)");
    });

    it("handles empty findings section", () => {
      const template = "Findings: {{findings_section}}";
      const data: PrCommentTemplateData = {
        status: "NEEDS_REVIEW",
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        riskCount: 0,
        seedCount: 0,
        findings: [],
        recommendations: [],
      };

      const result = renderPrCommentTemplate(template, data);
      expect(result).toBe("Findings: ");
    });

    it("handles empty recommendations section", () => {
      const template = "Actions: {{recommendations_section}}";
      const data: PrCommentTemplateData = {
        status: "NEEDS_REVIEW",
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        riskCount: 0,
        seedCount: 0,
        findings: [],
        recommendations: [],
      };

      const result = renderPrCommentTemplate(template, data);
      expect(result).toBe("Actions: ");
    });
  });

  describe("DEFAULT_PR_COMMENT_TEMPLATE", () => {
    it("is defined and non-empty", () => {
      expect(DEFAULT_PR_COMMENT_TEMPLATE).toBeDefined();
      expect(DEFAULT_PR_COMMENT_TEMPLATE.length).toBeGreaterThan(0);
    });

    it("contains header", () => {
      expect(DEFAULT_PR_COMMENT_TEMPLATE).toContain("## code-to-gate Analysis");
    });

    it("contains placeholder variables", () => {
      expect(DEFAULT_PR_COMMENT_TEMPLATE).toContain("{{status}}");
      expect(DEFAULT_PR_COMMENT_TEMPLATE).toContain("{{critical_count}}");
      expect(DEFAULT_PR_COMMENT_TEMPLATE).toContain("{{high_count}}");
      expect(DEFAULT_PR_COMMENT_TEMPLATE).toContain("{{findings_section}}");
      expect(DEFAULT_PR_COMMENT_TEMPLATE).toContain("{{artifact_url}}");
    });

    it("can be rendered with template data", () => {
      const data: PrCommentTemplateData = {
        status: "BLOCKED",
        criticalCount: 1,
        highCount: 2,
        mediumCount: 3,
        lowCount: 4,
        riskCount: 5,
        seedCount: 6,
        findings: [
          { ruleId: "CRITICAL_AUTH", severity: "critical", summary: "Auth issue", path: "auth.ts", line: 10 },
        ],
        recommendations: ["Fix authentication"],
        artifactUrl: "https://example.com/report",
      };

      const result = renderPrCommentTemplate(DEFAULT_PR_COMMENT_TEMPLATE, data);

      expect(result).toContain("BLOCKED");
      expect(result).toContain("1");
      expect(result).toContain("2");
      expect(result).toContain("CRITICAL_AUTH");
      expect(result).toContain("Fix authentication");
      expect(result).toContain("https://example.com/report");
    });
  });

  describe("severity formatting", () => {
    it("formats critical severity with bold", () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("CRIT_RULE", "critical"));

      const options: PrCommentOptions = { findings };
      const comment = generatePrComment(options);

      expect(comment).toContain("**CRITICAL**");
    });

    it("formats high severity with bold", () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("HIGH_RULE", "high"));

      const options: PrCommentOptions = { findings };
      const comment = generatePrComment(options);

      expect(comment).toContain("**HIGH**");
    });

    it("formats medium severity with italic", () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("MED_RULE", "medium"));

      const options: PrCommentOptions = { findings };
      const comment = generatePrComment(options);

      expect(comment).toContain("*MEDIUM*");
    });

    it("formats low severity without emphasis", () => {
      const findings = createMockFindings();
      findings.findings.push(createMockFinding("LOW_RULE", "low"));

      const options: PrCommentOptions = { findings };
      const comment = generatePrComment(options);

      expect(comment).toContain("LOW");
      expect(comment).not.toContain("**LOW**");
      expect(comment).not.toContain("*LOW*");
    });
  });

  describe("status formatting", () => {
    it("formats passed status", () => {
      const findings = createMockFindings();
      const readiness = createMockReadiness();
      readiness.status = "passed";

      const comment = generatePrComment({ findings, readiness });
      expect(comment).toContain("PASSED");
    });

    it("formats passed_with_risk status", () => {
      const findings = createMockFindings();
      const readiness = createMockReadiness();
      readiness.status = "passed_with_risk";

      const comment = generatePrComment({ findings, readiness });
      expect(comment).toContain("PASSED_WITH_RISK");
    });

    it("formats needs_review status", () => {
      const findings = createMockFindings();
      const readiness = createMockReadiness();
      readiness.status = "needs_review";

      const comment = generatePrComment({ findings, readiness });
      expect(comment).toContain("NEEDS_REVIEW");
    });

    it("formats blocked status", () => {
      const findings = createMockFindings();
      const readiness = createMockReadiness();
      readiness.status = "blocked";

      const comment = generatePrComment({ findings, readiness });
      expect(comment).toContain("BLOCKED");
    });
  });
});