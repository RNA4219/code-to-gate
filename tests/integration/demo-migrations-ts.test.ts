/**
 * Integration tests for database migration risk detection (SPEC-29)
 *
 * Tests:
 * - scan detects migration files with "migration" role
 * - analyze generates database findings for risky migration patterns
 * - All 8 database finding rule IDs are triggered:
 *   - DB_DROP_TABLE
 *   - DB_DROP_COLUMN
 *   - DB_ADD_NOT_NULL_WITHOUT_DEFAULT
 *   - DB_RISKY_TYPE_CHANGE
 *   - DB_DROP_CONSTRAINT
 *   - DB_DROP_INDEX
 *   - DB_MIGRATION_NO_TRANSACTION_SIGNAL
 *   - DB_ROLLBACK_NOT_EVIDENCED
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runCli,
  fixturePath,
  readJson,
  createTempOutDir,
  cleanupTempDir,
  fileExists,
} from "./helper.js";
import path from "node:path";

describe("demo-migrations-ts integration", () => {
  const fixture = "demo-migrations-ts";
  const fixtureRoot = fixturePath(fixture);
  let tempDir: string;
  let analyzeResult: { exitCode: number; stdout: string; stderr: string };

  beforeAll(() => {
    tempDir = createTempOutDir("demo-migrations-ts");
    // Run analyze once for all tests
    analyzeResult = runCli(["analyze", fixtureRoot, "--database-analysis", "--emit", "all", "--out", tempDir]);
  });

  afterAll(() => {
    cleanupTempDir(tempDir);
  });

  it("scan command generates database-assets without changing stable graph enums", { timeout: 30000 }, () => {
    const result = runCli(["scan", fixtureRoot, "--database-analysis", "--out", tempDir]);

    expect(result.exitCode).toBe(0);
    expect(fileExists(path.join(tempDir, "repo-graph.json"))).toBe(true);
    expect(fileExists(path.join(tempDir, "database-assets.json"))).toBe(true);

    const graph = readJson(path.join(tempDir, "repo-graph.json")) as {
      artifact: string;
      files: Array<{ path: string; role: string }>;
    };
    expect(graph.artifact).toBe("normalized-repo-graph");

    expect(graph.files.every((f) => f.role !== "migration")).toBe(true);

    const databaseAssets = readJson(path.join(tempDir, "database-assets.json")) as {
      artifact: string;
      schema: string;
      stats: { filesAnalyzed: number };
    };
    expect(databaseAssets.artifact).toBe("database-assets");
    expect(databaseAssets.schema).toBe("database-assets@v1alpha1");
    expect(databaseAssets.stats.filesAnalyzed).toBeGreaterThan(0);
  });

  it("analyze generates database findings for risky migrations", { timeout: 30000 }, () => {
    // Accept POLICY_FAILED (exit code 5) as valid since there are critical findings
    expect([0, 5]).toContain(analyzeResult.exitCode);
    expect(fileExists(path.join(tempDir, "findings.json"))).toBe(true);

    const findings = readJson(path.join(tempDir, "findings.json")) as {
      artifact: string;
      findings: Array<{ ruleId: string; category: string; severity: string }>;
    };
    expect(findings.artifact).toBe("findings");

    // Check that database findings are present
    const dbFindings = findings.findings.filter((f) => f.category === "data");
    expect(dbFindings.length).toBeGreaterThan(0);
  });

  it("detects DB_DROP_TABLE finding", { timeout: 30000 }, () => {
    const findings = readJson(path.join(tempDir, "findings.json")) as {
      findings: Array<{ ruleId: string; severity: string; title: string }>;
    };

    const dropTable = findings.findings.find((f) => f.ruleId === "DB_DROP_TABLE");
    expect(dropTable).toBeDefined();
    expect(dropTable?.severity).toBe("critical"); // SPEC-29: baseline critical, no rollback stays critical
    expect(dropTable?.title.toLowerCase()).toContain("drop table");
  });

  it("detects DB_DROP_COLUMN finding", { timeout: 30000 }, () => {
    const findings = readJson(path.join(tempDir, "findings.json")) as {
      findings: Array<{ ruleId: string; severity: string; title: string }>;
    };

    const dropColumn = findings.findings.find((f) => f.ruleId === "DB_DROP_COLUMN");
    expect(dropColumn).toBeDefined();
    expect(dropColumn?.severity).toBe("medium"); // Has rollback pattern
    expect(dropColumn?.title.toLowerCase()).toContain("drop column");
  });

  it("detects DB_ADD_NOT_NULL_WITHOUT_DEFAULT finding", { timeout: 30000 }, () => {
    const findings = readJson(path.join(tempDir, "findings.json")) as {
      findings: Array<{ ruleId: string; severity: string; title: string }>;
    };

    const notNullDefault = findings.findings.find(
      (f) => f.ruleId === "DB_ADD_NOT_NULL_WITHOUT_DEFAULT"
    );
    expect(notNullDefault).toBeDefined();
    expect(notNullDefault?.severity).toBe("high"); // Blocking operation
    expect(notNullDefault?.title.toLowerCase()).toContain("not null");
  });

  it("detects DB_RISKY_TYPE_CHANGE finding", { timeout: 30000 }, () => {
    const findings = readJson(path.join(tempDir, "findings.json")) as {
      findings: Array<{ ruleId: string; severity: string; title: string }>;
    };

    const typeChange = findings.findings.find((f) => f.ruleId === "DB_RISKY_TYPE_CHANGE");
    expect(typeChange).toBeDefined();
    expect(typeChange?.severity).toBe("medium"); // Has rollback pattern
    expect(typeChange?.title.toLowerCase()).toContain("type change");
  });

  it("detects DB_DROP_CONSTRAINT finding", { timeout: 30000 }, () => {
    const findings = readJson(path.join(tempDir, "findings.json")) as {
      findings: Array<{ ruleId: string; severity: string; title: string }>;
    };

    const dropConstraint = findings.findings.find((f) => f.ruleId === "DB_DROP_CONSTRAINT");
    expect(dropConstraint).toBeDefined();
    expect(dropConstraint?.severity).toBe("medium"); // Has rollback pattern
    expect(dropConstraint?.title.toLowerCase()).toContain("constraint");
  });

  it("detects DB_DROP_INDEX finding", { timeout: 30000 }, () => {
    const findings = readJson(path.join(tempDir, "findings.json")) as {
      findings: Array<{ ruleId: string; severity: string; title: string }>;
    };

    const dropIndex = findings.findings.find((f) => f.ruleId === "DB_DROP_INDEX");
    expect(dropIndex).toBeDefined();
    expect(dropIndex?.severity).toBe("medium"); // SPEC-29: baseline medium
    expect(dropIndex?.title.toLowerCase()).toContain("drop index");
  });

  it("detects DB_MIGRATION_NO_TRANSACTION_SIGNAL finding", { timeout: 30000 }, () => {
    const findings = readJson(path.join(tempDir, "findings.json")) as {
      findings: Array<{ ruleId: string; severity: string; title: string }>;
    };

    const noTransaction = findings.findings.find(
      (f) => f.ruleId === "DB_MIGRATION_NO_TRANSACTION_SIGNAL"
    );
    expect(noTransaction).toBeDefined();
    expect(noTransaction?.severity).toBe("medium");
    expect(noTransaction?.title.toLowerCase()).toContain("transaction");
  });

  it("detects DB_ROLLBACK_NOT_EVIDENCED finding", { timeout: 30000 }, () => {
    const findings = readJson(path.join(tempDir, "findings.json")) as {
      findings: Array<{ ruleId: string; severity: string; title: string }>;
    };

    const rollbackEvidence = findings.findings.find(
      (f) => f.ruleId === "DB_ROLLBACK_NOT_EVIDENCED"
    );
    expect(rollbackEvidence).toBeDefined();
    expect(rollbackEvidence?.severity).toBe("medium");
    expect(rollbackEvidence?.title.toLowerCase()).toContain("rollback");
  });

  it("database findings have correct tags", { timeout: 30000 }, () => {
    const findings = readJson(path.join(tempDir, "findings.json")) as {
      findings: Array<{ ruleId: string; tags: string[] }>;
    };

    const dbFindings = findings.findings.filter((f) => f.category === "data");
    for (const finding of dbFindings) {
      expect(finding.tags).toContain("database");
      expect(finding.tags).toContain("migration");
    }
  });

  it("findings.json validates against schema", { timeout: 30000 }, () => {
    const result = runCli(["schema", "validate", path.join(tempDir, "findings.json")]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("artifact ok");
  });

  it("database findings flow into risk and test seed artifacts", { timeout: 30000 }, () => {
    const findings = readJson(path.join(tempDir, "findings.json")) as {
      findings: Array<{ id: string; ruleId: string }>;
    };
    const dbFindingIds = new Set(
      findings.findings.filter((finding) => finding.ruleId.startsWith("DB_")).map((finding) => finding.id)
    );
    const testSeeds = readJson(path.join(tempDir, "test-seeds.json")) as {
      seeds: Array<{ sourceFindingIds: string[] }>;
    };
    expect(testSeeds.seeds.some((seed) => seed.sourceFindingIds.some((id) => dbFindingIds.has(id)))).toBe(true);
  });

  it("database findings flow into SARIF and readiness inputs", { timeout: 30000 }, () => {
    const sarifResult = runCli(["export", "sarif", "--from", tempDir]);
    expect(sarifResult.exitCode).toBe(0);
    const sarif = readJson(path.join(tempDir, "results.sarif")) as {
      runs: Array<{ results: Array<{ ruleId: string }> }>;
    };
    expect(sarif.runs[0].results.some((result) => result.ruleId.startsWith("DB_"))).toBe(true);

    const readinessResult = runCli([
      "readiness",
      fixtureRoot,
      "--policy",
      fixturePath("policies/strict.yaml"),
      "--from",
      tempDir,
      "--out",
      tempDir,
    ]);
    expect([0, 1, 5]).toContain(readinessResult.exitCode);
    const readiness = readJson(path.join(tempDir, "release-readiness.json")) as {
      failedConditions: Array<{ matchedFindingIds?: string[] }>;
    };
    expect(readiness.failedConditions.some((condition) => (condition.matchedFindingIds?.length ?? 0) > 0)).toBe(true);
  });
});
