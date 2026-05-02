/**
 * P2-03: Viewer Display Expansion Tests
 *
 * Tests for:
 * - Large artifact handling
 * - Performance under load
 * - Key display functionality
 */

import { describe, it, expect } from "vitest";
import {
  generateReportHtml,
  generateSimplifiedReport,
} from "../report-viewer.js";
import {
  generateMermaidFlowchart,
} from "../graph-viewer.js";
import {
  sortFindingsBySeverity,
  countBySeverity,
  countByCategory,
} from "../finding-viewer.js";
import { getAllStyles } from "../styles.js";
import {
  Severity,
  FindingCategory,
  Finding,
} from "../../types/artifacts.js";
import { NormalizedRepoGraph } from "../../types/graph.js";
import {
  createMockFindingsArtifact,
  createMockReleaseReadinessArtifact,
  createMockFinding,
} from "../../test-utils/index.js";

const createMockFindings = createMockFindingsArtifact;

function createMockFinding(sev: Severity, cat: FindingCategory): Finding {
  return {
    id: `finding-${sev}-${cat}`,
    ruleId: `RULE-${cat}`,
    category: cat,
    severity: sev,
    confidence: 0.85,
    title: `Test finding ${sev} ${cat}`,
    summary: `Test summary for ${sev} ${cat}`,
    evidence: [],
  };
}

function createMockReadiness(overrides?: Partial<ReleaseReadinessArtifact>): ReleaseReadinessArtifact {
  const base: ReleaseReadinessArtifact = {
    version: CTG_VERSION,
    generated_at: new Date().toISOString(),
    run_id: "ctg-test-run-001",
    repo: { root: "." },
    tool: { name: "code-to-gate", version: "0.2.0", plugin_versions: [] },
    artifact: "release-readiness",
    schema: "release-readiness@v1",
    completeness: "complete",
    status: "passed",
    summary: "All checks passed",
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
  };
  return { ...base, ...overrides } as ReleaseReadinessArtifact;
}

function createMockGraph(fileCount: number): NormalizedRepoGraph {
  const files = [];
  for (let i = 0; i < fileCount; i++) {
    files.push({
      path: `src/file-${i}.ts`,
      hash: `hash-${i}`,
      role: "source",
      language: "typescript",
      sizeBytes: 1000,
      lineCount: 50,
    });
  }
  return {
    version: CTG_VERSION,
    generated_at: new Date().toISOString(),
    run_id: "test-run",
    repo: { root: ".", files: fileCount },
    tool: { name: "code-to-gate", version: "0.2.0" },
    artifact: "repo-graph",
    schema: "repo-graph@v1",
    completeness: "complete",
    files,
    symbols: [],
    relations: [],
    modules: [],
    configs: [],
    tests: [],
    diagnostics: [],
    stats: {
      totalFiles: fileCount,
      totalSymbols: 0,
      totalRelations: 0,
      sourceFiles: fileCount,
      testFiles: 0,
      configFiles: 0,
    },
  };
}

