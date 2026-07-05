import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPrReview, writePrReview } from "../pr-review.js";

const VERSION = "0.1.0";

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function header(runId = "pr-review-run"): Record<string, unknown> {
  return {
    version: "ctg/v1",
    generated_at: "2026-07-05T00:00:00Z",
    run_id: runId,
    repo: { root: "." },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
  };
}

function writeCompleteArtifacts(dir: string): void {
  writeJson(path.join(dir, "release-readiness.json"), {
    ...header(),
    artifact: "release-readiness",
    schema: "release-readiness@v1",
    status: "blocked_input",
    completeness: "complete",
    summary: "High severity policy blocked the PR.",
    counts: {
      findings: 1,
      critical: 0,
      high: 1,
      risks: 1,
      testSeeds: 0,
      unsupportedClaims: 0,
    },
    baseline: {
      mode: "ratchet",
      source: ".qh/baseline/findings.json",
      baselineFindings: 3,
      currentFindings: 4,
      newFindings: 1,
      worsenedFindings: 0,
      unchangedFindings: 3,
      resolvedFindings: 0,
      gatedFindingIds: ["finding-001"],
      resolvedFindingIds: [],
    },
    failedConditions: [{
      id: "high",
      reason: "High finding is new in the ratchet gate.",
      matchedFindingIds: ["finding-001"],
    }],
    recommendedActions: ["Review finding-001 before merge."],
    artifactRefs: { findings: path.join(dir, "findings.json") },
  });

  writeJson(path.join(dir, "findings.json"), {
    ...header(),
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings: [{
      id: "finding-001",
      ruleId: "AUTH_BYPASS",
      category: "auth",
      severity: "high",
      confidence: 0.9,
      title: "Auth bypass",
      summary: "Admin route lacks an auth guard.",
      evidence: [{ id: "e1", path: "src/admin.ts", kind: "text", startLine: 12, excerptHash: "abc123" }],
    }],
    unsupported_claims: [],
  });

  writeJson(path.join(dir, "test-plan.json"), {
    ...header(),
    artifact: "test-plan",
    schema: "test-plan@v1",
    completeness: "complete",
    status: "needs_manual_oracle",
    changedFiles: ["src/admin.ts"],
    affectedFiles: ["src/admin.ts", "src/admin.test.ts"],
    recommendedTests: [{
      id: "test-plan-001",
      title: "Run admin auth tests",
      target: "src/admin.test.ts",
      level: "unit",
      priority: "high",
      reason: "Changed admin route requires auth regression coverage.",
      sourcePaths: ["src/admin.ts"],
      evidence: [{ path: "diff-analysis.json", detail: "blast_radius.affectedTests" }],
      command: "npm test -- src/admin.test.ts",
    }],
    oracleGaps: [{
      id: "oracle-001",
      sourcePath: "src/admin.ts",
      reason: "No automated oracle proves negative authorization behavior.",
      suggestedManualTest: "Manually verify unauthorized admin access is denied.",
      evidence: [{ path: "test-plan.json", detail: "oracleGaps" }],
    }],
    summary: {
      changedFiles: 1,
      affectedFiles: 2,
      recommendedTests: 1,
      oracleGaps: 1,
    },
  });

  writeJson(path.join(dir, "spec-drift.json"), {
    ...header(),
    artifact: "spec-drift",
    schema: "spec-drift@v1",
    completeness: "complete",
    status: "failed",
    checks: [{
      id: "schema.public-schemas.registered",
      type: "schema",
      status: "fail",
      summary: "Public schema missing from validator preload.",
      evidence: [{ path: "src/cli/schema-validate.ts", detail: "schemaFiles" }],
    }],
    findings: [{
      id: "spec-drift-001",
      severity: "high",
      category: "release-risk",
      title: "Schema registration drift",
      summary: "Public schema is not preloaded.",
      sourceCheckId: "schema.public-schemas.registered",
      evidence: [{ path: "src/cli/schema-validate.ts", detail: "schemaFiles" }],
    }],
    summary: { checks: 1, failed: 1, warnings: 0, findings: 1 },
  });

  writeJson(path.join(dir, "ownership-risk.json"), {
    ...header(),
    artifact: "ownership-risk",
    schema: "ownership-risk@v1",
    completeness: "complete",
    status: "unowned",
    codeowners: { present: false, entries: 0, diagnostics: [] },
    files: [{
      path: "src/admin.ts",
      role: "source",
      owners: [],
      changed: true,
      risk: "high",
      reasons: ["No CODEOWNERS match was found for this file."],
    }],
    modules: [],
    reviewerCandidates: [],
    summary: {
      files: 1,
      ownedFiles: 0,
      unownedFiles: 1,
      modules: 0,
      modulesWithoutOwner: 0,
      changedFiles: 1,
      highRiskModules: 0,
      reviewerCandidates: 0,
    },
  });
}

