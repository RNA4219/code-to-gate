import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { prReviewCommand } from "../pr-review.js";

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

function writeReadiness(dir: string, status: "passed" | "blocked_input"): void {
  const header = {
    version: "ctg/v1",
    generated_at: "2026-07-05T00:00:00Z",
    run_id: "pr-review-cli-run",
    repo: { root: "." },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
  };
  writeJson(path.join(dir, "release-readiness.json"), {
    ...header,
    artifact: "release-readiness",
    schema: "release-readiness@v1",
    status,
    completeness: "complete",
    summary: status === "passed" ? "Ready." : "Blocked.",
    counts: { findings: status === "passed" ? 0 : 1, critical: 0, high: status === "passed" ? 0 : 1, risks: 0, testSeeds: 0, unsupportedClaims: 0 },
    failedConditions: status === "passed" ? [] : [{ id: "high", reason: "High finding present.", matchedFindingIds: ["finding-001"] }],
    recommendedActions: [],
    artifactRefs: { findings: path.join(dir, "findings.json") },
  });
  writeJson(path.join(dir, "findings.json"), {
    ...header,
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings: status === "passed" ? [] : [{
      id: "finding-001",
      ruleId: "AUTH_BYPASS",
      category: "auth",
      severity: "high",
      confidence: 0.9,
      title: "Auth bypass",
      summary: "Admin route lacks an auth guard.",
      evidence: [{ id: "e1", path: "src/admin.ts", kind: "text", excerptHash: "abc123" }],
    }],
    unsupported_claims: [],
  });
}

describe("pr-review CLI", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-pr-review-cli-"));
  });

  afterEach(() => {
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("writes pr-review artifacts and returns READINESS_NOT_CLEAR on block", async () => {
    const artifactDir = path.join(tempRoot, "artifacts");
    const outDir = path.join(tempRoot, "out");
    writeReadiness(artifactDir, "blocked_input");

    const exitCode = await prReviewCommand([
      "--from",
      artifactDir,
      "--out",
      outDir,
      "--quiet",
    ], { VERSION, EXIT, getOption });

    const artifact = JSON.parse(readFileSync(path.join(outDir, "pr-review.json"), "utf8"));
    const markdown = readFileSync(path.join(outDir, "pr-review.md"), "utf8");

    expect(exitCode).toBe(EXIT.READINESS_NOT_CLEAR);
    expect(artifact.status).toBe("block");
    expect(artifact.sections.blockReasons).toHaveLength(1);
    expect(markdown).toContain("### Blocking Reasons");
  });

  it("supports a separate comment file and returns OK when review passes", async () => {
    const artifactDir = path.join(tempRoot, "artifacts");
    const outDir = path.join(tempRoot, "out");
    const commentFile = path.join(tempRoot, "comment.md");
    writeReadiness(artifactDir, "passed");

    const exitCode = await prReviewCommand([
      "--from",
      artifactDir,
      "--out",
      outDir,
      "--comment-file",
      commentFile,
      "--artifact-url",
      "https://example.com/report.html",
      "--quiet",
    ], { VERSION, EXIT, getOption });

    const artifact = JSON.parse(readFileSync(path.join(outDir, "pr-review.json"), "utf8"));

    expect(exitCode).toBe(EXIT.OK);
    expect(artifact.status).toBe("pass");
    expect(artifact.markdown.path.replace(/\\/g, "/")).toContain("comment.md");
    expect(readFileSync(commentFile, "utf8")).toContain("https://example.com/report.html");
  });

  it("rejects unknown options", async () => {
    const exitCode = await prReviewCommand(["--bad"], { VERSION, EXIT, getOption });

    expect(exitCode).toBe(EXIT.USAGE_ERROR);
  });
});
