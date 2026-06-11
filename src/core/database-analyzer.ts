/**
 * Database Analyzer - SPEC-29
 *
 * Analyzes database/migration files and generates database assets artifact.
 * Wired into scan command via --database-analysis flag.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  type DatabaseAssetsArtifact,
  type MigrationRef,
  type RawSqlRef,
  type OrmUsageRef,
  type DatabaseAssetsStats,
  type SqlDialect,
  type DiagnosticRef,
  DATABASE_ASSETS_SCHEMA_VERSION,
} from "../types/database-assets.js";
import type { NormalizedRepoGraph, RepoFile } from "../types/artifacts.js";
import type { HashService } from "../types/contracts.js";
import { DefaultHashService } from "./hash-service.js";
import {
  discoverDatabaseFiles,
  detectOrmFromPath,
  readFileAtGitRef,
  listDatabaseFilesAtGitRef,
} from "./file-utils.js";
import {
  analyzeMigration,
  createRawSqlRefs,
  detectOrmType,
} from "./sql-lightweight-parser.js";
import { toPosix } from "./path-utils.js";

/**
 * Options for database analysis
 */
export interface DatabaseAnalysisOptions {
  /** Repository root directory */
  repoRoot: string;
  /** Existing repo graph (optional) */
  graph?: NormalizedRepoGraph;
  /** Hash service for generating IDs */
  hashService?: HashService;
  /** Verbose logging */
  verbose?: boolean;
}

