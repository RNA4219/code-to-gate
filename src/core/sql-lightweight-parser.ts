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
  DiagnosticRef,
  TableRef,
  ColumnRef,
  IndexRef,
  ConstraintRef,
  IndexType,
  ConstraintType,
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
  line?: number; // Line number (1-based), optional for backward compatibility
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
// SQL Tokenizer with Diagnostics
// ============================================================================

/**
 * Result of tokenization including diagnostics.
 * Internal use - provides enhanced parsing accuracy information.
 */
export interface TokenizeResult {
  tokens: SqlToken[];
  diagnostics: DiagnosticRef[];
}

/**
 * Tokenize a SQL string into tokens (backward-compatible public API).
 * Simple tokenizer using regex patterns.
 */
export function tokenizeSql(sql: string): SqlToken[] {
  const result = tokenizeSqlWithDiagnostics(sql, "unknown-file", 1);
  return result.tokens;
}

/**
 * Tokenize a SQL string with full diagnostic tracking.
 * Internal function for enhanced parsing accuracy.
 *
 * Tracks:
 * - Unknown characters (UNSUPPORTED_SQL_SYNTAX)
 * - Unterminated strings (UNTERMINATED_STRING)
 * - Unterminated comments (UNTERMINATED_COMMENT)
 * - Unbalanced parentheses (UNBALANCED_PARENTHESIS) - excluding string/comment content
 */
export function tokenizeSqlWithDiagnostics(
  sql: string,
  filePath: string,
  startLine: number
): TokenizeResult {
  const tokens: SqlToken[] = [];
  const diagnostics: DiagnosticRef[] = [];
  let pos = 0;
  let currentLine = startLine;

  // Token patterns in priority order - using slice approach for sticky flag
  const tokenPatterns: Array<[RegExp, SqlTokenType]> = [
    // Whitespace
    [/^\s+/y, "whitespace"],
    // Comments (block and line)
    [/^--[^\n]*|^\/\*[\s\S]*?\*\//y, "comment"],
    // Strings (single/double quotes, backticks)
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
          line: currentLine,
        });

        // Update line count based on newlines in the matched value
        const newlinesInValue = countNewlines(value);
        currentLine += newlinesInValue;

        pos += value.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Track unknown character as diagnostic (Phase A enhancement)
      const unknownChar = sql[pos];
      diagnostics.push({
        id: `diag-${pos}`,
        severity: "warning",
        code: "UNSUPPORTED_SQL_SYNTAX",
        message: `Unknown character in SQL: '${unknownChar}' (position ${pos})`,
        filePath,
        startLine: currentLine,
        details: { character: unknownChar, position: pos },
      });

      // Create unknown token for tracking (instead of skipping)
      tokens.push({
        type: "unknown",
        value: unknownChar,
        position: pos,
        line: currentLine,
      });

      // Check if unknown char is a newline
      if (unknownChar === '\n') {
        currentLine++;
      }

      pos++;
    }
  }

  // Check for unterminated string/comment patterns
  diagnostics.push(...checkUnterminatedPatterns(sql, filePath, startLine));

  // Check parenthesis balance (excluding strings/comments)
  diagnostics.push(...checkParenthesisBalance(tokens, filePath, startLine));

  return { tokens, diagnostics };
}

/**
 * Count newlines in a string.
 */
function countNewlines(str: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\n') {
      count++;
    }
  }
  return count;
}

/**
 * Check for unterminated strings and comments in SQL.
 */
