import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_DIRECTORY_WALK_LIMITS } from "../../core/file-utils.js";
import { readGitSnapshot } from "../git-snapshot.js";

const roots: string[] = [];

function git(repo: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function createRepo(files: Record<string, string>): { root: string; revision: string } {
  const root = mkdtempSync(path.join(process.env.TEMP ?? process.cwd(), "ctg-git-snapshot-"));
  roots.push(root);
  git(root, ["init"]);
  git(root, ["config", "user.email", "ctg@example.invalid"]);
  git(root, ["config", "user.name", "code-to-gate test"]);
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, "utf8");
  }
  git(root, ["add", "."]);
  git(root, ["commit", ...(Object.keys(files).length === 0 ? ["--allow-empty"] : []), "-m", "snapshot fixture"]);
  return { root, revision: git(root, ["rev-parse", "HEAD"]) };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("readGitSnapshot", () => {
  it("reads one fixed commit, including whitespace and non-ASCII names", () => {
    const fixture = createRepo({
      "src/fixed.ts": "const marker = 'committed';\n",
      "space name.ts": "export const spaced = true;\n",
      "日本語/空 白.md": "固定スナップショット\n",
      ".qh-cache/ignored.ts": "ignored\n",
      ".test-temp-run/ignored.ts": "ignored\n",
    });
    writeFileSync(path.join(fixture.root, "src/fixed.ts"), "const marker = 'working-tree';\n", "utf8");
    writeFileSync(path.join(fixture.root, "untracked.ts"), "untracked\n", "utf8");
    const statusBefore = git(fixture.root, ["status", "--porcelain"]);

    const result = readGitSnapshot(fixture.root, fixture.revision);

    expect(result.revision).toBe(fixture.revision);
    expect(result.partial).toBe(false);
    expect(result.paths).toContain("src/fixed.ts");
    expect(result.paths).toContain("space name.ts");
    expect(result.paths).toContain("日本語/空 白.md");
    expect(result.paths.some(file => file.includes("ignored"))).toBe(false);
    expect(result.contents.get("src/fixed.ts")).toBe("const marker = 'committed';\n");
    expect(result.contents.has("untracked.ts")).toBe(false);
    expect(git(fixture.root, ["status", "--porcelain"])).toBe(statusBefore);
  });

  it("rejects invalid refs without reading the worktree", () => {
    const fixture = createRepo({ "src/a.ts": "a\n" });
    for (const ref of ["-bad", "bad\0ref", "does-not-exist"]) {
      const result = readGitSnapshot(fixture.root, ref);
      expect(result.partial).toBe(true);
      expect(result.paths).toEqual([]);
      expect(result.contents.size).toBe(0);
    }
  });

  it("keeps bounded scans partial and reports skipped files", () => {
    const fixture = createRepo({
      "a.ts": "123456789\n",
      "nested/b.ts": "b\n",
      "c.ts": "c\n",
    });
    const limited = readGitSnapshot(fixture.root, fixture.revision, { limits: { maxFiles: 1 } });
    expect(limited.partial).toBe(true);
    expect(limited.paths).toHaveLength(1);
    expect(limited.reasons).toContain("MAX_FILES_EXCEEDED");
    expect(limited.scan.skippedFiles).toBeGreaterThan(0);

    const oversized = readGitSnapshot(fixture.root, fixture.revision, { limits: { maxFileSizeBytes: 3 } });
    expect(oversized.partial).toBe(true);
    expect(oversized.paths).not.toContain("a.ts");
    expect(oversized.reasons.some(reason => reason.startsWith("MAX_FILE_SIZE_EXCEEDED:"))).toBe(true);

    const shallow = readGitSnapshot(fixture.root, fixture.revision, { limits: { maxDepth: 0 } });
    expect(shallow.partial).toBe(true);
    expect(shallow.paths).not.toContain("nested/b.ts");
    expect(shallow.reasons.some(reason => reason.startsWith("MAX_DEPTH_EXCEEDED:"))).toBe(true);

    const total = readGitSnapshot(fixture.root, fixture.revision, { limits: { maxTotalBytes: 2 } });
    expect(total.partial).toBe(true);
    expect(total.reasons).toContain("MAX_TOTAL_BYTES_EXCEEDED");

    const defaultLimit = DEFAULT_DIRECTORY_WALK_LIMITS.maxTotalBytes;
    expect(defaultLimit).toBeGreaterThan(0);
  });

  it("reports a deadline failure as partial", () => {
    const fixture = createRepo({ "src/a.ts": "a\n" });
    const result = readGitSnapshot(fixture.root, fixture.revision, { limits: { deadlineMs: 0 } });
    expect(result.partial).toBe(true);
    expect(result.paths).toEqual([]);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("distinguishes an empty committed tree from an unavailable repository", () => {
    const empty = createRepo({});
    const complete = readGitSnapshot(empty.root, empty.revision);
    expect(complete.partial).toBe(false);
    expect(complete.revision).toBe(empty.revision);
    expect(complete.paths).toEqual([]);

    const missing = readGitSnapshot(path.join(empty.root, "missing-repo"), empty.revision);
    expect(missing.partial).toBe(true);
    expect(missing.revision).toBeUndefined();
    expect(missing.paths).toEqual([]);
  });
});