function redactDatabaseSecrets(content: string): string {
  return content
    .replace(/((?:password|passwd|pwd|secret|api[_-]?key|token)\s*=\s*)(['"])[^'"]*\2/gi, "$1$2[REDACTED]$2")
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+@/gi, "$1[REDACTED]@")
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]");
}

function collectContentDiagnostics(content: string, relPath: string, dialect: SqlDialect): DiagnosticRef[] {
  const diagnostics: DiagnosticRef[] = [];

  if (dialect === "unknown") {
    diagnostics.push({
      id: `diag:${relPath}:unknown-dialect`,
      severity: "warning",
      code: "UNKNOWN_DIALECT",
      message: "SQL dialect could not be determined; common syntax only was analyzed",
      filePath: relPath,
    });
  }

  const openParens = (content.match(/\(/g) ?? []).length;
  const closeParens = (content.match(/\)/g) ?? []).length;
  if (openParens !== closeParens) {
    diagnostics.push({
      id: `diag:${relPath}:unbalanced-parentheses`,
      severity: "error",
      code: "PARTIAL_PARSE",
      message: "Unbalanced parentheses detected; parsed operations may be incomplete",
      filePath: relPath,
    });
  }

  return diagnostics;
}

/**
 * Analyze database files and generate database assets artifact
 */
export function analyzeDatabaseAssets(options: DatabaseAnalysisOptions): DatabaseAssetsArtifact {
  const hashService = options.hashService ?? new DefaultHashService();
  const startTime = Date.now();

  // Discover database/migration files
  const dbFiles = discoverDatabaseFiles(options.repoRoot);

  if (options.verbose) {
    console.log(JSON.stringify({
      phase: "database-discovery",
      databaseFiles: dbFiles.length,
      timeMs: Date.now() - startTime,
    }));
  }

  // Analyze migrations
  const migrations: MigrationRef[] = [];
  const rawSqlStatements: RawSqlRef[] = [];
  const ormUsageRefs: OrmUsageRef[] = [];
  const diagnostics: DiagnosticRef[] = [];
  const detectedDialects: Set<SqlDialect> = new Set();

  // Track ORM usage per file
  const ormUsageByFile: Map<string, OrmUsageRef> = new Map();

  for (const file of dbFiles) {
    const relPath = toPosix(path.relative(options.repoRoot, file));

    // Try to read file content
    let content: string;
    try {
      content = redactDatabaseSecrets(readFileSync(file, "utf8"));
    } catch (e) {
      diagnostics.push({
        id: `diag:${relPath}:read-error`,
        severity: "error",
        code: "READ_ERROR",
        message: `Failed to read file: ${e instanceof Error ? e.message : "unknown error"}`,
        filePath: relPath,
      });
      continue;
    }

    // Detect dialect from file content
    const dialect = detectSqlDialect(content, relPath);
    detectedDialects.add(dialect);
    diagnostics.push(...collectContentDiagnostics(content, relPath, dialect));

    // Analyze as migration
    const migrationRefs = analyzeMigration(relPath, content, hashService);
    migrations.push(...migrationRefs);

    // Detect ORM type from file path and content
    const pathOrm = detectOrmFromPath(relPath);
    const contentOrm = detectOrmType(content);
    const effectiveOrm = pathOrm !== "unknown" ? pathOrm : contentOrm;

    // Track ORM usage
    if (effectiveOrm !== "none" && effectiveOrm !== "unknown") {
      const existing = ormUsageByFile.get(relPath);
      if (existing) {
        existing.migrations.push(relPath);
      } else {
        ormUsageByFile.set(relPath, {
          orm: effectiveOrm,
          filePath: relPath,
          patterns: [],
          entities: [],
          migrations: [relPath],
        });
      }
    }

    // Create raw SQL refs for SQL files
    if (file.endsWith(".sql")) {
      const sqlRefs = createRawSqlRefs(relPath, content, hashService);
      rawSqlStatements.push(...sqlRefs);
    }
  }

  // Convert ORM usage map to array
  ormUsageRefs.push(...ormUsageByFile.values());
  migrations.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.startLine - b.startLine || a.direction.localeCompare(b.direction));
  rawSqlStatements.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.startLine - b.startLine);
  ormUsageRefs.sort((a, b) => a.filePath.localeCompare(b.filePath));
  diagnostics.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.code.localeCompare(b.code));

  // Convert dialects set to array
  const dialects: SqlDialect[] = detectedDialects.size > 0
    ? Array.from(detectedDialects).sort()
    : ["unknown"];

  const endTime = Date.now();

  if (options.verbose) {
    console.log(JSON.stringify({
      phase: "database-analysis",
      migrationsFound: migrations.length,
      rawSqlStatements: rawSqlStatements.length,
      ormUsageCount: ormUsageRefs.length,
      timeMs: endTime - startTime,
    }));
  }

  // Build stats
  const stats: DatabaseAssetsStats = {
    tableCount: 0, // Not detected yet - requires deeper analysis
    columnCount: 0,
    indexCount: migrations.reduce((acc, m) =>
      acc + m.operations.filter(op => op.type === "add_index" || op.type === "drop_index").length, 0),
    constraintCount: migrations.reduce((acc, m) =>
      acc + m.operations.filter(op => op.type === "add_constraint" || op.type === "drop_constraint").length, 0),
    migrationCount: migrations.length,
    ormEntityCount: ormUsageRefs.reduce((acc, ref) => acc + ref.entities.length, 0),
    rawSqlCount: rawSqlStatements.length,
    filesAnalyzed: dbFiles.length,
  };

  // Build artifact
  const artifact: DatabaseAssetsArtifact = {
    artifact: "database-assets",
    schema: DATABASE_ASSETS_SCHEMA_VERSION,
    version: "ctg/v1",
    generated_at: new Date().toISOString(),
    run_id: options.graph?.run_id ?? `db-analysis-${Date.now()}`,
    repo: options.graph?.repo ?? {
      root: options.repoRoot,
    },
    tool: options.graph?.tool ?? {
      name: "code-to-gate",
      version: "1.0.0",
      plugin_versions: [],
    },
    completeness: dbFiles.length === 0 ? "complete" : diagnostics.some(d => d.severity === "error") ? "partial" : "complete",
    dialects,
    diagnostics,
    tables: [], // Requires deeper schema analysis
    columns: [],
    indexes: [],
    constraints: [],
    migrations,
    ormUsage: ormUsageRefs,
    rawSqlStatements,
    stats,
  };

  return artifact;
}

/**
 * Update repo graph with database file metadata
 * Adds database files with migration role to the graph
 */
export function createDatabaseRuleGraph(
  graph: NormalizedRepoGraph,
  repoRoot: string
): NormalizedRepoGraph {
  const databaseGraph = structuredClone(graph);
  const dbFiles = discoverDatabaseFiles(repoRoot);

  for (const file of dbFiles) {
    const relPath = toPosix(path.relative(repoRoot, file));
    const existingFile = databaseGraph.files.find(f => f.path === relPath);

    if (!existingFile) {
      const content = readFileSync(file, "utf8");
      const language: RepoFile["language"] =
        file.endsWith(".ts") ? "ts" :
        file.endsWith(".js") ? "js" :
        file.endsWith(".py") ? "py" :
        file.endsWith(".rb") ? "rb" : "unknown";

      const repoFile: RepoFile = {
        id: `file:${relPath}`,
        path: relPath,
        language,
        role: "source",
        hash: new DefaultHashService().sha256(content),
        sizeBytes: Buffer.byteLength(content),
        lineCount: content.split(/\r?\n/).length,
        parser: {
          status: "skipped",
          adapter: "ctg-db-v0",
        },
      };

      databaseGraph.files.push(repoFile);
    }
  }

  return databaseGraph;
}

