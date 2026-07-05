import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { reviewQueueCommand } from "../review-queue.js";

const EXIT = {
  OK: 0,
  READINESS_NOT_CLEAR: 1,
  USAGE_ERROR: 2,
  SCAN_FAILED: 3,
  LLM_FAILED: 4,
  POLICY_FAILED: 5,
  PLUGIN_FAILED: 6,
  SCHEMA_FAILED: 7,
  IMPORT_FAILED: 8,
  INTEGRATION_EXPORT_FAILED: 9,
  INTERNAL_ERROR: 10,
  ASSURANCE_FAILED: 11,
};

const VERSION = "0.1.0";

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function writeQueueSources(dir: string): void {
  const header = {
    version: "ctg/v1",
    generated_at: "2026-07-05T00:00:00Z",
    run_id: "review-queue-source-run",
    repo: { root: "." },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
  };
  writeJson(path.join(dir, "historical-comparison.json"), {
    ...header,
    artifact: "historical-comparison",
    schema: "historical-comparison@v1",
    completeness: "complete",
    currentRun: { runId: "current", artifactDir: ".qh/current" },
    previousRun: { runId: "previous", artifactDir: ".qh/previous" },
    findingsComparison: { new: [], resolved: [], unchanged: [], modified: [], regressions: [], summary: { totalCurrent: 0, totalPrevious: 0, newCount: 0, resolvedCount: 0, unchangedCount: 0, modifiedCount: 0, regressionCount: 0, bySeverity: {}, byCategory: {} } },
    riskTrends: { status: "stable", signals: [], summary: { totalSignals: 0, worsening: 0, improving: 0, stable: 0 } },
    qualitySlo: {
      status: "breached",
      blockerRegressions: 0,
      criticalOrHighIncrease: 2,
      highFindingsIncreaseRate: 0.4,
      readinessDegraded: true,
      indicators: [{ id: "slo-high-findings", status: "fail", summary: "High findings increased by 40%." }],
    },
    recommendations: [],
    generated_by: "ctg-historical-v1",
  });
  writeJson(path.join(dir, "release-readiness.json"), {
    ...header,
    artifact: "release-readiness",
    schema: "release-readiness@v1",
    completeness: "complete",
    status: "passed_with_risk",
    summary: "Baseline expired.",
    counts: { findings: 1, critical: 0, high: 1, risks: 0, testSeeds: 0, unsupportedClaims: 0 },
    baseline: {
      mode: "ratchet",
      source: ".ctg/baseline.json",
      baselineFindings: 1,
      currentFindings: 1,
      newFindings: 0,
      worsenedFindings: 0,
      unchangedFindings: 1,
      resolvedFindings: 0,
      gatedFindingIds: ["finding-001"],
      resolvedFindingIds: [],
      owner: "@quality",
      expiresAt: "2026-07-01",
      expired: true,
    },
    failedConditions: [],
    recommendedActions: [],
    artifactRefs: {},
  });
  writeJson(path.join(dir, "test-plan.json"), {
    ...header,
    artifact: "test-plan",
    schema: "test-plan@v1",
    completeness: "complete",
    status: "needs_manual_oracle",
    changedFiles: [],
    affectedFiles: [],
    recommendedTests: [],
    oracleGaps: [{
      id: "oracle-001",
      sourcePath: "src/payment.ts",
      reason: "Changed source lacks mapped automated tests.",
      suggestedManualTest: "Manually verify payment fallback.",
      evidence: [{ path: "test-plan.json", detail: "oracle gap" }],
    }],
    summary: { changedFiles: 0, affectedFiles: 0, recommendedTests: 0, oracleGaps: 1 },
  });
  writeJson(path.join(dir, "drift-budget.json"), {
    ...header,
    artifact: "drift-budget",
    schema: "drift-budget@v1",
    completeness: "complete",
    status: "exceeded",
    current: { sourceArtifact: ".qh/spec-drift.json", failed: 0, warnings: 1, findings: 0 },
    recurrence: {
      recurringChecks: [{
        id: "schema.public-schemas.registered",
        occurrences: 2,
        statuses: ["warning"],
        sourceArtifacts: [".qh/run-1/spec-drift.json", ".qh/run-2/spec-drift.json"],
      }],
      count: 1,
    },
    budget: { failed: 0, warnings: 0, recurringChecks: 0 },
    branchPolicy: { releaseBranch: false, blockOnExceeded: false },
    exceeded: [],
    sourceArtifacts: [{ path: ".qh/spec-drift.json", hashSha256: "a".repeat(64), generatedAt: "2026-07-05T00:00:00Z" }],
    summary: { status: "exceeded", failed: 0, warnings: 1, recurringChecks: 1, exceeded: 1 },
    generated_by: "ctg-drift-budget-v1",
  });
}

describe("review-queue CLI", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-review-queue-"));
  });

  afterEach(() => {
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("writes queue items for SLO, baseline expiry, oracle gaps, and drift recurrence", async () => {
    const artifactDir = path.join(tempRoot, "artifacts");
    const outDir = path.join(tempRoot, "out");
    writeQueueSources(artifactDir);

    const exitCode = await reviewQueueCommand(["--from", artifactDir, "--out", outDir, "--quiet"], { VERSION, EXIT, getOption });
    const artifact = JSON.parse(readFileSync(path.join(outDir, "review-queue.json"), "utf8"));

    expect(exitCode).toBe(EXIT.OK);
    expect(artifact.artifact).toBe("review-queue");
    expect(artifact.schema).toBe("review-queue@v1");
    expect(artifact.summary.items).toBe(4);
    expect(artifact.summary.byType).toMatchObject({
      slo_breach: 1,
      baseline_expiry: 1,
      manual_oracle_gap: 1,
      spec_drift_recurrence: 1,
    });
    expect(artifact.items.every((item: { status: string }) => item.status === "open")).toBe(true);
    expect(artifact.items.find((item: { type: string }) => item.type === "baseline_expiry").owner).toBe("@quality");
  });

  it("rejects unknown options", async () => {
    const exitCode = await reviewQueueCommand(["--bad"], { VERSION, EXIT, getOption });

    expect(exitCode).toBe(EXIT.USAGE_ERROR);
  });
});
