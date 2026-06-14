/**
 * Database Assets Types for SPEC-29
 *
 * Represents detected database-related artifacts from code analysis.
 * Lightweight: no runtime connections, no external parser dependencies.
 */

// Schema version
export const DATABASE_ASSETS_SCHEMA_VERSION = "database-assets@v1alpha1";

// ============================================================================
// SQL Dialect Detection
// ============================================================================

export type SqlDialect = "postgresql" | "mysql" | "sqlite" | "unknown";

// ============================================================================
// Diagnostics
// ============================================================================

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface DiagnosticRef {
  id: string;
  severity: DiagnosticSeverity;
  code: string; // e.g., "PARSE_ERROR", "ENCODING_ERROR", "SIZE_LIMIT", "UNKNOWN_DIALECT"
  message: string;
  filePath: string;
  startLine?: number;
  details?: Record<string, unknown>;
}

// ============================================================================
// Database Object Types
// ============================================================================

export type DatabaseObjectType =
  | "table"
  | "column"
  | "index"
  | "constraint"
  | "sequence"
  | "view"
  | "function"
  | "trigger";

export type ConstraintType =
  | "primary_key"
  | "foreign_key"
  | "unique"
  | "check"
  | "not_null";

export type IndexType =
  | "btree"
  | "hash"
  | "gin"
  | "gist"
  | "unique";

export type ColumnDataType =
  | "integer"
  | "bigint"
  | "smallint"
  | "decimal"
  | "numeric"
  | "float"
  | "double"
  | "boolean"
  | "char"
  | "varchar"
  | "text"
  | "date"
  | "datetime"
  | "timestamp"
  | "time"
  | "json"
  | "jsonb"
  | "blob"
  | "clob"
  | "uuid"
  | "enum"
  | "array"
  | "unknown";

// ============================================================================
// Database Object Definitions
// ============================================================================

export interface DatabaseObjectRef {
  id: string;              // Unique identifier: table:column format
  name: string;            // Object name (table, column, etc.)
  type: DatabaseObjectType;
  schema?: string;         // Database schema name (e.g., "public")
  filePath: string;        // Source file where detected
  startLine: number;
  endLine?: number;
}

export interface TableRef extends DatabaseObjectRef {
  type: "table";
  columns: ColumnRef[];
  indexes?: IndexRef[];
  constraints?: ConstraintRef[];
}

export interface ColumnRef extends DatabaseObjectRef {
  type: "column";
  tableName: string;
  dataType: ColumnDataType;
  nullable: boolean;
  defaultValue?: string | null;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  references?: {
    table: string;
    column: string;
  };
}

export interface IndexRef extends DatabaseObjectRef {
  type: "index";
  tableName: string;
  columns: string[];
  indexType: IndexType;
  isUnique: boolean;
}

export interface ConstraintRef extends DatabaseObjectRef {
  type: "constraint";
  tableName: string;
  constraintType: ConstraintType;
  columns?: string[];
  referencedTable?: string;
  referencedColumns?: string[];
}

// ============================================================================
// Migration Detection
// ============================================================================

export type MigrationDirection = "up" | "down";

export interface MigrationRef {
  id: string;
  filePath: string;
  name: string;            // Migration class/function name
  direction: MigrationDirection;
  startLine: number;
  endLine?: number;

  // Transaction signals
  hasTransactionWrapper: boolean;
  transactionSignalDetected: boolean;
  transactionPattern?: "begin-commit" | "transaction-call" | "decorator" | "unknown";

  // Rollback signals
  hasRollbackPattern: boolean;
  rollbackPattern?: "rollback-call" | "down-method" | "revert-method" | "unknown";

  // Operations in migration
  operations: MigrationOperation[];
}

export type MigrationOperationType =
  | "create_table"
  | "drop_table"
  | "alter_table"
  | "add_column"
  | "drop_column"
  | "modify_column"
  | "add_constraint"
  | "drop_constraint"
  | "add_index"
  | "drop_index"
  | "raw_sql";

