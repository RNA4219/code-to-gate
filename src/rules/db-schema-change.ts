/**
 * Database Schema Change Risk Rules (SPEC-29)
 *
 * Detects risky schema changes in migrations:
 * - DB_RISKY_TYPE_CHANGE: Column type changes that may cause data loss
 * - DB_DROP_CONSTRAINT: Dropping constraints (FK, UNIQUE, CHECK) without safeguards
 *
 * These operations can cause data integrity issues and require careful review.
 */

import type { RulePlugin, RuleContext, Finding } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";
import {
  analyzeMigration,
  isRiskyTypeChange,
  detectTypeChanges,
  DatabaseFindingRuleId,
} from "../core/sql-lightweight-parser.js";
import type { HashService } from "../types/contracts.js";
import type { ColumnDataType } from "../types/database-assets.js";

// Default hash service for rule evaluation
const defaultHashService: HashService = {
  sha256: (input: string) => {
    const hash = input.split("").reduce((acc, char) => {
      return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
    }, 0);
    return `sha256-${Math.abs(hash).toString(16).padStart(16, "0")}`;
  },
  fingerprint: (input: string) => `fp-${input.slice(0, 8).replace(/\s/g, "_")}`,
};

// Risky type changes with data loss explanations
const RISKY_TYPE_EXPLANATIONS: Record<string, string> = {
  "bigint->integer": "Integer overflow risk - bigint values may exceed integer range",
  "decimal->integer": "Precision loss - decimal fractions will be truncated",
  "numeric->integer": "Precision loss - numeric fractions will be truncated",
  "float->integer": "Precision loss - float fractions will be truncated",
  "double->float": "Precision loss - double precision will be reduced",
  "varchar->char": "Truncation risk - varchar values longer than char size will be truncated",
  "text->varchar": "Truncation risk - text values may exceed varchar limit",
  "timestamp->date": "Time component loss - timestamp time-of-day will be discarded",
  "datetime->date": "Time component loss - datetime time-of-day will be discarded",
  "jsonb->json": "Binary JSON loss - jsonb indexing/operator benefits lost",
  "uuid->varchar": "UUID semantics loss - UUID validation/operator benefits lost",
};

/**
 * Combined rule for all risky schema change operations.
 */