function checkUnterminatedPatterns(
  sql: string,
  filePath: string,
  startLine: number
): DiagnosticRef[] {
  const diagnostics: DiagnosticRef[] = [];

  // Check for unterminated single-quoted strings
  const singleQuotePattern = /^'([^']*)'/g;
  let match;
  let lastSingleQuoteEnd = 0;
  while ((match = singleQuotePattern.exec(sql)) !== null) {
    lastSingleQuoteEnd = match.index + match[0].length;
  }
  // Check for any remaining unmatched single quote
  const remainingAfterMatch = sql.slice(lastSingleQuoteEnd);
  const unmatchedSingleQuote = remainingAfterMatch.indexOf("'");
  if (unmatchedSingleQuote >= 0) {
    const absolutePos = lastSingleQuoteEnd + unmatchedSingleQuote;
    diagnostics.push({
      id: `diag-unterminated-string-${absolutePos}`,
      severity: "error",
      code: "UNTERMINATED_STRING",
      message: "Unterminated single-quoted string",
      filePath,
      startLine: startLine + countLinesBefore(sql, absolutePos),
      details: { quoteType: "single", position: absolutePos },
    });
  }

  // Check for unterminated double-quoted strings
  const doubleQuotePattern = /^"([^"]*)"/g;
  let lastDoubleQuoteEnd = 0;
  while ((match = doubleQuotePattern.exec(sql)) !== null) {
    lastDoubleQuoteEnd = match.index + match[0].length;
  }
  const remainingAfterDouble = sql.slice(lastDoubleQuoteEnd);
  const unmatchedDoubleQuote = remainingAfterDouble.indexOf('"');
  if (unmatchedDoubleQuote >= 0) {
    const absolutePos = lastDoubleQuoteEnd + unmatchedDoubleQuote;
    diagnostics.push({
      id: `diag-unterminated-string-${absolutePos}`,
      severity: "error",
      code: "UNTERMINATED_STRING",
      message: "Unterminated double-quoted string",
      filePath,
      startLine: startLine + countLinesBefore(sql, absolutePos),
      details: { quoteType: "double", position: absolutePos },
    });
  }

  // Check for unterminated block comments
  const blockCommentStart = sql.indexOf("/*");
  const blockCommentEnd = sql.indexOf("*/", blockCommentStart + 2);
  if (blockCommentStart >= 0 && (blockCommentEnd < 0 || blockCommentEnd < blockCommentStart)) {
    diagnostics.push({
      id: `diag-unterminated-comment-${blockCommentStart}`,
      severity: "error",
      code: "UNTERMINATED_COMMENT",
      message: "Unterminated block comment /* ... */",
      filePath,
      startLine: startLine + countLinesBefore(sql, blockCommentStart),
      details: { startPosition: blockCommentStart },
    });
  }

  return diagnostics;
}

/**
 * Check parenthesis balance using tokens (excluding strings and comments).
 * This provides accurate balance checking that ignores parentheses inside strings/comments.
 */
function checkParenthesisBalance(
  tokens: SqlToken[],
  filePath: string,
  startLine: number
): DiagnosticRef[] {
  const diagnostics: DiagnosticRef[] = [];

  // Count parentheses only from relevant tokens (not strings/comments)
  const parenTokens = tokens.filter(
    (t) => t.type === "paren_open" || t.type === "paren_close"
  );

  const openCount = parenTokens.filter((t) => t.type === "paren_open").length;
  const closeCount = parenTokens.filter((t) => t.type === "paren_close").length;

  if (openCount !== closeCount) {
    // Find the position of imbalance
    const balance = openCount - closeCount;
    const lastParen = parenTokens[parenTokens.length - 1];

    diagnostics.push({
      id: `diag-unbalanced-paren`,
      severity: "error",
      code: "UNBALANCED_PARENTHESIS",
      message: balance > 0
        ? `Unbalanced parentheses: ${openCount} open, ${closeCount} close (${balance} unmatched open)`
        : `Unbalanced parentheses: ${openCount} open, ${closeCount} close (${Math.abs(balance)} unmatched close)`,
      filePath,
      startLine: lastParen?.line ?? startLine,
      details: { openCount, closeCount, balance },
    });
  }

  return diagnostics;
}

/**
 * Count the number of newlines before a position in the string.
 */
function countLinesBefore(content: string, position: number): number {
  const prefix = content.substring(0, position);
  return prefix.split("\n").length - 1;
}

// ============================================================================
// SQL Operation Detection
// ============================================================================

/**
 * Result of SQL operation detection including diagnostics.
 */
export interface DetectOperationsResult {
  operations: MigrationOperation[];
  diagnostics: DiagnosticRef[];
}

/**
 * Detect SQL operations from a SQL string with diagnostic tracking.
 */
export function detectSqlOperationsWithDiagnostics(
  sql: string,
  filePath: string,
  startLine: number
): DetectOperationsResult {
  const { tokens, diagnostics } = tokenizeSqlWithDiagnostics(sql, filePath, startLine);
  const operations: MigrationOperation[] = [];

  // Look for DDL patterns
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    // Skip whitespace and comments (and unknown tokens)
    if (token.type === "whitespace" || token.type === "comment" || token.type === "unknown") {
      i++;
      continue;
    }

    // Detect CREATE TABLE
    if (token.type === "keyword" && token.value.toUpperCase() === "CREATE") {
      const op = detectCreateOperation(tokens, i, startLine);
      if (op) {
        operations.push(op);
        i += (op.details?.tokenCount as number) ?? 5;
        continue;
      }
    }

    // Detect DROP operations
    if (token.type === "keyword" && token.value.toUpperCase() === "DROP") {
      const op = detectDropOperation(tokens, i, startLine);
      if (op) {
        operations.push(op);
        i += (op.details?.tokenCount as number) ?? 3;
        continue;
      }
    }

    // Detect ALTER TABLE
    if (token.type === "keyword" && token.value.toUpperCase() === "ALTER") {
      const op = detectAlterOperation(tokens, i, startLine);
      if (op) {
        operations.push(op);
        i += (op.details?.tokenCount as number) ?? 5;
        continue;
      }
    }

    i++;
  }

  // Add INCOMPLETE_DDL diagnostic if operations detected but SQL appears truncated
  if (operations.length > 0 && sql.trim().length > 0) {
    const lastToken = tokens[tokens.length - 1];
    // Check if SQL ends with incomplete statement (no semicolon, ends mid-keyword)
    const endsIncomplete = !sql.trim().endsWith(";") &&
      (lastToken?.type === "keyword" || lastToken?.type === "identifier" || lastToken?.type === "unknown");

    if (endsIncomplete && !diagnostics.some(d => d.code === "INCOMPLETE_DDL")) {
      diagnostics.push({
        id: `diag-incomplete-ddl-${startLine}`,
        severity: "warning",
        code: "INCOMPLETE_DDL",
        message: "SQL statement appears incomplete (missing semicolon or truncated)",
        filePath,
        startLine,
        details: { lastToken: lastToken?.value, lastTokenType: lastToken?.type },
      });
    }
  }

  return { operations, diagnostics };
}