/**
 * Detect SQL dialect from file content and path
 * Uses heuristics to identify PostgreSQL, MySQL, SQLite patterns
 */
function detectSqlDialect(content: string, filePath: string): SqlDialect {
  const upperContent = content.toUpperCase();
  const upperPath = filePath.toUpperCase();

  // Path-based hints
  if (upperPath.includes("POSTGRES") || upperPath.includes("PG") || upperPath.includes("PSQL")) {
    return "postgresql";
  }
  if (upperPath.includes("MYSQL") || upperPath.includes("MARIADB")) {
    return "mysql";
  }
  if (upperPath.includes("SQLITE") || upperPath.includes("SQLITE3")) {
    return "sqlite";
  }

  // Content-based hints (PostgreSQL)
  if (
    upperContent.includes("SERIAL") ||
    upperContent.includes("BIGSERIAL") ||
    upperContent.includes("RETURNING") ||
    upperContent.includes("JSONB") ||
    upperContent.includes("::") ||
    upperContent.includes("ILIKE") ||
    upperContent.includes("NOW()") ||
    upperContent.includes("CURRENT_TIMESTAMP") ||
    upperContent.includes("UUID")
  ) {
    return "postgresql";
  }

  // Content-based hints (MySQL)
  if (
    upperContent.includes("AUTO_INCREMENT") ||
    upperContent.includes("ENGINE=") ||
    upperContent.includes("INT(11)") ||
    upperContent.includes("VARCHAR(255)") ||
    upperContent.includes("DATETIME") ||
    upperContent.includes("UNSIGNED") ||
    upperContent.includes("TINYINT")
  ) {
    return "mysql";
  }

  // Content-based hints (SQLite)
  if (
    upperContent.includes("AUTOINCREMENT") ||
    upperContent.includes("INTEGER PRIMARY KEY") &&
    !upperContent.includes("AUTO_INCREMENT")
  ) {
    return "sqlite";
  }

  // Default to unknown if no clear indicators
  return "unknown";
}

/**
 * Options for database analysis at a git ref (SPEC-29 diff)
 */
