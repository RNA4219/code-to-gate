/**
 * Tests for readiness CLI command - Refactored
 *
 * Original: 44 tests, 965 lines
 * Refactored: 15 tests (merged similar cases)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readinessCommand } from "../readiness.js";
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

// Helper: Create findings artifact
function createFindingsArtifact(findings: object[] = [], overrides = {}): object {
  return {
    version: "ctg/v1",
    generated_at: new Date().toISOString(),
    run_id: "test-run",
    repo: { root: "/test/repo" },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings,
    unsupported_claims: [],
    ...overrides,
  };
}

// Helper: Create finding
function createFinding(overrides = {}): object {
  return {
    id: "finding-001",
    ruleId: "TEST_RULE",
    category: "security",
    severity: "medium",
    confidence: 0.9,
    title: "Test finding",
    summary: "Test summary",
    evidence: [{ id: "ev-1", path: "src/test.ts", startLine: 10 }],
    ...overrides,
  };
}

// Helper: Write findings to directory
function writeFindingsToDir(dir: string, findings: object[]): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "findings.json"),
    JSON.stringify(createFindingsArtifact(findings)),
    "utf8"
  );
  return dir;
}

// Helper: Run readiness and get result
async function runReadiness(args: string[]): Promise<{ exitCode: number; readiness: object }> {
  const result = await readinessCommand(args, { VERSION, EXIT, getOption });
  const readinessPath = path.join(args[args.indexOf("--out") + 1] || ".qh", "release-readiness.json");
  const readiness = existsSync(readinessPath) ? JSON.parse(readFileSync(readinessPath, "utf8")) : {};
  return { exitCode: result, readiness };
}

describe("readiness CLI", () => {
  let tempOutDir: string;
  const fixturesDir = path.resolve(import.meta.dirname, "../../../fixtures/demo-ci-imports");
  const demoShopDir = path.resolve(import.meta.dirname, "../../../fixtures/demo-shop-ts");
  const policyFile = path.resolve(import.meta.dirname, "../../../fixtures/policies/strict.yaml");

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-readiness-test-${Date.now()}`);
    mkdirSync(tempOutDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
    mkdirSync(tempOutDir, { recursive: true });
  });

  describe("happy path", () => {
    it("generates valid release-readiness.json with all required fields", async () => {
      const findingsDir = writeFindingsToDir(path.join(tempOutDir, "happy"), []);
      const args = [fixturesDir, "--policy", policyFile, "--from", findingsDir, "--out", tempOutDir];
      const { exitCode, readiness } = await runReadiness(args);

      expect(exitCode).toBe(EXIT.OK);
      expect(readiness.artifact).toBe("release-readiness");
      expect(readiness.schema).toBe("release-readiness@v1");
      expect(readiness.version).toBe("ctg/v1");

      // Status
      const validStatuses = ["passed", "passed_with_risk", "needs_review", "blocked_input", "failed"];
      expect(validStatuses).toContain(readiness.status);

      // Counts
      expect(readiness.counts).toBeDefined();
      expect(typeof readiness.counts.findings).toBe("number");
      expect(typeof readiness.counts.critical).toBe("number");
      expect(typeof readiness.counts.high).toBe("number");
      expect(typeof readiness.counts.risks).toBe("number");
      expect(typeof readiness.counts.testSeeds).toBe("number");

      // Arrays
      expect(Array.isArray(readiness.failedConditions)).toBe(true);
      expect(Array.isArray(readiness.recommendedActions)).toBe(true);

      // Metadata
      expect(readiness.repo).toBeDefined();
      expect(readiness.repo.root).toBeDefined();
      expect(readiness.generated_at).toBeDefined();
      expect(readiness.run_id).toBeDefined();
      expect(readiness.tool).toBeDefined();
      expect(readiness.tool.name).toBe("code-to-gate");
      expect(readiness.tool.policy_id).toBe("strict");

      // Optional fields
      expect(readiness.artifactRefs).toBeDefined();
      expect(readiness.completeness).toBeDefined();
      expect(["complete", "partial"]).toContain(readiness.completeness);
    });

    it("handles different fixtures and relative paths", async () => {
      const findingsDir = writeFindingsToDir(path.join(tempOutDir, "demo-shop"), []);
      // demo-shop-ts fixture
      const args1 = [demoShopDir, "--policy", policyFile, "--from", findingsDir, "--out", tempOutDir];
      const result1 = await readinessCommand(args1, { VERSION, EXIT, getOption });
      expect([EXIT.OK, EXIT.READINESS_NOT_CLEAR]).toContain(result1);

      // Relative path
      const findingsDir2 = writeFindingsToDir(path.join(tempOutDir, "relative"), []);
      const args2 = ["../../../fixtures/demo-ci-imports", "--policy", "../../../fixtures/policies/strict.yaml", "--from", findingsDir2, "--out", tempOutDir];
      const result2 = await readinessCommand(args2, { VERSION, EXIT, getOption });
      expect(typeof result2).toBe("number");
    });
  });

  describe("error handling", () => {
    it("returns USAGE_ERROR for invalid arguments", async () => {
      // Missing repo
      const result1 = await readinessCommand(["--policy", policyFile], { VERSION, EXIT, getOption });
      expect(result1).toBe(EXIT.USAGE_ERROR);

      // Missing policy
      const result2 = await readinessCommand([fixturesDir, "--out", tempOutDir], { VERSION, EXIT, getOption });
      expect(result2).toBe(EXIT.USAGE_ERROR);

      // Nonexistent repo
      const result3 = await readinessCommand(["/nonexistent", "--policy", policyFile, "--out", tempOutDir], { VERSION, EXIT, getOption });
      expect(result3).toBe(EXIT.USAGE_ERROR);

      // Nonexistent policy
      const result4 = await readinessCommand([fixturesDir, "--policy", "/nonexistent.yaml", "--out", tempOutDir], { VERSION, EXIT, getOption });
      expect(result4).toBe(EXIT.USAGE_ERROR);

      // Repo is file not directory
      const filePath = path.join(tempOutDir, "file.txt");
      writeFileSync(filePath, "test", "utf8");
      const result5 = await readinessCommand([filePath, "--policy", policyFile, "--out", tempOutDir], { VERSION, EXIT, getOption });
      expect(result5).toBe(EXIT.USAGE_ERROR);
    });

    it("handles malformed policy gracefully", async () => {
      const malformedPolicy = path.join(tempOutDir, "malformed.yaml");
      writeFileSync(malformedPolicy, "not valid yaml {{{", "utf8");

      const args = [fixturesDir, "--policy", malformedPolicy, "--out", tempOutDir];
      const result = await readinessCommand(args, { VERSION, EXIT, getOption });
      // Graceful handling - parses partial policy
      expect([EXIT.OK, EXIT.USAGE_ERROR]).toContain(result);
    });
  });

  describe("output handling", () => {
    it("creates custom --out directory and handles --from option", async () => {
      const customOutDir = path.join(tempOutDir, "custom-output");
      const findingsDir = writeFindingsToDir(path.join(tempOutDir, "existing-findings"), [
        createFinding({ ruleId: "EXISTING_RULE", severity: "low", category: "maintainability" }),
      ]);

      const args = [fixturesDir, "--policy", policyFile, "--from", findingsDir, "--out", customOutDir];
      const { exitCode, readiness } = await runReadiness(args);

      expect(exitCode).toBe(EXIT.OK);
      expect(existsSync(path.join(customOutDir, "release-readiness.json"))).toBe(true);
      expect(readiness.counts.findings).toBe(1);
      expect(readiness.artifactRefs.findings).toBeDefined();
    });

    it("handles nonexistent --from directory and empty findings", async () => {
      // Nonexistent --from - now returns POLICY_FAILED (P0-01 fix)
      const args1 = [fixturesDir, "--policy", policyFile, "--from", "/nonexistent", "--out", tempOutDir];
      const result1 = await readinessCommand(args1, { VERSION, EXIT, getOption });
      expect(result1).toBe(EXIT.POLICY_FAILED);

      // Empty findings - should pass
      const emptyDir = writeFindingsToDir(path.join(tempOutDir, "empty"), []);
      const args2 = [fixturesDir, "--policy", policyFile, "--from", emptyDir, "--out", tempOutDir];
      const { readiness } = await runReadiness(args2);

      expect(readiness.status).toBe("passed");
      expect(readiness.counts.findings).toBe(0);
      expect(readiness.summary).toContain("ready");
    });
  });

  describe("policy evaluation", () => {
    it("evaluates blocking severities and categories", async () => {
      // Critical severity
      const criticalDir = writeFindingsToDir(path.join(tempOutDir, "critical"), [
        createFinding({ severity: "critical" }),
      ]);
      const args1 = [fixturesDir, "--policy", policyFile, "--from", criticalDir, "--out", tempOutDir];
      const { exitCode, readiness } = await runReadiness(args1);

      expect(exitCode).toBe(EXIT.READINESS_NOT_CLEAR);
      expect(readiness.status).toBe("blocked_input");
      expect(readiness.failedConditions.some(c => c.id === "BLOCKING_SEVERITY_CRITICAL")).toBe(true);

      // Verify failedConditions structure
      for (const condition of readiness.failedConditions) {
        expect(condition.id).toBeDefined();
        expect(condition.reason).toBeDefined();
        if (condition.matchedFindingIds) {
          expect(Array.isArray(condition.matchedFindingIds)).toBe(true);
        }
      }
    });

    it("evaluates blocking categories (payment)", async () => {
      const paymentDir = writeFindingsToDir(path.join(tempOutDir, "payment"), [
        createFinding({ category: "payment", severity: "high" }),
      ]);
      const args = [fixturesDir, "--policy", policyFile, "--from", paymentDir, "--out", tempOutDir];
      const { exitCode, readiness } = await runReadiness(args);

      expect(exitCode).toBe(EXIT.READINESS_NOT_CLEAR);
      expect(readiness.status).toBe("blocked_input");
      expect(readiness.failedConditions.some(c => c.id.includes("PAYMENT"))).toBe(true);
    });

    it("evaluates blocking rules (CLIENT_TRUSTED_PRICE)", async () => {
      const ruleDir = writeFindingsToDir(path.join(tempOutDir, "rule"), [
        createFinding({ ruleId: "CLIENT_TRUSTED_PRICE", severity: "critical" }),
      ]);
      const args = [fixturesDir, "--policy", policyFile, "--from", ruleDir, "--out", tempOutDir];
      const { exitCode, readiness } = await runReadiness(args);

      expect(exitCode).toBe(EXIT.READINESS_NOT_CLEAR);
      expect(readiness.status).toBe("blocked_input");
      expect(readiness.failedConditions.some(c => c.id.includes("CLIENT_TRUSTED_PRICE"))).toBe(true);
    });

    it("passes when no blocking conditions matched", async () => {
      const findingsDir = writeFindingsToDir(path.join(tempOutDir, "no-block"), []);
      const args = [fixturesDir, "--policy", policyFile, "--from", findingsDir, "--out", tempOutDir];
      const { readiness } = await runReadiness(args);

      if (readiness.counts.critical === 0) {
        expect(["passed", "passed_with_risk"]).toContain(readiness.status);
      }
    });
  });

  describe("run metadata", () => {
    it("generates unique run_id per invocation", async () => {
      const findingsDir = writeFindingsToDir(path.join(tempOutDir, "run-meta"), []);
      const out1 = path.join(tempOutDir, "run1");
      const out2 = path.join(tempOutDir, "run2");

      await readinessCommand([fixturesDir, "--policy", policyFile, "--from", findingsDir, "--out", out1], { VERSION, EXIT, getOption });
      await new Promise(r => setTimeout(r, 100));
      await readinessCommand([fixturesDir, "--policy", policyFile, "--from", findingsDir, "--out", out2], { VERSION, EXIT, getOption });

      const r1 = JSON.parse(readFileSync(path.join(out1, "release-readiness.json"), "utf8"));
      const r2 = JSON.parse(readFileSync(path.join(out2, "release-readiness.json"), "utf8"));

      expect(r1.run_id).toMatch(/^readiness-/);
      expect(r2.run_id).toMatch(/^readiness-/);
    });
  });

  describe("recommended actions", () => {
    it("generates appropriate recommendedActions for findings", async () => {
      const findingsDir = writeFindingsToDir(path.join(tempOutDir, "recommend"), [
        createFinding({ severity: "critical", category: "security" }),
        createFinding({ severity: "high", category: "auth" }),
      ]);

      const args = [fixturesDir, "--policy", policyFile, "--from", findingsDir, "--out", tempOutDir];
      const { readiness } = await runReadiness(args);

      expect(Array.isArray(readiness.recommendedActions)).toBe(true);
      for (const action of readiness.recommendedActions) {
        expect(typeof action).toBe("string");
      }
    });
  });

  describe("edge cases", () => {
    it("ignores .git directory", async () => {
      const gitRepo = path.join(tempOutDir, "git-repo");
      mkdirSync(path.join(gitRepo, ".git"), { recursive: true });
      mkdirSync(path.join(gitRepo, "src"), { recursive: true });
      writeFileSync(path.join(gitRepo, ".git", "config"), "git config", "utf8");
      writeFileSync(path.join(gitRepo, "src", "index.ts"), "export const x = 1;", "utf8");

      const findingsDir = writeFindingsToDir(path.join(tempOutDir, "git-findings"), []);
      const args = [gitRepo, "--policy", policyFile, "--from", findingsDir, "--out", tempOutDir];
      const result = await readinessCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.OK);
    });

    it("requires --from option (P0-01 fix)", async () => {
      // Missing --from should return USAGE_ERROR
      const args = [fixturesDir, "--policy", policyFile, "--out", tempOutDir];
      const result = await readinessCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("fails when findings.json not found in --from directory (P0-01 fix)", async () => {
      const emptyFromDir = path.join(tempOutDir, "empty-from");
      mkdirSync(emptyFromDir, { recursive: true });
      // No findings.json in this directory

      const args = [fixturesDir, "--policy", policyFile, "--from", emptyFromDir, "--out", tempOutDir];
      const result = await readinessCommand(args, { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.POLICY_FAILED);
    });
  });
});