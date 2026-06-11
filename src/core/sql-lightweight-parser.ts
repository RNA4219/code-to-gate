/**
 * SQL Lightweight Parser for SPEC-29
 *
 * A simple tokenizer/parser for detecting SQL patterns in code.
 * NO external dependencies, NO runtime database connections.
 *
 * Purpose: Extract database operations from source code and migration files.
 */

import type {
  MigrationRef,
  MigrationOperation,
  MigrationOperationType,
  ColumnDataType,
  RawSqlRef,
  DetectedOrm,
} from "../types/database-assets.js";
import type { HashService } from "../types/contracts.js";

// ============================================================================
// Database Rule IDs (SPEC-29)
// ============================================================================

/**
 * Rule IDs for database findings.
 * These constants are used by database rules in src/rules/
 */
export const DatabaseFindingRuleId = {
  // Destructive operations
  DB_DROP_TABLE: "DB_DROP_TABLE",
  DB_DROP_COLUMN: "DB_DROP_COLUMN",
  DB_ADD_NOT_NULL_WITHOUT_DEFAULT: "DB_ADD_NOT_NULL_WITHOUT_DEFAULT",

  // Schema changes
  DB_RISKY_TYPE_CHANGE: "DB_RISKY_TYPE_CHANGE",
  DB_DROP_CONSTRAINT: "DB_DROP_CONSTRAINT",

  // Migration operations
  DB_DROP_INDEX: "DB_DROP_INDEX",
  DB_MIGRATION_NO_TRANSACTION_SIGNAL: "DB_MIGRATION_NO_TRANSACTION_SIGNAL",
  DB_ROLLBACK_NOT_EVIDENCED: "DB_ROLLBACK_NOT_EVIDENCED",

  // Raw SQL/ORM
  DB_RAW_SQL_IN_MIGRATION: "DB_RAW_SQL_IN_MIGRATION",
  DB_UNSAFE_MIGRATION_PATTERN: "DB_UNSAFE_MIGRATION_PATTERN",
} as const;

export type DatabaseFindingRuleIdType = keyof typeof DatabaseFindingRuleId;

// ============================================================================
// SQL Token Types
// ============================================================================

export type SqlTokenType =
  | "keyword"
  | "identifier"
  | "string"
  | "number"
  | "operator"
  | "paren_open"
  | "paren_close"
  | "comma"
  | "semicolon"
  | "comment"
  | "whitespace"
  | "unknown";

export interface SqlToken {
  type: SqlTokenType;
  value: string;
  position: number;
}

// SQL Keywords (subset for detection)
const SQL_KEYWORDS = new Set([
  // DDL
  "CREATE", "DROP", "ALTER", "TABLE", "INDEX", "CONSTRAINT", "COLUMN",
  "SEQUENCE", "VIEW", "TRIGGER", "FUNCTION",
  // DML
  "SELECT", "INSERT", "UPDATE", "DELETE", "FROM", "WHERE", "INTO",
  "VALUES", "SET", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "ON",
  // Constraints
  "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "UNIQUE", "CHECK", "NOT",
  "NULL", "DEFAULT", "CONSTRAINT",
  // Types
  "INTEGER", "BIGINT", "SMALLINT", "DECIMAL", "NUMERIC", "FLOAT", "DOUBLE",
  "BOOLEAN", "CHAR", "VARCHAR", "TEXT", "DATE", "DATETIME", "TIMESTAMP",
  "TIME", "JSON", "JSONB", "BLOB", "CLOB", "UUID", "ENUM", "ARRAY",
  // Transaction
  "BEGIN", "COMMIT", "ROLLBACK", "TRANSACTION", "START",
  // Index types
  "BTREE", "HASH", "GIN", "GIST", "USING",
  // Misc
  "IF", "EXISTS", "CASCADE", "RESTRICT", "ADD", "REMOVE", "MODIFY",
  "TYPE", "FIRST", "AFTER", "BEFORE", "AUTO_INCREMENT", "INCREMENT",
]);

const DANGEROUS_KEYWORDS = new Set([
  "DROP", "DELETE", "TRUNCATE", "ALTER",
]);