/**
 * Detect SQL operations from a SQL string (backward-compatible public API).
 */
export function detectSqlOperations(sql: string): MigrationOperation[] {
  const result = detectSqlOperationsWithDiagnostics(sql, "unknown-file", 1);
  return result.operations;
}

function detectCreateOperation(tokens: SqlToken[], startIdx: number, startLine: number = 1): MigrationOperation | null {
  // CREATE TABLE <name>
  // CREATE [UNIQUE] INDEX <name> ON <table>

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
        startLine,
        details: { tokenCount: nameIdx - startIdx + 1 },
      };
    }
  }

  const type = typeToken.value.toUpperCase();
  const isUniqueIndex = type === "UNIQUE" &&
    tokens[getNthTokenIndex(tokens, startIdx, 2)]?.value.toUpperCase() === "INDEX";

  if (type === "INDEX" || isUniqueIndex) {
    const offset = isUniqueIndex ? 1 : 0;

    // Get index name after CREATE [UNIQUE] INDEX
    const idxNameIdx = getNthTokenIndex(tokens, startIdx, 2 + offset);
    if (idxNameIdx < 0) return null;

    // Get ON keyword
    const onIdx = getNthTokenIndex(tokens, startIdx, 3 + offset);
    if (onIdx < 0) return null;

    if (tokens[onIdx]?.value.toUpperCase() === "ON") {
      // Get table name after ON
      const tableNameIdx = getNthTokenIndex(tokens, startIdx, 4 + offset);
      if (tableNameIdx < 0) return null;

      return {
        type: "add_index",
        tableName: cleanIdentifier(tokens[tableNameIdx].value),
        startLine,
        details: {
          indexName: cleanIdentifier(tokens[idxNameIdx].value),
          unique: isUniqueIndex,
          tokenCount: tableNameIdx - startIdx + 1,
        },
      };
    }
  }

  return null;
}

function detectDropOperation(tokens: SqlToken[], startIdx: number, startLine: number = 1): MigrationOperation | null {
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
      startLine,
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
      startLine,
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
      startLine,
      details: { constraintName: cleanIdentifier(tokens[nameIdx].value), tokenCount: nameIdx - startIdx + 1 },
    };
  }

  return null;
}

