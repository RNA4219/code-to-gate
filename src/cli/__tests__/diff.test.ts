/**
 * Tests for diff CLI command
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { diffCommand } from "../diff.js";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

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
};

const VERSION = "0.1.0";

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/**
 * Create a Git repository with commits and tags for testing.
 * Pattern from tests/integration/database-diff.test.ts
 */
function createGitRepoWithCommits(
  repoDir: string,
  baseContent: Record<string, string>,
  headContent: Record<string, string>
): void {
  // Initialize Git repo
  execFileSync("git", ["init"], { cwd: repoDir });
  execFileSync("git", ["config", "user.email", "ctg@example.invalid"], { cwd: repoDir });
  execFileSync("git", ["config", "user.name", "code-to-gate test"], { cwd: repoDir });

  // Create base commit with baseContent files
  for (const [relPath, content] of Object.entries(baseContent)) {
    const filePath = path.join(repoDir, relPath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
  }
  execFileSync("git", ["add", "."], { cwd: repoDir });
  execFileSync("git", ["commit", "-m", "base commit"], { cwd: repoDir });
  execFileSync("git", ["tag", "base"], { cwd: repoDir });

  // Create head commit with modifications/additions
  for (const [relPath, content] of Object.entries(headContent)) {
    const filePath = path.join(repoDir, relPath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
  }
  execFileSync("git", ["add", "."], { cwd: repoDir });
  execFileSync("git", ["commit", "-m", "head commit"], { cwd: repoDir });
  execFileSync("git", ["tag", "head"], { cwd: repoDir });
}

describe("diff CLI", () => {
  let tempOutDir: string;
  const fixturesDir = path.resolve(import.meta.dirname, "../../../fixtures/demo-ci-imports");
  const demoShopDir = path.resolve(import.meta.dirname, "../../../fixtures/demo-shop-ts");

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-diff-test-${Date.now()}`);
    mkdirSync(tempOutDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean output directory before each test
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
    mkdirSync(tempOutDir, { recursive: true });
  });

  // Happy path tests with proper Git repos

  it("exit code OK when no blocking findings in diff", async () => {
    // Create proper Git repo with commits
    const gitRepo = path.join(tempOutDir, "happy-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/index.ts": "export const x = 1;\n" },
      { "src/index.ts": "export const x = 2;\n", "src/new.ts": "export const y = 1;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("diff-analysis.json is generated", async () => {
    const gitRepo = path.join(tempOutDir, "diff-gen-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffPath = path.join(tempOutDir, "diff-analysis.json");
    expect(existsSync(diffPath)).toBe(true);
  });

  it("findings.json is generated for changed files", async () => {
    const gitRepo = path.join(tempOutDir, "findings-gen-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/index.ts": "export const x = 1;\n" },
      { "src/index.ts": "export const x = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const findingsPath = path.join(tempOutDir, "findings.json");
    expect(existsSync(findingsPath)).toBe(true);
  });

  it("blast-radius.mmd is generated", async () => {
    const gitRepo = path.join(tempOutDir, "blast-gen-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/app.ts": "export function app() {}\n" },
      { "src/app.ts": "export function app() { return 1; }\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const mermaidPath = path.join(tempOutDir, "blast-radius.mmd");
    expect(existsSync(mermaidPath)).toBe(true);
  });

  it("audit.json is generated", async () => {
    const gitRepo = path.join(tempOutDir, "audit-gen-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/main.ts": "console.log('hello');\n" },
      { "src/main.ts": "console.log('world');\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const auditPath = path.join(tempOutDir, "audit.json");
    expect(existsSync(auditPath)).toBe(true);
  });

  // Schema validation tests with proper Git repos

  it("diff-analysis.json has correct schema", async () => {
    const gitRepo = path.join(tempOutDir, "schema-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffPath = path.join(tempOutDir, "diff-analysis.json");
    const diffAnalysis = JSON.parse(readFileSync(diffPath, "utf8"));

    expect(diffAnalysis.artifact).toBe("diff-analysis");
    expect(diffAnalysis.schema).toBe("diff-analysis@v1");
    expect(diffAnalysis.version).toBe("ctg/v1");
    expect(diffAnalysis.generated_at).toBeDefined();
    expect(diffAnalysis.run_id).toBeDefined();
  });

  it("diff-analysis.json has repo with base_ref and head_ref", async () => {
    const gitRepo = path.join(tempOutDir, "refs-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/base.ts": "export const base = 1;\n" },
      { "src/head.ts": "export const head = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffPath = path.join(tempOutDir, "diff-analysis.json");
    const diffAnalysis = JSON.parse(readFileSync(diffPath, "utf8"));

    expect(diffAnalysis.repo).toBeDefined();
    expect(diffAnalysis.repo.root).toBeDefined();
    expect(diffAnalysis.repo.base_ref).toBe("base");
    expect(diffAnalysis.repo.head_ref).toBe("head");
  });

  it("diff-analysis.json has changed_files array", async () => {
    const gitRepo = path.join(tempOutDir, "changed-files-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffPath = path.join(tempOutDir, "diff-analysis.json");
    const diffAnalysis = JSON.parse(readFileSync(diffPath, "utf8"));

    expect(Array.isArray(diffAnalysis.changed_files)).toBe(true);
  });

  it("diff-analysis.json has blast_radius object", async () => {
    const gitRepo = path.join(tempOutDir, "blast-radius-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/app.ts": "export function app() {}\n" },
      { "src/app.ts": "export function app() { return 1; }\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffPath = path.join(tempOutDir, "diff-analysis.json");
    const diffAnalysis = JSON.parse(readFileSync(diffPath, "utf8"));

    expect(diffAnalysis.blast_radius).toBeDefined();
    expect(Array.isArray(diffAnalysis.blast_radius.affectedFiles)).toBe(true);
    expect(Array.isArray(diffAnalysis.blast_radius.affectedSymbols)).toBe(true);
    expect(Array.isArray(diffAnalysis.blast_radius.affectedTests)).toBe(true);
    expect(Array.isArray(diffAnalysis.blast_radius.affectedEntrypoints)).toBe(true);
  });

  it("--blast-depth controls direct versus transitive importer radius", async () => {
    const gitRepo = path.join(tempOutDir, "blast-depth-repo");
    const depthOneOut = path.join(tempOutDir, "blast-depth-one");
    const depthTwoOut = path.join(tempOutDir, "blast-depth-two");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      {
        "src/a.ts": "import { b } from './b';\nexport const a = b;\n",
        "src/b.ts": "import { c } from './c';\nexport const b = c;\n",
        "src/c.ts": "export const c = 1;\n",
      },
      {
        "src/a.ts": "import { b } from './b';\nexport const a = b;\n",
        "src/b.ts": "import { c } from './c';\nexport const b = c;\n",
        "src/c.ts": "export const c = 2;\n",
      }
    );

    await diffCommand([gitRepo, "--base", "base", "--head", "head", "--out", depthOneOut, "--blast-depth", "1"], { VERSION, EXIT, getOption });
    await diffCommand([gitRepo, "--base", "base", "--head", "head", "--out", depthTwoOut, "--blast-depth", "2"], { VERSION, EXIT, getOption });

    const depthOne = JSON.parse(readFileSync(path.join(depthOneOut, "diff-analysis.json"), "utf8"));
    const depthTwo = JSON.parse(readFileSync(path.join(depthTwoOut, "diff-analysis.json"), "utf8"));

    expect(depthOne.blast_radius.maxDepth).toBe(1);
    expect(depthOne.blast_radius.affectedFiles).toContain("src/b.ts");
    expect(depthOne.blast_radius.affectedFiles).not.toContain("src/a.ts");

    expect(depthTwo.blast_radius.maxDepth).toBe(2);
    expect(depthTwo.blast_radius.affectedFiles).toContain("src/a.ts");
  });

  it("diff-analysis.json has diff_findings object", async () => {
    const gitRepo = path.join(tempOutDir, "diff-findings-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffPath = path.join(tempOutDir, "diff-analysis.json");
    const diffAnalysis = JSON.parse(readFileSync(diffPath, "utf8"));

    expect(diffAnalysis.diff_findings).toBeDefined();
    expect(Array.isArray(diffAnalysis.diff_findings.new_findings)).toBe(true);
    expect(Array.isArray(diffAnalysis.diff_findings.potentially_affected_findings)).toBe(true);
    expect(Array.isArray(diffAnalysis.diff_findings.resolved_findings)).toBe(true);
  });

  it("changed_file entry has required fields", async () => {
    const gitRepo = path.join(tempOutDir, "changed-entry-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffPath = path.join(tempOutDir, "diff-analysis.json");
    const diffAnalysis = JSON.parse(readFileSync(diffPath, "utf8"));

    for (const file of diffAnalysis.changed_files) {
      expect(file.path).toBeDefined();
      expect(file.status).toBeDefined();
      expect(["added", "modified", "deleted", "renamed"]).toContain(file.status);
      expect(typeof file.additions).toBe("number");
      expect(typeof file.deletions).toBe("number");
    }
  });

  it("findings.json has correct schema", async () => {
    const gitRepo = path.join(tempOutDir, "findings-schema-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const findingsPath = path.join(tempOutDir, "findings.json");
    const findings = JSON.parse(readFileSync(findingsPath, "utf8"));

    expect(findings.artifact).toBe("findings");
    expect(findings.schema).toBe("findings@v1");
    expect(Array.isArray(findings.findings)).toBe(true);
  });

  it("audit.json has correct schema", async () => {
    const gitRepo = path.join(tempOutDir, "audit-schema-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/main.ts": "console.log('hello');\n" },
      { "src/main.ts": "console.log('world');\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const auditPath = path.join(tempOutDir, "audit.json");
    const audit = JSON.parse(readFileSync(auditPath, "utf8"));

    expect(audit.artifact).toBe("audit");
    expect(audit.schema).toBe("audit@v1");
    expect(audit.exit).toBeDefined();
    expect(audit.exit.code).toBeDefined();
    expect(audit.exit.status).toBeDefined();
  });

  it("blast-radius.mmd contains mermaid graph syntax", async () => {
    const gitRepo = path.join(tempOutDir, "mermaid-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/app.ts": "export function app() {}\n" },
      { "src/app.ts": "export function app() { return 1; }\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const mermaidPath = path.join(tempOutDir, "blast-radius.mmd");
    const content = readFileSync(mermaidPath, "utf8");

    expect(content).toContain("graph TD");
  });

  // Error handling tests - Git failure scenarios

  it("exit code SCAN_FAILED when directory is not a Git repository", async () => {
    // Create directory without Git
    const nonGitRepo = path.join(tempOutDir, "non-git-repo");
    mkdirSync(nonGitRepo, { recursive: true });
    mkdirSync(path.join(nonGitRepo, "src"), { recursive: true });
    writeFileSync(path.join(nonGitRepo, "src", "index.ts"), "export const x = 1;\n", "utf8");

    const args = [nonGitRepo, "--base", "main", "--head", "feature", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.SCAN_FAILED);
  });

  it("exit code SCAN_FAILED for invalid Git refs", async () => {
    // Create valid Git repo but use refs that don't exist
    const gitRepo = path.join(tempOutDir, "invalid-refs-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--base", "nonexistent-base", "--head", "head", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.SCAN_FAILED);
  });

  it("exit code SCAN_FAILED for an invalid head ref", async () => {
    const gitRepo = path.join(tempOutDir, "invalid-head-ref-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "nonexistent-head", "--out", tempOutDir];
    expect(await diffCommand(args, { VERSION, EXIT, getOption })).toBe(EXIT.SCAN_FAILED);
  });

  it.each([
    ["base", "--malicious", "head"],
    ["base", "base", "--malicious"],
    ["base", "bad\0ref", "head"],
    ["base", "base", "bad\0ref"],
  ])("exit code SCAN_FAILED for unsafe %s ref", async (_case, baseRef, headRef) => {
    const gitRepo = path.join(tempOutDir, `unsafe-ref-repo-${Math.random().toString(16).slice(2)}`);
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--base", baseRef, "--head", headRef, "--out", tempOutDir];
    expect(await diffCommand(args, { VERSION, EXIT, getOption })).toBe(EXIT.SCAN_FAILED);
  });

  it("exit code USAGE_ERROR when repo argument missing", async () => {
    const args: string[] = [];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when --base argument missing", async () => {
    const gitRepo = path.join(tempOutDir, "missing-base-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--head", "head", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when --head argument missing", async () => {
    const gitRepo = path.join(tempOutDir, "missing-head-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when repo does not exist", async () => {
    const args = ["/nonexistent/path", "--base", "main", "--head", "feature", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when repo path is a file (not directory)", async () => {
    // Create a file instead of directory
    const filePath = path.join(tempOutDir, "not-a-dir.txt");
    writeFileSync(filePath, "test content", "utf8");

    const args = [filePath, "--base", "main", "--head", "feature", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code OK when no changes detected between same ref", async () => {
    // Create Git repo and use same ref for base and head
    const gitRepo = path.join(tempOutDir, "same-ref-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "base", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  // Output file generation tests with proper Git repos

  it("custom --out directory is created", async () => {
    const gitRepo = path.join(tempOutDir, "custom-out-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const customOutDir = path.join(tempOutDir, "custom-output");

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", customOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
    expect(existsSync(path.join(customOutDir, "diff-analysis.json"))).toBe(true);
  });

  it("findings.json contains version and metadata", async () => {
    const gitRepo = path.join(tempOutDir, "metadata-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const findingsPath = path.join(tempOutDir, "findings.json");
    const findings = JSON.parse(readFileSync(findingsPath, "utf8"));

    expect(findings.version).toBe("ctg/v1");
    expect(findings.generated_at).toBeDefined();
    expect(findings.run_id).toBeDefined();
    expect(findings.repo).toBeDefined();
  });

  it("run_id matches across artifacts", async () => {
    const gitRepo = path.join(tempOutDir, "runid-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffAnalysis = JSON.parse(readFileSync(path.join(tempOutDir, "diff-analysis.json"), "utf8"));
    const findings = JSON.parse(readFileSync(path.join(tempOutDir, "findings.json"), "utf8"));
    const audit = JSON.parse(readFileSync(path.join(tempOutDir, "audit.json"), "utf8"));

    expect(diffAnalysis.run_id).toBeDefined();
    expect(findings.run_id).toBeDefined();
    expect(audit.run_id).toBeDefined();
    expect(diffAnalysis.run_id).toBe(findings.run_id);
  });

  it("findings have required fields", async () => {
    const gitRepo = path.join(tempOutDir, "findings-fields-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const findingsPath = path.join(tempOutDir, "findings.json");
    const findings = JSON.parse(readFileSync(findingsPath, "utf8"));

    for (const finding of findings.findings) {
      expect(finding.id).toBeDefined();
      expect(finding.category).toBeDefined();
      expect(finding.rule).toBeDefined();
      expect(finding.severity).toBeDefined();
      expect(finding.description).toBeDefined();
      expect(finding.evidence).toBeDefined();
    }
  });

  it("findings severity values are valid", async () => {
    const gitRepo = path.join(tempOutDir, "severity-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const findingsPath = path.join(tempOutDir, "findings.json");
    const findings = JSON.parse(readFileSync(findingsPath, "utf8"));

    const validSeverities = ["critical", "high", "medium", "low", "info"];
    for (const finding of findings.findings) {
      expect(validSeverities).toContain(finding.severity);
    }
  });

  it("tool metadata in findings", async () => {
    const gitRepo = path.join(tempOutDir, "tool-meta-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const findingsPath = path.join(tempOutDir, "findings.json");
    const findings = JSON.parse(readFileSync(findingsPath, "utf8"));

    expect(findings.tool).toBeDefined();
    expect(findings.tool.name).toBe("code-to-gate");
    expect(findings.tool.version).toBeDefined();
  });

  // Ignored directories tests with proper Git repos

  it("ignores .git directory in diff analysis", async () => {
    const gitRepo = path.join(tempOutDir, "git-dir-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/index.ts": "export const x = 1;\n" },
      { "src/index.ts": "export const x = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("ignores node_modules directory in diff analysis", async () => {
    const gitRepo = path.join(tempOutDir, "nm-dir-repo");
    mkdirSync(gitRepo, { recursive: true });
    mkdirSync(path.join(gitRepo, "node_modules"), { recursive: true });
    writeFileSync(path.join(gitRepo, "node_modules", "package.json"), "{}", "utf8");
    createGitRepoWithCommits(
      gitRepo,
      { "src/index.ts": "export const x = 1;\n" },
      { "src/index.ts": "export const x = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  // File categorization tests with proper Git repos

  it("added_files array is populated correctly", async () => {
    const gitRepo = path.join(tempOutDir, "added-files-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n", "src/b.ts": "const b = 1;\n" }  // b.ts is added
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffPath = path.join(tempOutDir, "diff-analysis.json");
    const diffAnalysis = JSON.parse(readFileSync(diffPath, "utf8"));

    expect(Array.isArray(diffAnalysis.added_files)).toBe(true);
    // Should contain paths from changed_files with status "added"
    const addedFromChanged = diffAnalysis.changed_files
      .filter((f: { status: string }) => f.status === "added")
      .map((f: { path: string }) => f.path);
    expect(diffAnalysis.added_files).toEqual(addedFromChanged);
  });

  it("deleted_files array is populated correctly", async () => {
    const gitRepo = path.join(tempOutDir, "deleted-files-repo");
    mkdirSync(gitRepo, { recursive: true });

    // Base has two files, head removes one
    execFileSync("git", ["init"], { cwd: gitRepo });
    execFileSync("git", ["config", "user.email", "ctg@example.invalid"], { cwd: gitRepo });
    execFileSync("git", ["config", "user.name", "code-to-gate test"], { cwd: gitRepo });
    mkdirSync(path.join(gitRepo, "src"), { recursive: true });
    writeFileSync(path.join(gitRepo, "src", "a.ts"), "const a = 1;\n", "utf8");
    writeFileSync(path.join(gitRepo, "src", "b.ts"), "const b = 1;\n", "utf8");
    execFileSync("git", ["add", "."], { cwd: gitRepo });
    execFileSync("git", ["commit", "-m", "base"], { cwd: gitRepo });
    execFileSync("git", ["tag", "base"], { cwd: gitRepo });

    // Delete b.ts in head
    rmSync(path.join(gitRepo, "src", "b.ts"));
    execFileSync("git", ["add", "."], { cwd: gitRepo });
    execFileSync("git", ["commit", "-m", "head"], { cwd: gitRepo });
    execFileSync("git", ["tag", "head"], { cwd: gitRepo });

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffPath = path.join(tempOutDir, "diff-analysis.json");
    const diffAnalysis = JSON.parse(readFileSync(diffPath, "utf8"));

    expect(Array.isArray(diffAnalysis.deleted_files)).toBe(true);
  });

  it("modified_files array is populated correctly", async () => {
    const gitRepo = path.join(tempOutDir, "modified-files-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }  // modified
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffPath = path.join(tempOutDir, "diff-analysis.json");
    const diffAnalysis = JSON.parse(readFileSync(diffPath, "utf8"));

    expect(Array.isArray(diffAnalysis.modified_files)).toBe(true);
    const modifiedFromChanged = diffAnalysis.changed_files
      .filter((f: { status: string }) => f.status === "modified")
      .map((f: { path: string }) => f.path);
    expect(diffAnalysis.modified_files).toEqual(modifiedFromChanged);
  });

  // Audit status tests with proper Git repos

  it("audit exit status is valid", async () => {
    const gitRepo = path.join(tempOutDir, "audit-status-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const auditPath = path.join(tempOutDir, "audit.json");
    const audit = JSON.parse(readFileSync(auditPath, "utf8"));

    const validStatuses = ["passed", "passed_with_risk", "blocked", "failed"];
    expect(validStatuses).toContain(audit.exit.status);
  });

  it("audit exit code reflects command result", async () => {
    const gitRepo = path.join(tempOutDir, "audit-code-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    const args = [gitRepo, "--base", "base", "--head", "head", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });

    const auditPath = path.join(tempOutDir, "audit.json");
    const audit = JSON.parse(readFileSync(auditPath, "utf8"));

    expect(audit.exit.code).toBe(result);
  });

  // Git failure edge cases

  it("handles ref with special characters safely", async () => {
    // Create Git repo with a tag containing a safe special character
    const gitRepo = path.join(tempOutDir, "special-ref-repo");
    mkdirSync(gitRepo, { recursive: true });
    createGitRepoWithCommits(
      gitRepo,
      { "src/a.ts": "const a = 1;\n" },
      { "src/a.ts": "const a = 2;\n" }
    );

    // Add a branch with hyphen (safe)
    execFileSync("git", ["branch", "feature-branch"], { cwd: gitRepo });

    const args = [gitRepo, "--base", "base", "--head", "feature-branch", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect([EXIT.OK, EXIT.SCAN_FAILED]).toContain(result);
  });
});