export interface MigrationOperation {
  type: MigrationOperationType;
  tableName?: string;
  columnName?: string;
  details?: Record<string, unknown>;
  startLine: number;
  rawSql?: string;        // Raw SQL statement if available
}

// ============================================================================
// ORM Detection
// ============================================================================

export type DetectedOrm = "typeorm" | "prisma" | "sequelize" | "knex" | "rails" | "flyway" | "django" | "unknown" | "none";

export interface OrmUsageRef {
  orm: DetectedOrm;
  filePath: string;
  patterns: string[];      // Detected patterns (e.g., "@Entity", "model.define")
  entities: EntityRef[];
  migrations: string[];    // Migration file paths
}

export interface EntityRef {
  name: string;
  tableName: string;
  filePath: string;
  startLine: number;
  columns: ColumnRef[];
}

// ============================================================================
// Database Assets Artifact
// ============================================================================

import type { ArtifactHeader, Completeness } from "./artifacts.js";

export interface DatabaseAssetsArtifact extends ArtifactHeader {
  artifact: "database-assets";
  schema: "database-assets@v1alpha1";
  completeness: Completeness;

  // SQL dialect detection
  dialects: SqlDialect[];

  // Analysis diagnostics
  diagnostics: DiagnosticRef[];

  // Detected objects
  tables: TableRef[];
  columns: ColumnRef[];
  indexes: IndexRef[];
  constraints: ConstraintRef[];

  // Migration analysis
  migrations: MigrationRef[];

  // ORM detection
  ormUsage: OrmUsageRef[];

  // Raw SQL statements detected
  rawSqlStatements: RawSqlRef[];

  // Statistics
  stats: DatabaseAssetsStats;
}

export interface RawSqlRef {
  id: string;
  filePath: string;
  startLine: number;
  endLine?: number;
  sql: string;
  isDynamic: boolean;     // Whether SQL is constructed dynamically
  context: "query" | "migration" | "unknown";
}

export interface DatabaseAssetsStats {
  tableCount: number;
  columnCount: number;
  indexCount: number;
  constraintCount: number;
  migrationCount: number;
  ormEntityCount: number;
  rawSqlCount: number;
  filesAnalyzed: number;
}

// ============================================================================
// Database Finding Rule IDs (SPEC-29)
// ============================================================================

export const DATABASE_FINDING_RULE_IDS = [
  "DB_DROP_TABLE",
  "DB_DROP_COLUMN",
  "DB_ADD_NOT_NULL_WITHOUT_DEFAULT",
  "DB_RISKY_TYPE_CHANGE",
  "DB_DROP_CONSTRAINT",
  "DB_DROP_INDEX",
  "DB_MIGRATION_NO_TRANSACTION_SIGNAL",
  "DB_ROLLBACK_NOT_EVIDENCED",
] as const;

export type DatabaseFindingRuleId = typeof DATABASE_FINDING_RULE_IDS[number];

// ============================================================================
// SQL Parser Diagnostic Codes (Phase A Enhancement)
// ============================================================================

export const SQL_PARSER_DIAGNOSTIC_CODES = [
  // Existing from database-analyzer
  "PARTIAL_PARSE",
  "ENCODING_ERROR",
  "SIZE_LIMIT",
  "UNKNOWN_DIALECT",
  // New diagnostic codes for enhanced parser accuracy
  "UNTERMINATED_STRING",
  "UNTERMINATED_COMMENT",
  "UNBALANCED_PARENTHESIS",
  "INCOMPLETE_DDL",
  "UNSUPPORTED_SQL_SYNTAX",
  // Schema inventory diagnostics
  "DUPLICATE_OBJECT_DECLARATION",
] as const;

export type SqlParserDiagnosticCode = typeof SQL_PARSER_DIAGNOSTIC_CODES[number];

/**
 * Type guard for SqlParserDiagnosticCode
 */
