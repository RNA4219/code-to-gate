/**
 * Python file parser using regex-based AST extraction
 *
 * Supports:
 * - Import statements: import X, from X import Y, from X import Y as Z
 * - Function definitions: def name(), async def name()
 * - Class definitions: class Name, class Name(Base)
 * - Class methods: def method(self), async def method(self)
 * - Entrypoints: if __name__ == "__main__":, FastAPI/Flask routes
 *
 * This module orchestrates parsing by delegating to specialized parsers.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

// Types
export {
  EvidenceRef,
  SymbolNode,
  GraphRelation,
  ParseResult,
} from "./py-parser-types.js";

// Helpers
import { sha256, toPosix, createEvidence, findBlockEnd } from "./py-parser-helpers.js";

// Syntax utilities
import { getSymbolKind, extractDecorators } from "./py-parser-syntax.js";

// Parsers
import { parseImports } from "./py-parser-imports.js";
import { parseClasses, parseMethodsInClass } from "./py-parser-classes.js";
import { parseFunctions, parseCallsInBlock } from "./py-parser-functions.js";
import { parseVariables, parseTypes } from "./py-parser-variables.js";
import { parseEntrypoints } from "./py-parser-entrypoints.js";

// Types for internal use
import type {
  SymbolNode,
  GraphRelation,
  ParseResult,
} from "./py-parser-types.js";

/**
 * Main export function to parse Python files
 */
