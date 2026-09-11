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

function writeFile(repo: string, relative: string, content: string): void {
  const file = path.join(repo, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

function createFixture(): { root: string; base: string; head: string; policy: string } {
  const root = mkdtempSync(path.join(tmpdir(), "ctg-diff-snapshot-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "ctg@example.invalid"]);
  git(root, ["config", "user.name", "code-to-gate test"]);
  writeFile(root, "src/a.ts", "export const a = 1;\n");
  writeFile(root, "src/b.ts", "import { a } from './a';\nexport const b = a;\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "base"]);
  const base = git(root, ["rev-parse", "HEAD"]);
  writeFile(root, "src/a.ts", "// TODO: fixed head marker\nexport const a = 2;\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "head"]);
  const head = git(root, ["rev-parse", "HEAD"]);
  const policy = path.join(root, "policy.yaml");
  writeFile(root, "policy.yaml", `version: ctg/v1
policy_id: snapshot-test
blocking:
  severity: { critical: false, high: false, medium: false, low: false }
  category: { auth: false, payment: false, validation: false, data: false, config: false, maintainability: false, testing: false, compatibility: false, release-risk: false, security: false }
confidence: { min_confidence: 0.6, filter_low: true }
partial: { allow_partial: false }
`);
  return { root, base, head, policy };
}

describe("diff immutable Git snapshot", () => {
  it("uses the fixed head tree for graph, imports, and findings despite worktree edits", async () => {
    const fixture = createFixture();
    const outputRoot = mkdtempSync(path.join(tmpdir(), "ctg-diff-snapshot-out-"));
    try {
      const firstOut = path.join(outputRoot, "out-first");
      const args = [fixture.root, "--base", fixture.base, "--head", fixture.head, "--out", firstOut, "--policy", fixture.policy];
      const firstCode = await diffCommand(args, { VERSION, EXIT, getOption });
      const firstAnalysis = JSON.parse(readFileSync(path.join(firstOut, "diff-analysis.json"), "utf8"));
      const firstFindings = JSON.parse(readFileSync(path.join(firstOut, "findings.json"), "utf8"));
      expect(firstFindings.findings).toHaveLength(1);
      expect(firstFindings.findings[0].ruleId).toBe("DEBT_MARKER");
      writeFile(fixture.root, "src/a.ts", "export const a = 999;\n");
      writeFile(fixture.root, "src/b.ts", "export const b = 0;\n");
      const statusDuring = git(fixture.root, ["status", "--porcelain"]);
      const secondOut = path.join(outputRoot, "out-second");
      const secondCode = await diffCommand(
        [fixture.root, "--base", fixture.base, "--head", fixture.head, "--out", secondOut, "--policy", fixture.policy],
        { VERSION, EXIT, getOption }
      );
      const secondAnalysis = JSON.parse(readFileSync(path.join(secondOut, "diff-analysis.json"), "utf8"));
      const secondFindings = JSON.parse(readFileSync(path.join(secondOut, "findings.json"), "utf8"));

      expect(firstCode).toBe(EXIT.OK);
      expect(secondCode).toBe(EXIT.OK);
      expect(firstAnalysis.repo.head_ref).toBe(fixture.head);
      expect(secondAnalysis.repo.head_ref).toBe(fixture.head);
      expect(secondAnalysis.changed_files).toEqual(firstAnalysis.changed_files);
      expect(secondAnalysis.blast_radius).toEqual(firstAnalysis.blast_radius);
      expect(secondFindings.findings).toEqual(firstFindings.findings);
      expect(secondFindings.repo.revision).toBe(fixture.head);
      expect(git(fixture.root, ["status", "--porcelain"])).toBe(statusDuring);
      expect(readFileSync(path.join(fixture.root, "src/a.ts"), "utf8")).toBe("export const a = 999;\n");
      expect(readFileSync(path.join(fixture.root, "src/b.ts"), "utf8")).toBe("export const b = 0;\n");

      // Move the checkout to base while retaining the same untracked policy.
      // The explicit head SHA must still supply the graph and evidence.
      git(fixture.root, ["checkout", "--", "src/a.ts", "src/b.ts"]);
      git(fixture.root, ["checkout", "--detach", fixture.base]);
      const statusBeforeThird = git(fixture.root, ["status", "--porcelain"]);
      const thirdOut = path.join(outputRoot, "out-third");
      const thirdCode = await diffCommand(
        [fixture.root, "--base", fixture.base, "--head", fixture.head, "--out", thirdOut, "--policy", fixture.policy],
        { VERSION, EXIT, getOption }
      );
      const thirdAnalysis = JSON.parse(readFileSync(path.join(thirdOut, "diff-analysis.json"), "utf8"));
      const thirdFindings = JSON.parse(readFileSync(path.join(thirdOut, "findings.json"), "utf8"));

      expect(thirdCode).toBe(EXIT.OK);
      expect(thirdAnalysis.changed_files).toEqual(firstAnalysis.changed_files);
      expect(thirdAnalysis.blast_radius).toEqual(firstAnalysis.blast_radius);
      expect(thirdFindings.findings).toEqual(firstFindings.findings);
      expect(thirdFindings.findings[0].evidence).toEqual(firstFindings.findings[0].evidence);
      expect(thirdFindings.repo.revision).toBe(fixture.head);
      expect(git(fixture.root, ["status", "--porcelain"])).toBe(statusBeforeThird);
      expect(statusDuring).toContain("src/a.ts");
    } finally {
      rmSync(outputRoot, { recursive: true, force: true });
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
