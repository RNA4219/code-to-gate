import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cleanupTempDir, createTempOutDir, readJson, runCli } from "./helper.js";

describe("database base/head diff", () => {
  let repoDir: string;
  let outDir: string;

  beforeAll(() => {
    repoDir = createTempOutDir("database-diff-repo");
    outDir = createTempOutDir("database-diff-output");
    execFileSync("git", ["init"], { cwd: repoDir });
    execFileSync("git", ["config", "user.email", "ctg@example.invalid"], { cwd: repoDir });
    execFileSync("git", ["config", "user.name", "code-to-gate test"], { cwd: repoDir });
    mkdirSync(path.join(repoDir, "migrations"), { recursive: true });
    writeFileSync(path.join(repoDir, "migrations", "V00000001__base.sql"), "DROP TABLE users;\n", "utf8");
    execFileSync("git", ["add", "."], { cwd: repoDir });
    execFileSync("git", ["commit", "-m", "base"], { cwd: repoDir });
    execFileSync("git", ["tag", "base"], { cwd: repoDir });

    writeFileSync(path.join(repoDir, "migrations", "V00000002__head.sql"), "DROP TABLE orders;\n", "utf8");
    execFileSync("git", ["add", "."], { cwd: repoDir });
    execFileSync("git", ["commit", "-m", "head"], { cwd: repoDir });
    execFileSync("git", ["tag", "head"], { cwd: repoDir });
  });

  afterAll(() => {
    cleanupTempDir(repoDir);
    cleanupTempDir(outDir);
  });

  it("reports only database risks newly introduced in head", { timeout: 30000 }, () => {
    const result = runCli([
      "diff", repoDir, "--base", "base", "--head", "head", "--database-analysis", "--out", outDir,
    ]);
    expect([0, 1]).toContain(result.exitCode);

    const findings = readJson(path.join(outDir, "findings.json")) as {
      findings: Array<{ ruleId: string; title: string; evidence: Array<{ path: string }> }>;
    };
    const dropTables = findings.findings.filter((finding) => finding.ruleId === "DB_DROP_TABLE");
    expect(dropTables).toHaveLength(1);
    expect(dropTables[0].title).toContain("orders");
    expect(dropTables[0].evidence[0].path).toContain("V00000002__head.sql");

    const diff = readJson(path.join(outDir, "database-assets-diff.json")) as {
      newOperations: Array<{ operation: { type: string; tableName?: string } }>;
    };
    expect(diff.newOperations).toContainEqual(
      expect.objectContaining({
        operation: expect.objectContaining({ type: "drop_table", tableName: "orders" }),
      })
    );
  });
});
