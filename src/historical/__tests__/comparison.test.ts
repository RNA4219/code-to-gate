/**
 * Tests for historical comparison functionality
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import {
  loadFindings,
  loadRisks,
  loadReadiness,
  compareFindings,
  compareRisks,
  compareReadiness,
  analyzeRiskTrends,
  generateHistoricalReport,
} from "../comparison.js";

import {
  FindingsArtifact,
  RiskRegisterArtifact,
  ReleaseReadinessArtifact,
  Finding,
  RiskSeed,
} from "../../types/artifacts.js";

import {
  RunReference,
  FindingsComparisonResult,
} from "../types.js";

import { generateFindingFingerprint } from "../../utils/fingerprint.js";
import {
  createMockFindingsArtifact as createMockFindingsArtifactBase,
  createMockRiskRegisterArtifact as createMockRiskRegisterArtifactBase,
  createMockReleaseReadinessArtifact as createMockReadinessBase,
} from "../../test-utils/index.js";

// Test fixtures - wrappers with specific signatures for this test file
function createMockFindingsArtifact(
  runId: string,
  findings: Finding[]
): FindingsArtifact {
  return createMockFindingsArtifactBase({
    run_id: runId,
    repo: { root: "/test/repo" },
    findings,
  });
}

function createMockRiskRegisterArtifact(
  runId: string,
  risks: RiskSeed[]
): RiskRegisterArtifact {
  return createMockRiskRegisterArtifactBase({
    run_id: runId,
    repo: { root: "/test/repo" },
    risks,
  });
}

function createMockFinding(
  id: string,
  ruleId: string,
  path: string,
  severity: "low" | "medium" | "high" | "critical",
  category: "security" | "auth" | "validation" | "maintainability",
  fingerprint?: string
): Finding {
  const finding: Finding = {
    id,
    ruleId,
    category,
    severity,
    confidence: 0.9,
    title: `Finding ${id}`,
    summary: `Summary for ${id}`,
    evidence: [{ id: `ev-${id}`, path, kind: "ast", startLine: 10 }],
    affectedSymbols: [`symbol:${path}`],
  };
  if (fingerprint) {
    finding.fingerprint = fingerprint;
  }
  return finding;
}

function createMockFindingWithExcerpt(
  id: string,
  ruleId: string,
  path: string,
  excerptHash: string,
  severity: "low" | "medium" | "high" | "critical",
  category: "security" | "auth" | "validation" | "maintainability"
): Finding {
  return {
    id,
    ruleId,
    category,
    severity,
    confidence: 0.9,
    title: `Finding ${id}`,
    summary: `Summary for ${id}`,
    evidence: [{ id: `ev-${id}`, path, kind: "text", excerptHash }],
    affectedSymbols: [`symbolFor:${excerptHash}`],
    fingerprint: generateFindingFingerprint({
      id,
      ruleId,
      category,
      severity,
      confidence: 0.9,
      title: `Finding ${id}`,
      summary: `Summary for ${id}`,
      evidence: [{ id: `ev-${id}`, path, kind: "text", excerptHash }],
      affectedSymbols: [`symbolFor:${excerptHash}`],
    }),
  };
}

// Alias for test compatibility
const createMockRiskRegister = createMockRiskRegisterArtifact;

function createMockReadiness(
  runId: string,
  status: "passed" | "passed_with_risk" | "needs_review" | "blocked",
  critical: number,
  high: number
): ReleaseReadinessArtifact {
  return createMockReadinessBase({
    run_id: runId,
    repo: { root: "/test/repo" },
    status,
    metrics: {
      criticalFindings: critical,
      highFindings: high,
      mediumFindings: 0,
      lowFindings: 0,
      riskCount: 0,
      testSeedCount: 0,
    },
  });
}

function createMockRunReference(artifactDir: string, runId: string): RunReference {
  return {
    run_id: runId,
    generated_at: new Date().toISOString(),
    artifact_dir: artifactDir,
  };
}

describe("Historical Comparison", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = path.join(tmpdir(), `ctg-historical-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    mkdirSync(tempDir, { recursive: true });
  });

  // === Load Findings Tests ===

  describe("loadFindings", () => {
    it("loads findings artifact from directory", () => {
      const findingsDir = path.join(tempDir, "current");
      mkdirSync(findingsDir, { recursive: true });

      const findings = createMockFindingsArtifact("run-current", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security"),
      ]);

      writeFileSync(
        path.join(findingsDir, "findings.json"),
        JSON.stringify(findings),
        "utf8"
      );

      const loaded = loadFindings(findingsDir);
      expect(loaded).toBeDefined();
      expect(loaded?.run_id).toBe("run-current");
      expect(loaded?.findings.length).toBe(1);
    });

    it("returns null if findings.json not found", () => {
      const emptyDir = path.join(tempDir, "empty");
      mkdirSync(emptyDir, { recursive: true });

      const loaded = loadFindings(emptyDir);
      expect(loaded).toBeNull();
    });

    it("returns null for invalid JSON", () => {
      const invalidDir = path.join(tempDir, "invalid");
      mkdirSync(invalidDir, { recursive: true });

      writeFileSync(
        path.join(invalidDir, "findings.json"),
        "not valid json {{{",
        "utf8"
      );

      const loaded = loadFindings(invalidDir);
      expect(loaded).toBeNull();
    });
  });

  // === Compare Findings Tests ===

  describe("compareFindings", () => {
    it("identifies new findings", () => {
      const previous = createMockFindingsArtifact("run-prev", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security"),
      ]);

      const current = createMockFindingsArtifact("run-current", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security"),
        createMockFinding("f2", "RULE_B", "src/b.ts", "medium", "validation"),
      ]);

      const result = compareFindings(current, previous);

      expect(result.new.length).toBe(1);
      expect(result.new[0].ruleId).toBe("RULE_B");
      expect(result.unchanged.length).toBe(1);
      expect(result.resolved.length).toBe(0);
    });

    it("identifies resolved findings", () => {
      const previous = createMockFindingsArtifact("run-prev", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security"),
        createMockFinding("f2", "RULE_B", "src/b.ts", "medium", "validation"),
      ]);

      const current = createMockFindingsArtifact("run-current", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security"),
      ]);

      const result = compareFindings(current, previous);

      expect(result.resolved.length).toBe(1);
      expect(result.resolved[0].ruleId).toBe("RULE_B");
      expect(result.unchanged.length).toBe(1);
      expect(result.new.length).toBe(0);
    });

    it("identifies unchanged findings", () => {
      const previous = createMockFindingsArtifact("run-prev", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security"),
      ]);

      const current = createMockFindingsArtifact("run-current", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security"),
      ]);

      const result = compareFindings(current, previous);

      expect(result.unchanged.length).toBe(1);
      expect(result.new.length).toBe(0);
      expect(result.resolved.length).toBe(0);
    });

    it("identifies modified findings (severity change)", () => {
      const previous = createMockFindingsArtifact("run-prev", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "medium", "security"),
      ]);

      const current = createMockFindingsArtifact("run-current", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security"),
      ]);

      const result = compareFindings(current, previous);

      expect(result.modified.length).toBe(1);
      expect(result.modified[0].severity).toBe("high");
    });

    it("handles empty previous findings", () => {
      const current = createMockFindingsArtifact("run-current", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security"),
      ]);

      const result = compareFindings(current, null);

      expect(result.new.length).toBe(1);
      expect(result.unchanged.length).toBe(0);
      expect(result.resolved.length).toBe(0);
    });

    it("handles empty current findings", () => {
      const previous = createMockFindingsArtifact("run-prev", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security"),
      ]);

      const result = compareFindings(null, previous);

      expect(result.resolved.length).toBe(1);
      expect(result.new.length).toBe(0);
      expect(result.unchanged.length).toBe(0);
    });

    it("matches findings by ruleId and path", () => {
      const previous = createMockFindingsArtifact("run-prev", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security"),
      ]);

      const current = createMockFindingsArtifact("run-current", [
        createMockFinding("f2", "RULE_A", "src/a.ts", "high", "security"), // Different ID but same ruleId + path
      ]);

      const result = compareFindings(current, previous);

      expect(result.unchanged.length).toBe(1);
      expect(result.unchanged[0].matchedOn).toBe("ruleId_path");
    });

    // === Fingerprint Matching Tests (Golden Fixtures) ===

    it("matches findings by fingerprint (path rename stability)", () => {
      // Golden fixture: path renamed but fingerprint stays same due to excerpt hash
      const fingerprint = "fp-stable-abc123";

      const previous = createMockFindingsArtifact("run-prev", [
        createMockFinding("f1", "RULE_A", "src/old-path.ts", "high", "security", fingerprint),
      ]);

      const current = createMockFindingsArtifact("run-current", [
        // Path changed but fingerprint same - should match
        createMockFinding("f2", "RULE_A", "src/new-path.ts", "high", "security", fingerprint),
      ]);

      const result = compareFindings(current, previous);

      expect(result.unchanged.length).toBe(1);
      expect(result.unchanged[0].matchedOn).toBe("fingerprint");
    });

    it("matches findings by fingerprint with excerpt hash", () => {
      // Golden fixture: excerpt hash based matching for code content
      const excerptHash = "sha256:code-content-hash";

      const previous = createMockFindingsArtifact("run-prev", [
        createMockFindingWithExcerpt("f1", "RULE_A", "src/a.ts", excerptHash, "high", "security"),
      ]);

      const current = createMockFindingsArtifact("run-current", [
        // Line moved (different startLine) but same excerpt hash
        createMockFindingWithExcerpt("f2", "RULE_A", "src/a.ts", excerptHash, "high", "security"),
      ]);

      const result = compareFindings(current, previous);

      expect(result.unchanged.length).toBe(1);
      expect(result.unchanged[0].matchedOn).toBe("fingerprint");
    });

    it("fingerprint matching takes priority over ruleId_path", () => {
      // When both fingerprint and ruleId_path are available, fingerprint wins
      const fpSame = "fp-priority-test";

      const previous = createMockFindingsArtifact("run-prev", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security", fpSame),
      ]);

      const current = createMockFindingsArtifact("run-current", [
        // Same fingerprint but different path - fingerprint should match
        createMockFinding("f2", "RULE_A", "src/different.ts", "high", "security", fpSame),
      ]);

      const result = compareFindings(current, previous);

      expect(result.unchanged.length).toBe(1);
      expect(result.unchanged[0].matchedOn).toBe("fingerprint");
    });

    it("handles multiple findings with same ruleId+path using queue", () => {
      // Golden fixture: duplicate findings at same location
      const previous = createMockFindingsArtifact("run-prev", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security"),
        createMockFinding("f2", "RULE_A", "src/a.ts", "medium", "security"),
      ]);

      const current = createMockFindingsArtifact("run-current", [
        createMockFinding("f3", "RULE_A", "src/a.ts", "high", "security"),
        createMockFinding("f4", "RULE_A", "src/a.ts", "medium", "security"),
      ]);

      const result = compareFindings(current, previous);

      // Both should match and be unchanged
      expect(result.unchanged.length).toBe(2);
      expect(result.new.length).toBe(0);
      expect(result.resolved.length).toBe(0);
    });

    it("handles duplicate findings with fingerprints", () => {
      // Multiple findings with different fingerprints at same path
      const previous = createMockFindingsArtifact("run-prev", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security", "fp1"),
        createMockFinding("f2", "RULE_A", "src/a.ts", "medium", "security", "fp2"),
      ]);

      const current = createMockFindingsArtifact("run-current", [
        createMockFinding("f3", "RULE_A", "src/a.ts", "high", "security", "fp1"),
        createMockFinding("f4", "RULE_A", "src/a.ts", "medium", "security", "fp2"),
      ]);

      const result = compareFindings(current, previous);

      expect(result.unchanged.length).toBe(2);
      expect(result.unchanged.every(f => f.matchedOn === "fingerprint")).toBe(true);
    });

    it("generates correct summary counts", () => {
      const previous = createMockFindingsArtifact("run-prev", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security"),
        createMockFinding("f2", "RULE_B", "src/b.ts", "critical", "auth"),
      ]);

      const current = createMockFindingsArtifact("run-current", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security"),
        createMockFinding("f3", "RULE_C", "src/c.ts", "critical", "auth"),
      ]);

      const result = compareFindings(current, previous);

      expect(result.summary.totalCurrent).toBe(2);
      expect(result.summary.totalPrevious).toBe(2);
      expect(result.summary.newCount).toBe(1);
      expect(result.summary.resolvedCount).toBe(1);
      expect(result.summary.unchangedCount).toBe(1);
    });

    it("generates correct bySeverity summary", () => {
      const previous = createMockFindingsArtifact("run-prev", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security"),
        createMockFinding("f2", "RULE_B", "src/b.ts", "critical", "auth"),
      ]);

      const current = createMockFindingsArtifact("run-current", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security"),
        createMockFinding("f3", "RULE_C", "src/c.ts", "critical", "auth"),
      ]);

      const result = compareFindings(current, previous);

      expect(result.summary.bySeverity.critical.new).toBe(1);
      expect(result.summary.bySeverity.critical.resolved).toBe(1);
      expect(result.summary.bySeverity.high.unchanged).toBe(1);
    });

    it("generates correct byCategory summary", () => {
      const previous = createMockFindingsArtifact("run-prev", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security"),
        createMockFinding("f2", "RULE_B", "src/b.ts", "critical", "auth"),
      ]);

      const current = createMockFindingsArtifact("run-current", [
        createMockFinding("f1", "RULE_A", "src/a.ts", "high", "security"),
        createMockFinding("f3", "RULE_C", "src/c.ts", "critical", "auth"),
      ]);

      const result = compareFindings(current, previous);

      expect(result.summary.byCategory.auth.new).toBe(1);
      expect(result.summary.byCategory.auth.resolved).toBe(1);
      expect(result.summary.byCategory.security.unchanged).toBe(1);
    });
  });

  // === Compare Risks Tests ===

  describe("compareRisks", () => {
    it("identifies new risks", () => {
      const previous = createMockRiskRegister("run-prev", [
        { id: "r1", title: "Risk A", severity: "high", likelihood: "medium", impact: ["security"], confidence: 0.9, sourceFindingIds: ["f1"], evidence: [], recommendedActions: [] },
      ]);

      const current = createMockRiskRegister("run-current", [
        { id: "r1", title: "Risk A", severity: "high", likelihood: "medium", impact: ["security"], confidence: 0.9, sourceFindingIds: ["f1"], evidence: [], recommendedActions: [] },
        { id: "r2", title: "Risk B", severity: "medium", likelihood: "low", impact: ["availability"], confidence: 0.8, sourceFindingIds: ["f2"], evidence: [], recommendedActions: [] },
      ]);

      const result = compareRisks(current, previous);

      expect(result.new.length).toBe(1);
      expect(result.new[0].title).toBe("Risk B");
    });

    it("identifies resolved risks", () => {
      const previous = createMockRiskRegister("run-prev", [
        { id: "r1", title: "Risk A", severity: "high", likelihood: "medium", impact: ["security"], confidence: 0.9, sourceFindingIds: ["f1"], evidence: [], recommendedActions: [] },
        { id: "r2", title: "Risk B", severity: "medium", likelihood: "low", impact: ["availability"], confidence: 0.8, sourceFindingIds: ["f2"], evidence: [], recommendedActions: [] },
      ]);

      const current = createMockRiskRegister("run-current", [
        { id: "r1", title: "Risk A", severity: "high", likelihood: "medium", impact: ["security"], confidence: 0.9, sourceFindingIds: ["f1"], evidence: [], recommendedActions: [] },
      ]);

      const result = compareRisks(current, previous);

      expect(result.resolved.length).toBe(1);
      expect(result.resolved[0].title).toBe("Risk B");
    });

    it("identifies evolved risks (severity change)", () => {
      const previous = createMockRiskRegister("run-prev", [
        { id: "r1", title: "Risk A", severity: "medium", likelihood: "medium", impact: ["security"], confidence: 0.9, sourceFindingIds: ["f1"], evidence: [], recommendedActions: [] },
      ]);

      const current = createMockRiskRegister("run-current", [
        { id: "r1", title: "Risk A", severity: "high", likelihood: "medium", impact: ["security"], confidence: 0.9, sourceFindingIds: ["f1"], evidence: [], recommendedActions: [] },
      ]);

      const result = compareRisks(current, previous);

      expect(result.evolved.length).toBe(1);
      expect(result.evolved[0].severity).toBe("high");
    });

    it("handles null risks", () => {
      const result = compareRisks(null, null);

      expect(result.new.length).toBe(0);
      expect(result.resolved.length).toBe(0);
      expect(result.summary.totalCurrent).toBe(0);
      expect(result.summary.totalPrevious).toBe(0);
    });
  });

  // === Compare Readiness Tests ===

  describe("compareReadiness", () => {
    it("identifies status changes", () => {
      const previous = createMockReadiness("run-prev", "passed", 0, 1);
      const current = createMockReadiness("run-current", "needs_review", 1, 2);

      const result = compareReadiness(current, previous);

      expect(result).toBeDefined();
      expect(result?.statusChanged).toBe(true);
      expect(result?.statusDegraded).toBe(true);
      expect(result?.statusImproved).toBe(false);
    });

    it("identifies status improvement", () => {
      const previous = createMockReadiness("run-prev", "needs_review", 2, 3);
      const current = createMockReadiness("run-current", "passed", 0, 0);

      const result = compareReadiness(current, previous);

      expect(result?.statusImproved).toBe(true);
      expect(result?.statusDegraded).toBe(false);
    });

    it("calculates metrics changes", () => {
      const previous = createMockReadiness("run-prev", "passed", 2, 5);
      const current = createMockReadiness("run-current", "passed", 1, 3);

      const result = compareReadiness(current, previous);

      expect(result?.metricsComparison.criticalFindings.change).toBe(-1);
      expect(result?.metricsComparison.highFindings.change).toBe(-2);
    });

    it("returns null if artifacts missing", () => {
      const previous = createMockReadiness("run-prev", "passed", 0, 0);

      const result = compareReadiness(null, previous);
      expect(result).toBeNull();

      const result2 = compareReadiness(previous, null);
      expect(result2).toBeNull();
    });
  });

  // === Risk Trend Analysis Tests ===

  describe("analyzeRiskTrends", () => {
    it("detects improving trend", () => {
      const findingsComparison: FindingsComparisonResult = {
        new: [],
        resolved: [
          { findingId: "f1", ruleId: "RULE_A", status: "resolved", path: "src/a.ts", severity: "high", category: "security", matchedOn: "ruleId_path" },
        ],
        unchanged: [],
        modified: [],
        regressions: [],
        summary: {
          totalCurrent: 0,
          totalPrevious: 1,
          newCount: 0,
          resolvedCount: 1,
          unchangedCount: 0,
          modifiedCount: 0,
          regressionCount: 0,
          bySeverity: { critical: { new: 0, resolved: 0, unchanged: 0 }, high: { new: 0, resolved: 1, unchanged: 0 }, medium: { new: 0, resolved: 0, unchanged: 0 }, low: { new: 0, resolved: 0, unchanged: 0 } },
          byCategory: { security: { new: 0, resolved: 1, unchanged: 0 } } as unknown as Record<string, { new: number; resolved: number; unchanged: number }>,
        },
      };

      const trends = analyzeRiskTrends(findingsComparison, null);

      expect(trends.trendDirection).toBe("improving");
      expect(trends.trendScore).toBeGreaterThan(0);
    });

    it("detects degrading trend", () => {
      const findingsComparison: FindingsComparisonResult = {
        new: [
          { findingId: "f2", ruleId: "RULE_B", status: "new", path: "src/b.ts", severity: "critical", category: "auth", matchedOn: "fuzzy_match" },
        ],
        resolved: [],
        unchanged: [],
        modified: [],
        regressions: [],
        summary: {
          totalCurrent: 2,
          totalPrevious: 1,
          newCount: 1,
          resolvedCount: 0,
          unchangedCount: 0,
          modifiedCount: 0,
          regressionCount: 0,
          bySeverity: { critical: { new: 1, resolved: 0, unchanged: 0 }, high: { new: 0, resolved: 0, unchanged: 0 }, medium: { new: 0, resolved: 0, unchanged: 0 }, low: { new: 0, resolved: 0, unchanged: 0 } },
          byCategory: { auth: { new: 1, resolved: 0, unchanged: 0 } } as unknown as Record<string, { new: number; resolved: number; unchanged: number }>,
        },
      };

      const trends = analyzeRiskTrends(findingsComparison, null);

      expect(trends.trendDirection).toBe("degrading");
      expect(trends.trendScore).toBeLessThan(0);
      expect(trends.criticalTrend).toBe("increasing");
    });

    it("detects stable trend", () => {
      const findingsComparison: FindingsComparisonResult = {
        new: [],
        resolved: [],
        unchanged: [
          { findingId: "f1", ruleId: "RULE_A", status: "unchanged", path: "src/a.ts", severity: "medium", category: "maintainability", matchedOn: "ruleId_path" },
        ],
        modified: [],
        regressions: [],
        summary: {
          totalCurrent: 1,
          totalPrevious: 1,
          newCount: 0,
          resolvedCount: 0,
          unchangedCount: 1,
          modifiedCount: 0,
          regressionCount: 0,
          bySeverity: { critical: { new: 0, resolved: 0, unchanged: 0 }, high: { new: 0, resolved: 0, unchanged: 0 }, medium: { new: 0, resolved: 0, unchanged: 1 }, low: { new: 0, resolved: 0, unchanged: 0 } },
          byCategory: { maintainability: { new: 0, resolved: 0, unchanged: 1 } } as unknown as Record<string, { new: number; resolved: number; unchanged: number }>,
        },
      };

      const trends = analyzeRiskTrends(findingsComparison, null);

      expect(trends.trendDirection).toBe("stable");
    });
  });

  // === Generate Historical Report Tests ===

  describe("generateHistoricalReport", () => {
    it("generates complete report", () => {
      const currentRun = createMockRunReference(tempDir, "run-current");
      const previousRun = createMockRunReference(tempDir, "run-previous");

      const findingsComparison: FindingsComparisonResult = {
        new: [],
        resolved: [],
        unchanged: [],
        modified: [],
        regressions: [],
        summary: {
          totalCurrent: 0,
          totalPrevious: 0,
          newCount: 0,
          resolvedCount: 0,
          unchangedCount: 0,
          modifiedCount: 0,
          regressionCount: 0,
          bySeverity: { critical: { new: 0, resolved: 0, unchanged: 0 }, high: { new: 0, resolved: 0, unchanged: 0 }, medium: { new: 0, resolved: 0, unchanged: 0 }, low: { new: 0, resolved: 0, unchanged: 0 } },
          byCategory: {} as Record<string, { new: number; resolved: number; unchanged: number }>,
        },
      };

      const report = generateHistoricalReport(
        currentRun,
        previousRun,
        findingsComparison
      );

      expect(report.artifact).toBe("historical-comparison");
      expect(report.schema).toBe("historical-comparison@v1");
      expect(report.currentRun.run_id).toBe("run-current");
      expect(report.previousRun.run_id).toBe("run-previous");
      expect(report.riskTrends).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it("includes risks comparison when provided", () => {
      const currentRun = createMockRunReference(tempDir, "run-current");
      const previousRun = createMockRunReference(tempDir, "run-previous");

      const findingsComparison: FindingsComparisonResult = {
        new: [],
        resolved: [],
        unchanged: [],
        modified: [],
        regressions: [],
        summary: {
          totalCurrent: 0,
          totalPrevious: 0,
          newCount: 0,
          resolvedCount: 0,
          unchangedCount: 0,
          modifiedCount: 0,
          regressionCount: 0,
          bySeverity: { critical: { new: 0, resolved: 0, unchanged: 0 }, high: { new: 0, resolved: 0, unchanged: 0 }, medium: { new: 0, resolved: 0, unchanged: 0 }, low: { new: 0, resolved: 0, unchanged: 0 } },
          byCategory: {} as Record<string, { new: number; resolved: number; unchanged: number }>,
        },
      };

      const risksComparison = {
        new: [],
        resolved: [],
        unchanged: [],
        evolved: [],
        summary: {
          totalCurrent: 0,
          totalPrevious: 0,
          newCount: 0,
          resolvedCount: 0,
          unchangedCount: 0,
          evolvedCount: 0,
        },
      };

      const report = generateHistoricalReport(
        currentRun,
        previousRun,
        findingsComparison,
        risksComparison
      );

      expect(report.risksComparison).toBeDefined();
    });

    it("generates recommendations for regressions", () => {
      const currentRun = createMockRunReference(tempDir, "run-current");
      const previousRun = createMockRunReference(tempDir, "run-previous");

      const findingsComparison: FindingsComparisonResult = {
        new: [],
        resolved: [],
        unchanged: [],
        modified: [],
        regressions: [
          { findingId: "f1", ruleId: "RULE_A", status: "new", path: "src/a.ts", severity: "critical", category: "security", matchedOn: "ruleId_path", regression: true },
        ],
        summary: {
          totalCurrent: 1,
          totalPrevious: 0,
          newCount: 0,
          resolvedCount: 0,
          unchangedCount: 0,
          modifiedCount: 0,
          regressionCount: 1,
          bySeverity: { critical: { new: 0, resolved: 0, unchanged: 0 }, high: { new: 0, resolved: 0, unchanged: 0 }, medium: { new: 0, resolved: 0, unchanged: 0 }, low: { new: 0, resolved: 0, unchanged: 0 } },
          byCategory: {} as Record<string, { new: number; resolved: number; unchanged: number }>,
        },
      };

      const report = generateHistoricalReport(
        currentRun,
        previousRun,
        findingsComparison
      );

      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some(r => r.includes("regression"))).toBe(true);
    });
  });
});