function detectAlterOperation(tokens: SqlToken[], startIdx: number, startLine: number = 1): MigrationOperation | null {
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
        startLine,
        details: { tokenCount: colNameIdx - startIdx + 1 },
      };
    } else if (nextToken.value.toUpperCase() === "CONSTRAINT") {
      // Get constraint name (5th after ALTER)
      const constraintNameIdx = getNthTokenIndex(tokens, startIdx, 5);
      if (constraintNameIdx < 0) return null;

      return {
        type: "add_constraint",
        tableName,
        startLine,
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
      startLine,
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
        startLine,
        details: { tokenCount: colNameIdx - startIdx + 1 },
      };
    } else if (nextToken.value.toUpperCase() === "CONSTRAINT") {
      // Get constraint name (5th after ALTER)
      const constraintNameIdx = getNthTokenIndex(tokens, startIdx, 5);
      if (constraintNameIdx < 0) return null;

      return {
        type: "drop_constraint",
        tableName,
        startLine,
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
        startLine,
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
      startLine,
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
      startLine,
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

function isIdentifierLike(token: SqlToken | undefined): boolean {
  return token?.type === "identifier" || token?.type === "string";
}

function isOpenParen(token: SqlToken | undefined): boolean {
  return token?.type === "paren_open";
}

function isCloseParen(token: SqlToken | undefined): boolean {
  return token?.type === "paren_close";
}

function isComma(token: SqlToken | undefined): boolean {
  return token?.type === "comma";
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
 * Result of migration analysis including diagnostics.
 */
export interface AnalyzeMigrationResult {
  migrations: MigrationRef[];
  diagnostics: DiagnosticRef[];
}

/**
 * Analyze a migration file content with diagnostic tracking.
 */
export function analyzeMigrationWithDiagnostics(
  filePath: string,
  content: string,
  hashService: HashService
): AnalyzeMigrationResult {
  const migrations: MigrationRef[] = [];
  const diagnostics: DiagnosticRef[] = [];

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

  // Process SQL statements with diagnostics
  const operations: MigrationOperation[] = [];
  let currentLine = 1;

  for (const sql of sqlStatements) {
    const sqlStartLine = findSqlLine(content, sql, currentLine);
    const result = detectSqlOperationsWithDiagnostics(sql, filePath, sqlStartLine);

    // Collect diagnostics
    diagnostics.push(...result.diagnostics);

    for (const op of result.operations) {
      op.startLine = sqlStartLine;
      op.rawSql = sql;
      operations.push(op);
      currentLine = Math.max(currentLine, op.startLine ?? 1);
    }
  }

  // Also check for raw SQL patterns in method bodies with diagnostics
  const rawSqlPatterns = content.matchAll(/(?:query|execute|raw)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/gi);
  for (const match of rawSqlPatterns) {
    const sql = match[1];
    const lineNum = getLineNumber(content, match.index ?? 0);
    const result = detectSqlOperationsWithDiagnostics(sql, filePath, lineNum);

    // Collect diagnostics
    diagnostics.push(...result.diagnostics);

    for (const op of result.operations) {
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

  return { migrations, diagnostics };
}

/**
 * Analyze a migration file content (backward-compatible public API).
 */
export function analyzeMigration(
  filePath: string,
  content: string,
  hashService: HashService
): MigrationRef[] {
  const result = analyzeMigrationWithDiagnostics(filePath, content, hashService);
  return result.migrations;
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
  // Tokenizer with diagnostics (Phase A)
  tokenizeSql,
  tokenizeSqlWithDiagnostics,
  // Operation detection with diagnostics (Phase A)
  detectSqlOperations,
  detectSqlOperationsWithDiagnostics,
  // Dangerous operation detection
  containsDangerousOperation,
  containsDropTable,
  containsDropColumn,
  containsNotNullWithoutDefault,
  // Type change detection
  isRiskyTypeChange,
  detectTypeChanges,
  // Transaction/ORM patterns
  detectTransactionPatterns,
  detectOrmType,
  extractSqlFromOrmCode,
  // Migration analysis with diagnostics (Phase A)
  analyzeMigration,
  analyzeMigrationWithDiagnostics,
  // Raw SQL extraction
  createRawSqlRefs,
};

// ============================================================================
// Schema Inventory Extraction (Phase B - SPEC-29)
// ============================================================================

/**
 * Result of schema inventory extraction including diagnostics.
 */
export interface SchemaInventoryResult {
  tables: TableRef[];
  columns: ColumnRef[];
  indexes: IndexRef[];
  constraints: ConstraintRef[];
  diagnostics: DiagnosticRef[];
}

/**
 * Map of SQL data types to normalized ColumnDataType.
 */
const SQL_TYPE_MAP: Record<string, ColumnDataType> = {
  // Integer types
  "int": "integer",
  "integer": "integer",
  "bigint": "bigint",
  "smallint": "smallint",
  "tinyint": "smallint",
  "serial": "integer",
  "bigserial": "bigint",
  "smallserial": "smallint",
  // Decimal/numeric types
  "decimal": "decimal",
  "numeric": "numeric",
  "real": "float",
  "float": "float",
  "double": "double",
  "double precision": "double",
  "money": "decimal",
  // Boolean
  "boolean": "boolean",
  "bool": "boolean",
  // String types
  "char": "char",
  "character": "char",
  "varchar": "varchar",
  "character varying": "varchar",
  "text": "text",
  "string": "varchar",
  // Date/time types
  "date": "date",
  "datetime": "datetime",
  "timestamp": "timestamp",
  "timestamptz": "timestamp",
  "time": "time",
  "timetz": "time",
  // JSON types
  "json": "json",
  "jsonb": "jsonb",
  // Binary types
  "blob": "blob",
  "bytea": "blob",
  "binary": "blob",
  "varbinary": "blob",
  "clob": "clob",
  // UUID
  "uuid": "uuid",
  // Array
  "array": "array",
};

/**
 * Normalize SQL data type to ColumnDataType.
 */
function normalizeDataType(sqlType: string): ColumnDataType {
  const normalized = sqlType.toLowerCase().trim();
  // Remove size specifiers like (255), (10,2)
  const baseType = normalized.replace(/\s*\([^)]*\)/g, "");

  // Check direct match
  if (SQL_TYPE_MAP[baseType]) {
    return SQL_TYPE_MAP[baseType];
  }

  // Check with spaces normalized
  const spaceNormalized = baseType.replace(/\s+/g, " ");
  if (SQL_TYPE_MAP[spaceNormalized]) {
    return SQL_TYPE_MAP[spaceNormalized];
  }

  // Check enum pattern
  if (baseType.startsWith("enum")) {
    return "enum";
  }

  return "unknown";
}

/**
 * Detect index type from SQL keywords.
 * @internal Reserved for future use
 */
function _detectIndexType(tokens: SqlToken[], startIdx: number): IndexType {
  // Check for UNIQUE keyword before INDEX
  const uniqueIdx = getNthTokenIndex(tokens, startIdx, 1);
  if (uniqueIdx >= 0 && tokens[uniqueIdx]?.value.toUpperCase() === "UNIQUE") {
    return "unique";
  }

  // Default to btree
  return "btree";
}

/**
 * Detect constraint type from SQL keywords.
 */
function detectConstraintTypeFromSql(sqlKeywords: string[]): ConstraintType {
  const upperKeywords = sqlKeywords.map(k => k.toUpperCase());

  if (upperKeywords.includes("PRIMARY") && upperKeywords.includes("KEY")) {
    return "primary_key";
  }
  if (upperKeywords.includes("FOREIGN") && upperKeywords.includes("KEY")) {
    return "foreign_key";
  }
  if (upperKeywords.includes("UNIQUE")) {
    return "unique";
  }
  if (upperKeywords.includes("CHECK")) {
    return "check";
  }

  return "not_null";
}

/**
 * Extract schema inventory from SQL content with diagnostic tracking.
 * Supports CREATE TABLE, CREATE INDEX, and constraint extraction.
 */
export function extractSchemaInventory(
  sql: string,
  filePath: string,
  startLine: number,
  hashService: HashService
): SchemaInventoryResult {
  const { tokens, diagnostics } = tokenizeSqlWithDiagnostics(sql, filePath, startLine);

  const tables: TableRef[] = [];
  const columns: ColumnRef[] = [];
  const indexes: IndexRef[] = [];
  const constraints: ConstraintRef[] = [];

  // Track seen objects to detect duplicates
  const seenTables = new Map<string, { line: number; ref: TableRef }>();
  const seenIndexes = new Map<string, { line: number; ref: IndexRef }>();

  // Process DDL statements
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    // Skip whitespace and comments
    if (token.type === "whitespace" || token.type === "comment" || token.type === "unknown") {
      i++;
      continue;
    }

    // CREATE TABLE
    if (token.type === "keyword" && token.value.toUpperCase() === "CREATE") {
      const typeIdx = getNthTokenIndex(tokens, i, 1);
      if (typeIdx >= 0 && tokens[typeIdx]?.value.toUpperCase() === "TABLE") {
        const tableNameIdx = getNthTokenIndex(tokens, i, 2);
        if (tableNameIdx >= 0 && isIdentifierLike(tokens[tableNameIdx])) {
          const tableName = cleanIdentifier(tokens[tableNameIdx].value);
          const tableLine = tokens[tableNameIdx].line ?? startLine;

          // Check for duplicate
          const tableId = `table:${tableName}`;
          if (seenTables.has(tableId)) {
            const existing = seenTables.get(tableId)!;
            diagnostics.push({
              id: `diag-duplicate-${tableId}-${tableLine}`,
              severity: "warning",
              code: "DUPLICATE_OBJECT_DECLARATION",
              message: `Table "${tableName}" declared multiple times (first at line ${existing.line})`,
              filePath,
              startLine: tableLine,
              details: { objectType: "table", objectName: tableName, firstLine: existing.line },
            });
          } else {
            // Extract columns from table definition
            const tableColumns = extractColumnsFromTableDef(
              tokens, tableNameIdx, tableName, filePath, tableLine, hashService
            );

            const tableRef: TableRef = {
              id: hashService.fingerprint(`${filePath}:${tableId}:${tableLine}`),
              name: tableName,
              type: "table",
              filePath,
              startLine: tableLine,
              columns: tableColumns,
            };

            tables.push(tableRef);
            columns.push(...tableColumns);
            seenTables.set(tableId, { line: tableLine, ref: tableRef });
          }
        }
      }

      // CREATE INDEX / CREATE UNIQUE INDEX
      if (typeIdx >= 0 && tokens[typeIdx]?.value.toUpperCase() === "INDEX") {
        const result = extractIndexFromCreate(tokens, i, filePath, startLine, hashService);
        if (result.index) {
          const indexId = `index:${result.index.name}`;
          if (seenIndexes.has(indexId)) {
            const existing = seenIndexes.get(indexId)!;
            diagnostics.push({
              id: `diag-duplicate-${indexId}-${result.index.startLine}`,
              severity: "warning",
              code: "DUPLICATE_OBJECT_DECLARATION",
              message: `Index "${result.index.name}" declared multiple times (first at line ${existing.line})`,
              filePath,
              startLine: result.index.startLine,
              details: { objectType: "index", objectName: result.index.name, firstLine: existing.line },
            });
          } else {
            indexes.push(result.index);
            seenIndexes.set(indexId, { line: result.index.startLine, ref: result.index });
          }
        }
      }

      // CREATE UNIQUE INDEX
      const maybeUniqueIdx = getNthTokenIndex(tokens, i, 1);
      if (maybeUniqueIdx >= 0 && tokens[maybeUniqueIdx]?.value.toUpperCase() === "UNIQUE") {
        const indexIdx = getNthTokenIndex(tokens, i, 2);
        if (indexIdx >= 0 && tokens[indexIdx]?.value.toUpperCase() === "INDEX") {
          const result = extractIndexFromCreate(tokens, i, filePath, startLine, hashService, true);
          if (result.index) {
            const indexId = `index:${result.index.name}`;
            if (seenIndexes.has(indexId)) {
              const existing = seenIndexes.get(indexId)!;
              diagnostics.push({
                id: `diag-duplicate-${indexId}-${result.index.startLine}`,
                severity: "warning",
                code: "DUPLICATE_OBJECT_DECLARATION",
                message: `Index "${result.index.name}" declared multiple times (first at line ${existing.line})`,
                filePath,
                startLine: result.index.startLine,
                details: { objectType: "index", objectName: result.index.name, firstLine: existing.line },
              });
            } else {
              indexes.push(result.index);
              seenIndexes.set(indexId, { line: result.index.startLine, ref: result.index });
            }
          }
          i = result.nextTokenIndex;
          continue;
        }
      }
    }

    // ALTER TABLE ADD CONSTRAINT
    if (token.type === "keyword" && token.value.toUpperCase() === "ALTER") {
      const constraint = extractConstraintFromAlter(tokens, i, filePath, startLine, hashService);
      if (constraint) {
        constraints.push(constraint);
      }
    }

    i++;
  }

  return { tables, columns, indexes, constraints, diagnostics };
}

/**
 * Extract columns from CREATE TABLE definition.
 */
function extractColumnsFromTableDef(
  tokens: SqlToken[],
  tableNameIdx: number,
  tableName: string,
  filePath: string,
  tableLine: number,
  hashService: HashService
): ColumnRef[] {
  const columns: ColumnRef[] = [];

  // Find opening parenthesis
  let parenIdx = -1;
  for (let i = tableNameIdx + 1; i < tokens.length; i++) {
    if (isOpenParen(tokens[i])) {
      parenIdx = i;
      break;
    }
  }

  if (parenIdx < 0) return columns;

  // Process column definitions inside parentheses
  let depth = 1;
  let i = parenIdx + 1;
  let currentColumn: { name: string; type: string; line: number } | null = null;
  let columnKeywords: string[] = [];
  let columnConstraints: { isPrimaryKey: boolean; isForeignKey: boolean; nullable: boolean; references?: { table: string; column: string } } = {
    isPrimaryKey: false,
    isForeignKey: false,
    nullable: true,
  };

  while (i < tokens.length && depth > 0) {
    const token = tokens[i];

    if (isOpenParen(token)) {
      depth++;
    } else if (isCloseParen(token)) {
      depth--;
      if (depth === 0 && currentColumn) {
        finalizeColumn(currentColumn, columnConstraints, tableName, filePath, hashService, columns);
      }
    } else if (isComma(token) && depth === 1) {
      if (currentColumn) {
        finalizeColumn(currentColumn, columnConstraints, tableName, filePath, hashService, columns);
        currentColumn = null;
        columnKeywords = [];
        columnConstraints = { isPrimaryKey: false, isForeignKey: false, nullable: true };
      }
    }

    if (token.type === "keyword") {
      const kw = token.value.toUpperCase();

      if (!currentColumn && kw !== "PRIMARY" && kw !== "FOREIGN" && kw !== "UNIQUE" && kw !== "CHECK" && kw !== "CONSTRAINT") {
        // First keyword after column name might be type - but we need identifier first
        // Skip for now, column name should be identifier
      } else if (currentColumn) {
        columnKeywords.push(kw);

        // Process constraints
        const nextTokenIdx = getNthTokenIndex(tokens, i, 1);
        const nextKeyword = nextTokenIdx >= 0 ? tokens[nextTokenIdx]?.value.toUpperCase() : undefined;

        if (kw === "PRIMARY" && nextKeyword === "KEY") {
          columnConstraints.isPrimaryKey = true;
          columnConstraints.nullable = false;
        }
        if (kw === "NOT" && nextKeyword === "NULL") {
          columnConstraints.nullable = false;
        }
        if (kw === "NULL" && !columnKeywords.includes("NOT")) {
          columnConstraints.nullable = true;
        }
        if (kw === "REFERENCES") {
          // Extract referenced table and column
          const refTableIdx = getNthTokenIndex(tokens, i, 1);
          const refColIdx = getNthTokenIndex(tokens, i, 3); // After table name and parentheses
          if (refTableIdx >= 0) {
            columnConstraints.isForeignKey = true;
            columnConstraints.references = {
              table: cleanIdentifier(tokens[refTableIdx].value),
              column: refColIdx >= 0 ? cleanIdentifier(tokens[refColIdx].value) : "id",
            };
          }
        }
      }
    }

    if (token.type === "identifier" && depth === 1 && !currentColumn) {
      // Potential column name
      // Check if this is actually a constraint declaration
      const prevKeyword = getTokenBefore(tokens, i);
      if (prevKeyword?.value.toUpperCase() === "CONSTRAINT") {
        // Skip constraint name, this is not a column
      } else {
        currentColumn = {
          name: cleanIdentifier(token.value),
          type: "",
          line: token.line ?? tableLine,
        };
        // Get type from next token
        const typeToken = getTokenSkippingWhitespace(tokens, i + 1);
        if (typeToken && (typeToken.type === "keyword" || typeToken.type === "identifier")) {
          currentColumn.type = typeToken.value;
        }
      }
    }

    i++;
  }

  return columns;
}

/**
 * Finalize a column definition and add to columns array.
 */
function finalizeColumn(
  current: { name: string; type: string; line: number },
  constraints: { isPrimaryKey: boolean; isForeignKey: boolean; nullable: boolean; references?: { table: string; column: string } },
  tableName: string,
  filePath: string,
  hashService: HashService,
  columns: ColumnRef[]
): void {
  const columnRef: ColumnRef = {
    id: hashService.fingerprint(`${filePath}:${tableName}:${current.name}:${current.line}`),
    name: current.name,
    type: "column",
    tableName,
    filePath,
    startLine: current.line,
    dataType: normalizeDataType(current.type),
    nullable: constraints.nullable,
    isPrimaryKey: constraints.isPrimaryKey,
    isForeignKey: constraints.isForeignKey,
    references: constraints.references,
  };

  columns.push(columnRef);
}

/**
 * Get token before given index, skipping whitespace.
 */
function getTokenBefore(tokens: SqlToken[], idx: number): SqlToken | null {
  for (let i = idx - 1; i >= 0; i--) {
    if (tokens[i].type !== "whitespace" && tokens[i].type !== "comment") {
      return tokens[i];
    }
  }
  return null;
}

/**
 * Extract index from CREATE INDEX statement.
 */
function extractIndexFromCreate(
  tokens: SqlToken[],
  startIdx: number,
  filePath: string,
  startLine: number,
  hashService: HashService,
  isUnique: boolean = false
): { index: IndexRef | null; nextTokenIndex: number } {
  // CREATE [UNIQUE] INDEX <name> ON <table> (<columns>)

  // Adjust offset for UNIQUE keyword
  const offset = isUnique ? 1 : 0;

  // Get index name
  const idxNameIdx = getNthTokenIndex(tokens, startIdx, 2 + offset);
  if (idxNameIdx < 0 || !isIdentifierLike(tokens[idxNameIdx])) {
    return { index: null, nextTokenIndex: startIdx + 5 };
  }

  const indexName = cleanIdentifier(tokens[idxNameIdx].value);

  // Find ON keyword
  const onIdx = getNthTokenIndex(tokens, startIdx, 3 + offset);
  if (onIdx < 0 || tokens[onIdx]?.value.toUpperCase() !== "ON") {
    return { index: null, nextTokenIndex: startIdx + 5 };
  }

  // Get table name
  const tableNameIdx = getNthTokenIndex(tokens, startIdx, 4 + offset);
  if (tableNameIdx < 0 || !isIdentifierLike(tokens[tableNameIdx])) {
    return { index: null, nextTokenIndex: startIdx + 5 };
  }

  const tableName = cleanIdentifier(tokens[tableNameIdx].value);

  // Find opening parenthesis for columns
  let parenIdx = -1;
  for (let i = tableNameIdx + 1; i < tokens.length; i++) {
    if (isOpenParen(tokens[i])) {
      parenIdx = i;
      break;
    }
  }

  // Extract column names from parentheses
  const indexColumns: string[] = [];
  let closeParenIdx = -1;
  if (parenIdx >= 0) {
    let i = parenIdx + 1;
    while (i < tokens.length) {
      const token = tokens[i];
      if (isCloseParen(token)) {
        closeParenIdx = i;
        break;
      }
      if (token.type === "identifier") {
        indexColumns.push(cleanIdentifier(token.value));
      }
      i++;
    }
  }

  const indexLine = tokens[idxNameIdx].line ?? startLine;

  const indexRef: IndexRef = {
    id: hashService.fingerprint(`${filePath}:index:${indexName}:${indexLine}`),
    name: indexName,
    type: "index",
    tableName,
    filePath,
    startLine: indexLine,
    columns: indexColumns,
    indexType: isUnique ? "unique" : "btree",
    isUnique,
  };

  return {
    index: indexRef,
    nextTokenIndex: closeParenIdx >= 0 ? closeParenIdx : (parenIdx >= 0 ? parenIdx : startIdx),
  };
}

/**
 * Extract constraint from ALTER TABLE ADD CONSTRAINT statement.
 */
function extractConstraintFromAlter(
  tokens: SqlToken[],
  startIdx: number,
  filePath: string,
  startLine: number,
  hashService: HashService
): ConstraintRef | null {
  // ALTER TABLE <table> ADD CONSTRAINT <name> <type> ...

  // Check TABLE keyword
  const tableIdx = getNthTokenIndex(tokens, startIdx, 1);
  if (tableIdx < 0 || tokens[tableIdx]?.value.toUpperCase() !== "TABLE") return null;

  // Get table name
  const tableNameIdx = getNthTokenIndex(tokens, startIdx, 2);
  if (tableNameIdx < 0 || !isIdentifierLike(tokens[tableNameIdx])) return null;

  const tableName = cleanIdentifier(tokens[tableNameIdx].value);

  // Get ADD keyword
  const addIdx = getNthTokenIndex(tokens, startIdx, 3);
  if (addIdx < 0 || tokens[addIdx]?.value.toUpperCase() !== "ADD") return null;

  // Get CONSTRAINT keyword
  const constraintIdx = getNthTokenIndex(tokens, startIdx, 4);
  if (constraintIdx < 0 || tokens[constraintIdx]?.value.toUpperCase() !== "CONSTRAINT") return null;

  // Get constraint name
  const nameIdx = getNthTokenIndex(tokens, startIdx, 5);
  if (nameIdx < 0 || !isIdentifierLike(tokens[nameIdx])) return null;

  const constraintName = cleanIdentifier(tokens[nameIdx].value);

  // Get constraint type keywords
  const typeKeywords: string[] = [];
  let i = nameIdx + 1;
  while (i < tokens.length && i < nameIdx + 10) {
    const token = tokens[i];
    if (token.type === "keyword") {
      typeKeywords.push(token.value);
    }
    if (isOpenParen(token)) {
      // Start of column list - stop type detection
      break;
    }
    i++;
  }

  const constraintType = detectConstraintTypeFromSql(typeKeywords);
  const constraintLine = tokens[nameIdx].line ?? startLine;

  // Extract columns from parentheses
  const constraintColumns: string[] = [];
  let parenIdx = -1;
  for (let j = i; j < tokens.length; j++) {
    if (isOpenParen(tokens[j])) {
      parenIdx = j;
      break;
    }
  }

  if (parenIdx >= 0) {
    let j = parenIdx + 1;
    while (j < tokens.length) {
      const token = tokens[j];
      if (isCloseParen(token)) break;
      if (token.type === "identifier") {
        constraintColumns.push(cleanIdentifier(token.value));
      }
      j++;
    }
  }

  // Extract foreign key references if applicable
  let referencedTable: string | undefined;
  let referencedColumns: string[] | undefined;

  if (constraintType === "foreign_key") {
    // Find REFERENCES keyword
    for (let j = nameIdx + 1; j < tokens.length; j++) {
      if (tokens[j]?.value.toUpperCase() === "REFERENCES") {
        const refTableIdx = getNthTokenIndex(tokens, j, 1);
        if (refTableIdx >= 0) {
          referencedTable = cleanIdentifier(tokens[refTableIdx].value);
          // Find referenced columns in parentheses
          for (let k = refTableIdx + 1; k < tokens.length; k++) {
            if (isOpenParen(tokens[k])) {
              let m = k + 1;
              while (m < tokens.length) {
                if (isCloseParen(tokens[m])) break;
                if (tokens[m].type === "identifier") {
                  const col = cleanIdentifier(tokens[m].value);
                  if (referencedColumns) {
                    referencedColumns.push(col);
                  } else {
                    referencedColumns = [col];
                  }
                }
                m++;
              }
              break;
            }
          }
        }
        break;
      }
    }
  }

  return {
    id: hashService.fingerprint(`${filePath}:constraint:${constraintName}:${constraintLine}`),
    name: constraintName,
    type: "constraint",
    tableName,
    filePath,
    startLine: constraintLine,
    constraintType,
    columns: constraintColumns,
    referencedTable,
    referencedColumns,
  };
}
