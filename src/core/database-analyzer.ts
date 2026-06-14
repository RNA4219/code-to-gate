/**
 * Database Analyzer - SPEC-29
 *
 * Analyzes database/migration files and generates database assets artifact.
 * Wired into scan command via --database-analysis flag.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { DiffAccessResult } from "../types/diff-contracts.js";
import {
  type DatabaseAssetsArtifact,
  type MigrationRef,
  type RawSqlRef,
  type OrmUsageRef,
  type DatabaseAssetsStats,
  type SqlDialect,
  type DiagnosticRef,
  type TableRef,
  type ColumnRef,
  type IndexRef,
  type ConstraintRef,
  DATABASE_ASSETS_SCHEMA_VERSION,
} from "../types/database-assets.js";
import type { NormalizedRepoGraph, RepoFile } from "../types/artifacts.js";
import type { HashService, GitFileAccess } from "../types/contracts.js";
import { DefaultHashService } from "./hash-service.js";
import {
  discoverDatabaseFiles,
  detectOrmFromPath,
  isDatabaseFile,
} from "./file-utils.js";
import {
  analyzeMigrationWithDiagnostics,
  createRawSqlRefs,
  detectOrmType,
  tokenizeSqlWithDiagnostics,
  extractSchemaInventory,
} from "./sql-lightweight-parser.js";
import { toPosix } from "./path-utils.js";

type WorkspaceReadFileFn = (filePath: string, encoding: BufferEncoding) => string;

/**
 * File source interface for database analyzer (Phase 3 common pipeline)
 * Abstracts workspace vs git ref file access
 * SPEC-29 Phase 3: Unified interface with repoRoot and structured readFile
 */
export interface DatabaseFileSource {
  /** Repository root directory */
  readonly repoRoot: string;
  /** List database/migration files as relative POSIX paths */
  listFiles(): string[];
  /** Read file content with structured result */
  readFile(relPath: string): DiffAccessResult<string>;
  /** Source label for diagnostics */
  sourceLabel: string;
  /** Generate run_id suffix for artifact */
  runIdSuffix(): string;
  /** Get diagnostics for listing issues (limit_exceeded, git_failure, etc.) */
  getListDiagnostics(): DiagnosticRef[];
  /** Get diagnostics for read failures */
  getReadDiagnostics(): DiagnosticRef[];
}

/**
 * Workspace file source - reads files from current workspace
 */
export class WorkspaceFileSource implements DatabaseFileSource {
  sourceLabel = "workspace";
  private readFailures: Array<{ relPath: string; result: DiffAccessResult<string> }> = [];

  constructor(
    public readonly repoRoot: string,
    private readonly readFileImpl: WorkspaceReadFileFn = readFileSync
  ) {}

  listFiles(): string[] {
    const absoluteFiles = discoverDatabaseFiles(this.repoRoot);
    return absoluteFiles.map(absPath => toPosix(path.relative(this.repoRoot, absPath)));
  }

  readFile(relPath: string): DiffAccessResult<string> {
    try {
      const content = this.readFileImpl(path.join(this.repoRoot, relPath), "utf8");
      return { status: "success", value: content };
    } catch (err) {
      const result: DiffAccessResult<string> = {
        status: "content_unavailable",
        message: err instanceof Error ? err.message : "Unknown error",
      };
      this.readFailures.push({ relPath, result });
      return result;
    }
  }

  runIdSuffix(): string {
    return `${Date.now()}`;
  }

  getListDiagnostics(): DiagnosticRef[] {
    // Workspace listing doesn't fail - it uses filesystem directly
    return [];
  }

  getReadDiagnostics(): DiagnosticRef[] {
    return this.readFailures.map(({ relPath, result }) => ({
      id: `diag:${relPath}:${result.status}`,
      severity: result.status === "limit_exceeded" ? "warning" : "error",
      code: "READ_ERROR",
      message: result.message ?? `Failed to read ${relPath} from workspace`,
      filePath: relPath,
      details: result.limit ? { limit: result.limit } : undefined,
    }));
  }
}

/**
 * Git ref file source - reads files at specific git ref
 * SPEC-29 Phase 3: Uses structured result contract for diagnostics
 */
class GitRefFileSource implements DatabaseFileSource {
  private listResult: DiffAccessResult<string[]> | null = null;
  private readFailures: Array<{ relPath: string; result: DiffAccessResult<string> }> = [];

  constructor(
    public readonly repoRoot: string,
    private gitRef: string,
    private gitFileAccess: GitFileAccess
  ) {}

  get sourceLabel(): string {
    return `git-ref:${this.gitRef}`;
  }

