/**
 * Database Destructive Operations Rule (SPEC-29)
 *
 * Detects potentially destructive database operations in migrations:
 * - DB_DROP_TABLE: DROP TABLE statements without safeguards
 * - DB_DROP_COLUMN: DROP COLUMN statements without safeguards
 * - DB_ADD_NOT_NULL_WITHOUT_DEFAULT: Adding NOT NULL column without default value
 *
 * These operations can cause data loss and require careful review.
 */

import type { RulePlugin, RuleContext, Finding } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";
import {
  analyzeMigration,
  containsDropTable,
  containsDropColumn,
  containsNotNullWithoutDefault,
  DatabaseFindingRuleId,
} from "../core/sql-lightweight-parser.js";
import type { HashService } from "../types/contracts.js";

// Default hash service for rule evaluation
const defaultHashService: HashService = {
  sha256: (input: string) => {
    // Simple hash for rule evaluation (not cryptographic quality required here)
    const hash = input.split("").reduce((acc, char) => {
      return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
    }, 0);
    return `sha256-${Math.abs(hash).toString(16).padStart(16, "0")}`;
  },
  fingerprint: (input: string) => `fp-${input.slice(0, 8).replace(/\s/g, "_")}`,
};

/**
 * Combined rule for all destructive database operations.
 */
export const DB_DESTRUCTIVE_OPS_RULE: RulePlugin = {
  id: "DB_DESTRUCTIVE_OPS",
  name: "Destructive Database Operations",
  description:
    "Detects potentially destructive database operations in migration files: DROP TABLE, DROP COLUMN, and adding NOT NULL columns without default values. These operations can cause data loss and require careful review.",
  category: "data",
  defaultSeverity: "high",
  defaultConfidence: 0.9,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of context.graph.files) {
      // Only analyze migration files
      if (!isMigrationFile(file.path, file.role)) continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      // Analyze migration for operations
      const migrations = analyzeMigration(file.path, content, defaultHashService);

      for (const migration of migrations) {
        for (const op of migration.operations) {
          // DB_DROP_TABLE detection
          if (op.type === "drop_table") {
            findings.push(
              createDropTableFinding(file.path, op, migration.hasRollbackPattern, context)
            );
          }

          // DB_DROP_COLUMN detection
          if (op.type === "drop_column") {
            findings.push(
              createDropColumnFinding(file.path, op, migration.hasRollbackPattern, context)
            );
          }

          // DB_ADD_NOT_NULL_WITHOUT_DEFAULT detection
          if (op.type === "add_column") {
            // Use rawSql from operation if available, otherwise extract from content
            const sqlContent = (op as { rawSql?: string }).rawSql ?? extractOperationSql(content, op);
            if (sqlContent && containsNotNullWithoutDefault(sqlContent)) {
              findings.push(
                createNotNullWithoutDefaultFinding(file.path, op, migration.hasRollbackPattern, context)
              );
            }
          }
        }

        // Also check for patterns not detected as specific operations
        const rawContent = content;
        if (!migrations.some((m) => m.operations.some((o) => o.type === "drop_table"))) {
          if (containsDropTable(rawContent)) {
            findings.push(createGenericDropTableFinding(file.path, rawContent, context));
          }
        }

        if (!migrations.some((m) => m.operations.some((o) => o.type === "drop_column"))) {
          if (containsDropColumn(rawContent)) {
            findings.push(createGenericDropColumnFinding(file.path, rawContent, context));
          }
        }
      }
    }

    return findings;
  },
};

/**
 * Check if file is a migration file
 */
function isMigrationFile(filePath: string, role: string | undefined): boolean {
  // Accept explicit migration role
  if (role === "migration") return true;

  // Also accept source role with migration path patterns
  if (role !== "source") return false;

  const migrationPatterns = [
    /migration/i,
    /migrations/i,
    /\.migration\./i,
    /db\/migrate/i,
    /schema\/migrations/i,
    /_\d+_.*\.ts$/, // TypeORM timestamp format
    /\d{14}_.*\.ts$/, // Rails-style timestamp
    /V\d+__.*\.sql$/, // Flyway format
    /V\d+__.*\.java$/, // Flyway Java migrations
  ];

  return migrationPatterns.some((p) => p.test(filePath));
}

