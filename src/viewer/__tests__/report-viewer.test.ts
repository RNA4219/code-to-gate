/**
 * Tests for Report Viewer
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  generateReportHtml,
  writeReportHtml,
  generateSimplifiedReport,
} from "../report-viewer.js";
import {
  generateMermaidFlowchart,
  generateMermaidDependencyGraph,
  generateMermaidCallGraph,
} from "../graph-viewer.js";
import {
  generateFindingsExplorer,
  sortFindingsBySeverity,
  filterFindingsBySeverity,
  filterFindingsByCategory,
  filterFindingsBySuppression,
  searchFindings,
  countBySeverity,
  countByCategory,
  getUniqueCategories,
  getSeverityOrder,
} from "../finding-viewer.js";
import { getAllStyles, getBaseStyles } from "../styles.js";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { NormalizedRepoGraph, SymbolNode, GraphRelation } from "../../types/graph.js";
import {
  createMockFinding,
  createMockFindingsArtifact,
  createMockRiskRegisterArtifact,
  createMockTestSeedsArtifact,
  createMockReleaseReadinessArtifact,
} from "../../test-utils/index.js";
import { createRedactionProfile, createRedactionSummary } from "../../redaction/redaction-profile.js";

// Local alias for convenience (matches existing test usage)
const createMockFindings = createMockFindingsArtifact;
const createMockRiskRegister = createMockRiskRegisterArtifact;
const createMockTestSeeds = createMockTestSeedsArtifact;
const createMockReadiness = createMockReleaseReadinessArtifact;

describe("report-viewer", () => {
  let tempOutDir: string;

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-report-viewer-test-${Date.now()}`);
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

  describe("generateReportHtml", () => {
    it("generates valid HTML document structure", () => {
      const artifacts = { findings: createMockFindings() };
      const html = generateReportHtml(artifacts);

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html");
      expect(html).toContain("</html>");
      expect(html).toContain("<head>");
      expect(html).toContain("<body>");
    });

    it("includes embedded CSS styles", () => {
      const artifacts = { findings: createMockFindings() };
      const html = generateReportHtml(artifacts);

      expect(html).toContain("<style>");
      expect(html).toContain("</style>");
      expect(html).toContain("--color-critical");
      expect(html).toContain("--color-high");
    });

    it("includes dark mode CSS variables", () => {
      const artifacts = { findings: createMockFindings() };
      const html = generateReportHtml(artifacts);

      expect(html).toContain("[data-theme=\"dark\"]");
      expect(html).toContain("--color-bg: #1a1a2e");
    });

    it("includes JavaScript for interactivity", () => {
      const artifacts = { findings: createMockFindings() };
      const html = generateReportHtml(artifacts);

      expect(html).toContain("<script>");
      expect(html).toContain("</script>");
      expect(html).toContain("toggleTheme");
      expect(html).toContain("showTab");
    });

    it("includes run metadata in header", () => {
      const findings = createMockFindings({
        run_id: "test-run-abc",
        generated_at: "2025-01-15T10:30:00Z",
        repo: { root: "/test/repo" },
      });
      const html = generateReportHtml({ findings });

      expect(html).toContain("test-run-abc");
      expect(html).toContain("2025-01-15T10:30:00Z");
      expect(html).toContain("/test/repo");
    });

    it("renders redaction summary when a profile is provided", () => {
      const profile = createRedactionProfile("regulated");
      const summary = createRedactionSummary(profile);
      const html = generateReportHtml(
        { findings: createMockFindings() },
        { redactionProfile: profile, redactionSummary: summary }
      );

      expect(html).toContain("Redaction");
      expect(html).toContain("regulated");
      expect(html).toContain("regulated profile requires signer");
    });

    it("supports dark mode default option", () => {
      const artifacts = { findings: createMockFindings() };
      const html = generateReportHtml(artifacts, { darkModeDefault: true });

      expect(html).toContain("data-theme=\"dark\"");
    });

    it("supports light mode default option", () => {
      const artifacts = { findings: createMockFindings() };
      const html = generateReportHtml(artifacts, { darkModeDefault: false });

      expect(html).toContain("data-theme=\"light\"");
    });

    it("includes tabs navigation when showTabs enabled", () => {
      const artifacts = {
        findings: createMockFindings(),
        riskRegister: createMockRiskRegister(),
      };
      const html = generateReportHtml(artifacts, { showTabs: true, showRiskRegister: true });

      expect(html).toContain("class=\"tabs\"");
      expect(html).toContain("Findings");
      expect(html).toContain("Risks");
    });

    it("omits tabs navigation when showTabs disabled", () => {
      const artifacts = { findings: createMockFindings() };
      const html = generateReportHtml(artifacts, { showTabs: false });

      expect(html).not.toContain("class=\"tabs\"");
    });

    it("includes findings explorer with filters", () => {
      const findings = createMockFindings({
        findings: [
          createMockFinding("critical", "security"),
          createMockFinding("high", "auth"),
        ],
      });
      const html = generateReportHtml({ findings }, {
        findingsConfig: { showFilters: true, showSearch: true },
      });

      // Toolbar appears in findings explorer when showFilters is true
      expect(html).toContain("filter-btn");
      expect(html).toContain("Severity:");
      expect(html).toContain("Suppression:");
    });

    it("limits rendered findings for large reports", () => {
      const findings = createMockFindings({
        findings: Array.from({ length: 3 }, (_, i) => ({
          ...createMockFinding("high", "security"),
          id: `large-${i}`,
          title: `Large ${i}`,
        })),
      });

      const html = generateReportHtml(
        { findings },
        { findingsConfig: { maxRenderedFindings: 2 } }
      );

      expect(html).toContain("Viewer limit applied");
      expect(html).toContain("large-0");
      expect(html).toContain("large-1");
      expect(html).not.toContain("large-2");
    });

    it("includes historical comparison tab when artifact is provided", () => {
      const findings = createMockFindings();
      const html = generateReportHtml(
        {
          findings,
          historicalComparison: {
            version: "ctg/v1",
            generated_at: "2026-07-04T00:00:00Z",
            run_id: "hist-1",
            repo: { root: "/repo" },
            tool: { name: "code-to-gate", version: "1.5.0", plugin_versions: [] },
            artifact: "historical-comparison",
            schema: "historical-comparison@v1",
            completeness: "complete",
            currentRun: { run_id: "current", generated_at: "2026-07-04T00:00:00Z", artifact_dir: ".qh" },
            previousRun: { run_id: "previous", generated_at: "2026-07-03T00:00:00Z", artifact_dir: ".qh-prev" },
            findingsComparison: {
              new: [],
              resolved: [],
              unchanged: [],
              modified: [],
              regressions: [],
              summary: {
                totalCurrent: 2,
                totalPrevious: 1,
                newCount: 1,
                resolvedCount: 0,
                unchangedCount: 1,
                modifiedCount: 0,
                regressionCount: 0,
                bySeverity: {
                  critical: { new: 0, resolved: 0, unchanged: 0 },
                  high: { new: 1, resolved: 0, unchanged: 1 },
                  medium: { new: 0, resolved: 0, unchanged: 0 },
                  low: { new: 0, resolved: 0, unchanged: 0 },
                },
                byCategory: {
                  security: { new: 1, resolved: 0, unchanged: 1 },
                },
              },
            },
            riskTrends: {
              trendDirection: "stable",
              trendScore: 0,
              criticalTrend: "stable",
              highTrend: "stable",
              riskScoreChange: 0,
              historyPoints: [
                {
                  run_id: "current",
                  generated_at: "2026-07-04T00:00:00Z",
                  criticalFindings: 0,
                  highFindings: 2,
                  mediumFindings: 0,
                  lowFindings: 0,
                  totalFindings: 2,
                  riskCount: 0,
                  readinessStatus: "passed_with_risk",
                },
              ],
            },
            recommendations: [],
            generated_by: "ctg-historical-v1",
          },
        },
        { showTabs: true, showHistorical: true }
      );

      expect(html).toContain("Historical");
      expect(html).toContain("Historical Diff");
      expect(html).toContain("timeline-chart");
    });

    it("includes QEG evidence and DAG drill-down when artifacts are provided", () => {
      const findings = createMockFindings();
      const html = generateReportHtml(
        {
          findings,
          qegEvidence: {
            version: "ctg.qeg-input/v1",
            producer: "code-to-gate",
            run_id: "qeg-run-1",
            artifact_dir: ".qh",
            findings_summary: {
              total: 1,
              by_severity: { high: 1 },
              by_category: { auth: 1 },
              by_rule: { WEAK_AUTH_GUARD: 1 },
            },
            readiness_status: "blocked_input",
            schema_compliance: [
              { artifact: "findings.json", status: "ok" },
              { artifact: "release-readiness.json", status: "error", errors: ["missing field"] },
            ],
            quality_checks_actual: [
              { name: "assurance_inspection", status: "skipped", details: "not provided" },
            ],
            artifact_hashes: [
              {
                artifact: "findings",
                path: ".qh/findings.json",
                hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              },
            ],
          },
          evidenceDag: {
            version: "ctg/v1",
            generated_at: "2026-07-05T00:00:00Z",
            run_id: "qeg-run-1",
            repo: { root: "." },
            tool: { name: "code-to-gate", version: "1.5.0", plugin_versions: [] },
            artifact: "evidence-dag",
            schema: "evidence-dag@v1",
            completeness: "complete",
            nodes: [
              { id: "finding:finding-auth", type: "finding", label: "Weak auth guard", metadata: { severity: "high" } },
              { id: "manual-test:risk-finding-auth", type: "manual-test", label: "Manual auth verification" },
              { id: "artifact:findings", type: "artifact", label: "findings.json" },
            ],
            edges: [
              {
                id: "finding:finding-auth|requires_manual_oracle|manual-test:risk-finding-auth",
                source: "finding:finding-auth",
                target: "manual-test:risk-finding-auth",
                type: "requires_manual_oracle",
              },
            ],
            summary: {
              nodeCount: 3,
              edgeCount: 1,
              findings: 1,
              artifacts: 1,
              verdicts: 0,
            },
          },
        },
        { showTabs: true, showQeg: true }
      );

      expect(html).toContain("QEG Evidence");
      expect(html).toContain("blocked_input");
      expect(html).toContain("release-readiness.json");
      expect(html).toContain("sha256:aaaaaaaa");
      expect(html).toContain("Finding Drill-down");
      expect(html).toContain("DAG search:");
      expect(html).toContain("qeg-dag-search");
      expect(html).toContain("filterQegDag");
      expect(html).toContain("Weak auth guard");
      expect(html).toContain("Manual Test Candidates");
      expect(html).toContain("Manual auth verification");
      expect(html).toContain("requires_manual_oracle");
    });
  });

  describe("Risk Register Section", () => {
    it("includes risk register when provided", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister({
        risks: [
          {
            id: "risk-001",
            title: "Test Risk",
            severity: "high",
            likelihood: "medium",
            impact: ["Financial loss"],
            confidence: 0.8,
            sourceFindingIds: [],
            evidence: [],
            recommendedActions: ["Fix the issue"],
          },
        ],
      });
      const html = generateReportHtml(
        { findings, riskRegister },
        { showRiskRegister: true }
      );

      expect(html).toContain("Risk Register");
      expect(html).toContain("Test Risk");
      expect(html).toContain("Financial loss");
    });

    it("shows empty state when no risks", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister();
      const html = generateReportHtml(
        { findings, riskRegister },
        { showRiskRegister: true }
      );

      expect(html).toContain("No risks identified");
    });

    it("omits risk section when not configured", () => {
      const findings = createMockFindings();
      const riskRegister = createMockRiskRegister({ risks: [] });
      const html = generateReportHtml(
        { findings, riskRegister },
        { showRiskRegister: false }
      );

      expect(html).not.toContain("Risks-tab");
    });
  });

  describe("Test Seeds Section", () => {
    it("includes test seeds when provided", () => {
      const findings = createMockFindings();
      const testSeeds = createMockTestSeeds({
        seeds: [
          {
            id: "seed-001",
            title: "Test Seed",
            intent: "regression",
            sourceRiskIds: [],
            sourceFindingIds: [],
            evidence: [],
            suggestedLevel: "e2e",
          },
        ],
      });
      const html = generateReportHtml(
        { findings, testSeeds },
        { showTestSeeds: true }
      );

      expect(html).toContain("Test Seeds");
      expect(html).toContain("Test Seed");
    });

    it("shows empty state when no seeds", () => {
      const findings = createMockFindings();
      const testSeeds = createMockTestSeeds();
      const html = generateReportHtml(
        { findings, testSeeds },
        { showTestSeeds: true }
      );

      expect(html).toContain("No test seeds generated");
    });
  });

  describe("Release Readiness Section", () => {
    it("includes readiness section when provided", () => {
      const findings = createMockFindings();
      const readiness = createMockReadiness({
        status: "blocked_input",
        counts: { findings: 1, critical: 1, high: 0, risks: 0, testSeeds: 0, unsupportedClaims: 0 },
        failedConditions: [{ id: "BLOCKING_SEVERITY_CRITICAL", reason: "Critical finding" }],
      });
      const html = generateReportHtml(
        { findings, readiness },
        { showReadiness: true }
      );

      expect(html).toContain("Release Readiness");
      expect(html).toContain("blocked_input");
      expect(html).toContain("Failed Conditions:");
    });

    it("shows passed status with green color", () => {
      const findings = createMockFindings();
      const readiness = createMockReadiness({ status: "passed" });
      const html = generateReportHtml(
        { findings, readiness },
        { showReadiness: true }
      );

      expect(html).toContain("#28a745");
    });

    it("shows blocked_input status with red color", () => {
      const findings = createMockFindings();
      const readiness = createMockReadiness({ status: "blocked_input" });
      const html = generateReportHtml(
        { findings, readiness },
        { showReadiness: true }
      );

      expect(html).toContain("#dc3545");
    });
  });

  describe("writeReportHtml", () => {
    it("writes HTML file to output path", () => {
      const artifacts = { findings: createMockFindings() };
      const outputPath = path.join(tempOutDir, "test-report.html");
      writeReportHtml(outputPath, artifacts);

      expect(existsSync(outputPath)).toBe(true);
    });

    it("written HTML is valid", () => {
      const findings = createMockFindings({ run_id: "write-test" });
      const outputPath = path.join(tempOutDir, "test-report.html");
      writeReportHtml(outputPath, { findings });

      const content = readFileSync(outputPath, "utf8");
      expect(content).toContain("<!DOCTYPE html>");
      expect(content).toContain("write-test");
    });
  });

  describe("generateSimplifiedReport", () => {
    it("generates report without tabs", () => {
      const findings = createMockFindings();
      const html = generateSimplifiedReport(findings);

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).not.toContain("class=\"tabs\"");
    });
  });

  describe("Edge cases", () => {
    it("handles empty findings artifact", () => {
      const artifacts = { findings: createMockFindings() };
      const html = generateReportHtml(artifacts);

      expect(html).toContain("card-value\">0</div>");
      expect(html).toContain("No findings detected");
    });

    it("handles missing findings artifact", () => {
      const html = generateReportHtml({});

      expect(html).toContain("<!DOCTYPE html>");
      // When no findings, shows empty state
      expect(html).toContain("No findings detected");
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
            summary: "Test & special 'chars' \"test\"",
            evidence: [],
          },
        ],
      });
      const html = generateReportHtml({ findings });

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
            summary: "Summary with unicode characters",
            evidence: [],
          },
        ],
      });
      const html = generateReportHtml({ findings });

      expect(html).toContain("Unicode finding");
    });
  });
});

describe("finding-viewer utilities", () => {
  describe("sortFindingsBySeverity", () => {
    it("sorts findings by severity order", () => {
      const findings = [
        createMockFinding("low", "security"),
        createMockFinding("critical", "security"),
        createMockFinding("medium", "security"),
        createMockFinding("high", "security"),
      ];

      const sorted = sortFindingsBySeverity(findings);

      expect(sorted[0].severity).toBe("critical");
      expect(sorted[1].severity).toBe("high");
      expect(sorted[2].severity).toBe("medium");
      expect(sorted[3].severity).toBe("low");
    });
  });

  describe("filterFindingsBySeverity", () => {
    it("filters by specific severity", () => {
      const findings = [
        createMockFinding("critical", "security"),
        createMockFinding("high", "security"),
        createMockFinding("medium", "security"),
      ];

      const filtered = filterFindingsBySeverity(findings, "critical");

      expect(filtered.length).toBe(1);
      expect(filtered[0].severity).toBe("critical");
    });

    it("returns all when severity is 'all'", () => {
      const findings = [
        createMockFinding("critical", "security"),
        createMockFinding("high", "security"),
      ];

      const filtered = filterFindingsBySeverity(findings, "all");

      expect(filtered.length).toBe(2);
    });
  });

  describe("filterFindingsByCategory", () => {
    it("filters by specific category", () => {
      const findings = [
        createMockFinding("high", "security"),
        createMockFinding("high", "auth"),
        createMockFinding("high", "payment"),
      ];

      const filtered = filterFindingsByCategory(findings, "auth");

      expect(filtered.length).toBe(1);
      expect(filtered[0].category).toBe("auth");
    });
  });

  describe("filterFindingsBySuppression", () => {
    it("filters suppressed findings by tag", () => {
      const active = createMockFinding("high", "security");
      const suppressed = { ...createMockFinding("high", "security"), tags: ["suppressed"] };

      expect(filterFindingsBySuppression([active, suppressed], "active")).toEqual([active]);
      expect(filterFindingsBySuppression([active, suppressed], "suppressed")).toEqual([suppressed]);
    });
  });

  describe("searchFindings", () => {
    it("searches by title", () => {
      const findings = [
        { ...createMockFinding("high", "security"), title: "SQL injection vulnerability" },
        { ...createMockFinding("high", "security"), title: "XSS attack vector" },
      ];

      const results = searchFindings(findings, "SQL");

      expect(results.length).toBe(1);
      expect(results[0].title).toContain("SQL");
    });

    it("returns all when query is empty", () => {
      const findings = [
        createMockFinding("high", "security"),
        createMockFinding("medium", "auth"),
      ];

      const results = searchFindings(findings, "");

      expect(results.length).toBe(2);
    });
  });

  describe("countBySeverity", () => {
    it("counts findings by each severity", () => {
      const findings = [
        createMockFinding("critical", "security"),
        createMockFinding("critical", "security"),
        createMockFinding("high", "security"),
        createMockFinding("medium", "security"),
        createMockFinding("low", "security"),
      ];

      const counts = countBySeverity(findings);

      expect(counts.critical).toBe(2);
      expect(counts.high).toBe(1);
      expect(counts.medium).toBe(1);
      expect(counts.low).toBe(1);
    });
  });

  describe("countByCategory", () => {
    it("counts findings by each category", () => {
      const findings = [
        createMockFinding("high", "security"),
        createMockFinding("high", "security"),
        createMockFinding("high", "auth"),
      ];

      const counts = countByCategory(findings);

      expect(counts["security"]).toBe(2);
      expect(counts["auth"]).toBe(1);
    });
  });

  describe("getUniqueCategories", () => {
    it("returns unique categories", () => {
      const findings = [
        createMockFinding("high", "security"),
        createMockFinding("high", "auth"),
        createMockFinding("high", "auth"), // duplicate
      ];

      const categories = getUniqueCategories(findings);

      expect(categories.length).toBe(2);
      expect(categories).toContain("security");
      expect(categories).toContain("auth");
    });
  });

  describe("getSeverityOrder", () => {
    it("returns correct order for critical", () => {
      expect(getSeverityOrder("critical")).toBe(0);
    });

    it("returns correct order for high", () => {
      expect(getSeverityOrder("high")).toBe(1);
    });

    it("returns correct order for medium", () => {
      expect(getSeverityOrder("medium")).toBe(2);
    });

    it("returns correct order for low", () => {
      expect(getSeverityOrder("low")).toBe(3);
    });
  });
});

describe("styles", () => {
  describe("getBaseStyles", () => {
    it("returns CSS with variables", () => {
      const styles = getBaseStyles();

      expect(styles).toContain(":root");
      expect(styles).toContain("--color-critical");
      expect(styles).toContain("--color-bg");
    });

    it("includes dark mode styles", () => {
      const styles = getBaseStyles();

      expect(styles).toContain("[data-theme=\"dark\"]");
    });

    it("includes responsive styles", () => {
      const styles = getBaseStyles();

      expect(styles).toContain("@media (max-width: 768px)");
    });

    it("includes print styles", () => {
      const styles = getBaseStyles();

      expect(styles).toContain("@media print");
    });
  });

  describe("getAllStyles", () => {
    it("combines base and mermaid styles", () => {
      const styles = getAllStyles();

      expect(styles).toContain("--color-critical");
      expect(styles).toContain("--mermaid-node-bg");
    });
  });
});
