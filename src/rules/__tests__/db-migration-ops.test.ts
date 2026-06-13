/**
 * Database Migration Operations Rule Tests (SPEC-29)
 *
 * Unit tests for DB_MIGRATION_OPS_RULE:
 * - DB_DROP_INDEX detection
 * - DB_MIGRATION_NO_TRANSACTION_SIGNAL detection
 * - DB_ROLLBACK_NOT_EVIDENCED detection
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DB_MIGRATION_OPS_RULE,
  DatabaseFindingRuleId,
  type RuleContext,
} from "../../rules/index.js";
import type { RepoFile } from "../../types/artifacts.js";

// Helper to create mock context with files
function createMockContext(files: Array<{ path: string; role?: string; content?: string }>): RuleContext {
  const fileContents: Record<string, string> = {};
  const repoFiles: RepoFile[] = [];

  for (const file of files) {
    fileContents[file.path] = file.content ?? "";
    repoFiles.push({
      path: file.path,
      hash: "test-hash",
      language: file.path.endsWith(".ts") ? "typescript" : file.path.endsWith(".sql") ? "sql" : "javascript",
      role: file.role ?? "source",
      size: file.content?.length ?? 0,
      lines: file.content?.split("\n").length ?? 0,
    });
  }

  return {
    graph: {
      files: repoFiles,
      run_id: "test-run",
      generated_at: new Date().toISOString(),
      repo: { root: "/test" },
      stats: { partial: false },
    },
    getFileContent: (path: string) => fileContents[path] ?? null,
  };
}

describe("DB_MIGRATION_OPS_RULE", () => {
  describe("Rule Metadata", () => {
    it("should have correct rule ID", () => {
      expect(DB_MIGRATION_OPS_RULE.id).toBe("DB_MIGRATION_OPS");
    });

    it("should have correct category", () => {
      expect(DB_MIGRATION_OPS_RULE.category).toBe("data");
    });

    it("should have valid severity", () => {
      expect(DB_MIGRATION_OPS_RULE.defaultSeverity).toBe("high");
    });

    it("should have valid confidence", () => {
      expect(DB_MIGRATION_OPS_RULE.defaultConfidence).toBeGreaterThanOrEqual(0);
      expect(DB_MIGRATION_OPS_RULE.defaultConfidence).toBeLessThanOrEqual(1);
    });

    it("should have non-empty name and description", () => {
      expect(DB_MIGRATION_OPS_RULE.name.length).toBeGreaterThan(0);
      expect(DB_MIGRATION_OPS_RULE.description.length).toBeGreaterThan(10);
    });

    it("should have evaluate function", () => {
      expect(typeof DB_MIGRATION_OPS_RULE.evaluate).toBe("function");
    });
  });

  describe("DB_DROP_INDEX Detection", () => {
    it("should detect DROP INDEX in SQL migration", () => {
      const content = `
-- Drop index migration
DROP INDEX idx_users_email;
`;
      const context = createMockContext([
        { path: "migrations/001_drop_index.sql", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);

      const dropIndexFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_DROP_INDEX
      );
      expect(dropIndexFindings.length).toBeGreaterThan(0);
      expect(dropIndexFindings[0].severity).toBe("medium"); // SPEC-29: baseline medium
      expect(dropIndexFindings[0].title).toContain("DROP INDEX");
    });

    it("should detect DROP INDEX with table reference", () => {
      const content = `
ALTER TABLE users DROP INDEX idx_email;
`;
      const context = createMockContext([
        { path: "db/migrate/002_alter.sql", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);

      const dropIndexFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_DROP_INDEX
      );
      expect(dropIndexFindings.length).toBeGreaterThan(0);
    });

    it("should reduce severity when rollback exists", () => {
      const content = `
export class DropIndexMigration {
  async up(queryRunner) {
    await queryRunner.query("DROP INDEX idx_users_email");
  }

  async down(queryRunner) {
    await queryRunner.query("CREATE INDEX idx_users_email ON users(email)");
  }
}
`;
      const context = createMockContext([
        { path: "migrations/123_drop_index.ts", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);

      const dropIndexFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_DROP_INDEX
      );
      expect(dropIndexFindings.length).toBeGreaterThan(0);
      // Severity should be medium when rollback exists
      expect(dropIndexFindings[0].severity).toBe("medium");
    });

    it("should include index name in finding title", () => {
      const content = `
DROP INDEX idx_products_category;
`;
      const context = createMockContext([
        { path: "schema/migrations/drop.sql", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);

      const dropIndexFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_DROP_INDEX
      );
      expect(dropIndexFindings[0].title).toContain("idx_products_category");
    });
  });

  describe("DB_MIGRATION_NO_TRANSACTION_SIGNAL Detection", () => {
    it("should detect migration without transaction signals", () => {
      const content = `
export class AddColumnMigration {
  async up(queryRunner) {
    await queryRunner.query("ALTER TABLE users ADD COLUMN age INTEGER");
  }
}
`;
      const context = createMockContext([
        { path: "migrations/003_add_column.ts", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);

      const noTxFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_MIGRATION_NO_TRANSACTION_SIGNAL
      );
      expect(noTxFindings.length).toBeGreaterThan(0);
      expect(noTxFindings[0].severity).toBe("medium");
      expect(noTxFindings[0].title).toContain("without transaction signal");
    });

    it("should not flag migration with BEGIN/COMMIT", () => {
      const content = `
export class SafeMigration {
  async up(queryRunner) {
    await queryRunner.query("BEGIN");
    await queryRunner.query("ALTER TABLE users ADD COLUMN age INTEGER");
    await queryRunner.query("COMMIT");
  }
}
`;
      const context = createMockContext([
        { path: "migrations/004_safe.ts", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);

      const noTxFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_MIGRATION_NO_TRANSACTION_SIGNAL
      );
      expect(noTxFindings.length).toBe(0);
    });

    it("should not flag migration with transaction API call", () => {
      const content = `
export class TransactionMigration {
  async up(queryRunner) {
    await queryRunner.connection.transaction(async (trx) => {
      await trx.query("ALTER TABLE users ADD COLUMN age INTEGER");
    });
  }
}
`;
      const context = createMockContext([
        { path: "migrations/005_transaction.ts", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);

      const noTxFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_MIGRATION_NO_TRANSACTION_SIGNAL
      );
      expect(noTxFindings.length).toBe(0);
    });

    it("should not flag pure SQL file with BEGIN TRANSACTION", () => {
      const content = `
BEGIN TRANSACTION;
ALTER TABLE users ADD COLUMN age INTEGER;
COMMIT;
`;
      const context = createMockContext([
        { path: "V006__add_age.sql", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);

      const noTxFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_MIGRATION_NO_TRANSACTION_SIGNAL
      );
      expect(noTxFindings.length).toBe(0);
    });
  });

  describe("DB_ROLLBACK_NOT_EVIDENCED Detection", () => {
    it("should detect migration without down method", () => {
      const content = `
export class IrreversibleMigration {
  async up(queryRunner) {
    await queryRunner.query("DROP TABLE temp_data");
  }
}
`;
      const context = createMockContext([
        { path: "migrations/007_irreversible.ts", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);

      const rollbackFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_ROLLBACK_NOT_EVIDENCED
      );
      expect(rollbackFindings.length).toBeGreaterThan(0);
      expect(rollbackFindings[0].severity).toBe("medium");
      expect(rollbackFindings[0].title).toContain("without rollback evidence");
    });

    it("should not flag migration with down method", () => {
      const content = `
export class ReversibleMigration {
  async up(queryRunner) {
    await queryRunner.query("ALTER TABLE users ADD COLUMN status VARCHAR(50)");
  }

  async down(queryRunner) {
    await queryRunner.query("ALTER TABLE users DROP COLUMN status");
  }
}
`;
      const context = createMockContext([
        { path: "migrations/008_reversible.ts", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);

      const rollbackFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_ROLLBACK_NOT_EVIDENCED
      );
      expect(rollbackFindings.length).toBe(0);
    });

    it("should include operations in finding summary", () => {
      const content = `
export class ComplexMigration {
  async up(queryRunner) {
    await queryRunner.query("DROP TABLE old_data");
    await queryRunner.query("ALTER TABLE users DROP COLUMN deprecated_field");
  }
}
`;
      const context = createMockContext([
        { path: "migrations/009_complex.ts", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);

      const rollbackFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_ROLLBACK_NOT_EVIDENCED
      );
      expect(rollbackFindings.length).toBeGreaterThan(0);
      expect(rollbackFindings[0].summary).toContain("Operations include:");
    });

    it("should not flag down direction migrations", () => {
      const content = `
export class MigrationWithDown {
  async up(queryRunner) {
    await queryRunner.query("ALTER TABLE users ADD COLUMN new_field TEXT");
  }

  async down(queryRunner) {
    await queryRunner.query("ALTER TABLE users DROP COLUMN new_field");
  }
}
`;
      const context = createMockContext([
        { path: "migrations/010_complete.ts", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);

      // Should only flag up migrations, not down
      const rollbackFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_ROLLBACK_NOT_EVIDENCED
      );
      expect(rollbackFindings.length).toBe(0);
    });
  });

  describe("Non-migration files", () => {
    it("should not analyze non-migration files", () => {
      const content = `
-- Regular SQL query file
SELECT * FROM users;
DROP INDEX idx_email; -- This should not be flagged
`;
      const context = createMockContext([
        { path: "queries/users.sql", content }, // Not in migration path
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should not analyze source files outside migrations", () => {
      const content = `
// Regular TypeScript file
function someFunction() {
  db.query("DROP INDEX idx_test");
}
`;
      const context = createMockContext([
        { path: "src/services/db.ts", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });
  });

  describe("Migration file patterns", () => {
    it("should detect TypeORM timestamp format migrations", () => {
      const content = `
export class Migration1234567890 {
  async up(queryRunner) {
    await queryRunner.query("DROP INDEX idx_test");
  }
}
`;
      const context = createMockContext([
        { path: "src/migrations/1234567890-drop-index.ts", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);
      const dropIndexFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_DROP_INDEX
      );
      expect(dropIndexFindings.length).toBeGreaterThan(0);
    });

    it("should detect Rails-style timestamp migrations", () => {
      const content = `
class Migration20240115123456 {
  async up() {
    await queryRunner.query("ALTER TABLE users DROP COLUMN old_field");
  }
}
`;
      const context = createMockContext([
        { path: "db/migrate/20240115123456_remove_old_field.ts", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);
      // Should find DB_DROP_COLUMN from DB_DESTRUCTIVE_OPS_RULE - not part of this rule
      // But should also find DB_ROLLBACK_NOT_EVIDENCED if no down method
      const rollbackFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_ROLLBACK_NOT_EVIDENCED
      );
      expect(rollbackFindings.length).toBeGreaterThan(0);
    });

    it("should detect Flyway SQL migrations", () => {
      const content = `
DROP INDEX idx_products_sku;
`;
      const context = createMockContext([
        { path: "V20240101__drop_product_index.sql", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);
      const dropIndexFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_DROP_INDEX
      );
      expect(dropIndexFindings.length).toBeGreaterThan(0);
    });
  });

  describe("Evidence generation", () => {
    it("should include evidence with file path", () => {
      const content = `
DROP INDEX idx_users_name;
`;
      const context = createMockContext([
        { path: "migrations/drop_user_index.sql", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].evidence[0].path).toBe("migrations/drop_user_index.sql");
    });

    it("should include evidence with line numbers", () => {
      const content = `
-- Header comment
DROP INDEX idx_test;
`;
      const context = createMockContext([
        { path: "migrations/test.sql", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].evidence[0].startLine).toBeGreaterThanOrEqual(1);
    });

    it("should include tags in findings", () => {
      const content = `
DROP INDEX idx_test;
`;
      const context = createMockContext([
        { path: "migrations/drop.sql", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);
      const dropIndexFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_DROP_INDEX
      );
      expect(dropIndexFindings[0].tags).toContain("database");
      expect(dropIndexFindings[0].tags).toContain("migration");
      expect(dropIndexFindings[0].tags).toContain("index");
    });
  });

  describe("Empty context handling", () => {
    it("should return empty array for empty files list", () => {
      const context = createMockContext([]);
      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);
      expect(findings).toEqual([]);
    });

    it("should return empty array when no migration files", () => {
      const context = createMockContext([
        { path: "src/index.ts", content: "console.log('hello');" },
        { path: "README.md", content: "# Project" },
      ]);
      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);
      expect(findings).toEqual([]);
    });

    it("should return empty array when migration files have no content", () => {
      const context = createMockContext([
        { path: "migrations/empty.sql", content: "" },
        { path: "migrations/empty.ts", content: "" },
      ]);
      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);
      expect(findings).toEqual([]);
    });
  });

  describe("Multiple findings", () => {
    it("should detect multiple issues in same migration", () => {
      const content = `
export class RiskyMigration {
  async up(queryRunner) {
    await queryRunner.query("DROP INDEX idx_old");
    await queryRunner.query("DROP INDEX idx_deprecated");
    await queryRunner.query("ALTER TABLE users ADD COLUMN new_field TEXT");
  }
}
`;
      const context = createMockContext([
        { path: "migrations/risky.ts", content },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);

      const dropIndexFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_DROP_INDEX
      );
      const rollbackFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_ROLLBACK_NOT_EVIDENCED
      );
      const noTxFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_MIGRATION_NO_TRANSACTION_SIGNAL
      );

      // Should detect 2 DROP INDEX operations
      expect(dropIndexFindings.length).toBeGreaterThanOrEqual(2);
      // Should detect missing rollback
      expect(rollbackFindings.length).toBeGreaterThan(0);
      // Should detect no transaction signal
      expect(noTxFindings.length).toBeGreaterThan(0);
    });

    it("should detect issues across multiple migration files", () => {
      const context = createMockContext([
        { path: "migrations/001_no_tx.ts", content: `export class M1 { async up(q) { q.query("DROP INDEX idx1"); } }` },
        { path: "migrations/002_no_rollback.ts", content: `export class M2 { async up(q) { q.query("DROP INDEX idx2"); } }` },
        { path: "migrations/003_complete.ts", content: `export class M3 { async up(q) { q.query("BEGIN"); q.query("DROP INDEX idx3"); q.query("COMMIT"); } async down(q) { q.query("CREATE INDEX idx3 ON t(c)"); } }` },
      ]);

      const findings = DB_MIGRATION_OPS_RULE.evaluate(context);

      const dropIndexFindings = findings.filter(
        (f) => f.ruleId === DatabaseFindingRuleId.DB_DROP_INDEX
      );
      // Should detect DROP INDEX in all 3 files
      expect(dropIndexFindings.length).toBeGreaterThanOrEqual(3);
    });
  });
});