export const DB_SCHEMA_CHANGE_RULE: RulePlugin = {
  id: "DB_SCHEMA_CHANGE",
  name: "Risky Database Schema Changes",
  description:
    "Detects risky schema changes in migration files: column type changes that may cause data loss/truncation, and dropping constraints (foreign keys, unique, check) without safeguards.",
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
          // DB_RISKY_TYPE_CHANGE detection
          if (op.type === "modify_column" && op.rawSql) {
            const typeChanges = detectTypeChanges(op.rawSql);
            for (const change of typeChanges) {
              // Check if new type is smaller than old type OR if original type is unknown
              // When fromType is "unknown", we can't verify the change is safe, so flag it
              const isRisky = change.fromType === "unknown" ||
                isRiskyTypeChange(change.fromType as ColumnDataType, change.toType as ColumnDataType);
              if (isRisky) {
                findings.push(
                  createRiskyTypeChangeFinding(
                    file.path,
                    op,
                    change,
                    migration.hasRollbackPattern,
                    context
                  )
                );
              }
            }
          }

          // DB_DROP_CONSTRAINT detection
          if (op.type === "drop_constraint") {
            findings.push(
              createDropConstraintFinding(file.path, op, migration.hasRollbackPattern, context)
            );
          }
        }

        // Also check for type changes in raw SQL patterns
        for (const op of migration.operations) {
          if (op.rawSql && op.type !== "modify_column") {
            const typeChanges = detectTypeChanges(op.rawSql);
            for (const change of typeChanges) {
              // When fromType is "unknown", we can't verify the change is safe, so flag it
              const isRisky = change.fromType === "unknown" ||
                isRiskyTypeChange(change.fromType as ColumnDataType, change.toType as ColumnDataType);
              if (isRisky) {
                findings.push(
                  createRiskyTypeChangeFinding(
                    file.path,
                    { ...op, type: "modify_column", columnName: change.columnName },
                    change,
                    migration.hasRollbackPattern,
                    context
                  )
                );
              }
            }
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

  // Common migration file patterns
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
 * Create finding for risky type change
 */
function createRiskyTypeChangeFinding(
  filePath: string,
  op: { type?: string; tableName?: string; columnName?: string; details?: Record<string, unknown>; rawSql?: string },
  change: { columnName: string; fromType: string; toType: string },
  hasRollback: boolean,
  _context: RuleContext
): Finding {
  const tableName = op.tableName || "unknown";
  const columnName = change.columnName || op.columnName || "unknown";
  const startLine = (op.details?.startLine as number) || 1;
  const endLine = (op.details?.endLine as number) || startLine;

  const severity = hasRollback ? "medium" : "high";
  const confidence = hasRollback ? 0.85 : 0.95;

  const riskKey = `${change.fromType}->${change.toType}`;
  const explanation = RISKY_TYPE_EXPLANATIONS[riskKey] || `Type change from ${change.fromType} to ${change.toType} may cause data loss`;

  const summary = hasRollback
    ? `Column type change "${columnName}" (${change.fromType} -> ${change.toType}) in "${tableName}" has rollback pattern, but ${explanation}. Verify rollback restores original data correctly.`
    : `Column type change "${columnName}" (${change.fromType} -> ${change.toType}) in "${tableName}" without rollback pattern. ${explanation}. Run a data migration first or add rollback.`;

  return {
    id: generateFindingId(DatabaseFindingRuleId.DB_RISKY_TYPE_CHANGE, filePath, startLine),
    ruleId: DatabaseFindingRuleId.DB_RISKY_TYPE_CHANGE,
    category: "data",
    severity,
    confidence,
    title: `Risky type change: ${tableName}.${columnName} (${change.fromType} -> ${change.toType})`,
    summary,
    evidence: [
      createEvidence(
        filePath,
        startLine,
        endLine,
        "text",
        op.rawSql || `ALTER TABLE ${tableName} ALTER COLUMN ${columnName} TYPE ${change.toType}`
      ),
    ],
    tags: ["database", "migration", "schema-change", "type-change", "data-loss"],
    upstream: { tool: "native" },
  };
}

/**
 * Create finding for DROP CONSTRAINT operation
 */
function createDropConstraintFinding(
  filePath: string,
  op: { tableName?: string; details?: Record<string, unknown>; rawSql?: string },
  hasRollback: boolean,
  _context: RuleContext
): Finding {
  const tableName = op.tableName || (op.details?.tableName as string) || "unknown";
  const constraintName = (op.details?.constraintName as string) || "unknown";
  const startLine = (op.details?.startLine as number) || 1;
  const endLine = (op.details?.endLine as number) || startLine;

  const severity = hasRollback ? "medium" : "high";
  const confidence = hasRollback ? 0.85 : 0.95;

  // Determine constraint type for more specific message
  const constraintType = inferConstraintType(op.rawSql || "", constraintName);

  const summary = hasRollback
    ? `DROP CONSTRAINT "${constraintName}"${constraintType ? ` (${constraintType})` : ""} from "${tableName}" has rollback pattern, but data integrity risk remains. Verify rollback recreates constraint correctly.`
    : `DROP CONSTRAINT "${constraintName}"${constraintType ? ` (${constraintType})` : ""} from "${tableName}" without rollback pattern. This removes data integrity protection. Add ADD CONSTRAINT in down() migration.`;

  return {
    id: generateFindingId(DatabaseFindingRuleId.DB_DROP_CONSTRAINT, filePath, startLine),
    ruleId: DatabaseFindingRuleId.DB_DROP_CONSTRAINT,
    category: "data",
    severity,
    confidence,
    title: `DROP CONSTRAINT detected: ${tableName}.${constraintName}`,
    summary,
    evidence: [
      createEvidence(
        filePath,
        startLine,
        endLine,
        "text",
        op.rawSql || `ALTER TABLE ${tableName} DROP CONSTRAINT ${constraintName}`
      ),
    ],
    tags: ["database", "migration", "schema-change", "constraint", "data-integrity"],
    upstream: { tool: "native" },
  };
}

/**
 * Infer constraint type from SQL content or name pattern
 */
function inferConstraintType(sql: string, name: string): string | null {
  const upperSql = sql.toUpperCase();
  const upperName = name.toUpperCase();

  // Check SQL content for constraint type keywords
  if (upperSql.includes("FOREIGN KEY") || upperName.includes("FK") || upperName.includes("_FK")) {
    return "foreign key";
  }
  if (upperSql.includes("UNIQUE") || upperName.includes("UQ") || upperName.includes("_UQ") || upperName.includes("UNIQUE")) {
    return "unique";
  }
  if (upperSql.includes("CHECK") || upperName.includes("CHK") || upperName.includes("_CHK") || upperName.includes("CHECK")) {
    return "check";
  }
  if (upperSql.includes("PRIMARY KEY") || upperName.includes("PK") || upperName.includes("_PK")) {
    return "primary key";
  }

  return null;
}

// Export individual rule IDs for use in other modules
export { DatabaseFindingRuleId };