export interface DatabaseAnalysisAtRefOptions {
  /** Repository root directory */
  repoRoot: string;
  /** Git reference (commit hash, branch, tag, etc.) */
  gitRef: string;
  /** Hash service for generating IDs */
  hashService?: HashService;
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Analyze database files at a specific git ref (SPEC-29 diff)
 * Uses git show to read file content at the ref
 */
export function analyzeDatabaseAssetsAtRef(options: DatabaseAnalysisAtRefOptions): DatabaseAssetsArtifact {
  const hashService = options.hashService ?? new DefaultHashService();
  const startTime = Date.now();

  // Discover database/migration files at the git ref
  const dbFilePaths = listDatabaseFilesAtGitRef(options.repoRoot, options.gitRef);

  if (options.verbose) {
    console.log(JSON.stringify({
      phase: "database-discovery-at-ref",
      gitRef: options.gitRef,
      databaseFiles: dbFilePaths.length,
      timeMs: Date.now() - startTime,
    }));
  }

  // Analyze migrations
  const migrations: MigrationRef[] = [];
  const rawSqlStatements: RawSqlRef[] = [];
  const ormUsageRefs: OrmUsageRef[] = [];
  const diagnostics: DiagnosticRef[] = [];
  const detectedDialects: Set<SqlDialect> = new Set();

  // Track ORM usage per file
  const ormUsageByFile: Map<string, OrmUsageRef> = new Map();

  for (const relPath of dbFilePaths) {
    // Read file content at git ref
    const rawContent = readFileAtGitRef(options.repoRoot, options.gitRef, relPath);
    if (rawContent === null) {
      diagnostics.push({
        id: `diag:${relPath}:read-error-at-ref`,
        severity: "error",
        code: "READ_ERROR_AT_REF",
        message: `Failed to read file at ref ${options.gitRef}`,
        filePath: relPath,
      });
      continue;
    }
    const content = redactDatabaseSecrets(rawContent);

    // Detect dialect from file content
    const dialect = detectSqlDialect(content, relPath);
    detectedDialects.add(dialect);
    diagnostics.push(...collectContentDiagnostics(content, relPath, dialect));

    // Analyze as migration
    const migrationRefs = analyzeMigration(relPath, content, hashService);
    migrations.push(...migrationRefs);

    // Detect ORM type from file path and content
    const pathOrm = detectOrmFromPath(relPath);
    const contentOrm = detectOrmType(content);
    const effectiveOrm = pathOrm !== "unknown" ? pathOrm : contentOrm;

    // Track ORM usage
    if (effectiveOrm !== "none" && effectiveOrm !== "unknown") {
      const existing = ormUsageByFile.get(relPath);
      if (existing) {
        existing.migrations.push(relPath);
      } else {
        ormUsageByFile.set(relPath, {
          orm: effectiveOrm,
          filePath: relPath,
          patterns: [],
          entities: [],
          migrations: [relPath],
        });
      }
    }

    // Create raw SQL refs for SQL files
    if (relPath.endsWith(".sql")) {
      const sqlRefs = createRawSqlRefs(relPath, content, hashService);
      rawSqlStatements.push(...sqlRefs);
    }
  }

  // Convert ORM usage map to array
  ormUsageRefs.push(...ormUsageByFile.values());
  migrations.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.startLine - b.startLine || a.direction.localeCompare(b.direction));
  rawSqlStatements.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.startLine - b.startLine);
  ormUsageRefs.sort((a, b) => a.filePath.localeCompare(b.filePath));
  diagnostics.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.code.localeCompare(b.code));

  // Convert dialects set to array
  const dialects: SqlDialect[] = detectedDialects.size > 0
    ? Array.from(detectedDialects).sort()
    : ["unknown"];

  const endTime = Date.now();

  if (options.verbose) {
    console.log(JSON.stringify({
      phase: "database-analysis-at-ref",
      gitRef: options.gitRef,
      migrationsFound: migrations.length,
      rawSqlStatements: rawSqlStatements.length,
      ormUsageCount: ormUsageRefs.length,
      timeMs: endTime - startTime,
    }));
  }

  // Build stats
  const stats: DatabaseAssetsStats = {
    tableCount: 0,
    columnCount: 0,
    indexCount: migrations.reduce((acc, m) =>
      acc + m.operations.filter(op => op.type === "add_index" || op.type === "drop_index").length, 0),
    constraintCount: migrations.reduce((acc, m) =>
      acc + m.operations.filter(op => op.type === "add_constraint" || op.type === "drop_constraint").length, 0),
    migrationCount: migrations.length,
    ormEntityCount: ormUsageRefs.reduce((acc, ref) => acc + ref.entities.length, 0),
    rawSqlCount: rawSqlStatements.length,
    filesAnalyzed: dbFilePaths.length,
  };

  // Build artifact
  const artifact: DatabaseAssetsArtifact = {
    artifact: "database-assets",
    schema: DATABASE_ASSETS_SCHEMA_VERSION,
    version: "ctg/v1",
    generated_at: new Date().toISOString(),
    run_id: `db-analysis-${options.gitRef}-${Date.now()}`,
    repo: {
      root: options.repoRoot,
    },
    tool: {
      name: "code-to-gate",
      version: "1.0.0",
      plugin_versions: [],
    },
    completeness: dbFilePaths.length === 0 ? "complete" : diagnostics.some(d => d.severity === "error") ? "partial" : "complete",
    dialects,
    diagnostics,
    tables: [],
    columns: [],
    indexes: [],
    constraints: [],
    migrations,
    ormUsage: ormUsageRefs,
    rawSqlStatements,
    stats,
  };

  return artifact;
}

/**
 * Compare database assets between base and head refs (SPEC-29 diff)
 * Returns a structured diff with added/removed/modified migrations
 */
export interface DatabaseAssetsDiff {
  /** New migrations added in head */
  addedMigrations: MigrationRef[];
  /** Migrations removed from head */
  removedMigrations: MigrationRef[];
  /** Migrations modified (same path but different content) */
  modifiedMigrations: Array<{ path: string; base: MigrationRef; head: MigrationRef }>;
  /** Operations that are new in head */
  newOperations: Array<{ migrationPath: string; operation: MigrationRef["operations"][0] }>;
  /** Operations that were removed from head */
  removedOperations: Array<{ migrationPath: string; operation: MigrationRef["operations"][0] }>;
  /** Rollback patterns that were removed in head (increased risk) */
  removedRollbackPatterns: Array<{ migrationPath: string; migrationName: string }>;
  /** Transaction signals that were removed in head (increased risk) */
  removedTransactionSignals: Array<{ migrationPath: string; migrationName: string }>;
}