  listFiles(): string[] {
    this.listResult = this.gitFileAccess.listFilesAtRefResult(this.gitRef);
    const allFiles = this.listResult.status === "success" || this.listResult.status === "limit_exceeded"
      ? this.listResult.value!
      : [];
    // Filter to database/migration files - files are already relative paths from git
    return allFiles.filter(filePath => isDatabaseFile(filePath));
  }

  getListDiagnostics(): DiagnosticRef[] {
    const diagnostics: DiagnosticRef[] = [];
    if (!this.listResult) return diagnostics;

    const result = this.listResult;
    if (result.status === "limit_exceeded") {
      diagnostics.push({
        id: `diag:git-ref:${this.gitRef}:file-list-limit`,
        severity: "warning",
        code: "FILE_LIST_LIMIT_EXCEEDED",
        message: `File listing exceeded limit at git ref ${this.gitRef}: ${result.message ?? "max files reached"}`,
        filePath: "",
        details: { limit: result.limit?.max, actual: result.limit?.actual },
      });
    } else if (result.status === "git_failure") {
      diagnostics.push({
        id: `diag:git-ref:${this.gitRef}:git-failure`,
        severity: "error",
        code: "GIT_OPERATION_FAILED",
        message: `Git operation failed at ref ${this.gitRef}: ${result.message ?? "unknown error"}`,
        filePath: "",
      });
    } else if (result.status === "ref_invalid") {
      diagnostics.push({
        id: `diag:git-ref:${this.gitRef}:invalid-ref`,
        severity: "error",
        code: "INVALID_GIT_REF",
        message: `Invalid git ref ${this.gitRef}: ${result.message ?? "ref not found"}`,
        filePath: "",
      });
    }
    return diagnostics;
  }

  readFile(relPath: string): DiffAccessResult<string> {
    const result = this.gitFileAccess.getFileContentResult(this.gitRef, relPath);
    if (result.status !== "success") {
      this.readFailures.push({ relPath, result });
    }
    return result;
  }

  private getReadErrorCode(status: DiffAccessResult<string>["status"]): string {
    switch (status) {
      case "limit_exceeded":
        return "FILE_SIZE_LIMIT_EXCEEDED";
      case "content_unavailable":
        return "FILE_NOT_FOUND_AT_REF";
      case "git_failure":
        return "GIT_READ_FAILURE";
      case "ref_invalid":
        return "INVALID_GIT_REF_READ";
      case "path_unsafe":
        return "PATH_NOT_SAFE";
      default:
        return "READ_ERROR_AT_REF";
    }
  }

  getReadDiagnostics(): DiagnosticRef[] {
    return this.readFailures.map(({ relPath, result }) => ({
      id: `diag:${relPath}:${result.status}`,
      severity: result.status === "limit_exceeded" ? "warning" : "error",
      code: this.getReadErrorCode(result.status),
      message: result.message ?? `Failed to read ${relPath} at git ref ${this.gitRef}`,
      filePath: relPath,
      details: result.limit ? { limit: result.limit } : undefined,
    }));
  }

  runIdSuffix(): string {
    return `${this.gitRef}-${Date.now()}`;
  }
}

/**
 * Options for database analysis
 */
export interface DatabaseAnalysisOptions {
  /** Repository root directory */
  repoRoot: string;
  /** Override file source for tests and specialized callers */
  fileSource?: DatabaseFileSource;
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

  // Use tokenizer-based parenthesis balance check (excludes strings/comments)
  const tokenizeResult = tokenizeSqlWithDiagnostics(content, relPath, 1);
  diagnostics.push(...tokenizeResult.diagnostics);

  return diagnostics;
}

/**
 * Pipeline options for database analysis
 */