describe("pr-review artifact", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-pr-review-"));
  });

  afterEach(() => {
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("builds deterministic PR review sections from gate artifacts", () => {
    writeCompleteArtifacts(tempRoot);

    const result = createPrReview({
      version: VERSION,
      fromDir: tempRoot,
      out: tempRoot,
      now: new Date("2026-07-05T00:00:00Z"),
    });

    expect(result.artifact).toMatchObject({
      artifact: "pr-review",
      schema: "pr-review@v1",
      status: "block",
      completeness: "complete",
      summary: {
        blockReasons: 3,
        additionalTests: 2,
        specDiffs: 1,
        readinessStatus: "blocked_input",
        findings: 1,
        high: 1,
      },
    });
    expect(result.artifact.sections.blockReasons.map((reason) => reason.id)).toEqual(
      expect.arrayContaining(["readiness-high", "spec-drift-spec-drift-001", "ownership-src/admin.ts"])
    );
    expect(result.artifact.sections.baselineSummary?.detail).toContain("1 new");
    expect(result.markdown).toContain("### Blocking Reasons");
    expect(result.markdown).toContain("### Suggested Tests");
    expect(result.markdown).toContain("### Spec Drift");
    expect(result.markdown).toContain("### Evidence Links");
  });

  it("writes pr-review.json and pr-review.md", () => {
    writeCompleteArtifacts(tempRoot);
    const result = createPrReview({
      version: VERSION,
      fromDir: tempRoot,
      out: tempRoot,
      now: new Date("2026-07-05T00:00:00Z"),
    });

    writePrReview(result);

    expect(existsSync(path.join(tempRoot, "pr-review.json"))).toBe(true);
    expect(existsSync(path.join(tempRoot, "pr-review.md"))).toBe(true);
    expect(JSON.parse(readFileSync(path.join(tempRoot, "pr-review.json"), "utf8")).status).toBe("block");
    expect(readFileSync(path.join(tempRoot, "pr-review.md"), "utf8")).toContain("code-to-gate PR Review");
  });

  it("passes when readiness and spec drift evidence are clean", () => {
    writeJson(path.join(tempRoot, "release-readiness.json"), {
      ...header("clean-run"),
      artifact: "release-readiness",
      schema: "release-readiness@v1",
      status: "passed",
      completeness: "complete",
      summary: "Ready for merge.",
      counts: { findings: 0, critical: 0, high: 0, risks: 0, testSeeds: 0, unsupportedClaims: 0 },
      failedConditions: [],
      recommendedActions: [],
      artifactRefs: {},
    });
    writeJson(path.join(tempRoot, "findings.json"), {
      ...header("clean-run"),
      artifact: "findings",
      schema: "findings@v1",
      completeness: "complete",
      findings: [],
      unsupported_claims: [],
    });
    writeJson(path.join(tempRoot, "spec-drift.json"), {
      ...header("clean-run"),
      artifact: "spec-drift",
      schema: "spec-drift@v1",
      completeness: "complete",
      status: "passed",
      checks: [],
      findings: [],
      summary: { checks: 0, failed: 0, warnings: 0, findings: 0 },
    });
    writeJson(path.join(tempRoot, "test-plan.json"), {
      ...header("clean-run"),
      artifact: "test-plan",
      schema: "test-plan@v1",
      completeness: "complete",
      status: "no_changes",
      changedFiles: [],
      affectedFiles: [],
      recommendedTests: [],
      oracleGaps: [],
      summary: { changedFiles: 0, affectedFiles: 0, recommendedTests: 0, oracleGaps: 0 },
    });

    const result = createPrReview({
      version: VERSION,
      fromDir: tempRoot,
      now: new Date("2026-07-05T00:00:00Z"),
    });

    expect(result.artifact.status).toBe("pass");
    expect(result.artifact.sections.blockReasons).toEqual([]);
    expect(result.artifact.sections.acceptableReasons.length).toBeGreaterThan(0);
  });
});