/**
 * Diff database assets between base and head refs (SPEC-29)
 */
export function diffDatabaseAssets(base: DatabaseAssetsArtifact, head: DatabaseAssetsArtifact): DatabaseAssetsDiff {
  const baseMigrationByPath = new Map<string, MigrationRef>();
  for (const m of base.migrations) {
    baseMigrationByPath.set(m.filePath, m);
  }

  const headMigrationByPath = new Map<string, MigrationRef>();
  for (const m of head.migrations) {
    headMigrationByPath.set(m.filePath, m);
  }

  const addedMigrations: MigrationRef[] = [];
  const removedMigrations: MigrationRef[] = [];
  const modifiedMigrations: Array<{ path: string; base: MigrationRef; head: MigrationRef }> = [];
  const newOperations: Array<{ migrationPath: string; operation: MigrationRef["operations"][0] }> = [];
  const removedOperations: Array<{ migrationPath: string; operation: MigrationRef["operations"][0] }> = [];
  const removedRollbackPatterns: Array<{ migrationPath: string; migrationName: string }> = [];
  const removedTransactionSignals: Array<{ migrationPath: string; migrationName: string }> = [];

  // Find added migrations (in head but not in base)
  for (const [path, headMigration] of headMigrationByPath) {
    if (!baseMigrationByPath.has(path)) {
      addedMigrations.push(headMigration);
      // All operations in new migrations are "new operations"
      for (const op of headMigration.operations) {
        newOperations.push({ migrationPath: path, operation: op });
      }
    } else {
      // Check for modifications
      const baseMigration = baseMigrationByPath.get(path)!;

      // Check operations diff
      const baseOps = new Set(baseMigration.operations.map(operationSignature));
      const headOps = new Set(headMigration.operations.map(operationSignature));
      const modifiedBefore = newOperations.length + removedOperations.length;

      for (const op of headMigration.operations) {
        const key = operationSignature(op);
        if (!baseOps.has(key)) {
          newOperations.push({ migrationPath: path, operation: op });
        }
      }

      for (const op of baseMigration.operations) {
        const key = operationSignature(op);
        if (!headOps.has(key)) {
          removedOperations.push({ migrationPath: path, operation: op });
        }
      }

      // Check rollback pattern removed (increased risk)
      if (baseMigration.hasRollbackPattern && !headMigration.hasRollbackPattern) {
        removedRollbackPatterns.push({
          migrationPath: path,
          migrationName: headMigration.name,
        });
      }

      // Check transaction signal removed (increased risk)
      if (baseMigration.transactionSignalDetected && !headMigration.transactionSignalDetected) {
        removedTransactionSignals.push({
          migrationPath: path,
          migrationName: headMigration.name,
        });
      }

      // Track as modified if there are any differences
      if (newOperations.length + removedOperations.length > modifiedBefore ||
          baseMigration.hasRollbackPattern !== headMigration.hasRollbackPattern ||
          baseMigration.transactionSignalDetected !== headMigration.transactionSignalDetected) {
        modifiedMigrations.push({ path, base: baseMigration, head: headMigration });
      }
    }
  }

  // Find removed migrations (in base but not in head)
  for (const [path, baseMigration] of baseMigrationByPath) {
    if (!headMigrationByPath.has(path)) {
      removedMigrations.push(baseMigration);
      // All operations in removed migrations are "removed operations"
      for (const op of baseMigration.operations) {
        removedOperations.push({ migrationPath: path, operation: op });
      }
    }
  }

  return {
    addedMigrations,
    removedMigrations,
    modifiedMigrations,
    newOperations,
    removedOperations,
    removedRollbackPatterns,
    removedTransactionSignals,
  };
}

function operationSignature(operation: MigrationRef["operations"][0]): string {
  const details = operation.details ?? {};
  return [
    operation.type,
    operation.tableName ?? "",
    operation.columnName ?? "",
    String(details.indexName ?? ""),
    String(details.constraintName ?? ""),
    operation.rawSql?.replace(/\s+/g, " ").trim().toLowerCase() ?? "",
  ].join("|");
}
