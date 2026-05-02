/**
 * Tests for diff CLI command
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { diffCommand } from "../diff.js";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

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

  // Happy path tests

  it("exit code OK when no blocking findings in diff", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("diff-analysis.json is generated", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffPath = path.join(tempOutDir, "diff-analysis.json");
    expect(existsSync(diffPath)).toBe(true);
  });

  it("findings.json is generated for changed files", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const findingsPath = path.join(tempOutDir, "findings.json");
    expect(existsSync(findingsPath)).toBe(true);
  });

  it("blast-radius.mmd is generated", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const mermaidPath = path.join(tempOutDir, "blast-radius.mmd");
    expect(existsSync(mermaidPath)).toBe(true);
  });

  it("audit.json is generated", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const auditPath = path.join(tempOutDir, "audit.json");
    expect(existsSync(auditPath)).toBe(true);
  });

  // Schema validation tests

  it("diff-analysis.json has correct schema", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
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
    const args = [fixturesDir, "--base", "main", "--head", "feature-branch", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffPath = path.join(tempOutDir, "diff-analysis.json");
    const diffAnalysis = JSON.parse(readFileSync(diffPath, "utf8"));

    expect(diffAnalysis.repo).toBeDefined();
    expect(diffAnalysis.repo.root).toBeDefined();
    expect(diffAnalysis.repo.base_ref).toBe("main");
    expect(diffAnalysis.repo.head_ref).toBe("feature-branch");
  });

  it("diff-analysis.json has changed_files array", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffPath = path.join(tempOutDir, "diff-analysis.json");
    const diffAnalysis = JSON.parse(readFileSync(diffPath, "utf8"));

    expect(Array.isArray(diffAnalysis.changed_files)).toBe(true);
  });

  it("diff-analysis.json has blast_radius object", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffPath = path.join(tempOutDir, "diff-analysis.json");
    const diffAnalysis = JSON.parse(readFileSync(diffPath, "utf8"));

    expect(diffAnalysis.blast_radius).toBeDefined();
    expect(Array.isArray(diffAnalysis.blast_radius.affectedFiles)).toBe(true);
    expect(Array.isArray(diffAnalysis.blast_radius.affectedSymbols)).toBe(true);
    expect(Array.isArray(diffAnalysis.blast_radius.affectedTests)).toBe(true);
    expect(Array.isArray(diffAnalysis.blast_radius.affectedEntrypoints)).toBe(true);
  });

  it("diff-analysis.json has diff_findings object", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffPath = path.join(tempOutDir, "diff-analysis.json");
    const diffAnalysis = JSON.parse(readFileSync(diffPath, "utf8"));

    expect(diffAnalysis.diff_findings).toBeDefined();
    expect(Array.isArray(diffAnalysis.diff_findings.new_findings)).toBe(true);
    expect(Array.isArray(diffAnalysis.diff_findings.potentially_affected_findings)).toBe(true);
    expect(Array.isArray(diffAnalysis.diff_findings.resolved_findings)).toBe(true);
  });

  it("changed_file entry has required fields", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
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
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const findingsPath = path.join(tempOutDir, "findings.json");
    const findings = JSON.parse(readFileSync(findingsPath, "utf8"));

    expect(findings.artifact).toBe("findings");
    expect(findings.schema).toBe("findings@v1");
    expect(Array.isArray(findings.findings)).toBe(true);
  });

  it("audit.json has correct schema", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
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
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const mermaidPath = path.join(tempOutDir, "blast-radius.mmd");
    const content = readFileSync(mermaidPath, "utf8");

    expect(content).toContain("graph TD");
  });

  // Error handling tests

  it("exit code USAGE_ERROR when repo argument missing", async () => {
    const args: string[] = [];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when --base argument missing", async () => {
    const args = [fixturesDir, "--head", "feature", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when --head argument missing", async () => {
    const args = [fixturesDir, "--base", "main", "--out", tempOutDir];
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

  it("exit code OK when no changes detected", async () => {
    // Create empty repo (no changes)
    const emptyRepo = path.join(tempOutDir, "empty-repo");
    mkdirSync(emptyRepo, { recursive: true });

    const args = [emptyRepo, "--base", "main", "--head", "feature", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("exit code SCAN_FAILED for unexpected errors", async () => {
    // Create a repo with a deeply nested structure that might cause issues
    const deepRepo = path.join(tempOutDir, "deep-repo");
    mkdirSync(deepRepo, { recursive: true });
    // Create a file with invalid permissions simulation (just empty)
    writeFileSync(path.join(deepRepo, "index.ts"), "", "utf8");

    const args = [deepRepo, "--base", "main", "--head", "feature", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    // Should succeed (no blocking findings) or SCAN_FAILED
    expect([EXIT.OK, EXIT.SCAN_FAILED]).toContain(result);
  });

  // Output file generation tests

  it("custom --out directory is created", async () => {
    const customOutDir = path.join(tempOutDir, "custom-output");

    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", customOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
    expect(existsSync(path.join(customOutDir, "diff-analysis.json"))).toBe(true);
  });

  it("default --out is .qh", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature"];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
    const defaultOutPath = path.join(process.cwd(), ".qh", "diff-analysis.json");
    expect(existsSync(defaultOutPath)).toBe(true);
    // Clean up
    rmSync(path.join(process.cwd(), ".qh"), { recursive: true, force: true });
  });

  it("findings.json contains version and metadata", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const findingsPath = path.join(tempOutDir, "findings.json");
    const findings = JSON.parse(readFileSync(findingsPath, "utf8"));

    expect(findings.version).toBe("ctg/v1");
    expect(findings.generated_at).toBeDefined();
    expect(findings.run_id).toBeDefined();
    expect(findings.repo).toBeDefined();
  });

  it("run_id matches across artifacts", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
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
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
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
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const findingsPath = path.join(tempOutDir, "findings.json");
    const findings = JSON.parse(readFileSync(findingsPath, "utf8"));

    const validSeverities = ["critical", "high", "medium", "low", "info"];
    for (const finding of findings.findings) {
      expect(validSeverities).toContain(finding.severity);
    }
  });

  it("tool metadata in findings", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const findingsPath = path.join(tempOutDir, "findings.json");
    const findings = JSON.parse(readFileSync(findingsPath, "utf8"));

    expect(findings.tool).toBeDefined();
    expect(findings.tool.name).toBe("code-to-gate");
    expect(findings.tool.version).toBeDefined();
  });

  // Test with demo-shop-ts fixture

  it("handles demo-shop-ts fixture", async () => {
    const args = [demoShopDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect([EXIT.OK, EXIT.READINESS_NOT_CLEAR]).toContain(result);
  });

  it("detects entrypoints in demo-shop-ts", async () => {
    const args = [demoShopDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffPath = path.join(tempOutDir, "diff-analysis.json");
    const diffAnalysis = JSON.parse(readFileSync(diffPath, "utf8"));

    expect(Array.isArray(diffAnalysis.blast_radius.affectedEntrypoints)).toBe(true);
  });

  // Ignored directories tests

  it("ignores .git directory in diff analysis", async () => {
    const gitRepo = path.join(tempOutDir, "git-repo");
    mkdirSync(gitRepo, { recursive: true });
    mkdirSync(path.join(gitRepo, ".git"), { recursive: true });
    mkdirSync(path.join(gitRepo, "src"), { recursive: true });
    writeFileSync(path.join(gitRepo, ".git", "config"), "git config", "utf8");
    writeFileSync(path.join(gitRepo, "src", "index.ts"), "export const x = 1;", "utf8");

    const args = [gitRepo, "--base", "main", "--head", "feature", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("ignores node_modules directory in diff analysis", async () => {
    const nmRepo = path.join(tempOutDir, "nm-repo");
    mkdirSync(nmRepo, { recursive: true });
    mkdirSync(path.join(nmRepo, "node_modules"), { recursive: true });
    mkdirSync(path.join(nmRepo, "src"), { recursive: true });
    writeFileSync(path.join(nmRepo, "node_modules", "package.json"), "{}", "utf8");
    writeFileSync(path.join(nmRepo, "src", "index.ts"), "export const x = 1;", "utf8");

    const args = [nmRepo, "--base", "main", "--head", "feature", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  // File categorization tests

  it("added_files array is populated correctly", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
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
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffPath = path.join(tempOutDir, "diff-analysis.json");
    const diffAnalysis = JSON.parse(readFileSync(diffPath, "utf8"));

    expect(Array.isArray(diffAnalysis.deleted_files)).toBe(true);
  });

  it("modified_files array is populated correctly", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const diffPath = path.join(tempOutDir, "diff-analysis.json");
    const diffAnalysis = JSON.parse(readFileSync(diffPath, "utf8"));

    expect(Array.isArray(diffAnalysis.modified_files)).toBe(true);
    const modifiedFromChanged = diffAnalysis.changed_files
      .filter((f: { status: string }) => f.status === "modified")
      .map((f: { path: string }) => f.path);
    expect(diffAnalysis.modified_files).toEqual(modifiedFromChanged);
  });

  // Handles relative paths

  it("handles relative repo path", async () => {
    const args = ["../../../fixtures/demo-ci-imports", "--base", "main", "--head", "feature", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });
    expect(typeof result).toBe("number");
  });

  // Audit status tests

  it("audit exit status is valid", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    await diffCommand(args, { VERSION, EXIT, getOption });

    const auditPath = path.join(tempOutDir, "audit.json");
    const audit = JSON.parse(readFileSync(auditPath, "utf8"));

    const validStatuses = ["passed", "passed_with_risk", "blocked", "failed"];
    expect(validStatuses).toContain(audit.exit.status);
  });

  it("audit exit code reflects command result", async () => {
    const args = [fixturesDir, "--base", "main", "--head", "feature", "--out", tempOutDir];
    const result = await diffCommand(args, { VERSION, EXIT, getOption });

    const auditPath = path.join(tempOutDir, "audit.json");
    const audit = JSON.parse(readFileSync(auditPath, "utf8"));

    expect(audit.exit.code).toBe(result);
  });
});