import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ownershipCommand } from "../ownership.js";
import { EXIT, VERSION, getOption } from "../exit-codes.js";

let tempRoot: string;
let repoRoot: string;
let artifactDir: string;

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

beforeEach(() => {
  tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-ownership-cli-"));
  repoRoot = path.join(tempRoot, "repo");
  artifactDir = path.join(tempRoot, "artifacts");
  mkdirSync(path.join(repoRoot, ".github"), { recursive: true });
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(path.join(repoRoot, ".github", "CODEOWNERS"), "/src/ @core-team\n", "utf8");
  writeJson(path.join(artifactDir, "repo-graph.json"), {
    version: "ctg/v1",
    generated_at: "2026-01-01T00:00:00.000Z",
    run_id: "ownership-cli-run",
    repo: { root: repoRoot },
    tool: { name: "code-to-gate", version: "test", plugin_versions: [] },
    artifact: "normalized-repo-graph",
    schema: "normalized-repo-graph@v1",
    files: [{
      id: "file:src/index.ts",
      path: "src/index.ts",
      language: "ts",
      role: "source",
      hash: "hash-1",
      sizeBytes: 10,
      lineCount: 1,
      moduleId: "module:src",
      parser: { status: "skipped" },
    }],
    modules: [{ id: "module:src", path: "src", name: "app", packageManager: "npm", workspace: true, dependencies: [] }],
    symbols: [],
    relations: [],
    tests: [],
    configs: [],
    entrypoints: [],
    diagnostics: [],
    stats: { partial: false },
  });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("ownership CLI", () => {
  it("writes an ownership-risk artifact", async () => {
    const exitCode = await ownershipCommand(["--from", artifactDir, "--quiet"], { VERSION, EXIT, getOption });
    const artifact = JSON.parse(readFileSync(path.join(artifactDir, "ownership-risk.json"), "utf8"));

    expect(exitCode).toBe(EXIT.OK);
    expect(artifact).toMatchObject({
      artifact: "ownership-risk",
      schema: "ownership-risk@v1",
      status: "covered",
      reviewerCandidates: [],
    });
    expect(artifact.files[0].owners).toEqual(["@core-team"]);
  });

  it("rejects unknown ownership options", async () => {
    const exitCode = await ownershipCommand(["--bad"], { VERSION, EXIT, getOption });
    expect(exitCode).toBe(EXIT.USAGE_ERROR);
  });
});