interface DatabasePipelineOptions {
  /** Hash service for generating IDs */
  hashService: HashService;
  /** Existing repo graph (optional) */
  graph?: NormalizedRepoGraph;
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Deduplicate diagnostics by id or code+filePath+startLine combination
 */
function deduplicateDiagnostics(diagnostics: DiagnosticRef[]): DiagnosticRef[] {
  const seen = new Map<string, DiagnosticRef>();
  for (const d of diagnostics) {
    const key = d.id || `${d.code}:${d.filePath}:${d.startLine ?? 0}`;
    if (!seen.has(key)) seen.set(key, d);
  }
  return Array.from(seen.values());
}

/**
 * Common database analysis pipeline (Phase 3)
 * Used by both workspace and git ref analysis
 */
function analyzeDatabasePipeline(
  fileSource: DatabaseFileSource,
  options: DatabasePipelineOptions
): DatabaseAssetsArtifact {
  const startTime = Date.now();

  // Discover database/migration files
  const dbFiles = fileSource.listFiles();

  // SPEC-29 Phase 3: Add listing diagnostics (limit_exceeded, git_failure, etc.)
  const diagnostics: DiagnosticRef[] = [];
  diagnostics.push(...fileSource.getListDiagnostics());

  if (options.verbose) {
    console.log(JSON.stringify({
      phase: `database-discovery-${fileSource.sourceLabel}`,
      databaseFiles: dbFiles.length,
      timeMs: Date.now() - startTime,
    }));
  }

  // Analyze migrations
  const migrations: MigrationRef[] = [];
  const rawSqlStatements: RawSqlRef[] = [];
  const ormUsageRefs: OrmUsageRef[] = [];

  // Schema inventory (Phase B)
  const tables: TableRef[] = [];
  const columns: ColumnRef[] = [];
  const indexes: IndexRef[] = [];
  const constraints: ConstraintRef[] = [];

  const detectedDialects: Set<SqlDialect> = new Set();

  // Track ORM usage per file
  const ormUsageByFile: Map<string, OrmUsageRef> = new Map();

  for (const file of dbFiles) {
    // listFiles() now returns relative POSIX paths directly
    const relPath = toPosix(file);

    // Read file content with structured result
    const readResult = fileSource.readFile(relPath);
    if (readResult.status !== "success") {
      // Read diagnostics already collected from fileSource.getReadDiagnostics()
      continue;
    }
    const content = redactDatabaseSecrets(readResult.value!);

    // Detect dialect from file content
    const dialect = detectSqlDialect(content, relPath);
    detectedDialects.add(dialect);
    diagnostics.push(...collectContentDiagnostics(content, relPath, dialect));

    // Analyze as migration
    const migrationResult = analyzeMigrationWithDiagnostics(relPath, content, options.hashService);
    migrations.push(...migrationResult.migrations);
    diagnostics.push(...migrationResult.diagnostics);

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
      const sqlRefs = createRawSqlRefs(relPath, content, options.hashService);
      rawSqlStatements.push(...sqlRefs);

      // Extract schema inventory from DDL statements (Phase B)
      const inventoryResult = extractSchemaInventory(content, relPath, 1, options.hashService);
      tables.push(...inventoryResult.tables);
      columns.push(...inventoryResult.columns);
      indexes.push(...inventoryResult.indexes);
      constraints.push(...inventoryResult.constraints);
      diagnostics.push(...inventoryResult.diagnostics);
    }
  }

  // SPEC-29 Phase 3: Add read diagnostics (file read failures) - collected after file reading loop
  diagnostics.push(...fileSource.getReadDiagnostics());

  // Convert ORM usage map to array
  ormUsageRefs.push(...ormUsageByFile.values());
  migrations.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.startLine - b.startLine || a.direction.localeCompare(b.direction));
  rawSqlStatements.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.startLine - b.startLine);
  ormUsageRefs.sort((a, b) => a.filePath.localeCompare(b.filePath));

  // Convert dialects set to array
  const dialects: SqlDialect[] = detectedDialects.size > 0
    ? Array.from(detectedDialects).sort()
    : ["unknown"];

  const endTime = Date.now();

  if (options.verbose) {
    console.log(JSON.stringify({
      phase: `database-analysis-${fileSource.sourceLabel}`,
      migrationsFound: migrations.length,
      rawSqlStatements: rawSqlStatements.length,
      ormUsageCount: ormUsageRefs.length,
      timeMs: endTime - startTime,
    }));
  }

  // Build stats (Phase B: use actual schema inventory counts)
  const stats: DatabaseAssetsStats = {
    tableCount: tables.length,
    columnCount: columns.length,
    indexCount: indexes.length,
    constraintCount: constraints.length,
    migrationCount: migrations.length,
    ormEntityCount: ormUsageRefs.reduce((acc, ref) => acc + ref.entities.length, 0),
    rawSqlCount: rawSqlStatements.length,
    filesAnalyzed: dbFiles.length,
  };

  // Add PARTIAL_PARSE diagnostic if there are parsing errors
  const parsingErrorCodes = ["UNTERMINATED_STRING", "UNTERMINATED_COMMENT", "UNBALANCED_PARENTHESIS", "INCOMPLETE_DDL", "UNSUPPORTED_SQL_SYNTAX"];
  const hasParsingErrors = diagnostics.some(d => d.severity === "error" && parsingErrorCodes.includes(d.code));
  if (hasParsingErrors) {
    const errorDiagnostics = diagnostics.filter(d => d.severity === "error" && parsingErrorCodes.includes(d.code));
    diagnostics.push({
      id: `diag:partial-parse-summary`,
      severity: "warning",
      code: "PARTIAL_PARSE",
      message: `Parsing errors detected in ${errorDiagnostics.length} statement(s); analysis continued with partial results`,
      filePath: errorDiagnostics[0]?.filePath ?? "",
      startLine: errorDiagnostics[0]?.startLine,
      details: { errorCount: errorDiagnostics.length, errorCodes: errorDiagnostics.map(d => d.code) },
    });
  }

  // SPEC-29 Phase 3: Deduplicate and sort diagnostics
  const uniqueDiagnostics = deduplicateDiagnostics(diagnostics);
  uniqueDiagnostics.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.code.localeCompare(b.code));

  // Build artifact
  const artifact: DatabaseAssetsArtifact = {
    artifact: "database-assets",
    schema: DATABASE_ASSETS_SCHEMA_VERSION,
    version: "ctg/v1",
    generated_at: new Date().toISOString(),
    run_id: options.graph?.run_id ?? `db-analysis-${fileSource.runIdSuffix()}`,
    repo: options.graph?.repo ?? {
      root: fileSource.repoRoot,
    },
    tool: options.graph?.tool ?? {
      name: "code-to-gate",
      version: "1.0.0",
      plugin_versions: [],
    },
    completeness: uniqueDiagnostics.some(d =>
      d.severity === "error" ||
      d.code === "FILE_LIST_LIMIT_EXCEEDED" ||
      d.code === "FILE_SIZE_LIMIT_EXCEEDED"
    ) ? "partial" : "complete",
    dialects,
    diagnostics: uniqueDiagnostics,
    tables,
    columns,
    indexes,
    constraints,
    migrations,
    ormUsage: ormUsageRefs,
    rawSqlStatements,
    stats,
  };

  return artifact;
}