export function isSqlParserDiagnosticCode(value: string): value is SqlParserDiagnosticCode {
  return SQL_PARSER_DIAGNOSTIC_CODES.includes(value as SqlParserDiagnosticCode);
}

/**
 * Type guard for DatabaseFindingRuleId
 */
export function isDatabaseFindingRuleId(value: string): value is DatabaseFindingRuleId {
  return DATABASE_FINDING_RULE_IDS.includes(value as DatabaseFindingRuleId);
}

// ============================================================================
// Rule Severity/Category Mappings
// ============================================================================

import type { Severity, FindingCategory } from "./artifacts.js";

export const DB_RULE_SEVERITY_MAP: Record<DatabaseFindingRuleId, Severity> = {
  DB_DROP_TABLE: "critical",
  DB_DROP_COLUMN: "high",
  DB_ADD_NOT_NULL_WITHOUT_DEFAULT: "high",
  DB_RISKY_TYPE_CHANGE: "medium",
  DB_DROP_CONSTRAINT: "high",
  DB_DROP_INDEX: "medium",
  DB_MIGRATION_NO_TRANSACTION_SIGNAL: "medium",
  DB_ROLLBACK_NOT_EVIDENCED: "medium",
};

export const DB_RULE_CATEGORY_MAP: Record<DatabaseFindingRuleId, FindingCategory> = {
  DB_DROP_TABLE: "data",
  DB_DROP_COLUMN: "data",
  DB_ADD_NOT_NULL_WITHOUT_DEFAULT: "data",
  DB_RISKY_TYPE_CHANGE: "data",
  DB_DROP_CONSTRAINT: "data",
  DB_DROP_INDEX: "data",
  DB_MIGRATION_NO_TRANSACTION_SIGNAL: "data",
  DB_ROLLBACK_NOT_EVIDENCED: "data",
};

export const DB_RULE_DEFAULT_CONFIDENCE: Record<DatabaseFindingRuleId, number> = {
  DB_DROP_TABLE: 0.95,           // High confidence for explicit DROP TABLE
  DB_DROP_COLUMN: 0.85,          // Medium-high, may be intentional
  DB_ADD_NOT_NULL_WITHOUT_DEFAULT: 0.90, // High for pattern detection
  DB_RISKY_TYPE_CHANGE: 0.70,    // Medium, type changes may be safe
  DB_DROP_CONSTRAINT: 0.85,      // Medium-high
  DB_DROP_INDEX: 0.80,           // Medium-high
  DB_MIGRATION_NO_TRANSACTION_SIGNAL: 0.70, // Heuristic-based
  DB_ROLLBACK_NOT_EVIDENCED: 0.60, // Low confidence, pattern may exist elsewhere
};

// ============================================================================
// Database Finding Tags
// ============================================================================

export const DB_FINDING_TAGS = {
  DATABASE_RISK: "database-risk",
  MIGRATION_RISK: "migration-risk",
  DATA_LOSS_POTENTIAL: "data-loss-potential",
  TRANSACTION_SAFETY: "transaction-safety",
  ROLLBACK_SAFETY: "rollback-safety",
} as const;

export type DatabaseFindingTag = typeof DB_FINDING_TAGS[keyof typeof DB_FINDING_TAGS];

/**
 * Generate tags for database findings
 */
export function databaseFindingTags(ruleId: DatabaseFindingRuleId): string[] {
  const tags: string[] = ["database-risk", "review-required"];

  switch (ruleId) {
    case "DB_DROP_TABLE":
    case "DB_DROP_COLUMN":
      tags.push("data-loss-potential");
      break;
    case "DB_MIGRATION_NO_TRANSACTION_SIGNAL":
      tags.push("transaction-safety", "migration-risk");
      break;
    case "DB_ROLLBACK_NOT_EVIDENCED":
      tags.push("rollback-safety", "migration-risk");
      break;
    default:
      break;
  }

  return tags;
}
