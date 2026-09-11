import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { diffCommand } from "../diff.js";

const EXIT = { OK: 0, READINESS_NOT_CLEAR: 1, USAGE_ERROR: 2, SCAN_FAILED: 3, POLICY_FAILED: 5 } as const;
const VERSION = "test";
const getOption = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

function git(repo: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function writeRepoFile(repo: string, relative: string, content: string): void {
  const file = path.join(repo, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

function createRepo(base: Record<string, string>, head: Record<string, string>, remove: string[] = []) {
  const root = mkdtempSync(path.join(tmpdir(), "ctg-diff-deletion-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "ctg@example.invalid"]);
  git(root, ["config", "user.name", "code-to-gate test"]);
  for (const [relative, content] of Object.entries(base)) writeRepoFile(root, relative, content);
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "base"]);
  const baseRef = git(root, ["rev-parse", "HEAD"]);
  for (const relative of remove) rmSync(path.join(root, relative), { force: true });
  for (const [relative, content] of Object.entries(head)) writeRepoFile(root, relative, content);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "head"]);
  return { root, baseRef, headRef: git(root, ["rev-parse", "HEAD"]) };
}

function writePolicy(root: string): string {
  const file = path.join(root, "policy.yaml");
  writeRepoFile(root, "policy.yaml", `version: ctg/v1
policy_id: deletion-test
blocking:
  severity: { critical: false, high: false, medium: false, low: false }
  category: { auth: false, payment: false, validation: false, data: false, config: false, maintainability: false, testing: false, compatibility: false, release-risk: false, security: false }
confidence: { min_confidence: 0.6, filter_low: true }
partial: { allow_partial: false }
`);
  return file;
}

function run(repo: string, baseRef: string, headRef: string, policy: string, out: string): Promise<number> {
  return diffCommand([repo, "--base", baseRef, "--head", headRef, "--out", out, "--policy", policy], { VERSION, EXIT, getOption });
}

describe("diff deletion handling", () => {
  it("treats an unreferenced TypeScript deletion as complete", async () => {
    const fixture = createRepo({ "src/unused.ts": "export const unused = true;\n" }, {}, ["src/unused.ts"]);
    const outRoot = mkdtempSync(path.join(tmpdir(), "ctg-diff-deletion-out-"));
    try {
      const code = await run(fixture.root, fixture.baseRef, fixture.headRef, writePolicy(fixture.root), outRoot);
      const findings = JSON.parse(readFileSync(path.join(outRoot, "findings.json"), "utf8"));
      expect(code).toBe(EXIT.OK);
      expect(findings.findings).toEqual([]);
      expect(findings.completeness).toBe("complete");
      expect(findings.repo.revision).toBe(fixture.headRef);
    } finally {
      rmSync(outRoot, { recursive: true, force: true });
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("keeps a deletion plus an unprocessed Go change partial", async () => {
    const fixture = createRepo(
      { "src/removed.ts": "export const removed = true;\n", "src/main.go": "package main\nfunc main() {}\n" },
      { "src/main.go": "package main\nfunc main() { println(\"changed\") }\n" },
      ["src/removed.ts"]
    );
    const outRoot = mkdtempSync(path.join(tmpdir(), "ctg-diff-deletion-out-"));
    try {
      const code = await run(fixture.root, fixture.baseRef, fixture.headRef, writePolicy(fixture.root), outRoot);
      const findings = JSON.parse(readFileSync(path.join(outRoot, "findings.json"), "utf8"));
      expect(code).toBe(EXIT.READINESS_NOT_CLEAR);
      expect(findings.completeness).toBe("partial");
    } finally {
      rmSync(outRoot, { recursive: true, force: true });
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("keeps a remaining importer in the blast radius of a deleted module", async () => {
    const fixture = createRepo(
      { "src/deleted.ts": "export const value = 1;\n", "src/importer.ts": "import { value } from './deleted';\nexport const result = value;\n" },
      { "src/importer.ts": "import { value } from './deleted';\nexport const result = value;\n" },
      ["src/deleted.ts"]
    );
    const outRoot = mkdtempSync(path.join(tmpdir(), "ctg-diff-deletion-out-"));
    try {
      const code = await run(fixture.root, fixture.baseRef, fixture.headRef, writePolicy(fixture.root), outRoot);
      const analysis = JSON.parse(readFileSync(path.join(outRoot, "diff-analysis.json"), "utf8"));
      expect(code).toBe(EXIT.OK);
      expect(analysis.blast_radius.affectedFiles).toContain("src/importer.ts");
    } finally {
      rmSync(outRoot, { recursive: true, force: true });
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
