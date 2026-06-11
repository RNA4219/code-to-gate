/**
 * Performance test for SPEC-29 database analysis
 * Target: 1000 SQL files / 10 MiB total / 30 seconds
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runCli, createTempOutDir, cleanupTempDir } from "./helper.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

describe("database analysis performance", () => {
  const perfFixtureDir = path.join(import.meta.dirname, "../fixtures/perf-1000-sql");
  const tempDir = createTempOutDir("perf-1000-sql");
  const TARGET_FILES = 1000;
  const TARGET_SIZE_KB = 10 * 1024; // 10 MiB
  const TARGET_TIME_MS = 30 * 1000; // 30 seconds

  beforeAll(() => {
    // Create performance fixture if not exists
    mkdirSync(perfFixtureDir, { recursive: true });
    mkdirSync(path.join(perfFixtureDir, "migrations"), { recursive: true });
    mkdirSync(path.join(perfFixtureDir, "src"), { recursive: true });

    // Create 1000 SQL migration files with varying operations
    // Each file is ~10KB to reach 10 MiB total
    const operations = [
      "CREATE TABLE users_{id} (id INT PRIMARY KEY, name VARCHAR(255), email VARCHAR(255));",
      "ALTER TABLE users_{id} ADD COLUMN created_at TIMESTAMP DEFAULT NOW();",
      "CREATE INDEX idx_users_{id}_email ON users_{id}(email);",
      "DROP INDEX idx_old_{id};",
      "ALTER TABLE users_{id} DROP COLUMN deprecated_{id};",
    ];

    for (let i = 1; i <= TARGET_FILES; i++) {
      const opIndex = i % operations.length;
      // Add padding to reach ~10KB per file
      const padding = `-- Migration ${i}\n-- Padding line ${i}\n`.repeat(150);
      const content = `${padding}\n${operations[opIndex].replace("{id}", String(i))}\n`;
      writeFileSync(
        path.join(perfFixtureDir, "migrations", `V${String(i).padStart(4, "0")}__migration.sql`),
        content
      );
    }

    // Create a minimal source file to make scan succeed
    writeFileSync(
      path.join(perfFixtureDir, "src", "index.ts"),
      "export const app = { name: 'perf-test' };"
    );

    writeFileSync(
      path.join(perfFixtureDir, "package.json"),
      JSON.stringify({ name: "perf-1000-sql", version: "1.0.0" })
    );
  });

  afterAll(() => {
    cleanupTempDir(tempDir);
    // Cleanup fixture
    try {
      rmSync(perfFixtureDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it(
    "analyzes 1000 SQL files within 30 seconds",
    { timeout: 60_000 },
    () => {
      const startTime = Date.now();

      const result = runCli([
        "scan",
        perfFixtureDir,
        "--database-analysis",
        "--out",
        tempDir,
      ]);

      const elapsedMs = Date.now() - startTime;

      console.log(`Performance: ${elapsedMs}ms for ${TARGET_FILES} SQL files`);
      console.log(`Target: ${TARGET_TIME_MS}ms`);

      expect(result.exitCode).toBe(0);

      // Check database-assets.json
      const dbAssets = JSON.parse(
        require("fs").readFileSync(path.join(tempDir, "database-assets.json"), "utf8")
      );

      expect(dbAssets.artifact).toBe("database-assets");
      console.log(`Files analyzed: ${dbAssets.stats?.filesAnalyzed}`);

      // Verify time requirement
      expect(elapsedMs).toBeLessThanOrEqual(TARGET_TIME_MS);
    }
  );

  it(
    "analyze command generates findings within reasonable time",
    { timeout: 90_000 },
    () => {
      const startTime = Date.now();

      const result = runCli([
        "analyze",
        perfFixtureDir,
        "--database-analysis",
        "--emit",
        "all",
        "--out",
        tempDir,
      ]);

      const elapsedMs = Date.now() - startTime;

      console.log(`Analyze performance: ${elapsedMs}ms`);

      // Analyze can take longer than scan due to rule evaluation
      // Allow up to 60 seconds for analyze
      expect(elapsedMs).toBeLessThanOrEqual(60_000);
      expect([0, 5]).toContain(result.exitCode);
    }
  );
});