export function parsePythonFile(
  filePath: string,
  repoRoot: string,
  fileId: string
): ParseResult {
  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const diagnostics: ParseResult["diagnostics"] = [];
  const exportedSymbols = new Set<string>();

  const relPath = toPosix(path.relative(repoRoot, filePath));

  try {
    const content = readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);

    // Check for syntax errors (basic check)
    // Count parentheses, brackets, braces for balance
    let parenCount = 0;
    let bracketCount = 0;
    let braceCount = 0;
    let inTripleString = false;
    let tripleStringChar = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Handle triple-quoted strings
      // Check for both opening and closing on the same line
      const hasTripleQuote = line.includes('"""') || line.includes("'''");
      if (hasTripleQuote) {
        if (!inTripleString) {
          // Starting a triple-quoted string
          inTripleString = true;
          tripleStringChar = line.includes('"""') ? '"""' : "'''";
          // Check if it also closes on the same line
          const count = (line.match(new RegExp(tripleStringChar, 'g')) || []).length;
          if (count >= 2) {
            inTripleString = false;
          }
        } else if (line.includes(tripleStringChar)) {
          // Closing a triple-quoted string
          inTripleString = false;
        }
        // Still process the line for bracket counting (except for multi-line strings)
        if (inTripleString) continue;
      }

      if (inTripleString) continue;

      // Count brackets (skip comments)
      const codeOnly = line.split("#")[0];
      for (const char of codeOnly) {
        if (char === "(") parenCount++;
        if (char === ")") parenCount--;
        if (char === "[") bracketCount++;
        if (char === "]") bracketCount--;
        if (char === "{") braceCount++;
        if (char === "}") braceCount--;
      }
    }

    // If brackets are unbalanced, mark as potential syntax error
    if (parenCount !== 0 || bracketCount !== 0 || braceCount !== 0) {
      diagnostics.push({
        id: `diag:${relPath}:syntax-warning`,
        severity: "warning",
        code: "UNBALANCED_BRACKETS",
        message: `Potential syntax error: unbalanced brackets (paren: ${parenCount}, bracket: ${bracketCount}, brace: ${braceCount})`,
        evidence: [
          {
            id: `ev-syntax-${sha256(relPath).slice(0, 8)}`,
            path: relPath,
            kind: "ast",
          },
        ],
      });
    }

    // Parse imports
    parseImports(content, lines, relPath, fileId, relations);

    // Parse classes first (to track class context)
    parseClasses(lines, relPath, fileId, symbols, relations, exportedSymbols);

    // Get class names for filtering
    const classNames = new Set<string>();
    symbols.filter((s) => s.kind === "class").forEach((s) => classNames.add(s.name));

    // Parse standalone functions (not inside classes)
    // Track indentation to determine if inside a class
    let inClass = false;
    let classIndent = 0;
    const classBodyIndents = new Map<number, string>(); // indent -> className

    // Build a map of class start lines and their indentation
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const indent = line.length - line.trimStart().length;

      if (trimmed.startsWith("class ")) {
        const classMatch = trimmed.match(/^class\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (classMatch) {
          classBodyIndents.set(indent, classMatch[1]);
        }
      }
    }

    // Now parse functions, tracking class context by indentation
    let symbolIndex = symbols.length;
    const funcPattern = /^(async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const indent = line.length - line.trimStart().length;
      const lineNum = i + 1;

      if (trimmed.startsWith("#") || trimmed === "") continue;

      // Update class context based on indentation
      // Check if we're inside a class body
      let currentClassName: string | null = null;
      for (const [classStartIndent, className] of classBodyIndents) {
        if (indent > classStartIndent) {
          currentClassName = className;
          break;
        }
      }

      const funcMatch = trimmed.match(funcPattern);
      if (funcMatch) {
        const isAsync = funcMatch[1] !== undefined;
        const funcName = funcMatch[2];
        const isMethod = currentClassName !== null;

        // Skip if already added as a method in parseClasses
        if (isMethod && symbols.some((s) => s.id === `symbol:${relPath}:${currentClassName}.${funcName}`)) {
          continue;
        }

        // Get decorators
        const decorators = extractDecorators(lines, i);
        const decoratorStr = decorators.join(" ");

        const isExported = isMethod ? true : true; // All are exported in Python
        const endLineNum = findBlockEnd(lines, i, indent) + 1;

        symbolIndex++;
        const symbolId = isMethod
          ? `symbol:${relPath}:${currentClassName}.${funcName}`
          : `symbol:${relPath}:${funcName}`;

        const symbolKind = getSymbolKind(funcName, relPath, isMethod, decoratorStr);

        symbols.push({
          id: symbolId,
          fileId,
          name: funcName,
          kind: symbolKind,
          exported: isExported,
          async: isAsync,
          location: { startLine: lineNum, endLine: endLineNum },
          evidence: [
            createEvidence(
              `ev-symbol-${sha256(`${relPath}:${funcName}`).slice(0, 8)}`,
              relPath,
              lineNum,
              endLineNum,
              `node-${symbolIndex}`,
              symbolId
            ),
          ],
        });

        if (isExported) {
          exportedSymbols.add(funcName);
        }

        // Parse calls within function body
        let relationIndex = relations.length;
        parseCallsInBlock(lines, i, indent, relPath, symbolId, relations, relationIndex);
      }
    }

    // Parse types (TypedDict, dataclass)
    parseTypes(lines, relPath, fileId, symbols, exportedSymbols);

    // Parse variables
    parseVariables(lines, relPath, fileId, symbols, exportedSymbols);

    // Parse entrypoints
    parseEntrypoints(lines, relPath, fileId, relations);

    // Add export relations for exported symbols
    let exportIndex = 0;
    for (const symName of exportedSymbols) {
      exportIndex++;
      const symbol = symbols.find((s) => s.name === symName);
      if (symbol) {
        relations.push({
          id: `relation:${relPath}:export:${symName}`,
          from: fileId,
          to: symbol.id,
          kind: "exports",
          confidence: 1.0,
          evidence: [
            createEvidence(
              `ev-export-${sha256(`${relPath}:${symName}`).slice(0, 8)}`,
              relPath,
              symbol.location?.startLine ?? 1,
              symbol.location?.endLine ?? 1
            ),
          ],
        });
      }
    }

    // Determine parser status
    const hasErrors = diagnostics.some((d) => d.severity === "error");
    const parserStatus = hasErrors ? "failed" : "parsed";

    return {
      symbols,
      relations,
      diagnostics,
      parserStatus,
      parserAdapter: "py-regex-v0",
    };
  } catch (error) {
    diagnostics.push({
      id: `diag:${relPath}:parse-error`,
      severity: "error",
      code: "PARSER_FAILED",
      message: error instanceof Error ? error.message : String(error),
      evidence: [
        {
          id: `ev-parse-error-${sha256(relPath).slice(0, 8)}`,
          path: relPath,
          kind: "ast",
        },
      ],
    });

    return {
      symbols,
      relations,
      diagnostics,
      parserStatus: "failed",
      parserAdapter: "py-regex-v0",
    };
  }
}