// ============================================================================
// SQL Tokenizer
// ============================================================================

/**
 * Tokenize a SQL string into tokens.
 * Simple tokenizer using regex patterns.
 */
export function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let pos = 0;

  // Token patterns in priority order - using slice approach for sticky flag
  const tokenPatterns: Array<[RegExp, SqlTokenType]> = [
    // Whitespace
    [/^\s+/y, "whitespace"],
    // Comments
    [/^--[^\n]*|^\/\*[\s\S]*?\*\//y, "comment"],
    // Strings
    [/^'[^']*'|^"[^"]*"|^`[^`]*`/y, "string"],
    // Numbers
    [/^\d+(?:\.\d+)?/y, "number"],
    // Parentheses
    [/^\(/y, "paren_open"],
    [/^\)/y, "paren_close"],
    // Comma and semicolon
    [/^,/y, "comma"],
    [/^;/y, "semicolon"],
    // Operators (including * for SELECT *)
    [/^[=<>!*]+|^:=/y, "operator"],
    // Identifiers (keywords or names)
    [/^[a-zA-Z_][a-zA-Z0-9_]*|^`[^`]+`|^"[^"]+"/y, "identifier"],
  ];

  while (pos < sql.length) {
    const remaining = sql.slice(pos);
    let matched = false;

    for (const [pattern, baseType] of tokenPatterns) {
      // Reset lastIndex to 0 for sticky flag (we're matching on sliced string)
      pattern.lastIndex = 0;
      const match = pattern.exec(remaining);

      if (match) {
        const value = match[0];
        let tokenType = baseType;

        // Check if identifier is a keyword
        if (baseType === "identifier" && SQL_KEYWORDS.has(value.toUpperCase())) {
          tokenType = "keyword";
        }

        tokens.push({
          type: tokenType,
          value: value,
          position: pos,
        });

        pos += value.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Unknown character, skip
      pos++;
    }
  }

  return tokens;
}

// ============================================================================
// SQL Operation Detection
// ============================================================================

/**
 * Detect SQL operations from a SQL string.
 */
export function detectSqlOperations(sql: string): MigrationOperation[] {
  const tokens = tokenizeSql(sql);
  const operations: MigrationOperation[] = [];

  // Look for DDL patterns
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    // Skip whitespace and comments
    if (token.type === "whitespace" || token.type === "comment") {
      i++;
      continue;
    }

    // Detect CREATE TABLE
    if (token.type === "keyword" && token.value.toUpperCase() === "CREATE") {
      const op = detectCreateOperation(tokens, i);
      if (op) {
        operations.push(op);
        i += (op.details?.tokenCount as number) ?? 5;
        continue;
      }
    }

    // Detect DROP operations
    if (token.type === "keyword" && token.value.toUpperCase() === "DROP") {
      const op = detectDropOperation(tokens, i);
      if (op) {
        operations.push(op);
        i += (op.details?.tokenCount as number) ?? 3;
        continue;
      }
    }

    // Detect ALTER TABLE
    if (token.type === "keyword" && token.value.toUpperCase() === "ALTER") {
      const op = detectAlterOperation(tokens, i);
      if (op) {
        operations.push(op);
        i += (op.details?.tokenCount as number) ?? 5;
        continue;
      }
    }

    i++;
  }

  return operations;
}

function detectCreateOperation(tokens: SqlToken[], startIdx: number): MigrationOperation | null {
  // CREATE TABLE <name>
  // CREATE INDEX <name> ON <table>

  // Get TABLE or INDEX token (1st after CREATE)
  const typeIdx = getNthTokenIndex(tokens, startIdx, 1);
  if (typeIdx < 0) return null;

  const typeToken = tokens[typeIdx];
  if (!typeToken) return null;

  if (typeToken.value.toUpperCase() === "TABLE") {
    // Get table name (2nd after CREATE)
    const nameIdx = getNthTokenIndex(tokens, startIdx, 2);
    if (nameIdx < 0) return null;
    const nameToken = tokens[nameIdx];

    if (nameToken) {
      return {
        type: "create_table",
        tableName: cleanIdentifier(nameToken.value),
        startLine: 1,
        details: { tokenCount: nameIdx - startIdx + 1 },
      };
    }
  }

  if (typeToken.value.toUpperCase() === "INDEX") {
    // Get index name (2nd after CREATE)
    const idxNameIdx = getNthTokenIndex(tokens, startIdx, 2);
    if (idxNameIdx < 0) return null;

    // Get ON keyword (3rd after CREATE)
    const onIdx = getNthTokenIndex(tokens, startIdx, 3);
    if (onIdx < 0) return null;

    if (tokens[onIdx]?.value.toUpperCase() === "ON") {
      // Get table name (4th after CREATE)
      const tableNameIdx = getNthTokenIndex(tokens, startIdx, 4);
      if (tableNameIdx < 0) return null;

      return {
        type: "add_index",
        tableName: cleanIdentifier(tokens[tableNameIdx].value),
        startLine: 1,
        details: { indexName: cleanIdentifier(tokens[idxNameIdx].value), tokenCount: tableNameIdx - startIdx + 1 },
      };
    }
  }

  return null;
}

function detectDropOperation(tokens: SqlToken[], startIdx: number): MigrationOperation | null {
  // DROP TABLE <name>
  // DROP INDEX <name>
  // DROP CONSTRAINT <name>

  // Get type token (1st after DROP)
  const typeIdx = getNthTokenIndex(tokens, startIdx, 1);
  if (typeIdx < 0) return null;

  const typeToken = tokens[typeIdx];
  if (!typeToken) return null;

  const objType = typeToken.value.toUpperCase();

  if (objType === "TABLE") {
    // Get table name (2nd after DROP)
    const nameIdx = getNthTokenIndex(tokens, startIdx, 2);
    if (nameIdx < 0) return null;

    return {
      type: "drop_table",
      tableName: cleanIdentifier(tokens[nameIdx].value),
      startLine: 1,
      details: { tokenCount: nameIdx - startIdx + 1 },
    };
  }

  if (objType === "INDEX") {
    // Get index name (2nd after DROP)
    const nameIdx = getNthTokenIndex(tokens, startIdx, 2);
    if (nameIdx < 0) return null;

    return {
      type: "drop_index",
      tableName: undefined,
      startLine: 1,
      details: { indexName: cleanIdentifier(tokens[nameIdx].value), tokenCount: nameIdx - startIdx + 1 },
    };
  }

  if (objType === "CONSTRAINT") {
    // Get constraint name (2nd after DROP)
    const nameIdx = getNthTokenIndex(tokens, startIdx, 2);
    if (nameIdx < 0) return null;

    return {
      type: "drop_constraint",
      tableName: undefined,
      startLine: 1,
      details: { constraintName: cleanIdentifier(tokens[nameIdx].value), tokenCount: nameIdx - startIdx + 1 },
    };
  }

  return null;
}

function detectAlterOperation(tokens: SqlToken[], startIdx: number): MigrationOperation | null {
  // ALTER TABLE <name> ADD COLUMN <col> ...
  // ALTER TABLE <name> DROP COLUMN <col> ...
  // ALTER TABLE <name> MODIFY COLUMN <col> ...

  // Check TABLE keyword (1st after ALTER)
  const tableIdx = getNthTokenIndex(tokens, startIdx, 1);
  if (tableIdx < 0 || tokens[tableIdx]?.value.toUpperCase() !== "TABLE") return null;

  // Get table name (2nd after ALTER)
  const tableNameIdx = getNthTokenIndex(tokens, startIdx, 2);
  if (tableNameIdx < 0) return null;

  const tableName = cleanIdentifier(tokens[tableNameIdx].value);

  // Get action (ADD/DROP/MODIFY) (3rd after ALTER)
  const actionIdx = getNthTokenIndex(tokens, startIdx, 3);
  if (actionIdx < 0) return null;

  const action = tokens[actionIdx].value.toUpperCase();

  if (action === "ADD") {
    // Check COLUMN keyword (4th after ALTER)
    const columnOrConstraintIdx = getNthTokenIndex(tokens, startIdx, 4);
    if (columnOrConstraintIdx < 0) return null;

    const nextToken = tokens[columnOrConstraintIdx];
    if (nextToken.value.toUpperCase() === "COLUMN") {
      // Get column name (5th after ALTER)
      const colNameIdx = getNthTokenIndex(tokens, startIdx, 5);
      if (colNameIdx < 0) return null;

      return {
        type: "add_column",
        tableName,
        columnName: cleanIdentifier(tokens[colNameIdx].value),
        startLine: 1,
        details: { tokenCount: colNameIdx - startIdx + 1 },
      };
    } else if (nextToken.value.toUpperCase() === "CONSTRAINT") {
      // Get constraint name (5th after ALTER)
      const constraintNameIdx = getNthTokenIndex(tokens, startIdx, 5);
      if (constraintNameIdx < 0) return null;

      return {
        type: "add_constraint",
        tableName,
        startLine: 1,
        details: { constraintName: cleanIdentifier(tokens[constraintNameIdx].value), tokenCount: constraintNameIdx - startIdx + 1 },
      };
    }
    // ADD without COLUMN keyword (direct column add)
    const colNameIdx = getNthTokenIndex(tokens, startIdx, 4);
    if (colNameIdx < 0) return null;

    return {
      type: "add_column",
      tableName,
      columnName: cleanIdentifier(tokens[colNameIdx].value),
      startLine: 1,
      details: { tokenCount: colNameIdx - startIdx + 1 },
    };
  }

  if (action === "DROP") {
    // Check what's being dropped (COLUMN/CONSTRAINT/INDEX) (4th after ALTER)
    const columnOrConstraintIdx = getNthTokenIndex(tokens, startIdx, 4);
    if (columnOrConstraintIdx < 0) return null;

    const nextToken = tokens[columnOrConstraintIdx];
    if (nextToken.value.toUpperCase() === "COLUMN") {
      // Get column name (5th after ALTER)
      const colNameIdx = getNthTokenIndex(tokens, startIdx, 5);
      if (colNameIdx < 0) return null;

      return {
        type: "drop_column",
        tableName,
        columnName: cleanIdentifier(tokens[colNameIdx].value),
        startLine: 1,
        details: { tokenCount: colNameIdx - startIdx + 1 },
      };
    } else if (nextToken.value.toUpperCase() === "CONSTRAINT") {
      // Get constraint name (5th after ALTER)
      const constraintNameIdx = getNthTokenIndex(tokens, startIdx, 5);
      if (constraintNameIdx < 0) return null;

      return {
        type: "drop_constraint",
        tableName,
        startLine: 1,
        details: { constraintName: cleanIdentifier(tokens[constraintNameIdx].value), tokenCount: constraintNameIdx - startIdx + 1 },
      };
    } else if (nextToken.value.toUpperCase() === "INDEX") {
      // ALTER TABLE ... DROP INDEX pattern
      // Get index name (5th after ALTER)
      const indexNameIdx = getNthTokenIndex(tokens, startIdx, 5);
      if (indexNameIdx < 0) return null;

      return {
        type: "drop_index",
        tableName,
        startLine: 1,
        details: { indexName: cleanIdentifier(tokens[indexNameIdx].value), tokenCount: indexNameIdx - startIdx + 1 },
      };
    }
    // DROP without COLUMN keyword (direct column/constraint drop)
    const colNameIdx = getNthTokenIndex(tokens, startIdx, 4);
    if (colNameIdx < 0) return null;

    return {
      type: "drop_column",
      tableName,
      columnName: cleanIdentifier(tokens[colNameIdx].value),
      startLine: 1,
      details: { tokenCount: colNameIdx - startIdx + 1 },
    };
  }

  if (action === "MODIFY" || action === "ALTER") {
    // Check COLUMN keyword (4th after ALTER)
    const columnIdx = getNthTokenIndex(tokens, startIdx, 4);
    if (columnIdx < 0 || tokens[columnIdx]?.value.toUpperCase() !== "COLUMN") return null;

    // Get column name (5th after ALTER)
    const colNameIdx = getNthTokenIndex(tokens, startIdx, 5);
    if (colNameIdx < 0) return null;

    return {
      type: "modify_column",
      tableName,
      columnName: cleanIdentifier(tokens[colNameIdx].value),
      startLine: 1,
      details: { tokenCount: colNameIdx - startIdx + 1 },
    };
  }

  return null;
}

function getTokenSkippingWhitespace(tokens: SqlToken[], fromIdx: number): SqlToken | null {
  for (let i = fromIdx; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== "whitespace" && token.type !== "comment") {
      return token;
    }
  }
  return null;
}

/**
 * Get the actual index in tokens array for the n-th non-whitespace token after startIdx.
 */
function getNthTokenIndex(tokens: SqlToken[], startIdx: number, n: number): number {
  let count = 0;
  for (let i = startIdx + 1; i < tokens.length; i++) {
    if (tokens[i].type !== "whitespace" && tokens[i].type !== "comment") {
      count++;
      if (count === n) return i;
    }
  }
  return -1;
}

function cleanIdentifier(id: string): string {
  // Remove quotes/backticks
  return id.replace(/[`'"]/g, "");
}

// ============================================================================
// Dangerous Operation Detection
// ============================================================================

/**
 * Check if a SQL string contains dangerous operations.
 */
export function containsDangerousOperation(sql: string): boolean {
  const tokens = tokenizeSql(sql);
  return tokens.some(
    (t) => t.type === "keyword" && DANGEROUS_KEYWORDS.has(t.value.toUpperCase())
  );
}

/**
 * Check if SQL contains DROP TABLE.
 */
export function containsDropTable(sql: string): boolean {
  const tokens = tokenizeSql(sql);
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i].value.toUpperCase() === "DROP") {
      const next = getTokenSkippingWhitespace(tokens, i + 1);
      if (next?.value.toUpperCase() === "TABLE") {
        return true;
      }
    }
    i++;
  }
  return false;
}

