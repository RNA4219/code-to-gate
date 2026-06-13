/**
 * Tests for SQL Lightweight Parser (SPEC-29)
 */

import { describe, it, expect } from "vitest";
import {
  tokenizeSql,
  detectSqlOperations,
  containsDangerousOperation,
  containsDropTable,
  containsDropColumn,
  containsNotNullWithoutDefault,
  isRiskyTypeChange,
  detectTransactionPatterns,
  detectOrmType,
  extractSqlFromOrmCode,
  analyzeMigration,
  createRawSqlRefs,
} from "../../core/sql-lightweight-parser.js";
import type { HashService } from "../../types/contracts.js";

// Mock hash service for tests
const mockHashService: HashService = {
  sha256: (input: string) => `sha256-${input.length}`,
  fingerprint: (input: string) => `fp-${input.slice(0, 8)}`,
};

// ============================================================================
// Tokenizer Tests
// ============================================================================

describe("tokenizeSql", () => {
  it("should tokenize basic SQL keywords", () => {
    const tokens = tokenizeSql("SELECT * FROM users");
    expect(tokens.filter((t) => t.type === "keyword")).toHaveLength(2);
    expect(tokens.find((t) => t.value === "SELECT")).toBeDefined();
    expect(tokens.find((t) => t.value === "FROM")).toBeDefined();
  });

  it("should tokenize string literals", () => {
    const tokens = tokenizeSql("SELECT 'hello' FROM table");
    const stringToken = tokens.find((t) => t.type === "string");
    expect(stringToken?.value).toBe("'hello'");
  });

  it("should tokenize numbers", () => {
    const tokens = tokenizeSql("SELECT 42, 3.14 FROM table");
    const numberTokens = tokens.filter((t) => t.type === "number");
    expect(numberTokens).toHaveLength(2);
  });

  it("should handle comments", () => {
    const tokens = tokenizeSql("SELECT * -- comment\nFROM users");
    const commentToken = tokens.find((t) => t.type === "comment");
    expect(commentToken?.value).toContain("comment");
  });
});

// ============================================================================
// SQL Operation Detection Tests
// ============================================================================