/**
 * Extract SQL content for an operation from migration content
 */
function extractOperationSql(content: string, op: { details?: Record<string, unknown> }): string | null {
  // Try to extract SQL from query() calls or raw SQL strings
  const lines = content.split("\n");
  const startLine = op.details?.startLine as number | undefined;
  const endLine = op.details?.endLine as number | undefined;

  if (startLine && endLine) {
    return lines.slice(startLine - 1, endLine).join("\n");
  }

  // Fallback: search for SQL containing the table/column name
  const tableName = op.details?.tableName as string | undefined;
  const columnName = op.details?.columnName as string | undefined;

  if (tableName && columnName) {
    // Look for ALTER TABLE with ADD COLUMN
    const regex = new RegExp(
      `ALTER\\s+TABLE\\s+${tableName}\\s+ADD\\s+COLUMN\\s+${columnName}[^;]*`,
      "i"
    );
    const match = content.match(regex);
    return match ? match[0] : null;
  }

  return null;
}

/**
 * Create finding for DROP TABLE operation
 * SPEC-29: baseline critical, rollback evidence reduces to high
 */
function createDropTableFinding(
  filePath: string,
  op: { tableName?: string; details?: Record<string, unknown> },
  hasRollback: boolean,
  _context: RuleContext
): Finding {
  const tableName = op.tableName || (op.details?.tableName as string) || "unknown";
  const startLine = (op.details?.startLine as number) || 1;
  const endLine = (op.details?.endLine as number) || startLine;

  // SPEC-29 severity: critical (no rollback), high (rollback evidence)
  const severity = hasRollback ? "high" : "critical";
  const confidence = hasRollback ? 0.90 : 0.95;

  const summary = hasRollback
    ? `DROP TABLE on "${tableName}" has rollback pattern. Data loss risk remains critical; verify rollback correctness in staging.`
    : `DROP TABLE on "${tableName}" without rollback pattern. This operation will permanently delete all data. Requires explicit approval or rollback implementation.`;

  return {
    id: generateFindingId(DatabaseFindingRuleId.DB_DROP_TABLE, filePath, startLine),
    ruleId: DatabaseFindingRuleId.DB_DROP_TABLE,
    category: "data",
    severity,
    confidence,
    title: `DROP TABLE detected: ${tableName}`,
    summary,
    evidence: [
      createEvidence(
        filePath,
        startLine,
        endLine,
        "text",
        `DROP TABLE ${tableName}`
      ),
    ],
    tags: ["database", "migration", "destructive", "data-loss"],
    upstream: { tool: "native" },
  };
}

/**
 * Create finding for DROP COLUMN operation
 */
function createDropColumnFinding(
  filePath: string,
  op: { tableName?: string; columnName?: string; details?: Record<string, unknown> },
  hasRollback: boolean,
  _context: RuleContext
): Finding {
  const tableName = op.tableName || (op.details?.tableName as string) || "unknown";
  const columnName = op.columnName || (op.details?.columnName as string) || "unknown";
  const startLine = (op.details?.startLine as number) || 1;
  const endLine = (op.details?.endLine as number) || startLine;

  const severity = hasRollback ? "medium" : "high";
  const confidence = hasRollback ? 0.85 : 0.95;

  const summary = hasRollback
    ? `DROP COLUMN "${columnName}" from "${tableName}" has rollback pattern, but data loss risk remains. Verify rollback adds column with correct type.`
    : `DROP COLUMN "${columnName}" from "${tableName}" without rollback pattern. This operation will permanently delete all data in this column. Add ADD COLUMN in down() migration.`;

  return {
    id: generateFindingId(DatabaseFindingRuleId.DB_DROP_COLUMN, filePath, startLine),
    ruleId: DatabaseFindingRuleId.DB_DROP_COLUMN,
    category: "data",
    severity,
    confidence,
    title: `DROP COLUMN detected: ${tableName}.${columnName}`,
    summary,
    evidence: [
      createEvidence(
        filePath,
        startLine,
        endLine,
        "text",
        `ALTER TABLE ${tableName} DROP COLUMN ${columnName}`
      ),
    ],
    tags: ["database", "migration", "destructive", "data-loss"],
    upstream: { tool: "native" },
  };
}

