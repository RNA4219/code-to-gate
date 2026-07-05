import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

  it("excludes generated, vendored, and minified files before parser adapters run", () => {
    tempRoot = mkdtempSync(path.join(tmpdir(), "ctg-repo-graph-generated-"));
    writeFileSync(path.join(tempRoot, "index.ts"), "export const value = 1;\n", "utf8");
    writeFileSync(path.join(tempRoot, "app.min.js"), "function min(){}\n", "utf8");
    mkdirSync(path.join(tempRoot, "vendor"), { recursive: true });
    writeFileSync(path.join(tempRoot, "vendor", "lib.ts"), "export const vendored = true;\n", "utf8");

    const graph = buildGraph(tempRoot, "1.5.0");
    expect(graph.files.map((file) => file.path)).toEqual(["index.ts"]);
  });

  it("records monorepo workspace modules and assigns files to the nearest package boundary", () => {
    const fixtureRoot = path.resolve(import.meta.dirname, "../../../fixtures/demo-monorepo");
    const graph = buildGraph(fixtureRoot, "1.5.0");

    expect(graph.modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "module:.", path: ".", name: "demo-monorepo", workspace: true }),
        expect.objectContaining({ id: "module:packages/api", path: "packages/api", name: "@demo/monorepo-api", workspace: true }),
      ])
    );

    const apiFile = graph.files.find((file) => file.path === "packages/api/src/index.ts");
    expect(apiFile?.moduleId).toBe("module:packages/api");

    const rootPackage = graph.files.find((file) => file.path === "package.json");
    expect(rootPackage?.moduleId).toBe("module:.");
  });
});
