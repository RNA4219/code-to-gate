import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { queryCommand } from "../query.js";

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
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("query CLI", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-query-"));
    writeJson(path.join(tempRoot, "findings.json"), {
      version: "ctg/v1",
      generated_at: "2026-07-05T00:00:00Z",
      run_id: "query-run",
      repo: { root: "." },
      tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
      artifact: "findings",
      schema: "findings@v1",
      completeness: "complete",
      findings: [
        { id: "finding-high", severity: "high", ruleId: "AUTH", category: "auth", title: "High", summary: "High finding", confidence: 0.9, evidence: [] },
        { id: "finding-low", severity: "low", ruleId: "DOC", category: "docs", title: "Low", summary: "Low finding", confidence: 0.5, evidence: [] },
      ],
      unsupported_claims: [],
    });
    writeJson(path.join(tempRoot, "release-readiness.json"), {
      version: "ctg/v1",
      generated_at: "2026-07-05T00:00:00Z",
      run_id: "readiness-run",
      repo: { root: "." },
      tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
      artifact: "release-readiness",
      schema: "release-readiness@v1",
      completeness: "complete",
      status: "blocked_input",
      summary: "Blocked",
      counts: { findings: 2, critical: 0, high: 1, risks: 0, testSeeds: 0, unsupportedClaims: 0 },
      failedConditions: [],
      recommendedActions: [],
      baseline: {
        source: ".qh/baseline-findings.json",
        baselineFindings: 1,
        newFindings: 1,
        worsenedFindings: 0,
        unchangedFindings: 1,
        resolvedFindings: 0,
        gatedFindingIds: ["finding-high"],
        expired: true,
      },
    });
  });

  afterEach(() => {
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("queries findings by severity rank", async () => {
    const exitCode = await queryCommand(["finding where severity >= high", "--from", tempRoot, "--quiet"], { VERSION, EXIT, getOption });
    const artifact = JSON.parse(readFileSync(path.join(tempRoot, "evidence-query.json"), "utf8"));

    expect(exitCode).toBe(EXIT.OK);
    expect(artifact.artifact).toBe("evidence-query");
    expect(artifact.query.domain).toBe("finding");
    expect(artifact.summary.resultCount).toBe(1);
    expect(artifact.matches[0]).toMatchObject({ id: "finding-high", type: "finding" });
  });

  it("queries artifacts by schema", async () => {
    const exitCode = await queryCommand(["artifact where schema = findings@v1", "--from", tempRoot, "--quiet"], { VERSION, EXIT, getOption });
    const artifact = JSON.parse(readFileSync(path.join(tempRoot, "evidence-query.json"), "utf8"));

    expect(exitCode).toBe(EXIT.OK);
    expect(artifact.summary.resultCount).toBe(1);
    expect(artifact.matches[0]).toMatchObject({ id: "artifact:findings.json", type: "artifact" });
  });

  it("queries baseline fields", async () => {
    const exitCode = await queryCommand(["baseline where expired = true", "--from", tempRoot, "--quiet"], { VERSION, EXIT, getOption });
    const artifact = JSON.parse(readFileSync(path.join(tempRoot, "evidence-query.json"), "utf8"));

    expect(exitCode).toBe(EXIT.OK);
    expect(artifact.summary.resultCount).toBe(1);
    expect(artifact.matches[0]).toMatchObject({ type: "baseline", locator: "release-readiness.json#baseline" });
  });

  it("rejects unsupported expressions", async () => {
    const exitCode = await queryCommand(["finding severity high", "--from", tempRoot, "--quiet"], { VERSION, EXIT, getOption });

    expect(exitCode).toBe(EXIT.USAGE_ERROR);
  });
});
