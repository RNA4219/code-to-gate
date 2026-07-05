import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { driftBudgetCommand } from "../drift-budget.js";

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

function writeSpecDrift(filePath: string, input: { generatedAt: string; failed: number; warnings: number; checkStatus: "fail" | "warning" | "pass" }): void {
  const checks = [
    {
      id: "schema.public-schemas.registered",
      type: "schema",
      status: input.checkStatus,
      summary: "Schema registration drift.",
      evidence: [{ path: "src/cli/schema-validate.ts", detail: "schema preload" }],
    },
  ];
  writeJson(filePath, {
    version: "ctg/v1",
    generated_at: input.generatedAt,
    run_id: `spec-drift-${input.generatedAt}`,
    repo: { root: "." },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
    artifact: "spec-drift",
    schema: "spec-drift@v1",
    completeness: "complete",
    status: input.failed > 0 ? "failed" : "passed",
    checks,
    findings: input.failed > 0 ? [{
      id: "spec-drift-001",
      severity: "high",
      category: "release-risk",
      title: "Spec drift: schema.public-schemas.registered",
      summary: "Schema registration drift.",
      sourceCheckId: "schema.public-schemas.registered",
      evidence: [{ path: "src/cli/schema-validate.ts", detail: "schema preload" }],
    }] : [],
    summary: {
      checks: checks.length,
      failed: input.failed,
      warnings: input.warnings,
      findings: input.failed,
    },
  });
}

describe("drift-budget CLI", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-drift-budget-"));
  });

  afterEach(() => {
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("writes exceeded drift-budget evidence without blocking normal PR branches", async () => {
    const historyDir = path.join(tempRoot, "history");
    writeSpecDrift(path.join(historyDir, "run-1", "spec-drift.json"), {
      generatedAt: "2026-07-04T00:00:00Z",
      failed: 1,
      warnings: 0,
      checkStatus: "fail",
    });
    writeSpecDrift(path.join(historyDir, "run-2", "spec-drift.json"), {
      generatedAt: "2026-07-05T00:00:00Z",
      failed: 1,
      warnings: 1,
      checkStatus: "warning",
    });

    const exitCode = await driftBudgetCommand([
      "--from",
      historyDir,
      "--out",
      path.join(tempRoot, "out"),
      "--quiet",
    ], { VERSION, EXIT, getOption });

    const artifact = JSON.parse(readFileSync(path.join(tempRoot, "out", "drift-budget.json"), "utf8"));
    expect(exitCode).toBe(EXIT.OK);
    expect(artifact.artifact).toBe("drift-budget");
    expect(artifact.status).toBe("exceeded");
    expect(artifact.branchPolicy.blockOnExceeded).toBe(false);
    expect(artifact.recurrence.count).toBe(1);
    expect(artifact.exceeded.map((entry: { metric: string }) => entry.metric)).toEqual(["failed", "warnings", "recurringChecks"]);
  });

  it("blocks release branches when the budget is exceeded", async () => {
    const artifactDir = path.join(tempRoot, "artifacts");
    writeSpecDrift(path.join(artifactDir, "spec-drift.json"), {
      generatedAt: "2026-07-05T00:00:00Z",
      failed: 1,
      warnings: 0,
      checkStatus: "fail",
    });

    const exitCode = await driftBudgetCommand([
      "--from",
      artifactDir,
      "--release-branch",
      "--branch",
      "release/v1.0.0",
      "--quiet",
    ], { VERSION, EXIT, getOption });

    const artifact = JSON.parse(readFileSync(path.join(artifactDir, "drift-budget.json"), "utf8"));
    expect(exitCode).toBe(EXIT.READINESS_NOT_CLEAR);
    expect(artifact.branchPolicy.releaseBranch).toBe(true);
    expect(artifact.branchPolicy.blockOnExceeded).toBe(true);
    expect(artifact.exceeded[0].severity).toBe("critical");
  });
});