/**
 * Check if SQL contains DROP COLUMN.
 */
export function containsDropColumn(sql: string): boolean {
  const tokens = tokenizeSql(sql);
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i].value.toUpperCase() === "ALTER") {
      const op = detectAlterOperation(tokens, i);
      if (op?.type === "drop_column") {
        return true;
      }
    }
    i++;
  }
  return false;
}

/**
 * Check if SQL adds NOT NULL without DEFAULT.
 */
export function containsNotNullWithoutDefault(sql: string): boolean {
  const tokens = tokenizeSql(sql);
  let hasNotNull = false;
  let hasDefault = false;

  for (const token of tokens) {
    if (token.type === "keyword") {
      const val = token.value.toUpperCase();
      if (val === "NOT") {
        const next = getTokenSkippingWhitespace(tokens, tokens.indexOf(token) + 1);
        if (next?.value.toUpperCase() === "NULL") {
          hasNotNull = true;
        }
      }
      if (val === "DEFAULT") {
        hasDefault = true;
      }
    }
  }

  return hasNotNull && !hasDefault;
}

// ============================================================================
// Type Change Risk Detection
// ============================================================================

/**
 * Risky type change patterns.
 */
const RISKY_TYPE_CHANGES: Array<[ColumnDataType, ColumnDataType]> = [
  // Numeric truncation
  ["bigint", "integer"],
  ["decimal", "integer"],
  ["numeric", "integer"],
  ["float", "integer"],
  ["double", "float"],
  // String truncation
  ["varchar", "char"],
  ["text", "varchar"],
  // Precision loss
  ["timestamp", "date"],
  ["datetime", "date"],
  // JSON loss
  ["jsonb", "json"],
  // UUID loss
  ["uuid", "varchar"],
];

