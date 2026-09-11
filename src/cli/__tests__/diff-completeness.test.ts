import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";

const scanState = vi.hoisted(() => ({ partial: false }));
vi.mock("../../core/file-utils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/file-utils.js")>();
  return {
    ...actual,
    walkDirBounded: (...args: Parameters<typeof actual.walkDirBounded>) => {
      const scan = actual.walkDirBounded(...args);
      return scanState.partial
        ? { ...scan, partial: true, reasons: [...scan.reasons, "TEST_SCAN_PARTIAL"] }
        : scan;
    },
  };
});

import { diffCommand } from "../diff.js";
import { nodeFileAccess } from "../../adapters/node-services.js";

const EXIT = { OK: 0, READINESS_NOT_CLEAR: 1, USAGE_ERROR: 2, SCAN_FAILED: 3, POLICY_FAILED: 5 } as const;
const VERSION = "test";
const getOption = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

function createRepo(root: string, base: string, head: string, fileName = "src/index.ts"): string {
  const repo = path.join(root, "repo");
  mkdirSync(path.dirname(path.join(repo, fileName)), { recursive: true });
  const git = (args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
  git(["init"]); git(["config", "user.email", "ctg@example.invalid"]); git(["config", "user.name", "ctg test"]);
  writeFileSync(path.join(repo, fileName), base, "utf8"); git(["add", "."]); git(["commit", "-qm", "base"]); git(["tag", "base"]);
  writeFileSync(path.join(repo, fileName), head, "utf8"); git(["add", "."]); git(["commit", "-qm", "head"]); git(["tag", "head"]);
  return repo;
}

function createDatabaseRepo(root: string): string {
  const repo = path.join(root, "database-repo");
  mkdirSync(path.join(repo, "migrations"), { recursive: true });
  const git = (args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
  git(["init"]); git(["config", "user.email", "ctg@example.invalid"]); git(["config", "user.name", "ctg test"]);
  writeFileSync(path.join(repo, "migrations", "V00000001__base.sql"), "CREATE TABLE users (id INT);\n", "utf8");
  git(["add", "."]); git(["commit", "-qm", "base"]); git(["tag", "base"]);
  writeFileSync(path.join(repo, "migrations", "V00000002__head.sql"), "DROP TABLE orders;\n", "utf8");
  git(["add", "."]); git(["commit", "-qm", "head"]); git(["tag", "head"]);
  return repo;
}

function writePolicy(root: string): string {
  const policy = path.join(root, "policy.yaml");
  writeFileSync(policy, `version: ctg/v1
policy_id: partial-test
blocking:
  severity: { critical: false, high: false, medium: false, low: false }
  category: { auth: false, payment: false, validation: false, data: false, config: false, maintainability: false, testing: false, compatibility: false, release-risk: false, security: false }
confidence: { min_confidence: 0.6, filter_low: true }
partial: { allow_partial: false }
`, "utf8");
  return policy;
}

describe("diff completeness", () => {
  it("keeps an actually partial scan blocking even when findings are empty", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "ctg-diff-completeness-"));
    scanState.partial = true;
    try {
      const repo = createRepo(root, "export const value = 1;\n", "export const value = 2;\n");
      const out = path.join(root, "out");
      const code = await diffCommand([repo, "--base", "base", "--head", "head", "--out", out, "--policy", writePolicy(root)], { VERSION, EXIT, getOption });
      const findings = JSON.parse(readFileSync(path.join(out, "findings.json"), "utf8"));
      expect(code).toBe(EXIT.READINESS_NOT_CLEAR);
      expect(findings.findings).toHaveLength(0);
      expect(findings.completeness).toBe("partial");
    } finally {
      scanState.partial = false;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(["go", "rs"])("keeps an unprocessed %s source diff partial", async (extension) => {
    const root = mkdtempSync(path.join(tmpdir(), `ctg-diff-source-${extension}-`));
    try {
      const [base, head] = extension === "go"
        ? ["package main\n\nfunc main() {}\n", "package main\n\nfunc main() { println(\"ok\") }\n"]
        : ["fn main() {}\n", "fn main() { println!(\"ok\"); }\n"];
      const repo = createRepo(root, base, head, `src/main.${extension}`);
      const out = path.join(root, "out");
      const code = await diffCommand([repo, "--base", "base", "--head", "head", "--out", out, "--policy", writePolicy(root)], { VERSION, EXIT, getOption });
      const findings = JSON.parse(readFileSync(path.join(out, "findings.json"), "utf8"));
      expect(code).toBe(EXIT.READINESS_NOT_CLEAR);
      expect(findings.findings).toHaveLength(0);
      expect(findings.completeness).toBe("partial");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps a target file read failure partial", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "ctg-diff-read-failure-"));
    const originalReadFile = nodeFileAccess.readFile;
    try {
      const repo = createRepo(root, "export const value = 1;\n", "export const value = 2;\n");
      nodeFileAccess.readFile = (filePath) =>
        filePath.endsWith(`${path.sep}src${path.sep}index.ts`) ? null : originalReadFile(filePath);
      const out = path.join(root, "out");
      const code = await diffCommand([repo, "--base", "base", "--head", "head", "--out", out, "--policy", writePolicy(root)], { VERSION, EXIT, getOption });
      const findings = JSON.parse(readFileSync(path.join(out, "findings.json"), "utf8"));
      expect(code).toBe(EXIT.READINESS_NOT_CLEAR);
      expect(findings.findings).toHaveLength(0);
      expect(findings.completeness).toBe("partial");
    } finally {
      nodeFileAccess.readFile = originalReadFile;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps an SQL diff partial when database analysis is disabled", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "ctg-diff-sql-disabled-"));
    try {
      const repo = createDatabaseRepo(root);
      const out = path.join(root, "out");
      const code = await diffCommand([repo, "--base", "base", "--head", "head", "--out", out, "--policy", writePolicy(root)], { VERSION, EXIT, getOption });
      const findings = JSON.parse(readFileSync(path.join(out, "findings.json"), "utf8"));
      expect(code).toBe(EXIT.READINESS_NOT_CLEAR);
      expect(findings.completeness).toBe("partial");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("completes an SQL diff when database analysis is enabled", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "ctg-diff-sql-enabled-"));
    try {
      const repo = createDatabaseRepo(root);
      const out = path.join(root, "out");
      const code = await diffCommand([repo, "--base", "base", "--head", "head", "--out", out, "--policy", writePolicy(root), "--database-analysis"], { VERSION, EXIT, getOption });
      const findings = JSON.parse(readFileSync(path.join(out, "findings.json"), "utf8"));
      expect(code).toBe(EXIT.OK);
      expect(findings.completeness).toBe("complete");
      expect(findings.findings.some((finding: { ruleId?: string }) => finding.ruleId === "DB_DROP_TABLE")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps a partial scan partial after adding database findings", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "ctg-diff-sql-partial-"));
    scanState.partial = true;
    try {
      const repo = createDatabaseRepo(root);
      const out = path.join(root, "out");
      const code = await diffCommand([repo, "--base", "base", "--head", "head", "--out", out, "--policy", writePolicy(root), "--database-analysis"], { VERSION, EXIT, getOption });
      const findings = JSON.parse(readFileSync(path.join(out, "findings.json"), "utf8"));
      expect(code).toBe(EXIT.READINESS_NOT_CLEAR);
      expect(findings.completeness).toBe("partial");
      expect(findings.findings.some((finding: { ruleId?: string }) => finding.ruleId === "DB_DROP_TABLE")).toBe(true);
    } finally {
      scanState.partial = false;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
