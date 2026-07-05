import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOwnershipRisk, writeOwnershipRisk } from "../ownership-risk.js";
import type { NormalizedRepoGraph } from "../../types/artifacts.js";

let tempRoot: string;
let repoRoot: string;
let artifactDir: string;

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function graph(files: NormalizedRepoGraph["files"]): NormalizedRepoGraph {
  return {
    version: "ctg/v1",
    generated_at: "2026-01-01T00:00:00.000Z",
    run_id: "ownership-test-run",
    repo: { root: repoRoot },
    tool: { name: "code-to-gate", version: "test", plugin_versions: [] },
    artifact: "normalized-repo-graph",
    schema: "normalized-repo-graph@v1",
    files,
    modules: [{ id: "module:src", path: "src", name: "app", packageManager: "npm", workspace: true, dependencies: [] }],
    symbols: [],
    relations: [],
    tests: [],
    configs: [],
    entrypoints: [],
    diagnostics: [],
    stats: { partial: false },
  };
}

beforeEach(() => {
  tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-ownership-"));
  repoRoot = path.join(tempRoot, "repo");
  artifactDir = path.join(tempRoot, "artifacts");
  mkdirSync(path.join(repoRoot, ".github"), { recursive: true });
  mkdirSync(artifactDir, { recursive: true });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("ownership risk", () => {
  it("resolves CODEOWNERS reviewers and high-risk unowned changed modules", () => {
    writeFileSync(path.join(repoRoot, ".github", "CODEOWNERS"), "/src/api/ @api-team\n*.md @docs-team\n", "utf8");
    writeJson(path.join(artifactDir, "repo-graph.json"), graph([
      {
        id: "file:src/api/server.ts",
        path: "src/api/server.ts",
        language: "ts",
        role: "source",
        hash: "hash-1",
        sizeBytes: 100,
        lineCount: 10,
        moduleId: "module:src",
        parser: { status: "skipped" },
      },
      {
        id: "file:src/legacy/old.ts",
        path: "src/legacy/old.ts",
        language: "ts",
        role: "source",
        hash: "hash-2",
        sizeBytes: 80,
        lineCount: 8,
        moduleId: "module:src",
        parser: { status: "skipped" },
      },
      {
        id: "file:README.md",
        path: "README.md",
        language: "unknown",
        role: "docs",
        hash: "hash-3",
        sizeBytes: 20,
        lineCount: 2,
        parser: { status: "skipped" },
      },
    ]));
    writeJson(path.join(artifactDir, "diff-analysis.json"), {
      changed_files: [
        { path: "src/api/server.ts", status: "modified", additions: 1, deletions: 0 },
        { path: "src/legacy/old.ts", status: "modified", additions: 1, deletions: 0 },
      ],
      blast_radius: { affectedFiles: ["src/api/server.ts", "src/legacy/old.ts"] },
    });

    const result = createOwnershipRisk({ version: "test", fromDir: artifactDir, now: new Date("2026-01-01T00:00:00.000Z") });

    expect(result.artifact.status).toBe("partial");
    expect(result.artifact.reviewerCandidates).toEqual(["@api-team"]);
    expect(result.artifact.summary).toMatchObject({
      files: 2,
      ownedFiles: 1,
      unownedFiles: 1,
      highRiskModules: 1,
    });
    expect(result.artifact.files.find((file) => file.path === "src/api/server.ts")?.owners).toEqual(["@api-team"]);
    expect(result.artifact.files.find((file) => file.path === "src/legacy/old.ts")?.risk).toBe("high");
    expect(result.artifact.modules[0]).toMatchObject({ id: "module:src", risk: "high" });
  });

  it("marks the artifact partial and unowned when CODEOWNERS is missing", () => {
    rmSync(path.join(repoRoot, ".github", "CODEOWNERS"), { force: true });
    writeJson(path.join(artifactDir, "repo-graph.json"), graph([
      {
        id: "file:src/index.ts",
        path: "src/index.ts",
        language: "ts",
        role: "source",
        hash: "hash-1",
        sizeBytes: 100,
        lineCount: 10,
        moduleId: "module:src",
        parser: { status: "skipped" },
      },
    ]));

    const result = createOwnershipRisk({ version: "test", fromDir: artifactDir });

    expect(result.artifact.completeness).toBe("partial");
    expect(result.artifact.status).toBe("unowned");
    expect(result.artifact.codeowners.diagnostics[0]?.code).toBe("CODEOWNERS_NOT_FOUND");

    writeOwnershipRisk(result);
    const written = JSON.parse(readFileSync(path.join(artifactDir, "ownership-risk.json"), "utf8"));
    expect(written.artifact).toBe("ownership-risk");
  });
});