describe("detectSqlOperations", () => {
  it("should detect CREATE TABLE", () => {
    const ops = detectSqlOperations("CREATE TABLE users (id INT, name VARCHAR(255))");
    expect(ops).toHaveLength(1);
    expect(ops[0]?.type).toBe("create_table");
    expect(ops[0]?.tableName).toBe("users");
  });

  it("should detect DROP TABLE", () => {
    const ops = detectSqlOperations("DROP TABLE users");
    expect(ops).toHaveLength(1);
    expect(ops[0]?.type).toBe("drop_table");
    expect(ops[0]?.tableName).toBe("users");
  });

  it("should detect ALTER TABLE ADD COLUMN", () => {
    const ops = detectSqlOperations("ALTER TABLE users ADD COLUMN email VARCHAR(255)");
    expect(ops).toHaveLength(1);
    expect(ops[0]?.type).toBe("add_column");
    expect(ops[0]?.tableName).toBe("users");
    expect(ops[0]?.columnName).toBe("email");
  });

  it("should detect ALTER TABLE DROP COLUMN", () => {
    const ops = detectSqlOperations("ALTER TABLE users DROP COLUMN email");
    expect(ops).toHaveLength(1);
    expect(ops[0]?.type).toBe("drop_column");
    expect(ops[0]?.tableName).toBe("users");
    expect(ops[0]?.columnName).toBe("email");
  });

  it("should detect CREATE INDEX", () => {
    const ops = detectSqlOperations("CREATE INDEX idx_email ON users (email)");
    expect(ops).toHaveLength(1);
    expect(ops[0]?.type).toBe("add_index");
    expect(ops[0]?.tableName).toBe("users");
    expect(ops[0]?.details?.indexName).toBe("idx_email");
  });

  it("should detect DROP INDEX", () => {
    const ops = detectSqlOperations("DROP INDEX idx_email");
    expect(ops).toHaveLength(1);
    expect(ops[0]?.type).toBe("drop_index");
    expect(ops[0]?.details?.indexName).toBe("idx_email");
  });

  it("should detect DROP CONSTRAINT", () => {
    const ops = detectSqlOperations("DROP CONSTRAINT fk_user_orders");
    expect(ops).toHaveLength(1);
    expect(ops[0]?.type).toBe("drop_constraint");
  });

  it("should handle multiple operations", () => {
    const sql = `
      CREATE TABLE orders (id INT);
      DROP TABLE temp_table;
      ALTER TABLE users ADD COLUMN phone VARCHAR(20);
    `;
    const ops = detectSqlOperations(sql);
    expect(ops.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// Dangerous Operation Detection Tests
// ============================================================================

describe("containsDangerousOperation", () => {
  it("should detect DROP as dangerous", () => {
    expect(containsDangerousOperation("DROP TABLE users")).toBe(true);
  });

  it("should detect DELETE as dangerous", () => {
    expect(containsDangerousOperation("DELETE FROM users")).toBe(true);
  });

  it("should not detect SELECT as dangerous", () => {
    expect(containsDangerousOperation("SELECT * FROM users")).toBe(false);
  });
});

describe("containsDropTable", () => {
  it("should detect DROP TABLE", () => {
    expect(containsDropTable("DROP TABLE users CASCADE")).toBe(true);
  });

  it("should not detect DROP INDEX as DROP TABLE", () => {
    expect(containsDropTable("DROP INDEX idx_name")).toBe(false);
  });

  it("should handle IF EXISTS clause", () => {
    expect(containsDropTable("DROP TABLE IF EXISTS temp_table")).toBe(true);
  });
});

describe("containsDropColumn", () => {
  it("should detect DROP COLUMN", () => {
    expect(containsDropColumn("ALTER TABLE users DROP COLUMN email")).toBe(true);
  });

  it("should not detect ADD COLUMN as DROP COLUMN", () => {
    expect(containsDropColumn("ALTER TABLE users ADD COLUMN email VARCHAR(255)")).toBe(false);
  });
});

describe("containsNotNullWithoutDefault", () => {
  it("should detect NOT NULL without DEFAULT", () => {
    expect(containsNotNullWithoutDefault("ALTER TABLE users ADD COLUMN name VARCHAR(255) NOT NULL")).toBe(true);
  });

  it("should not flag NOT NULL with DEFAULT", () => {
    expect(containsNotNullWithoutDefault("ALTER TABLE users ADD COLUMN name VARCHAR(255) NOT NULL DEFAULT ''")).toBe(false);
  });

  it("should not flag nullable column", () => {
    expect(containsNotNullWithoutDefault("ALTER TABLE users ADD COLUMN name VARCHAR(255)")).toBe(false);
  });
});

// ============================================================================
// Type Change Detection Tests
// ============================================================================

describe("isRiskyTypeChange", () => {
  it("should detect bigint to integer as risky", () => {
    expect(isRiskyTypeChange("bigint", "integer")).toBe(true);
  });

  it("should detect varchar to char as risky", () => {
    expect(isRiskyTypeChange("varchar", "char")).toBe(true);
  });

  it("should not flag safe type changes", () => {
    expect(isRiskyTypeChange("varchar", "text")).toBe(false);
    expect(isRiskyTypeChange("integer", "bigint")).toBe(false);
  });

  it("should handle case insensitivity", () => {
    expect(isRiskyTypeChange("BIGINT", "INTEGER")).toBe(true);
  });
});

// ============================================================================
// Transaction Pattern Detection Tests
// ============================================================================

describe("detectTransactionPatterns", () => {
  it("should detect BEGIN/COMMIT pattern", () => {
    const result = detectTransactionPatterns("BEGIN; INSERT INTO users; COMMIT;");
    expect(result.hasBegin).toBe(true);
    expect(result.hasCommit).toBe(true);
    expect(result.pattern).toBe("begin-commit");
  });

  it("should detect ROLLBACK", () => {
    const result = detectTransactionPatterns("BEGIN; INSERT; ROLLBACK;");
    expect(result.hasRollback).toBe(true);
  });

  it("should detect transaction() call pattern", () => {
    const result = detectTransactionPatterns("await db.transaction(async (t) => { })");
    expect(result.pattern).toBe("transaction-call");
  });

  it("should return none for no transaction", () => {
    const result = detectTransactionPatterns("SELECT * FROM users");
    expect(result.pattern).toBe("none");
  });
});

// ============================================================================
// ORM Detection Tests
// ============================================================================

describe("detectOrmType", () => {
  it("should detect TypeORM @Entity decorator", () => {
    const code = `
      @Entity('users')
      export class User {
        @Column()
        name: string;
      }
    `;
    expect(detectOrmType(code)).toBe("typeorm");
  });

  it("should detect Prisma model syntax", () => {
    const code = `
      model User {
        id    Int    @id @default(autoincrement())
        name  String
      }
    `;
    expect(detectOrmType(code)).toBe("prisma");
  });

  it("should detect Knex patterns", () => {
    const code = "await knex('users').where('id', 1)";
    expect(detectOrmType(code)).toBe("knex");
  });

  it("should return none for plain JS", () => {
    const code = "const x = 42;";
    expect(detectOrmType(code)).toBe("none");
  });
});

describe("extractSqlFromOrmCode", () => {
  it("should extract SQL from knex.raw()", () => {
    const code = "await knex.raw('SELECT * FROM users')";
    const sqls = extractSqlFromOrmCode(code);
    expect(sqls).toContain("SELECT * FROM users");
  });

  it("should extract SQL from template literals", () => {
    const code = "const sql = `SELECT * FROM users WHERE id = ?`";
    const sqls = extractSqlFromOrmCode(code);
    expect(sqls.length).toBeGreaterThan(0);
    expect(sqls[0]).toContain("SELECT");
  });
});

// ============================================================================
// Migration Analysis Tests
// ============================================================================

describe("analyzeMigration", () => {
  it("should analyze TypeORM migration", () => {
    const content = `
      import { MigrationInterface, QueryRunner } from "typeorm";

      export class CreateUserTable1715700000000 implements MigrationInterface {
        public async up(queryRunner: QueryRunner): Promise<void> {
          await queryRunner.query("CREATE TABLE users (id INT, name VARCHAR(255))");
        }

        public async down(queryRunner: QueryRunner): Promise<void> {
          await queryRunner.query("DROP TABLE users");
        }
      }
    `;
    const migrations = analyzeMigration("test-migration.ts", content, mockHashService);

    expect(migrations.length).toBeGreaterThan(0);
    const upMigration = migrations.find((m) => m.direction === "up");
    expect(upMigration).toBeDefined();
    expect(upMigration?.hasRollbackPattern).toBe(true);
    expect(upMigration?.operations.length).toBeGreaterThan(0);
  });

  it("should detect transaction wrapper in migration", () => {
    const content = `
      export class Migration {
        async up() {
          await this.query("BEGIN");
          await this.query("CREATE TABLE users (id INT)");
          await this.query("COMMIT");
        }
      }
    `;
    const migrations = analyzeMigration("test.ts", content, mockHashService);
    expect(migrations[0]?.transactionSignalDetected).toBe(true);
    expect(migrations[0]?.transactionPattern).toBe("begin-commit");
  });
});

describe("createRawSqlRefs", () => {
  it("should create refs from extracted SQL", () => {
    const content = `
      const sql = "SELECT * FROM users";
      await knex.raw("INSERT INTO logs VALUES (?)");
    `;
    const refs = createRawSqlRefs("test.ts", content, mockHashService);

    expect(refs.length).toBeGreaterThanOrEqual(2);
    const selectRef = refs.find((r) => r.sql.includes("SELECT"));
    expect(selectRef).toBeDefined();
    expect(selectRef?.sql).toContain("SELECT");
    expect(selectRef?.context).toBe("query");

    const insertRef = refs.find((r) => r.sql.includes("INSERT"));
    expect(insertRef).toBeDefined();
    expect(insertRef?.sql).toContain("INSERT");
  });

  it("should mark dynamic SQL correctly", () => {
    const content = "const sql = `SELECT * FROM ${tableName}`";
    const refs = createRawSqlRefs("test.ts", content, mockHashService);

    const dynamicRef = refs.find((r) => r.sql.includes("${"));
    expect(dynamicRef?.isDynamic).toBe(true);
  });
});