/**
 * Analyze database files and generate database assets artifact
 */
export function analyzeDatabaseAssets(options: DatabaseAnalysisOptions): DatabaseAssetsArtifact {
  const hashService = options.hashService ?? new DefaultHashService();
  const fileSource = options.fileSource ?? new WorkspaceFileSource(options.repoRoot);

  return analyzeDatabasePipeline(fileSource, {
    hashService,
    graph: options.graph,
    verbose: options.verbose,
  });
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
  /** Git file access for reading files at refs (optional - caller must provide for Git operations) */
  gitFileAccess?: GitFileAccess;
  /** Hash service for generating IDs */
  hashService?: HashService;
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Analyze database files at a specific git ref (SPEC-29 diff)
 * Uses GitFileAccess to read file content at the ref
 *
 * @returns Database assets artifact, or error artifact if gitFileAccess not provided
 */
export function analyzeDatabaseAssetsAtRef(options: DatabaseAnalysisAtRefOptions): DatabaseAssetsArtifact {
  const hashService = options.hashService ?? new DefaultHashService();

  // Architecture: core layer cannot import adapters layer directly
  // Caller must inject GitFileAccess adapter for Git operations
  // Backward compatibility: return error artifact if not provided
  if (!options.gitFileAccess) {
    return {
      artifact: "database-assets",
      schema: DATABASE_ASSETS_SCHEMA_VERSION,
      version: "ctg/v1",
      generated_at: new Date().toISOString(),
      run_id: `git-ref-${options.gitRef}-${Date.now()}`,
      repo: {
        root: options.repoRoot,
        revision: options.gitRef,
      },
      tool: {
        name: "code-to-gate",
        version: "1.5.0",
        plugin_versions: [],
      },
      completeness: "partial",
      dialects: [],
      diagnostics: [{
        id: `diag:git-ref:${options.gitRef}:missing-git-access`,
        severity: "error",
        code: "GIT_ACCESS_NOT_PROVIDED",
        message: "GitFileAccess not provided: caller must inject adapter for Git ref analysis",
        filePath: "",
      }],
      tables: [],
      columns: [],
      indexes: [],
      constraints: [],
      migrations: [],
      ormUsage: [],
      rawSqlStatements: [],
      stats: {
        tableCount: 0,
        columnCount: 0,
        indexCount: 0,
        constraintCount: 0,
        migrationCount: 0,
        ormEntityCount: 0,
        rawSqlCount: 0,
        filesAnalyzed: 0,
      },
    };
  }

  const fileSource = new GitRefFileSource(options.repoRoot, options.gitRef, options.gitFileAccess);

  return analyzeDatabasePipeline(fileSource, {
    hashService,
    verbose: options.verbose,
  });
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
