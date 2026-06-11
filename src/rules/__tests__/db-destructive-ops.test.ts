/**
 * Unit tests for DB_DESTRUCTIVE_OPS Rule
 */

import { describe, it, expect } from "vitest";
import { DB_DESTRUCTIVE_OPS_RULE, DatabaseFindingRuleId } from "../db-destructive-ops.js";
import type { RuleContext, SimpleGraph } from "../index.js";

// Mock context for testing
function createMockContext(files: Array<{ path: string; content: string; role?: string }>): RuleContext {
  return {
    graph: {
      files: files.map((f) => ({
        path: f.path,
        role: f.role || "source",
        language: f.path.endsWith(".ts") ? "ts" : "js",
        hash: "mock-hash",
        symbols: [],
        relations: [],
      })),
      run_id: "test-run",
      generated_at: new Date().toISOString(),
      repo: { root: "/test" },
      stats: { partial: false },
    },
    getFileContent: (path: string) => {
      const file = files.find((f) => f.path === path);
      return file?.content ?? null;
    },
  };
}

describe("DB_DESTRUCTIVE_OPS_RULE", () => {
  describe("Rule metadata", () => {
    it("has correct ID", () => {
      expect(DB_DESTRUCTIVE_OPS_RULE.id).toBe("DB_DESTRUCTIVE_OPS");
    });

    it("has correct category", () => {
      expect(DB_DESTRUCTIVE_OPS_RULE.category).toBe("data");
    });

    it("has high severity", () => {
      expect(DB_DESTRUCTIVE_OPS_RULE.defaultSeverity).toBe("high");
    });

    it("has valid confidence", () => {
      expect(DB_DESTRUCTIVE_OPS_RULE.defaultConfidence).toBeGreaterThanOrEqual(0.8);
      expect(DB_DESTRUCTIVE_OPS_RULE.defaultConfidence).toBeLessThanOrEqual(1);
    });
  });

  describe("DROP TABLE detection", () => {
    it("detects DROP TABLE in TypeORM migration", () => {
      const content = `
        import { MigrationInterface, QueryRunner } from "typeorm";

        export class DropUsersTable1715700000000 implements MigrationInterface {
          public async up(queryRunner: QueryRunner): Promise<void> {
            await queryRunner.query("DROP TABLE users");
          }

          public async down(queryRunner: QueryRunner): Promise<void> {
            await queryRunner.query("CREATE TABLE users (id INT, name VARCHAR(255))");
          }
        }
      `;
      const context = createMockContext([
        { path: "migrations/1715700000000-drop-users.ts", content },
      ]);

      const findings = DB_DESTRUCTIVE_OPS_RULE.evaluate(context);

      const dropTableFinding = findings.find(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_DROP_TABLE
      );

      expect(dropTableFinding).toBeDefined();
      expect(dropTableFinding?.title).toContain("DROP TABLE");
      expect(dropTableFinding?.severity).toBe("high"); // Has rollback → critical reduced to high (SPEC-29)
    });

    it("detects DROP TABLE without rollback (high severity)", () => {
      const content = `
        export class DangerousMigration implements MigrationInterface {
          public async up(queryRunner: QueryRunner): Promise<void> {
            await queryRunner.query("DROP TABLE users");
          }
          // No down method - no rollback
        }
      `;
      const context = createMockContext([
        { path: "migrations/dangerous.ts", content },
      ]);

      const findings = DB_DESTRUCTIVE_OPS_RULE.evaluate(context);

      const dropTableFinding = findings.find(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_DROP_TABLE
      );

      expect(dropTableFinding).toBeDefined();
      expect(dropTableFinding?.severity).toBe("critical"); // No rollback → baseline critical (SPEC-29)
    });

    it("detects DROP TABLE with IF EXISTS", () => {
      const content = `
        await queryRunner.query("DROP TABLE IF EXISTS temp_table");
      `;
      const context = createMockContext([
        { path: "migrations/cleanup.ts", content },
      ]);

      const findings = DB_DESTRUCTIVE_OPS_RULE.evaluate(context);

      expect(findings.some((f) => f.ruleId === DatabaseFindingRuleId.DB_DROP_TABLE)).toBe(true);
    });
  });

  describe("DROP COLUMN detection", () => {
    it("detects DROP COLUMN in migration", () => {
      const content = `
        export class DropEmailColumn1715700000001 implements MigrationInterface {
          public async up(queryRunner: QueryRunner): Promise<void> {
            await queryRunner.query("ALTER TABLE users DROP COLUMN email");
          }

          public async down(queryRunner: QueryRunner): Promise<void> {
            await queryRunner.query("ALTER TABLE users ADD COLUMN email VARCHAR(255)");
          }
        }
      `;
      const context = createMockContext([
        { path: "migrations/1715700000001-drop-email.ts", content },
      ]);

      const findings = DB_DESTRUCTIVE_OPS_RULE.evaluate(context);

      const dropColumnFinding = findings.find(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_DROP_COLUMN
      );

      expect(dropColumnFinding).toBeDefined();
      expect(dropColumnFinding?.title).toContain("DROP COLUMN");
      expect(dropColumnFinding?.title).toContain("users.email");
    });

    it("detects DROP COLUMN without rollback", () => {
      const content = `
        public async up(queryRunner: QueryRunner): Promise<void> {
          await queryRunner.query("ALTER TABLE users DROP COLUMN phone");
        }
      `;
      const context = createMockContext([
        { path: "migrations/no-rollback.ts", content },
      ]);

      const findings = DB_DESTRUCTIVE_OPS_RULE.evaluate(context);

      const dropColumnFinding = findings.find(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_DROP_COLUMN
      );

      expect(dropColumnFinding).toBeDefined();
      expect(dropColumnFinding?.severity).toBe("high");
    });
  });

  describe("NOT NULL without DEFAULT detection", () => {
    it("detects NOT NULL column without DEFAULT", () => {
      const content = `
        export class AddRequiredColumn1715700000002 implements MigrationInterface {
          public async up(queryRunner: QueryRunner): Promise<void> {
            await queryRunner.query("ALTER TABLE users ADD COLUMN required_field VARCHAR(255) NOT NULL");
          }

          public async down(queryRunner: QueryRunner): Promise<void> {
            await queryRunner.query("ALTER TABLE users DROP COLUMN required_field");
          }
        }
      `;
      const context = createMockContext([
        { path: "migrations/1715700000002-add-required.ts", content },
      ]);

      const findings = DB_DESTRUCTIVE_OPS_RULE.evaluate(context);

      const notNullFinding = findings.find(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_ADD_NOT_NULL_WITHOUT_DEFAULT
      );

      expect(notNullFinding).toBeDefined();
      expect(notNullFinding?.title).toContain("NOT NULL without DEFAULT");
      expect(notNullFinding?.severity).toBe("high");
    });

    it("does NOT flag NOT NULL with DEFAULT", () => {
      const content = `
        await queryRunner.query("ALTER TABLE users ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'active'");
      `;
      const context = createMockContext([
        { path: "migrations/safe-add.ts", content },
      ]);

      const findings = DB_DESTRUCTIVE_OPS_RULE.evaluate(context);

      const notNullFinding = findings.find(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_ADD_NOT_NULL_WITHOUT_DEFAULT
      );

      expect(notNullFinding).toBeUndefined();
    });

    it("does NOT flag nullable column", () => {
      const content = `
        await queryRunner.query("ALTER TABLE users ADD COLUMN optional_field VARCHAR(255)");
      `;
      const context = createMockContext([
        { path: "migrations/safe-add.ts", content },
      ]);

      const findings = DB_DESTRUCTIVE_OPS_RULE.evaluate(context);

      const notNullFinding = findings.find(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_ADD_NOT_NULL_WITHOUT_DEFAULT
      );

      expect(notNullFinding).toBeUndefined();
    });
  });

  describe("Migration file detection", () => {
    it("only analyzes migration files", () => {
      const content = `
        // This is a regular source file, not a migration
        await connection.query("DROP TABLE users");
      `;
      const context = createMockContext([
        { path: "src/services/user-service.ts", content },
      ]);

      const findings = DB_DESTRUCTIVE_OPS_RULE.evaluate(context);

      expect(findings.length).toBe(0);
    });

    it("analyzes files in migrations directory", () => {
      const content = `
        await queryRunner.query("DROP TABLE temp");
      `;
      const context = createMockContext([
        { path: "db/migrations/001-cleanup.ts", content },
      ]);

      const findings = DB_DESTRUCTIVE_OPS_RULE.evaluate(context);

      expect(findings.length).toBeGreaterThan(0);
    });

    it("analyzes TypeORM timestamp format files", () => {
      const content = `
        await queryRunner.query("DROP TABLE logs");
      `;
      const context = createMockContext([
        { path: "src/migrations/1715700000003-drop-logs.ts", content },
      ]);

      const findings = DB_DESTRUCTIVE_OPS_RULE.evaluate(context);

      expect(findings.length).toBeGreaterThan(0);
    });

    it("analyzes Flyway SQL files", () => {
      const content = `
        DROP TABLE audit_log;
      `;
      const context = createMockContext([
        { path: "db/migration/V001__drop_audit.sql", content },
      ]);

      const findings = DB_DESTRUCTIVE_OPS_RULE.evaluate(context);

      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe("Evidence generation", () => {
    it("includes correct evidence path", () => {
      const content = `
        await queryRunner.query("DROP TABLE users");
      `;
      const context = createMockContext([
        { path: "migrations/drop-users.ts", content },
      ]);

      const findings = DB_DESTRUCTIVE_OPS_RULE.evaluate(context);

      expect(findings[0]?.evidence[0]?.path).toBe("migrations/drop-users.ts");
    });

    it("includes correct tags", () => {
      const content = `
        await queryRunner.query("DROP TABLE users");
      `;
      const context = createMockContext([
        { path: "migrations/drop-users.ts", content },
      ]);

      const findings = DB_DESTRUCTIVE_OPS_RULE.evaluate(context);

      expect(findings[0]?.tags).toContain("database");
      expect(findings[0]?.tags).toContain("migration");
      expect(findings[0]?.tags).toContain("destructive");
    });
  });

  describe("Empty context handling", () => {
    it("returns empty array for empty files", () => {
      const context = createMockContext([]);

      const findings = DB_DESTRUCTIVE_OPS_RULE.evaluate(context);

      expect(findings).toEqual([]);
    });

    it("returns empty array for non-migration files", () => {
      const context = createMockContext([
        { path: "src/app.ts", content: "console.log('hello');" },
      ]);

      const findings = DB_DESTRUCTIVE_OPS_RULE.evaluate(context);

      expect(findings).toEqual([]);
    });
  });
});

describe("DatabaseFindingRuleId constants", () => {
  it("exports DB_DROP_TABLE", () => {
    expect(DatabaseFindingRuleId.DB_DROP_TABLE).toBe("DB_DROP_TABLE");
  });

  it("exports DB_DROP_COLUMN", () => {
    expect(DatabaseFindingRuleId.DB_DROP_COLUMN).toBe("DB_DROP_COLUMN");
  });

  it("exports DB_ADD_NOT_NULL_WITHOUT_DEFAULT", () => {
    expect(DatabaseFindingRuleId.DB_ADD_NOT_NULL_WITHOUT_DEFAULT).toBe("DB_ADD_NOT_NULL_WITHOUT_DEFAULT");
  });
});