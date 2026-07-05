import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { testPlanCommand } from "../test-plan.js";

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

function writeArtifacts(artifactDir: string): void {
  const header = {
    version: "ctg/v1",
    generated_at: "2026-01-01T00:00:00Z",
    run_id: "test-plan-run",
    repo: { root: "." },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
  };

  writeJson(path.join(artifactDir, "repo-graph.json"), {
    ...header,
    artifact: "normalized-repo-graph",
    schema: "normalized-repo-graph@v1",
    files: [
      {
        id: "file:src/order.ts",
        path: "src/order.ts",
        language: "ts",
        role: "source",
        hash: "order",
        sizeBytes: 10,
        lineCount: 1,
        parser: { status: "text_fallback" },
      },
      {
        id: "file:src/order.test.ts",
        path: "src/order.test.ts",
        language: "ts",
        role: "test",
        hash: "order-test",
        sizeBytes: 10,
        lineCount: 1,
        parser: { status: "text_fallback" },
      },
      {
        id: "file:src/payment.ts",
        path: "src/payment.ts",
        language: "ts",
        role: "source",
        hash: "payment",
        sizeBytes: 10,
        lineCount: 1,
        parser: { status: "text_fallback" },
      },
    ],
    modules: [],
    symbols: [],
    relations: [],
    tests: [],
    configs: [],
    entrypoints: [],
    diagnostics: [],
    stats: { partial: false },
  });

  writeJson(path.join(artifactDir, "diff-analysis.json"), {
    ...header,
    repo: { root: ".", base_ref: "main", head_ref: "HEAD" },
    artifact: "diff-analysis",
    schema: "diff-analysis@v1",
    changed_files: [
      { path: "src/order.ts", status: "modified", additions: 1, deletions: 0 },
      { path: "src/payment.ts", status: "modified", additions: 1, deletions: 0 },
    ],
    blast_radius: {
      affectedFiles: ["src/order.ts", "src/payment.ts"],
      affectedSymbols: [],
      affectedTests: ["src/order.test.ts"],
      affectedEntrypoints: [],
    },
    diff_findings: {
      new_findings: [],
      potentially_affected_findings: [],
      resolved_findings: [],
    },
  });
}

describe("test-plan CLI", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-test-plan-"));
  });

  afterEach(() => {
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("generates recommended tests and oracle gaps from artifacts", async () => {
    const artifactDir = path.join(tempRoot, "artifacts");
    const outDir = path.join(tempRoot, "out");
    writeArtifacts(artifactDir);

    const exitCode = await testPlanCommand(["--from", artifactDir, "--out", outDir, "--quiet"], {
      VERSION,
      EXIT,
      getOption,
    });
    const plan = JSON.parse(readFileSync(path.join(outDir, "test-plan.json"), "utf8"));

    expect(exitCode).toBe(EXIT.OK);
    expect(plan).toMatchObject({
      artifact: "test-plan",
      schema: "test-plan@v1",
      status: "needs_manual_oracle",
    });
    expect(plan.recommendedTests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "src/order.test.ts",
          reason: "Test was listed in diff blast radius.",
        }),
      ])
    );
    expect(plan.oracleGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourcePath: "src/payment.ts",
          manualTestDraft: expect.objectContaining({
            priority: "high",
            sourcePath: "src/payment.ts",
          }),
        }),
      ])
    );
  });

  it("returns usage error when repo graph is missing", async () => {
    const artifactDir = path.join(tempRoot, "missing");
    mkdirSync(artifactDir, { recursive: true });

    const exitCode = await testPlanCommand(["--from", artifactDir, "--quiet"], {
      VERSION,
      EXIT,
      getOption,
    });

    expect(exitCode).toBe(EXIT.USAGE_ERROR);
  });
});
