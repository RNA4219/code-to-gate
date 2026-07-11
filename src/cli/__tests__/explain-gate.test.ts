import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { explainGateCommand } from "../explain-gate.js";

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

function writeGateInputs(dir: string): void {
  const header = {
    version: "ctg/v1",
    generated_at: "2026-07-05T00:00:00Z",
    run_id: "explain-gate-run",
    repo: { root: "." },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
  };
  writeJson(path.join(dir, "release-readiness.json"), {
    ...header,
    artifact: "release-readiness",
    schema: "release-readiness@v1",
    completeness: "complete",
    status: "blocked_input",
    summary: "Blocked by high finding and baseline debt.",
    counts: { findings: 2, critical: 0, high: 1, risks: 0, testSeeds: 0, unsupportedClaims: 0 },
    failedConditions: [{ id: "HIGH_FINDING", reason: "High finding blocks release.", matchedFindingIds: ["finding-high"] }],
    recommendedActions: ["Review high finding."],
    baseline: {
      mode: "ratchet",
      source: ".qh/baseline-findings.json",
      baselineFindings: 1,
      currentFindings: 2,
      newFindings: 1,
      worsenedFindings: 0,
      unchangedFindings: 1,
      resolvedFindings: 0,
      gatedFindingIds: ["finding-high"],
      resolvedFindingIds: [],
      expiresAt: "2026-07-01T00:00:00Z",
      expired: true,
    },
    artifactRefs: { findings: "findings.json" },
  });
  writeJson(path.join(dir, "findings.json"), {
    ...header,
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings: [
      {
        id: "finding-high",
        ruleId: "AUTH_BYPASS",
        category: "auth",
        severity: "high",
        confidence: 0.72,
        title: "Admin route lacks an auth guard",
        summary: "The admin route does not check authentication before returning data.",
        evidence: [{ id: "e1", path: "src/admin.ts", kind: "text", excerptHash: "abc123" }],
      },
      {
        id: "finding-low",
        ruleId: "DOC_GAP",
        category: "maintainability",
        severity: "low",
        confidence: 0.95,
        title: "Docs can be clearer",
        summary: "Low severity docs finding.",
        evidence: [],
      },
    ],
    unsupported_claims: [],
  });
}

describe("explain-gate CLI", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-explain-gate-"));
  });

  afterEach(() => {
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("writes gate-explainability artifact from readiness and findings", async () => {
    writeGateInputs(tempRoot);

    const exitCode = await explainGateCommand(["--from", tempRoot, "--quiet"], { VERSION, EXIT, getOption });
    const artifact = JSON.parse(readFileSync(path.join(tempRoot, "gate-explainability.json"), "utf8"));

    expect(exitCode).toBe(EXIT.OK);
    expect(artifact).toMatchObject({
      artifact: "gate-explainability",
      schema: "gate-explainability@v1",
      status: "needs_action",
      summary: {
        failedConditions: 1,
        blockingFindings: 1,
        manualEvidenceCandidates: 1,
        baselineUpdateCandidates: 1,
        severityReEvaluationCandidates: 1,
        requiredActions: 3,
      },
    });
    expect(artifact.blockingFindings[0]).toMatchObject({ id: "finding-high", sourceConditionIds: ["HIGH_FINDING"] });
    expect(artifact.manualEvidenceCandidates[0]).toMatchObject({ type: "manual_evidence", sourceIds: ["finding-high", "HIGH_FINDING"] });
    expect(artifact.baselineUpdateCandidates[0]).toMatchObject({ type: "baseline_update", sourceIds: ["finding-high"] });
    expect(artifact.severityReEvaluationCandidates[0]).toMatchObject({ type: "severity_re_evaluation", sourceIds: ["finding-high", "HIGH_FINDING"] });
  });

  it("rejects missing inputs", async () => {
    const exitCode = await explainGateCommand(["--from", tempRoot, "--quiet"], { VERSION, EXIT, getOption });

    expect(exitCode).toBe(EXIT.USAGE_ERROR);
  });

  it("covers help, option validation, output paths, and malformed inputs", async () => {
    const help = await explainGateCommand(["--help"], { VERSION, EXIT, getOption });
    expect(help).toBe(EXIT.OK);
    expect(await explainGateCommand(["--from"], { VERSION, EXIT, getOption }))
      .toBe(EXIT.USAGE_ERROR);
    expect(await explainGateCommand(["--unknown"], { VERSION, EXIT, getOption }))
      .toBe(EXIT.USAGE_ERROR);
    expect(await explainGateCommand(["unexpected"], { VERSION, EXIT, getOption }))
      .toBe(EXIT.USAGE_ERROR);

    writeGateInputs(tempRoot);
    const outputFile = path.join(tempRoot, "nested", "explain.json");
    expect(await explainGateCommand([
      "--from", tempRoot, "--out", outputFile, "--quiet",
    ], { VERSION, EXIT, getOption })).toBe(EXIT.OK);
    expect(existsSync(outputFile)).toBe(true);

    writeJson(path.join(tempRoot, "findings.json"), { invalid: true });
    expect(await explainGateCommand([
      "--from", tempRoot, "--out", path.join(tempRoot, "bad.json"),
    ], { VERSION, EXIT, getOption })).toBe(EXIT.USAGE_ERROR);
  });
});