/**
 * Create finding for NOT NULL without DEFAULT
 */
function createNotNullWithoutDefaultFinding(
  filePath: string,
  op: { tableName?: string; columnName?: string; details?: Record<string, unknown> },
  _hasRollback: boolean,
  _context: RuleContext
): Finding {
  const tableName = op.tableName || (op.details?.tableName as string) || "unknown";
  const columnName = op.columnName || (op.details?.columnName as string) || "unknown";
  const startLine = (op.details?.startLine as number) || 1;
  const endLine = (op.details?.endLine as number) || startLine;

  const severity = "high";
  const confidence = 0.9;

  const summary = `Adding NOT NULL column "${columnName}" to "${tableName}" without a DEFAULT value will fail for existing rows with NULL values. Either add a DEFAULT value, make the column nullable, or run a data migration first to populate existing rows.`;

  return {
    id: generateFindingId(DatabaseFindingRuleId.DB_ADD_NOT_NULL_WITHOUT_DEFAULT, filePath, startLine),
    ruleId: DatabaseFindingRuleId.DB_ADD_NOT_NULL_WITHOUT_DEFAULT,
    category: "data",
    severity,
    confidence,
    title: `NOT NULL without DEFAULT: ${tableName}.${columnName}`,
    summary,
    evidence: [
      createEvidence(
        filePath,
        startLine,
        endLine,
        "text",
        `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ... NOT NULL`
      ),
    ],
    tags: ["database", "migration", "schema-change", "blocking"],
    upstream: { tool: "native" },
  };
}

/**
 * Create generic DROP TABLE finding (when not detected as specific operation)
 * SPEC-29: baseline critical
 */
function createGenericDropTableFinding(
  filePath: string,
  content: string,
  _context: RuleContext
): Finding {
  // Find line number containing DROP TABLE
  const lines = content.split("\n");
  let lineNum = 1;
  for (const line of lines) {
    if (containsDropTable(line)) {
      break;
    }
    lineNum++;
  }

  const summary = `DROP TABLE statement detected. This operation will permanently delete all data. Requires explicit approval or rollback implementation.`;

  return {
    id: generateFindingId(DatabaseFindingRuleId.DB_DROP_TABLE, filePath, lineNum),
    ruleId: DatabaseFindingRuleId.DB_DROP_TABLE,
    category: "data",
    severity: "critical",
    confidence: 0.85,
    title: "DROP TABLE detected in migration",
    summary,
    evidence: [createEvidence(filePath, lineNum, lineNum + 2, "text", lines.slice(lineNum - 1, lineNum + 2).join("\n"))],
    tags: ["database", "migration", "destructive", "data-loss"],
    upstream: { tool: "native" },
  };
}

/**
 * Create generic DROP COLUMN finding (when not detected as specific operation)
 */
function createGenericDropColumnFinding(
  filePath: string,
  content: string,
  _context: RuleContext
): Finding {
  // Find line number containing DROP COLUMN
  const lines = content.split("\n");
  let lineNum = 1;
  for (const line of lines) {
    if (containsDropColumn(line)) {
      break;
    }
    lineNum++;
  }

  const summary = `DROP COLUMN statement detected in migration file. This operation will permanently delete column data. Review carefully and ensure rollback is implemented.`;

  return {
    id: generateFindingId(DatabaseFindingRuleId.DB_DROP_COLUMN, filePath, lineNum),
    ruleId: DatabaseFindingRuleId.DB_DROP_COLUMN,
    category: "data",
    severity: "high",
    confidence: 0.85,
    title: "DROP COLUMN detected in migration",
    summary,
    evidence: [createEvidence(filePath, lineNum, lineNum + 2, "text", lines.slice(lineNum - 1, lineNum + 2).join("\n"))],
    tags: ["database", "migration", "destructive", "data-loss"],
    upstream: { tool: "native" },
  };
}

// Export individual rule IDs for use in other modules
export { DatabaseFindingRuleId };