describe("P2-03: Viewer Display Expansion Tests", () => {
  describe("Large artifact handling", () => {
    it("handles 100 findings efficiently", () => {
      const findings = [];
      for (let i = 0; i < 100; i++) {
        const sev: Severity = i % 4 === 0 ? "critical" : i % 4 === 1 ? "high" : i % 4 === 2 ? "medium" : "low";
        const cat: FindingCategory = i % 3 === 0 ? "security" : i % 3 === 1 ? "auth" : "payment";
        findings.push({
          ...createMockFinding(sev, cat),
          id: `finding-${i}`,
          title: `Finding ${i}`,
          summary: `Summary ${i}`,
        });
      }

      const artifact = createMockFindings({ findings });
      const startTime = Date.now();
      const html = generateReportHtml({ findings: artifact });
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 5s)
      expect(duration).toBeLessThan(5000);
      expect(html).toContain("Finding 0");
      expect(html).toContain("Finding 99");
    });

    it("handles 500 findings without memory issues", () => {
      const findings = [];
      for (let i = 0; i < 500; i++) {
        findings.push({
          ...createMockFinding("medium", "security"),
          id: `finding-${i}`,
          title: `Large Finding ${i}`,
        });
      }

      const artifact = createMockFindings({ findings });
      const html = generateReportHtml({ findings: artifact });

      // HTML should be generated without truncation
      expect(html.length).toBeGreaterThan(10000);
      expect(html).toContain("Large Finding 0");
      expect(html).toContain("Large Finding 499");
    });

    it("handles findings with many evidence items", () => {
      const finding = {
        id: "f-many-evidence",
        ruleId: "R1",
        category: "security",
        severity: "high",
        confidence: 0.9,
        title: "Finding with many evidence",
        summary: "Test summary",
        evidence: Array.from({ length: 50 }, (_, i) => ({
          id: `evidence-${i}`,
          path: `/path/to/file-${i}.ts`,
          kind: "ast",
          excerptHash: `hash-${i}`,
        })),
      };

      const artifact = createMockFindings({ findings: [finding] });
      const html = generateReportHtml({ findings: artifact });

      expect(html).toContain("Finding with many evidence");
      expect(html.length).toBeGreaterThan(1000);
    });
  });

  describe("Findings explorer utilities", () => {
    it("generates category breakdown", () => {
      const findings = [
        createMockFinding("high", "security"),
        createMockFinding("high", "security"),
        createMockFinding("medium", "auth"),
        createMockFinding("low", "payment"),
      ];

      const counts = countByCategory(findings);
      expect(counts["security"]).toBe(2);
      expect(counts["auth"]).toBe(1);
      expect(counts["payment"]).toBe(1);
    });

    it("generates severity distribution", () => {
      const findings = [
        createMockFinding("critical", "security"),
        createMockFinding("high", "security"),
        createMockFinding("medium", "security"),
        createMockFinding("low", "security"),
      ];

      const counts = countBySeverity(findings);
      expect(counts.critical).toBe(1);
      expect(counts.high).toBe(1);
      expect(counts.medium).toBe(1);
      expect(counts.low).toBe(1);
    });
  });

  describe("Release readiness display", () => {
    it("shows complete readiness dashboard", () => {
      const readiness = createMockReadiness({
        status: "needs_review",
        blockers: [],
        warnings: ["Warning 1", "Warning 2"],
        passedChecks: ["Check A", "Check B"],
        metrics: {
          criticalFindings: 0,
          highFindings: 2,
          mediumFindings: 5,
          lowFindings: 10,
          riskCount: 3,
          testSeedCount: 8,
        },
      });

      const html = generateReportHtml({ readiness }, { showReadiness: true });

      expect(html).toContain("needs_review");
      expect(html).toContain("Warning 1");
      expect(html).toContain("Check A");
    });

    it("shows blocked status prominently", () => {
      const readiness = createMockReadiness({
        status: "blocked_input",
        blockers: ["Critical severity finding"],
        summary: "Release blocked due to critical findings",
      });

      const html = generateReportHtml({ readiness }, { showReadiness: true });

      expect(html).toContain("blocked_input");
      expect(html).toContain("Critical severity finding");
    });
  });

  describe("Performance tests", () => {
    it("generates HTML for 1000 findings in under 10 seconds", () => {
      const findings = Array.from({ length: 1000 }, (_, i) => ({
        ...createMockFinding("medium", "security"),
        id: `perf-finding-${i}`,
        title: `Performance Test Finding ${i}`,
      }));

      const artifact = createMockFindings({ findings });
      const startTime = Date.now();
      const html = generateReportHtml({ findings: artifact });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10000);
      expect(html.length).toBeGreaterThan(10000);
    });

    it("sorting 1000 findings is fast", () => {
      const findings = Array.from({ length: 1000 }, (_, i) => ({
        ...createMockFinding(
          i % 4 === 0 ? "critical" : i % 4 === 1 ? "high" : i % 4 === 2 ? "medium" : "low",
          "security"
        ),
        id: `sort-finding-${i}`,
      }));

      const startTime = Date.now();
      const sorted = sortFindingsBySeverity(findings);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100);
      expect(sorted[0].severity).toBe("critical");
    });
  });

  describe("HTML structure and styles", () => {
    it("includes proper CSS styles", () => {
      const styles = getAllStyles();
      expect(styles).toContain("--color-critical");
      expect(styles).toContain("--color-high");
      expect(styles).toContain("dark");
    });

    it("generates valid HTML structure", () => {
      const findings = createMockFindings({ findings: [createMockFinding("high", "security")] });
      const html = generateReportHtml({ findings });

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html");
      expect(html).toContain("<style>");
      expect(html).toContain("<body>");
    });
  });
});