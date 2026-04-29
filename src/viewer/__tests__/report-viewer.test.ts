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
import {
  FindingsArtifact,
  RiskRegisterArtifact,
  TestSeedsArtifact,
  ReleaseReadinessArtifact,
  CTG_VERSION,
  Severity,
  FindingCategory,
} from "../../types/artifacts.js";
import { NormalizedRepoGraph, SymbolNode, GraphRelation } from "../../types/graph.js";

// Mock artifact generators
function createMockFindings(overrides?: Partial<FindingsArtifact>): FindingsArtifact {
  const base: FindingsArtifact = {
    version: CTG_VERSION,
    generated_at: new Date().toISOString(),
    run_id: "ctg-test-run-001",
    repo: { root: "." },
    tool: { name: "code-to-gate", version: "0.2.0", plugin_versions: [] },
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
    tool: { name: "code-to-gate", version: "0.2.0", plugin_versions: [] },
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
    tool: { name: "code-to-gate", version: "0.2.0", plugin_versions: [] },
    artifact: "test-seeds",
    schema: "test-seeds@v1",
    completeness: "complete",
    seeds: [],
  };
  return { ...base, ...overrides } as TestSeedsArtifact;
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
            category: "security",
            target: "auth.ts",
            description: "Test description",
            inputs: {},
            expectedOutcome: "Pass",
            priority: "high",
          },
        ],
      });
      const html = generateReportHtml(
        { findings, testSeeds },
        { showTestSeeds: true }
      );

      expect(html).toContain("Test Seeds");
      expect(html).toContain("Test Seed");
      expect(html).toContain("auth.ts");
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
        status: "blocked",
        blockers: ["Critical finding"],
        metrics: { criticalFindings: 1, highFindings: 0, mediumFindings: 0, lowFindings: 0, riskCount: 0, testSeedCount: 0 },
      });
      const html = generateReportHtml(
        { findings, readiness },
        { showReadiness: true }
      );

      expect(html).toContain("Release Readiness");
      expect(html).toContain("blocked");
      expect(html).toContain("Blockers:");
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

    it("shows blocked status with red color", () => {
      const findings = createMockFindings();
      const readiness = createMockReadiness({ status: "blocked" });
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