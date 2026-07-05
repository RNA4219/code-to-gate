import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { baselineLedgerCommand } from "../baseline-ledger.js";

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

function writeReadiness(dir: string): void {
  writeJson(path.join(dir, "release-readiness.json"), {
    version: "ctg/v1",
    generated_at: "2026-07-05T00:00:00Z",
    run_id: "readiness-ledger-source",
    repo: { root: "." },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
    artifact: "release-readiness",
    schema: "release-readiness@v1",
    completeness: "complete",
    status: "passed_with_risk",
    summary: "Baseline expired.",
    counts: { findings: 2, critical: 0, high: 1, risks: 0, testSeeds: 0, unsupportedClaims: 0 },
    baseline: {
      mode: "ratchet",
      source: ".ctg/baseline-findings.json",
      baselineFindings: 2,
      currentFindings: 2,
      newFindings: 0,
      worsenedFindings: 1,
      unchangedFindings: 1,
      resolvedFindings: 0,
      gatedFindingIds: ["finding-worse"],
      resolvedFindingIds: [],
      owner: "@quality",
      expiresAt: "2026-07-01T00:00:00Z",
      expired: true,
    },
    failedConditions: [],
    recommendedActions: [],
    artifactRefs: { baseline: ".ctg/baseline-findings.json" },
  });
}

describe("baseline-ledger CLI", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-baseline-ledger-"));
  });

  afterEach(() => {
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("writes baseline-debt-ledger evidence from release-readiness baseline", async () => {
    const artifactDir = path.join(tempRoot, "artifacts");
    const outDir = path.join(tempRoot, "out");
    writeReadiness(artifactDir);

    const exitCode = await baselineLedgerCommand([
      "--from",
      artifactDir,
      "--out",
      outDir,
      "--approver",
      "@lead",
      "--approval-reason",
      "Accepted as release debt for this run.",
      "--refresh-reason",
      "Debt expired before release.",
      "--estimated-effort",
      "2d",
      "--prevention-note",
      "Add regression tests before the next refresh.",
      "--quiet",
    ], { VERSION, EXIT, getOption });
    const artifact = JSON.parse(readFileSync(path.join(outDir, "baseline-debt-ledger.json"), "utf8"));

    expect(exitCode).toBe(EXIT.OK);
    expect(artifact.artifact).toBe("baseline-debt-ledger");
    expect(artifact.schema).toBe("baseline-debt-ledger@v1");
    expect(artifact.status).toBe("expired");
    expect(artifact.summary).toMatchObject({ items: 1, active: 0, expired: 1, unowned: 0 });
    expect(artifact.items[0]).toMatchObject({
      owner: "@quality",
      expiresAt: "2026-07-01",
      expired: true,
      approver: "@lead",
      approvalReason: "Accepted as release debt for this run.",
      refreshReason: "Debt expired before release.",
      estimatedEffort: "2d",
      preventionNote: "Add regression tests before the next refresh.",
      sourceArtifact: "release-readiness.json",
      sourceIds: ["finding-worse"],
      baselineSource: ".ctg/baseline-findings.json",
    });
  });

  it("writes an empty ledger when readiness has no baseline summary", async () => {
    const artifactDir = path.join(tempRoot, "artifacts-empty");
    writeJson(path.join(artifactDir, "release-readiness.json"), {
      version: "ctg/v1",
      generated_at: "2026-07-05T00:00:00Z",
      run_id: "readiness-no-baseline",
      repo: { root: "." },
      tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
      artifact: "release-readiness",
      schema: "release-readiness@v1",
      completeness: "complete",
      status: "passed",
      summary: "Ready.",
      counts: { findings: 0, critical: 0, high: 0, risks: 0, testSeeds: 0, unsupportedClaims: 0 },
      failedConditions: [],
      recommendedActions: [],
      artifactRefs: {},
    });

    const exitCode = await baselineLedgerCommand(["--from", artifactDir, "--quiet"], { VERSION, EXIT, getOption });
    const artifact = JSON.parse(readFileSync(path.join(artifactDir, "baseline-debt-ledger.json"), "utf8"));

    expect(exitCode).toBe(EXIT.OK);
    expect(artifact.status).toBe("empty");
    expect(artifact.completeness).toBe("partial");
    expect(artifact.items).toEqual([]);
  });
});
