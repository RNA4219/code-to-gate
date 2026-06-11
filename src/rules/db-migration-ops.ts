/**
 * Database Migration Operations Risk Rules (SPEC-29)
 *
 * Detects risky migration patterns:
 * - DB_DROP_INDEX: DROP INDEX operations without safeguards
 * - DB_MIGRATION_NO_TRANSACTION_SIGNAL: Migrations without transaction wrapping signals
 * - DB_ROLLBACK_NOT_EVIDENCED: Migrations without rollback/down method evidence
 *
 * These patterns indicate deployment risk and require careful review.
 */

import type { RulePlugin, RuleContext, Finding } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";
import {
  analyzeMigration,
  DatabaseFindingRuleId,
} from "../core/sql-lightweight-parser.js";
import type { HashService } from "../types/contracts.js";
import type { MigrationRef } from "../types/database-assets.js";

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

/**
 * Combined rule for migration operation risks.
 */
export const DB_MIGRATION_OPS_RULE: RulePlugin = {
  id: "DB_MIGRATION_OPS",
  name: "Risky Migration Operations",
  description:
    "Detects risky migration patterns: DROP INDEX operations that may impact query performance, migrations without transaction signals that risk partial execution, and migrations without rollback evidence that complicate rollbacks.",
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

      // Analyze migration for operations and patterns
      const migrations = analyzeMigration(file.path, content, defaultHashService);

      for (const migration of migrations) {
        // DB_DROP_INDEX detection
        for (const op of migration.operations) {
          if (op.type === "drop_index") {
            findings.push(
              createDropIndexFinding(file.path, op, migration.hasRollbackPattern, context)
            );
          }
        }

        // DB_MIGRATION_NO_TRANSACTION_SIGNAL detection
        // Only check for up direction migrations (the forward migration)
        if (migration.direction === "up") {
          if (!migration.transactionSignalDetected && !migration.hasTransactionWrapper) {
            findings.push(
              createNoTransactionSignalFinding(file.path, migration, context)
            );
          }
        }

        // DB_ROLLBACK_NOT_EVIDENCED detection
        // Check if this is an up migration without corresponding down/rollback
        if (migration.direction === "up") {
          // Check if there's a down migration in the same file
          const hasDownMigration = migrations.some(
            (m) => m.direction === "down" && m.filePath === migration.filePath
          );

          if (!migration.hasRollbackPattern && !hasDownMigration) {
            findings.push(
              createRollbackNotEvidencedFinding(file.path, migration, context)
            );
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
 * Create finding for DROP INDEX operation
 */
function createDropIndexFinding(
  filePath: string,
  op: { tableName?: string; details?: Record<string, unknown>; rawSql?: string },
  hasRollback: boolean,
  _context: RuleContext
): Finding {
  const tableName = op.tableName || "unknown";
  const indexName = (op.details?.indexName as string) || "unknown";
  const startLine = (op.details?.startLine as number) || 1;
  const endLine = (op.details?.endLine as number) || startLine;

  const severity = "medium"; // SPEC-29: baseline medium (performance risk, not data loss)
  const confidence = 0.9;

  const summary = hasRollback
    ? `DROP INDEX "${indexName}"${tableName !== "unknown" ? ` from table "${tableName}"` : ""} has rollback pattern. Query performance impact risk remains. Verify queries still perform well without this index and rollback recreates index correctly.`
    : `DROP INDEX "${indexName}"${tableName !== "unknown" ? ` from table "${tableName}"` : ""} without rollback pattern. This may cause query performance degradation. Add CREATE INDEX in down() migration and benchmark queries.`;

  return {
    id: generateFindingId(DatabaseFindingRuleId.DB_DROP_INDEX, filePath, startLine),
    ruleId: DatabaseFindingRuleId.DB_DROP_INDEX,
    category: "data",
    severity,
    confidence,
    title: `DROP INDEX detected: ${indexName}${tableName !== "unknown" ? ` on ${tableName}` : ""}`,
    summary,
    evidence: [
      createEvidence(
        filePath,
        startLine,
        endLine,
        "text",
        op.rawSql || `DROP INDEX ${indexName}`
      ),
    ],
    tags: ["database", "migration", "index", "performance"],
    upstream: { tool: "native" },
  };
}

/**
 * Create finding for migration without transaction signal
 */
function createNoTransactionSignalFinding(
  filePath: string,
  migration: MigrationRef,
  _context: RuleContext
): Finding {
  const startLine = migration.startLine || 1;
  const endLine = startLine;

  const summary = `Migration "${migration.name}" does not have transaction wrapping signals (BEGIN/COMMIT or transaction API calls). Without transaction safety, partial execution during deployment failure may leave database in inconsistent state. Consider adding transaction wrapper or using framework that provides automatic transaction management.`;

  return {
    id: generateFindingId(DatabaseFindingRuleId.DB_MIGRATION_NO_TRANSACTION_SIGNAL, filePath, startLine),
    ruleId: DatabaseFindingRuleId.DB_MIGRATION_NO_TRANSACTION_SIGNAL,
    category: "data",
    severity: "medium",
    confidence: 0.8,
    title: `Migration without transaction signal: ${migration.name}`,
    summary,
    evidence: [
      createEvidence(
        filePath,
        startLine,
        endLine + 5,
        "text",
        `Migration ${migration.name} lacks transaction signals`
      ),
    ],
    tags: ["database", "migration", "transaction", "deployment-risk"],
    upstream: { tool: "native" },
  };
}

/**
 * Create finding for migration without rollback evidence
 */
function createRollbackNotEvidencedFinding(
  filePath: string,
  migration: MigrationRef,
  _context: RuleContext
): Finding {
  const startLine = migration.startLine || 1;
  const endLine = startLine;

  const opTypes = migration.operations.map((o) => o.type).join(", ");

  const summary = `Migration "${migration.name}" has no rollback/down method evidence. If deployment fails or needs to be reverted, there is no documented rollback procedure. Operations include: ${opTypes || "unknown"}. Add a corresponding down() method or rollback SQL script documenting inverse operations.`;

  return {
    id: generateFindingId(DatabaseFindingRuleId.DB_ROLLBACK_NOT_EVIDENCED, filePath, startLine),
    ruleId: DatabaseFindingRuleId.DB_ROLLBACK_NOT_EVIDENCED,
    category: "data",
    severity: "medium",
    confidence: 0.85,
    title: `Migration without rollback evidence: ${migration.name}`,
    summary,
    evidence: [
      createEvidence(
        filePath,
        startLine,
        endLine + 10,
        "text",
        `Migration ${migration.name} lacks rollback method`
      ),
    ],
    tags: ["database", "migration", "rollback", "deployment-risk"],
    upstream: { tool: "native" },
  };
}

// Export individual rule IDs for use in other modules
export { DatabaseFindingRuleId };
