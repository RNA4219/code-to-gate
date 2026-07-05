import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { qeosCommand } from "../qeos.js";

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

function writeFile(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

describe("qeos matrix CLI", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-qeos-"));
    writeFile(
      path.join(repoRoot, "docs", "quality-evidence-os-requirements.md"),
      [
        "| ID | Name | Priority | Requirement |",
        "|---|---|---|---|",
        "| QEOS-031 | Evidence Query Language | P2 | Query artifacts |",
        "| QEOS-041 | GitHub App Health Evidence | P1 | Health evidence |",
        "| QEOS-042 | QEOS Acceptance Matrix Artifact | P0 | Matrix evidence |",
      ].join("\n")
    );
    writeFile(
      path.join(repoRoot, "orchestration", "quality-evidence-os-implementation.md"),
      [
        "## Task Seed QEOS-P2-11 Evidence Query Language",
        "Objective: Query artifacts.",
        "Status: done",
        "Requirements:",
        "- `evidence-query@v1` exists.",
        "Commands:",
        "- `npx vitest run src/cli/__tests__/query.test.ts --reporter=dot`",
        "",
        "## Task Seed QEOS-P1-21 GitHub App Health Evidence",
        "Objective: Health evidence.",
        "Status: done",
        "Requirements:",
        "- `github-app-health@v1` exists.",
        "Commands:",
        "- `npx vitest run src/cli/__tests__/pr-review-publish.test.ts --reporter=dot`",
        "",
        "## Task Seed QEOS-P0-22 QEOS Acceptance Matrix Artifact",
        "Objective: Matrix evidence.",
        "Status: planned",
        "Requirements:",
        "- `qeos-acceptance-matrix@v1` exists.",
        "Commands:",
        "- `npx vitest run src/cli/__tests__/qeos-matrix.test.ts --reporter=dot`",
      ].join("\n")
    );
    mkdirSync(path.join(repoRoot, "schemas"), { recursive: true });
    writeFile(path.join(repoRoot, "schemas", "evidence-query.schema.json"), "{}");
    writeFile(path.join(repoRoot, "schemas", "github-app-health.schema.json"), "{}");
    writeFile(path.join(repoRoot, "src", "cli.ts"), 'if (command === "query") {}\nif (command === "pr-review-publish") {}\nif (command === "qeos") {}\n');
  });

  afterEach(() => {
    if (existsSync(repoRoot)) {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("writes qeos-acceptance-matrix.json from requirements and task seeds", async () => {
    const outDir = path.join(repoRoot, ".qh");
    const exitCode = await qeosCommand(["matrix", "--from", repoRoot, "--out", outDir, "--quiet"], { VERSION, EXIT, getOption });
    const artifact = JSON.parse(readFileSync(path.join(outDir, "qeos-acceptance-matrix.json"), "utf8"));

    expect(exitCode).toBe(EXIT.OK);
    expect(artifact.artifact).toBe("qeos-acceptance-matrix");
    expect(artifact.schema).toBe("qeos-acceptance-matrix@v1");
    expect(artifact.summary.total).toBe(3);
    expect(artifact.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ qeosId: "QEOS-031", status: "done", schemas: ["evidence-query.schema.json"] }),
        expect.objectContaining({ qeosId: "QEOS-041", status: "done", schemas: ["github-app-health.schema.json"] }),
        expect.objectContaining({ qeosId: "QEOS-042", status: "planned" }),
      ])
    );
  });

  it("rejects unknown qeos commands", async () => {
    const exitCode = await qeosCommand(["unknown", "--quiet"], { VERSION, EXIT, getOption });

    expect(exitCode).toBe(EXIT.USAGE_ERROR);
  });
});
