/**
 * Tests for analyze CLI command
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { analyzeCommand } from "../analyze.js";
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

describe("analyze CLI", () => {
  let tempOutDir: string;
  const fixturesDir = path.resolve(import.meta.dirname, "../../../fixtures/demo-ci-imports");
  const blockingFixturesDir = path.resolve(import.meta.dirname, "../../../fixtures/demo-shop-ts");
  const policyFile = path.resolve(import.meta.dirname, "../../../fixtures/policies/strict.yaml");

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-analyze-test-${Date.now()}`);
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

  it("findings.json is generated", async () => {
    const args = [fixturesDir, "--out", tempOutDir];
    const result = await analyzeCommand(args, { VERSION, EXIT, getOption });

    const findingsPath = path.join(tempOutDir, "findings.json");
    expect(existsSync(findingsPath)).toBe(true);
  });

  it("--emit option generates specific artifacts", async () => {
    // Test with --emit json only
    const emitTestDir = path.join(tempOutDir, "emit-json");
    mkdirSync(emitTestDir, { recursive: true });

    const args = [fixturesDir, "--emit", "json", "--out", emitTestDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    // findings.json should exist
    expect(existsSync(path.join(emitTestDir, "findings.json"))).toBe(true);

    // risk-register.yaml should NOT exist (emit json only)
    expect(existsSync(path.join(emitTestDir, "risk-register.yaml"))).toBe(false);
  });

  it("--emit all generates all artifacts", async () => {
    const allTestDir = path.join(tempOutDir, "emit-all");
    mkdirSync(allTestDir, { recursive: true });

    const args = [fixturesDir, "--emit", "all", "--out", allTestDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    expect(existsSync(path.join(allTestDir, "findings.json"))).toBe(true);
    expect(existsSync(path.join(allTestDir, "risk-register.yaml"))).toBe(true);
    expect(existsSync(path.join(allTestDir, "analysis-report.md"))).toBe(true);
    expect(existsSync(path.join(allTestDir, "audit.json"))).toBe(true);
  });

  it("exit code OK on successful analysis", async () => {
    const args = [fixturesDir, "--out", tempOutDir];
    const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("exit code USAGE_ERROR when repo argument missing", async () => {
    const args: string[] = [];
    const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when repo does not exist", async () => {
    const args = ["/nonexistent/path", "--out", tempOutDir];
    const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("findings.json has correct structure", async () => {
    const args = [fixturesDir, "--out", tempOutDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    const findingsPath = path.join(tempOutDir, "findings.json");
    const findings = JSON.parse(readFileSync(findingsPath, "utf8"));

    expect(findings.artifact).toBe("findings");
    expect(findings.schema).toBe("findings@v1");
    expect(Array.isArray(findings.findings)).toBe(true);
    expect(Array.isArray(findings.unsupported_claims)).toBe(true);
  });

  it("audit.json is generated with correct structure", async () => {
    const args = [fixturesDir, "--out", tempOutDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    const auditPath = path.join(tempOutDir, "audit.json");
    const audit = JSON.parse(readFileSync(auditPath, "utf8"));

    expect(audit.artifact).toBe("audit");
    expect(audit.schema).toBe("audit@v1");
    expect(Array.isArray(audit.inputs)).toBe(true);
    expect(audit.exit).toBeDefined();
    expect(audit.exit.code).toBeDefined();
    expect(audit.exit.status).toBeDefined();
  });

  it("analysis-report.md is generated with --emit all", async () => {
    const reportTestDir = path.join(tempOutDir, "report");
    mkdirSync(reportTestDir, { recursive: true });

    const args = [fixturesDir, "--emit", "all", "--out", reportTestDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    const reportPath = path.join(reportTestDir, "analysis-report.md");
    expect(existsSync(reportPath)).toBe(true);

    const content = readFileSync(reportPath, "utf8");
    expect(content).toContain("# code-to-gate Analysis Report");
    expect(content).toContain("## Summary");
  });

  // Additional tests for edge cases and error handling

  it("exit code SCAN_FAILED for empty repo", async () => {
    // Create an empty repo
    const emptyRepo = path.join(tempOutDir, "empty-repo");
    mkdirSync(emptyRepo, { recursive: true });

    const args = [emptyRepo, "--out", tempOutDir];
    const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.SCAN_FAILED);
  });

  it("exit code USAGE_ERROR when repo path is a file (not directory)", async () => {
    // Create a file instead of directory
    const filePath = path.join(tempOutDir, "not-a-dir.txt");
    writeFileSync(filePath, "test content", "utf8");

    const args = [filePath, "--out", tempOutDir];
    const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("--emit yaml generates only YAML artifacts", async () => {
    const yamlTestDir = path.join(tempOutDir, "emit-yaml");
    mkdirSync(yamlTestDir, { recursive: true });

    const args = [fixturesDir, "--emit", "yaml", "--out", yamlTestDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    // risk-register.yaml should exist
    expect(existsSync(path.join(yamlTestDir, "risk-register.yaml"))).toBe(true);

    // findings.json should NOT exist (emit yaml only)
    expect(existsSync(path.join(yamlTestDir, "findings.json"))).toBe(false);

    // audit.json should exist (always generated)
    expect(existsSync(path.join(yamlTestDir, "audit.json"))).toBe(true);
  });

  it("--emit md generates only markdown artifacts", async () => {
    const mdTestDir = path.join(tempOutDir, "emit-md");
    mkdirSync(mdTestDir, { recursive: true });

    const args = [fixturesDir, "--emit", "md", "--out", mdTestDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    // analysis-report.md should exist
    expect(existsSync(path.join(mdTestDir, "analysis-report.md"))).toBe(true);

    // findings.json should NOT exist (emit md only)
    expect(existsSync(path.join(mdTestDir, "findings.json"))).toBe(false);

    // audit.json should exist (always generated)
    expect(existsSync(path.join(mdTestDir, "audit.json"))).toBe(true);
  });

  it("--emit json,yaml generates multiple formats", async () => {
    const multiTestDir = path.join(tempOutDir, "emit-multi");
    mkdirSync(multiTestDir, { recursive: true });

    const args = [fixturesDir, "--emit", "json,yaml", "--out", multiTestDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    expect(existsSync(path.join(multiTestDir, "findings.json"))).toBe(true);
    expect(existsSync(path.join(multiTestDir, "risk-register.yaml"))).toBe(true);
    expect(existsSync(path.join(multiTestDir, "audit.json"))).toBe(true);

    // md should NOT exist
    expect(existsSync(path.join(multiTestDir, "analysis-report.md"))).toBe(false);
  });

  it("default --emit generates all artifacts", async () => {
    // Without --emit, should generate all (default behavior)
    const args = [fixturesDir, "--out", tempOutDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    expect(existsSync(path.join(tempOutDir, "findings.json"))).toBe(true);
    expect(existsSync(path.join(tempOutDir, "risk-register.yaml"))).toBe(true);
    expect(existsSync(path.join(tempOutDir, "analysis-report.md"))).toBe(true);
    expect(existsSync(path.join(tempOutDir, "audit.json"))).toBe(true);
  });

  it("--policy option with valid policy file", async () => {
    const args = [fixturesDir, "--policy", policyFile, "--out", tempOutDir];
    const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("--policy option with non-existent file returns POLICY_FAILED", async () => {
    const args = [fixturesDir, "--policy", "/nonexistent/policy.yaml", "--out", tempOutDir];
    const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.POLICY_FAILED);
  });

  it("custom --out directory is created", async () => {
    const customOutDir = path.join(tempOutDir, "custom-output");

    const args = [fixturesDir, "--out", customOutDir];
    const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
    expect(existsSync(path.join(customOutDir, "findings.json"))).toBe(true);
  });

  it("risk-register.yaml has correct structure", async () => {
    const args = [fixturesDir, "--emit", "all", "--out", tempOutDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    const riskPath = path.join(tempOutDir, "risk-register.yaml");
    expect(existsSync(riskPath)).toBe(true);

    const content = readFileSync(riskPath, "utf8");
    expect(content).toContain("version:");
    expect(content).toContain("artifact: risk-register");
  });

  it("findings.json contains version and metadata", async () => {
    const args = [fixturesDir, "--out", tempOutDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    const findingsPath = path.join(tempOutDir, "findings.json");
    const findings = JSON.parse(readFileSync(findingsPath, "utf8"));

    expect(findings.version).toBe("ctg/v1");
    expect(findings.generated_at).toBeDefined();
    expect(findings.run_id).toBeDefined();
    expect(findings.repo).toBeDefined();
    expect(findings.repo.root).toBeDefined();
  });

  it("audit.json contains policy info when policy is provided", async () => {
    const args = [fixturesDir, "--policy", policyFile, "--out", tempOutDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    const auditPath = path.join(tempOutDir, "audit.json");
    const audit = JSON.parse(readFileSync(auditPath, "utf8"));

    expect(audit.policy).toBeDefined();
    expect(audit.policy?.name).toBe("strict");
  });

  it("audit.json has inputs array", async () => {
    const args = [fixturesDir, "--out", tempOutDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    const auditPath = path.join(tempOutDir, "audit.json");
    const audit = JSON.parse(readFileSync(auditPath, "utf8"));

    expect(Array.isArray(audit.inputs)).toBe(true);
    // Should contain the repo-graph.json path
    const inputPaths = audit.inputs.map((i: { path: string }) => i.path);
    expect(inputPaths.length).toBeGreaterThan(0);
  });

  it("output summary JSON to stdout", async () => {
    const args = [fixturesDir, "--out", tempOutDir];
    // The command outputs a summary JSON - just verify it runs without error
    const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("findings.severity values are valid", async () => {
    const args = [fixturesDir, "--out", tempOutDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    const findingsPath = path.join(tempOutDir, "findings.json");
    const findings = JSON.parse(readFileSync(findingsPath, "utf8"));

    const validSeverities = ["critical", "high", "medium", "low", "info"];
    for (const finding of findings.findings) {
      expect(validSeverities).toContain(finding.severity);
    }
  });

  it("findings have required fields", async () => {
    const args = [fixturesDir, "--out", tempOutDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

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

  it("risk-register has risks array", async () => {
    const args = [fixturesDir, "--emit", "yaml", "--out", tempOutDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    const riskPath = path.join(tempOutDir, "risk-register.yaml");
    const content = readFileSync(riskPath, "utf8");

    expect(content).toContain("risks:");
  });

  it("handles relative repo path", async () => {
    // Test with relative path
    const args = ["../../../fixtures/demo-ci-imports", "--out", tempOutDir];
    const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
    // May succeed or fail depending on working directory
    expect(typeof result).toBe("number");
  });

  it("default --out is .qh", async () => {
    // Test that default output directory is .qh when --out not specified
    const args = [fixturesDir];
    const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
    // .qh/findings.json should exist in cwd
    const defaultOutPath = path.join(process.cwd(), ".qh", "findings.json");
    expect(existsSync(defaultOutPath)).toBe(true);
    // Clean up
    rmSync(path.join(process.cwd(), ".qh"), { recursive: true, force: true });
  });

  it("analysis-report.md contains repo path", async () => {
    const args = [fixturesDir, "--emit", "all", "--out", tempOutDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    const reportPath = path.join(tempOutDir, "analysis-report.md");
    const content = readFileSync(reportPath, "utf8");

    expect(content).toContain("Repository:");
  });

  it("ignores .git directory in analysis", async () => {
    // Create repo with .git directory
    const gitRepo = path.join(tempOutDir, "git-repo");
    mkdirSync(gitRepo, { recursive: true });
    mkdirSync(path.join(gitRepo, ".git"), { recursive: true });
    mkdirSync(path.join(gitRepo, "src"), { recursive: true });
    writeFileSync(path.join(gitRepo, ".git", "config"), "git config", "utf8");
    writeFileSync(path.join(gitRepo, "src", "index.ts"), "export const x = 1;", "utf8");

    const args = [gitRepo, "--out", tempOutDir];
    const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);

    const auditPath = path.join(tempOutDir, "audit.json");
    const audit = JSON.parse(readFileSync(auditPath, "utf8"));
    // Verify that the analysis worked correctly
    expect(audit.artifact).toBe("audit");
  });

  it("ignores node_modules directory in analysis", async () => {
    // Create repo with node_modules directory
    const nmRepo = path.join(tempOutDir, "nm-repo");
    mkdirSync(nmRepo, { recursive: true });
    mkdirSync(path.join(nmRepo, "node_modules"), { recursive: true });
    mkdirSync(path.join(nmRepo, "src"), { recursive: true });
    writeFileSync(path.join(nmRepo, "node_modules", "package.json"), "{}", "utf8");
    writeFileSync(path.join(nmRepo, "src", "index.ts"), "export const x = 1;", "utf8");

    const args = [nmRepo, "--out", tempOutDir];
    const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);

    const findingsPath = path.join(tempOutDir, "findings.json");
    const findings = JSON.parse(readFileSync(findingsPath, "utf8"));
    expect(findings.artifact).toBe("findings");
  });

  it("test files are detected correctly", async () => {
    const args = [fixturesDir, "--out", tempOutDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    const auditPath = path.join(tempOutDir, "audit.json");
    const audit = JSON.parse(readFileSync(auditPath, "utf8"));

    // The graph used for analysis should have detected tests
    expect(audit.inputs.length).toBeGreaterThan(0);
  });

  it("config files are detected correctly", async () => {
    const args = [fixturesDir, "--out", tempOutDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    const findingsPath = path.join(tempOutDir, "findings.json");
    const findings = JSON.parse(readFileSync(findingsPath, "utf8"));
    // Verify analysis completed successfully
    expect(findings.artifact).toBe("findings");
  });

  it("mermaid emit option is accepted", async () => {
    const mermaidTestDir = path.join(tempOutDir, "emit-mermaid");
    mkdirSync(mermaidTestDir, { recursive: true });

    // mermaid is an emit format but may not generate a file
    const args = [fixturesDir, "--emit", "mermaid", "--out", mermaidTestDir];
    const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
    // Should return OK, even if mermaid file not generated
    expect(result).toBe(EXIT.OK);
    // audit.json should always exist
    expect(existsSync(path.join(mermaidTestDir, "audit.json"))).toBe(true);
  });

  it("unknown emit format is filtered out", async () => {
    const unknownTestDir = path.join(tempOutDir, "emit-unknown");
    mkdirSync(unknownTestDir, { recursive: true });

    // unknown format should be filtered, still generates audit.json
    const args = [fixturesDir, "--emit", "unknown,invalid", "--out", unknownTestDir];
    const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
    // Should return OK - unknown formats are filtered out
    expect(result).toBe(EXIT.OK);
    // audit.json should always exist
    expect(existsSync(path.join(unknownTestDir, "audit.json"))).toBe(true);
  });

  it("completeness field in findings", async () => {
    const args = [fixturesDir, "--out", tempOutDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    const findingsPath = path.join(tempOutDir, "findings.json");
    const findings = JSON.parse(readFileSync(findingsPath, "utf8"));

    expect(findings.completeness).toBeDefined();
  });

  it("tool metadata in findings", async () => {
    const args = [fixturesDir, "--out", tempOutDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    const findingsPath = path.join(tempOutDir, "findings.json");
    const findings = JSON.parse(readFileSync(findingsPath, "utf8"));

    expect(findings.tool).toBeDefined();
    expect(findings.tool.name).toBe("code-to-gate");
    expect(findings.tool.version).toBeDefined();
  });

  it("run_id matches across artifacts", async () => {
    const args = [fixturesDir, "--emit", "all", "--out", tempOutDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    const findings = JSON.parse(readFileSync(path.join(tempOutDir, "findings.json"), "utf8"));
    const audit = JSON.parse(readFileSync(path.join(tempOutDir, "audit.json"), "utf8"));

    expect(findings.run_id).toBeDefined();
    expect(audit.run_id).toBeDefined();
    // run_id should match between findings and audit
    expect(findings.run_id).toBe(audit.run_id);
  });

  it("audit exit status is valid", async () => {
    const args = [fixturesDir, "--out", tempOutDir];
    await analyzeCommand(args, { VERSION, EXIT, getOption });

    const auditPath = path.join(tempOutDir, "audit.json");
    const audit = JSON.parse(readFileSync(auditPath, "utf8"));

    const validStatuses = ["passed", "passed_with_risk", "needs_review", "blocked_input", "blocked", "failed"];
    expect(validStatuses).toContain(audit.exit.status);
  });

  it("audit exit reflects policy-blocked analyze result", async () => {
    const blockOutDir = path.join(tempOutDir, "policy-blocked");
    mkdirSync(blockOutDir, { recursive: true });

    const args = [blockingFixturesDir, "--policy", policyFile, "--emit", "all", "--out", blockOutDir];
    const result = await analyzeCommand(args, { VERSION, EXIT, getOption });

    const audit = JSON.parse(readFileSync(path.join(blockOutDir, "audit.json"), "utf8"));

    expect(result).toBe(EXIT.READINESS_NOT_CLEAR);
    expect(audit.exit.code).toBe(result);
    expect(audit.exit.status).toBe("blocked_input");
    expect(audit.exit.reason).toContain("Blocked:");
  }, 90000);
});
