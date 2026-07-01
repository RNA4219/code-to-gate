import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildGraph, clearGraphCache } from "../repo-graph-builder.js";

let tempRoot: string | undefined;

afterEach(() => {
  clearGraphCache();
  if (tempRoot) {
    rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

function runGit(repoRoot: string, args: string[]): void {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 10000,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
}

describe("repo-graph-builder", () => {
  it("records clean and dirty git worktree state in repo metadata", () => {
    tempRoot = mkdtempSync(path.join(tmpdir(), "ctg-repo-graph-"));
    writeFileSync(path.join(tempRoot, "index.ts"), "export const value = 1;\n", "utf8");

    runGit(tempRoot, ["init"]);
    runGit(tempRoot, ["add", "."]);
    runGit(tempRoot, ["-c", "user.name=Code To Gate", "-c", "user.email=ctg@example.test", "commit", "-m", "init"]);

    const cleanGraph = buildGraph(tempRoot, "1.5.0");
    expect(cleanGraph.repo.dirty).toBe(false);
    expect(cleanGraph.repo.revision).toMatch(/^[0-9a-f]{12}$/);

    writeFileSync(path.join(tempRoot, "untracked.ts"), "export const dirty = true;\n", "utf8");

    const dirtyGraph = buildGraph(tempRoot, "1.5.0");
    expect(dirtyGraph.repo.dirty).toBe(true);
  });

  it("leaves dirty unset for non-git directories", () => {
    tempRoot = mkdtempSync(path.join(tmpdir(), "ctg-repo-graph-nongit-"));
    writeFileSync(path.join(tempRoot, "index.ts"), "export const value = 1;\n", "utf8");

    const graph = buildGraph(tempRoot, "1.5.0");
    expect(graph.repo.dirty).toBeUndefined();
    expect(graph.repo.revision).toBeUndefined();
  });
});