/**
 * Check if type change is risky.
 */
export function isRiskyTypeChange(
  fromType: ColumnDataType,
  toType: ColumnDataType
): boolean {
  const from = fromType.toLowerCase() as ColumnDataType;
  const to = toType.toLowerCase() as ColumnDataType;

  return RISKY_TYPE_CHANGES.some(
    ([riskFrom, riskTo]) => from === riskFrom && to === riskTo
  );
}

/**
 * Detect type changes in ALTER COLUMN statements.
 */
export function detectTypeChanges(sql: string): Array<{ columnName: string; fromType: string; toType: string }> {
  const tokens = tokenizeSql(sql);
  const changes: Array<{ columnName: string; fromType: string; toType: string }> = [];

  // Look for ALTER TABLE ... ALTER COLUMN ... TYPE patterns
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i].value.toUpperCase() === "ALTER") {
      const op = detectAlterOperation(tokens, i);
      if (op?.type === "modify_column" && op.columnName) {
        // Look for TYPE keyword after column name
        const modifyIdx = i + ((op.details?.tokenCount as number) ?? 6);
        const typeToken = getTokenSkippingWhitespace(tokens, modifyIdx);
        if (typeToken?.value.toUpperCase() === "TYPE") {
          // Find the actual index of the TYPE token, then get the token after it
          let typeIdx = modifyIdx;
          while (typeIdx < tokens.length && (tokens[typeIdx].type === "whitespace" || tokens[typeIdx].type === "comment")) {
            typeIdx++;
          }
          // typeIdx is now at the TYPE token - get the next non-whitespace token
          const newTypeToken = getTokenSkippingWhitespace(tokens, typeIdx + 1);
          if (newTypeToken) {
            changes.push({
              columnName: op.columnName,
              fromType: "unknown",
              toType: newTypeToken.value.toLowerCase(),
            });
          }
        }
      }
    }
    i++;
  }

  return changes;
}

