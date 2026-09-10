import { describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import yaml from "js-yaml";
import type { FindingsArtifact } from "../../types/artifacts.js";
import { EXIT, getOption, VERSION } from "../../cli/exit-codes.js";
import { diffCommand } from "../diff.js";
import { evaluateDiffFindings, loadDiffPolicy } from "../diff-policy.js";
import { loadPolicyFile } from "../../config/policy-loader.js";

function findings(): FindingsArtifact {
  return {
    ...({
      version: "ctg/v1", generated_at: "2026-09-10T00:00:00.000Z", run_id: "run",
      repo: { root: "." }, tool: { name: "code-to-gate", version: "test", plugin_versions: [] },
      artifact: "findings", schema: "findings@v1", completeness: "complete", unsupported_claims: [],
    } as FindingsArtifact),
    findings: [{
      id: "f1", ruleId: "R1", category: "maintainability", severity: "critical", confidence: 1,
      title: "test", summary: "test", evidence: [{ id: "e1", path: "src/a.ts", kind: "text" }],
    }],
  };
}

function policyFile(content: string): { root: string; file: string } {
  const root = path.join(tmpdir(), `ctg-diff-policy-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  const file = path.join(root, "policy.yaml");
  writeFileSync(file, content, "utf8");
  return { root, file };
}

function rawSqlRepo(root: string): string {
  const repo = path.join(root, "git-repo");
  mkdirSync(path.join(repo, "src"), { recursive: true });
  const git = (args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
  git(["init"]); git(["config", "user.email", "ctg@example.invalid"]); git(["config", "user.name", "ctg test"]);
  writeFileSync(path.join(repo, "src", "a.ts"), "export const a = 1;\n");
  git(["add", "."]); git(["commit", "-m", "base"]); git(["tag", "base"]);
  writeFileSync(path.join(repo, "src", "a.ts"), "export function find(req: any) { return db.query(\"SELECT * FROM users WHERE id = \" + req.query.id); }\n");
  git(["add", "."]); git(["commit", "-m", "head"]); git(["tag", "head"]);
  return repo;
}

function databaseRepo(root: string): string {
  const repo = path.join(root, "database-repo");
  mkdirSync(path.join(repo, "migrations"), { recursive: true });
  const git = (args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
  git(["init"]); git(["config", "user.email", "ctg@example.invalid"]); git(["config", "user.name", "ctg test"]);
  writeFileSync(path.join(repo, "migrations", "V00000001__base.sql"), "CREATE TABLE users (id INT);\n");
  git(["add", "."]); git(["commit", "-m", "base"]); git(["tag", "base"]);
  writeFileSync(path.join(repo, "migrations", "V00000002__head.sql"), "DROP TABLE orders;\n");
  git(["add", "."]); git(["commit", "-m", "head"]); git(["tag", "head"]);
  return repo;
}

describe("diff policy", () => {
  it("keeps CI diff/readiness policy wiring and shared interpretation aligned", () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    const diffPolicyPath = path.join(repoRoot, ".github", "ctg-diff-policy.yaml");
    const readinessPolicyPath = path.join(repoRoot, ".github", "ctg-policy.yaml");
    const diffPolicy = loadDiffPolicy(diffPolicyPath, repoRoot);
    const readinessPolicy = loadPolicyFile(readinessPolicyPath, repoRoot);
    expect(diffPolicy.errors).toEqual([]); expect(readinessPolicy.errors).toEqual([]);
    expect(diffPolicy.policy?.blocking).toEqual(readinessPolicy.policy.blocking);
    expect(diffPolicy.policy?.confidence).toMatchObject({ minConfidence: readinessPolicy.policy.confidence.minConfidence, lowConfidenceThreshold: readinessPolicy.policy.confidence.lowConfidenceThreshold, filterLow: readinessPolicy.policy.confidence.filterLow });
    expect(diffPolicy.policy?.partial).toMatchObject({ allowPartial: readinessPolicy.policy.partial?.allowPartial, partialWarningThreshold: readinessPolicy.policy.partial?.partialWarningThreshold });
    const workflow = yaml.load(readFileSync(path.join(repoRoot, ".github", "workflows", "code-to-gate-pr.yml"), "utf8"), { schema: yaml.JSON_SCHEMA }) as { jobs: Record<string, { steps?: Array<{ name?: string; run?: string }> }> };
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
    const diffRun = steps.find((step) => step.name === "Run diff analysis")?.run;
    const readinessRun = steps.find((step) => step.name === "Run readiness evaluation")?.run;
    expect(diffRun).toContain("--policy .github/ctg-diff-policy.yaml");
    expect(readinessRun).toContain("--policy .github/ctg-policy.yaml");
  });

  it.each([["release-risk", true, "blocked_input"], ["release-risk", false, "passed"], ["releaseRisk", true, "blocked_input"], ["releaseRisk", false, "passed"]] as const)("maps blocking category %s=%s into releaseRisk evaluation", (key, value, expectedStatus) => {
    const { root, file } = policyFile(`version: ctg/v1\npolicy_id: release-risk\nblocking:\n  severity: { critical: false, high: false, medium: false, low: false }\n  category:\n    ${key}: ${value}\n`);
    try {
      const loaded = loadDiffPolicy(file, root); expect(loaded.errors).toEqual([]); expect(loaded.policy?.blocking.category.releaseRisk).toBe(value);
      const candidate = findings(); candidate.findings[0] = { ...candidate.findings[0], category: "release-risk", severity: "low" };
      expect(evaluateDiffFindings(candidate, loaded.policy!, ".", "run", "test").evaluation.status).toBe(expectedStatus);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("keeps raw severity and evaluates effective severity", () => {
    const { root, file } = policyFile(`version: ctg/v1\npolicy_id: diff-test\nseverity_overrides:\n  - rule_id: R1\n    severity: low\n    reason: accepted\n`);
    try {
      const loaded = loadDiffPolicy(file, root);
      expect(loaded.errors).toEqual([]);
      const applied = evaluateDiffFindings(findings(), loaded.policy!, ".", "run", "test");
      expect(applied.rawFindings.findings[0].severity).toBe("critical");
      expect(applied.effectiveFindings.findings[0].severity).toBe("low");
      expect(applied.effectiveFindings.findings[0].originalSeverity).toBe("critical");
      expect(applied.evaluation.summary.severityCounts.low).toBe(1);
      expect(applied.evaluation.status).toBe("passed");
      const partial = findings();
      partial.completeness = "partial";
      expect(evaluateDiffFindings(partial, loaded.policy!, ".", "run", "test").rawFindings.completeness).toBe("partial");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it.each(["suppression", "baseline", "llm", "exit", "rule_options", "unknown"]) (
    "rejects unsupported explicit top-level field %s", (key) => {
      const { root, file } = policyFile(`version: ctg/v1\npolicy_id: p\n${key}: {}\n`);
      try {
        const loaded = loadDiffPolicy(file, root);
        expect(loaded.policy).toBeUndefined();
        expect(loaded.errors.join(" ")).toContain(key);
      } finally { rmSync(root, { recursive: true, force: true }); }
    },
  );

  it("rejects DSL baseline and manual evidence because diff has no context", () => {
    const { root, file } = policyFile(`version: ctg/v1\npolicy_id: p\ndsl:\n  rules:\n    - id: r\n      action: block\n      when:\n        baseline: new_or_worsened\n`);
    try {
      expect(loadDiffPolicy(file, root).errors.join(" ")).toContain("unsupported");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it.each([
    "blocking:\n  severity:\n    unexpected: true",
    "blocking:\n  severity:\n    high: yes",
    "blocking:\n  count_threshold:\n    high_max: nope",
    "blocking:\n  count_threshold:\n    high_max: 0.5",
  ])("rejects malformed nested policy shape: %s", (section) => {
    const { root, file } = policyFile(`version: ctg/v1\npolicy_id: p\n${section}\n`);
    try { expect(loadDiffPolicy(file, root).errors.length).toBeGreaterThan(0); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("canonicalizes and accepts inline blocking policy", () => {
    const { root, file } = policyFile("version: ctg/v1\npolicy_id: inline\nblocking: { severity: { high: false } }\n");
    try {
      const loaded = loadDiffPolicy(file, root);
      expect(loaded.errors).toEqual([]);
      expect(loaded.policy?.blocking.severity.high).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("preserves colon values and arbitrary rule ids from the validated YAML root", () => {
    const { root, file } = policyFile("version: ctg/v1\npolicy_id: 'team: review'\nblocking:\n  rules:\n    'RULE:1': true\n");
    try {
      const loaded = loadDiffPolicy(file, root);
      expect(loaded.errors).toEqual([]);
      expect(loaded.policy?.policyId).toBe("team: review");
      expect(loaded.policy?.blocking.rules?.["RULE:1"]).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("accepts valid blocking, confidence, partial, and DSL hold/allow settings", () => {
    const { root, file } = policyFile(`version: ctg/v1
policy_id: valid-subset
blocking:
  severity:
    high: false
  category:
    security: false
confidence:
  min_confidence: 0.4
partial:
  allow_partial: true
dsl:
  rules:
    - id: hold-security
      action: hold
      when:
        category: security
    - id: allow-low
      action: allow
      when:
        severity: low
`);
    try {
      const loaded = loadDiffPolicy(file, root);
      expect(loaded.errors).toEqual([]);
      expect(loaded.policy?.confidence.minConfidence).toBe(0.4);
      expect(loaded.policy?.partial?.allowPartial).toBe(true);
      expect(loaded.policy?.dsl?.rules).toHaveLength(2);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it.each(["manual_evidence", "manualEvidence"])("rejects DSL %s alias without diff context", (key) => {
    const { root, file } = policyFile(`version: ctg/v1\npolicy_id: p\ndsl:\n  rules:\n    - id: r\n      action: hold\n      when:\n        ${key}: absent\n`);
    try { expect(loadDiffPolicy(file, root).errors.join(" ")).toContain("unsupported"); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });

  it.each([
    ["lower", "    severity: low\n    reason: accepted\n", "low", 0],
    ["raise", "    severity: critical\n    reason: escalated\n", "critical", 1],
    ["mismatch", "    path: tests/**\n    severity: low\n    reason: unrelated\n", "high", 1],
  ])("applies %s to a real Git diff and keeps raw/effective/audit/exit consistent", async (name, override, expectedSeverity, expectedExit) => {
    const { root } = policyFile("placeholder: true\n");
    const repo = rawSqlRepo(root);
    const policy = path.join(root, `${name}.yaml`);
    writeFileSync(policy, `version: ctg/v1\npolicy_id: ${name}\nseverity_overrides:\n  - rule_id: RAW_SQL\n${override}`);
    const out = path.join(root, "out", name);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const code = await diffCommand([repo, "--base", "base", "--head", "head", "--out", out, "--policy", policy], { VERSION, EXIT, getOption });
      const raw = JSON.parse(readFileSync(path.join(out, "raw-findings.json"), "utf8"));
      const effective = JSON.parse(readFileSync(path.join(out, "findings.json"), "utf8"));
      const audit = JSON.parse(readFileSync(path.join(out, "audit.json"), "utf8"));
      const summary = JSON.parse(String(log.mock.calls.at(-1)?.[0])).summary;
      expect(raw.findings[0].severity).toBe("high");
      expect(effective.findings[0].severity).toBe(expectedSeverity);
      expect(summary[expectedSeverity]).toBe(1);
      expect(summary).toHaveProperty("policy_status");
      expect(summary).toHaveProperty("blocked");
      expect(summary).toHaveProperty("held");
      expect(JSON.parse(String(log.mock.calls.at(-1)?.[0])).policy_status).toBeUndefined();
      expect(audit.exit.code).toBe(code);
      expect(code).toBe(expectedExit);
    } finally { log.mockRestore(); rmSync(root, { recursive: true, force: true }); }
  });

  it("uses effective severity for a count threshold", async () => {
    const { root } = policyFile("placeholder: true\n");
    const repo = rawSqlRepo(root);
    const policy = path.join(root, "threshold.yaml");
    writeFileSync(policy, "version: ctg/v1\npolicy_id: threshold\nblocking:\n  severity:\n    critical: false\n    high: true\n  category:\n    security: false\n  count_threshold:\n    high_max: 0\n");
    const out = path.join(root, "out");
    try {
      const code = await diffCommand([repo, "--base", "base", "--head", "head", "--out", out, "--policy", policy], { VERSION, EXIT, getOption });
      const audit = JSON.parse(readFileSync(path.join(out, "audit.json"), "utf8"));
      expect(code).toBe(EXIT.READINESS_NOT_CLEAR);
      expect(audit.exit.code).toBe(code);
      expect(audit.exit.status).toBe("blocked_input");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("applies policy after merging database findings", async () => {
    const { root } = policyFile("placeholder: true\n");
    const repo = databaseRepo(root);
    const policy = path.join(root, "database.yaml");
    writeFileSync(policy, "version: ctg/v1\npolicy_id: database\nseverity_overrides:\n  - rule_id: DB_DROP_TABLE\n    severity: low\n    reason: accepted\n");
    const out = path.join(root, "out");
    try {
      const code = await diffCommand([repo, "--base", "base", "--head", "head", "--out", out, "--policy", policy, "--database-analysis"], { VERSION, EXIT, getOption });
      const raw = JSON.parse(readFileSync(path.join(out, "raw-findings.json"), "utf8"));
      const effective = JSON.parse(readFileSync(path.join(out, "findings.json"), "utf8"));
      const rawFinding = raw.findings.find((finding: { ruleId: string }) => finding.ruleId === "DB_DROP_TABLE");
      const effectiveFinding = effective.findings.find((finding: { ruleId: string }) => finding.ruleId === "DB_DROP_TABLE");
      expect(rawFinding?.severity).toBe("critical");
      expect(effectiveFinding?.severity).toBe("low");
      expect(code).toBe(EXIT.OK);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("preflights policy before an empty diff and emits policy artifacts", async () => {
    const { root, file: policy } = policyFile("version: ctg/v1\npolicy_id: empty\nseverity_overrides: []\n");
    const repo = path.join(root, "repo");
    const out = path.join(root, "out");
    mkdirSync(path.join(repo, "src"), { recursive: true });
    writeFileSync(path.join(repo, "src", "a.ts"), "export const a = 1;\n");
    const git = (args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
    git(["init"]); git(["config", "user.email", "ctg@example.invalid"]); git(["config", "user.name", "ctg test"]);
    git(["add", "."]); git(["commit", "-m", "base"]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const code = await diffCommand([repo, "--base", "HEAD", "--head", "HEAD", "--out", out, "--policy", policy], { VERSION, EXIT, getOption });
      expect(code).toBe(EXIT.OK);
      expect(readdirSync(out).sort()).toEqual(["audit.json", "diff-analysis.json", "findings.json", "raw-findings.json"]);
      const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
      expect(payload.policy_status).toBeUndefined();
      expect(payload.summary).toMatchObject({ policy_status: "passed", blocked: 0, held: 0 });
    } finally { log.mockRestore(); rmSync(root, { recursive: true, force: true }); }
  });

  it("rejects an invalid policy before an empty diff writes output", async () => {
    const { root, file: policy } = policyFile("version: ctg/v1\npolicy_id: bad\nsuppression: {}\n");
    const repo = path.join(root, "repo");
    const out = path.join(root, "out");
    mkdirSync(path.join(repo, "src"), { recursive: true });
    writeFileSync(path.join(repo, "src", "a.ts"), "export const a = 1;\n");
    const git = (args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
    git(["init"]); git(["config", "user.email", "ctg@example.invalid"]); git(["config", "user.name", "ctg test"]);
    git(["add", "."]); git(["commit", "-m", "base"]);
    try {
      const code = await diffCommand([repo, "--base", "HEAD", "--head", "HEAD", "--out", out, "--policy", policy], { VERSION, EXIT, getOption });
      expect(code).toBe(EXIT.POLICY_FAILED);
      expect(existsSync(out)).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("returns POLICY_FAILED for a missing policy before Git analysis", async () => {
    const { root } = policyFile("placeholder: true\n");
    const repo = rawSqlRepo(root);
    const out = path.join(root, "missing-out");
    try {
      expect(await diffCommand([repo, "--base", "base", "--head", "head", "--out", out, "--policy", path.join(root, "missing.yaml")], { VERSION, EXIT, getOption })).toBe(EXIT.POLICY_FAILED);
      expect(existsSync(out)).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("keeps valid-policy Git failures as SCAN_FAILED", async () => {
    const { root, file: policy } = policyFile("version: ctg/v1\npolicy_id: valid\nseverity_overrides: []\n");
    const repo = rawSqlRepo(root);
    try {
      expect(await diffCommand([repo, "--base", "missing", "--head", "head", "--out", path.join(root, "bad-ref"), "--policy", policy], { VERSION, EXIT, getOption })).toBe(EXIT.SCAN_FAILED);
      const nonGit = path.join(root, "non-git");
      mkdirSync(nonGit, { recursive: true });
      expect(await diffCommand([nonGit, "--base", "base", "--head", "head", "--out", path.join(root, "non-git-out"), "--policy", policy], { VERSION, EXIT, getOption })).toBe(EXIT.SCAN_FAILED);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("preserves the no-policy empty-diff output", async () => {
    const { root } = policyFile("placeholder: true\n");
    const repo = rawSqlRepo(root);
    const out = path.join(root, "legacy-empty");
    try {
      expect(await diffCommand([repo, "--base", "base", "--head", "base", "--out", out], { VERSION, EXIT, getOption })).toBe(EXIT.OK);
      expect(readdirSync(out)).toEqual(["diff-analysis.json"]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

});
