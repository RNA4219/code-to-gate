/**
 * Python function parser
 * Parse function definitions and call expressions
 */

import { SymbolNode, GraphRelation } from "./py-parser-types.js";
import { sha256, createEvidence, findBlockEnd } from "./py-parser-helpers.js";
import { getSymbolKind, extractDecorators } from "./py-parser-syntax.js";

/**
 * Parse function definitions
 */
export function parseFunctions(
  lines: string[],
  relPath: string,
  fileId: string,
  symbols: SymbolNode[],
  relations: GraphRelation[],
  classNames: Set<string>,
  currentClass: { name: string; exported: boolean } | null,
  exportedSymbols: Set<string>
): void {
  let symbolIndex = 0;
  const relationIndex = 0;

  // Pattern for: def name(args), async def name(args)
  const funcPattern = /^(async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;

    // Skip comments
    if (trimmed.startsWith("#") || trimmed === "") continue;

    const funcMatch = trimmed.match(funcPattern);
    if (funcMatch) {
      const isAsync = funcMatch[1] !== undefined;
      const funcName = funcMatch[2];

      // Check if this is a method (inside a class)
      const isMethod = currentClass !== null;

      // Get decorators
      const decorators = extractDecorators(lines, i);
      const decoratorStr = decorators.join(" ");

      // Determine exported status
      // In Python, all definitions at module level are "exported"
      // Methods inherit class export status
      const isExported = isMethod ? currentClass!.exported : true;

      // Get indentation
      const indent = line.length - line.trimStart().length;

      // Find end line
      const endLineNum = findBlockEnd(lines, i, indent) + 1;

      symbolIndex++;
      const symbolId = isMethod
        ? `symbol:${relPath}:${currentClass!.name}.${funcName}`
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
      parseCallsInBlock(lines, i, indent, relPath, symbolId, relations, relationIndex);
    }
  }
}

/**
 * Parse call expressions within a function/method body
 */
export function parseCallsInBlock(
  lines: string[],
  startLineIndex: number,
  baseIndent: number,
  relPath: string,
  fromSymbol: string,
  relations: GraphRelation[],
  startIndex: number
): void {
  let relationIndex = startIndex;

  // Pattern for: name(args), obj.method(args), await name(args)
  const callPattern =
    /(?:await\s+)?([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\s*\(/g;

  for (let i = startLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith("#") || trimmed === "") continue;

    // Check indentation
    const indent = line.length - line.trimStart().length;

    // Stop if we're back at same or lower indentation (end of block)
    if (indent <= baseIndent) break;

    // Find all calls in this line
    const matches = trimmed.matchAll(callPattern);
    for (const match of matches) {
      const callName = match[1];
      const lineNum = i + 1;

      relationIndex++;

      relations.push({
        id: `relation:${relPath}:call:${relationIndex}`,
        from: fromSymbol,
        to: `symbol:${callName}`,
        kind: "calls",
        confidence: 0.7,
        evidence: [
          createEvidence(
            `ev-call-${sha256(`${relPath}:${relationIndex}`).slice(0, 8)}`,
            relPath,
            lineNum,
            lineNum
          ),
        ],
      });
    }
  }
}