// ============================================================================
// Transaction Pattern Detection
// ============================================================================

/**
 * Detect transaction wrapper patterns.
 * Works with both pure SQL and migration file content (TS/JS with embedded SQL strings).
 */
export function detectTransactionPatterns(sql: string): {
  hasBegin: boolean;
  hasCommit: boolean;
  hasRollback: boolean;
  pattern: "begin-commit" | "transaction-call" | "unknown" | "none";
} {
  const upperSql = sql.toUpperCase();

  // Use regex to detect BEGIN/COMMIT/ROLLBACK in both pure SQL and embedded SQL strings
  // Pattern matches: "BEGIN" or 'BEGIN' or BEGIN as standalone keyword
  const beginPattern = /(?:["'`])?\bBEGIN\b(?:["'`])?|\.query\s*\(\s*["'`]BEGIN["'`]/i;
  const commitPattern = /(?:["'`])?\bCOMMIT\b(?:["'`])?|\.query\s*\(\s*["'`]COMMIT["'`]/i;
  const rollbackPattern = /(?:["'`])?\bROLLBACK\b(?:["'`])?|\.query\s*\(\s*["'`]ROLLBACK["'`]/i;

  const hasBegin = beginPattern.test(sql);
  const hasCommit = commitPattern.test(sql);
  const hasRollback = rollbackPattern.test(sql);

  let pattern: "begin-commit" | "transaction-call" | "unknown" | "none" = "none";

  if (hasBegin && hasCommit) {
    pattern = "begin-commit";
  } else if (
    upperSql.includes("TRANSACTION()") ||
    /db\.transaction|knex\.transaction|connection\.transaction|\.transaction\s*\(/i.test(sql)
  ) {
    pattern = "transaction-call";
  }

  return { hasBegin, hasCommit, hasRollback, pattern };
}

// ============================================================================
// ORM Pattern Detection
// ============================================================================

const ORM_PATTERNS: Record<DetectedOrm, RegExp[]> = {
  typeorm: [
    /@Entity\s*\(/,
    /@Column\s*\(/,
    /@Table\s*\(/,
    /@JoinColumn\s*\(/,
    /@Index\s*\(/,
    /createQueryBuilder\s*\(/,
    /getRepository\s*\(/,
  ],
  prisma: [
    /model\s+\w+\s*\{/,
    /db\.\$\w+\s*\(/,
    /prisma\.\w+\s*\(/,
    /PrismaClient/,
  ],
  sequelize: [
    /sequelize\.define\s*\(/,
    /\.sync\s*\(/,
    /DataTypes\.\w+/,
  ],
  knex: [
    /knex\s*\(['"]\w+['"]\)/,
    /\.table\s*\(/,
    /\.schema\s*\(/,
    /\.raw\s*\(/,
  ],
  rails: [
    /ActiveRecord::Base/,
    /create_table\s*\(/,
    /add_column\s*\(/,
    /remove_column\s*\(/,
    /change_table\s*\(/,
  ],
  flyway: [
    /Flyway/,
    /V\d{8}__/,
    /migrate\s*\(/,
  ],
  django: [
    /class\s+\w+\s*\(.*Model\)/,
    /models\.Model/,
    /models\.CharField/,
    /models\.IntegerField/,
    /makemigrations/,
    /migrate/,
  ],
  unknown: [],
  none: [],
};

/**
 * Detect ORM type from source code.
 */
export function detectOrmType(sourceCode: string): DetectedOrm {
  for (const [orm, patterns] of Object.entries(ORM_PATTERNS)) {
    if (orm === "unknown" || orm === "none") continue;
    for (const pattern of patterns) {
      if (pattern.test(sourceCode)) {
        return orm as DetectedOrm;
      }
    }
  }
  return "none";
}

/**
 * Extract SQL from ORM code patterns.
 */
export function extractSqlFromOrmCode(sourceCode: string): string[] {
  const sqls: string[] = [];

  // Extract from knex.raw() calls
  const knexRawMatch = sourceCode.matchAll(/\.raw\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g);
  for (const match of knexRawMatch) {
    sqls.push(match[1]);
  }

  // Extract from template literals with SQL-like content
  const templateMatch = sourceCode.matchAll(/`([^`]*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)[^`]*)`/gi);
  for (const match of templateMatch) {
    sqls.push(match[1]);
  }

  // Extract from string literals with SQL keywords
  const stringMatch = sourceCode.matchAll(/['"]([^'"]*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)[^'"]*)['"]/gi);
  for (const match of stringMatch) {
    sqls.push(match[1]);
  }

  return sqls;
}

// ============================================================================
// Migration Analysis
// ============================================================================

/**
 * Analyze a migration file content.
 */
export function analyzeMigration(
  filePath: string,
  content: string,
  hashService: HashService
): MigrationRef[] {
  const migrations: MigrationRef[] = [];

  // Detect ORM type
  const ormType = detectOrmType(content);

  // Check if this is a pure SQL file (no ORM wrapping)
  const isPureSqlFile = filePath.endsWith(".sql") && ormType === "none";

  // Extract SQL statements
  let sqlStatements: string[];
  if (isPureSqlFile) {
    // For pure SQL files, the entire content is SQL
    // Split by semicolons to handle multiple statements
    sqlStatements = content.split(";").filter(s => s.trim().length > 0);
  } else {
    sqlStatements = extractSqlFromOrmCode(content);
  }

  // Look for up/down methods (TypeORM pattern)
  const hasUpMethod = /\bup\s*\([^)]*\)[^{]*\{/.test(content);
  const hasDownMethod = /\bdown\s*\([^)]*\)[^{]*\{/.test(content);

  // Check for transaction patterns
  const transactionInfo = detectTransactionPatterns(content);

  // Process SQL statements
  const operations: MigrationOperation[] = [];
  let currentLine = 1;

  for (const sql of sqlStatements) {
    const ops = detectSqlOperations(sql);
    for (const op of ops) {
      op.startLine = findSqlLine(content, sql, currentLine);
      op.rawSql = sql;
      operations.push(op);
      currentLine = Math.max(currentLine, op.startLine ?? 1);
    }
  }

  // Also check for raw SQL patterns in method bodies
  const rawSqlPatterns = content.matchAll(/(?:query|execute|raw)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/gi);
  for (const match of rawSqlPatterns) {
    const sql = match[1];
    const ops = detectSqlOperations(sql);
    for (const op of ops) {
      const lineNum = getLineNumber(content, match.index ?? 0);
      op.startLine = lineNum;
      op.rawSql = sql;
      operations.push(op);
    }
  }

  // Create migration ref for up method
  if (hasUpMethod || operations.length > 0) {
    const upLine = content.indexOf("up(");
    const startLine = upLine >= 0 ? getLineNumber(content, upLine) : 1;

    migrations.push({
      id: hashService.fingerprint(`${filePath}:up:${startLine}`),
      filePath,
      name: extractMigrationName(content) ?? `migration_${startLine}`,
      direction: "up",
      startLine,
      hasTransactionWrapper: transactionInfo.pattern !== "none",
      transactionSignalDetected: transactionInfo.hasBegin || transactionInfo.hasCommit,
      transactionPattern: transactionInfo.pattern === "none" ? "unknown" : transactionInfo.pattern,
      hasRollbackPattern: hasDownMethod,
      rollbackPattern: hasDownMethod ? "down-method" : "unknown",
      operations: [...operations],
    });
  }

  // Create migration ref for down method
  if (hasDownMethod) {
    const downLine = content.indexOf("down(");
    const startLine = downLine >= 0 ? getLineNumber(content, downLine) : 1;

    const downOps = operations.map((op) => ({
      ...op,
      // Invert operations for down method
      type: invertOperation(op.type),
    }));

    migrations.push({
      id: hashService.fingerprint(`${filePath}:down:${startLine}`),
      filePath,
      name: extractMigrationName(content) ?? `migration_${startLine}`,
      direction: "down",
      startLine,
      hasTransactionWrapper: transactionInfo.pattern !== "none",
      transactionSignalDetected: transactionInfo.hasBegin || transactionInfo.hasRollback,
      transactionPattern: transactionInfo.pattern === "none" ? "unknown" : transactionInfo.pattern,
      hasRollbackPattern: true,
      rollbackPattern: "down-method",
      operations: downOps,
    });
  }

  return migrations;
}

function extractMigrationName(content: string): string | null {
  // TypeORM: class MigrationName implements MigrationInterface
  const classMatch = content.match(/class\s+(\w+)\s+implements\s+MigrationInterface/);
  if (classMatch) return classMatch[1];

  // Generic: export class MigrationName
  const exportMatch = content.match(/export\s+class\s+(\w+)/);
  if (exportMatch) return exportMatch[1];

  return null;
}

function getLineNumber(content: string, index: number): number {
  const lines = content.substring(0, index).split("\n");
  return lines.length;
}

function findSqlLine(content: string, sql: string, startLine: number): number {
  const idx = content.indexOf(sql);
  if (idx >= 0) {
    return getLineNumber(content, idx);
  }
  return startLine;
}

function invertOperation(type: MigrationOperationType): MigrationOperationType {
  const inversionMap: Record<MigrationOperationType, MigrationOperationType> = {
    create_table: "drop_table",
    drop_table: "create_table",
    alter_table: "alter_table",
    add_column: "drop_column",
    drop_column: "add_column",
    modify_column: "modify_column",
    add_constraint: "drop_constraint",
    drop_constraint: "add_constraint",
    add_index: "drop_index",
    drop_index: "add_index",
    raw_sql: "raw_sql",
  };
  return inversionMap[type] ?? type;
}

// ============================================================================
// Raw SQL Statement Extraction
// ============================================================================

/**
 * Create RawSqlRef from detected SQL.
 */
export function createRawSqlRefs(
  filePath: string,
  content: string,
  hashService: HashService
): RawSqlRef[] {
  const refs: RawSqlRef[] = [];
  const sqls = extractSqlFromOrmCode(content);

  for (const sql of sqls) {
    const idx = content.indexOf(sql);
    const startLine = idx >= 0 ? getLineNumber(content, idx) : 1;
    const endLine = idx >= 0 ? getLineNumber(content, idx + sql.length) : startLine;

    refs.push({
      id: hashService.fingerprint(`${filePath}:${startLine}:${sql.substring(0, 50)}`),
      filePath,
      startLine,
      endLine,
      sql,
      isDynamic: sql.includes("${") || sql.includes("?"),
      context: filePath.includes("migration") ? "migration" : "query",
    });
  }

  return refs;
}

// ============================================================================
// Export Summary
// ============================================================================

export const SQL_LIGHTWEIGHT_PARSER = {
  tokenizeSql,
  detectSqlOperations,
  containsDangerousOperation,
  containsDropTable,
  containsDropColumn,
  containsNotNullWithoutDefault,
  isRiskyTypeChange,
  detectTypeChanges,
  detectTransactionPatterns,
  detectOrmType,
  extractSqlFromOrmCode,
  analyzeMigration,
  createRawSqlRefs,
};
