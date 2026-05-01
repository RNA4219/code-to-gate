/**
 * Python class parser
 * Parse class definitions and methods
 */

import { SymbolNode, GraphRelation } from "./py-parser-types.js";
import { sha256, createEvidence, findBlockEnd } from "./py-parser-helpers.js";
import { getSymbolKind, extractDecorators } from "./py-parser-syntax.js";
import { parseCallsInBlock } from "./py-parser-functions.js";

/**
 * Parse class definitions
 */
export function parseClasses(
  lines: string[],
  relPath: string,
  fileId: string,
  symbols: SymbolNode[],
  relations: GraphRelation[],
  exportedSymbols: Set<string>
): void {
  let symbolIndex = 0;

  // Pattern for: class Name, class Name(Base), class Name(Base1, Base2)
  const classPattern = /^class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\([^)]*\))?/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;

    // Skip comments
    if (trimmed.startsWith("#") || trimmed === "") continue;

    const classMatch = trimmed.match(classPattern);
    if (classMatch) {
      const className = classMatch[1];

      // Get indentation
      const indent = line.length - line.trimStart().length;

      // Find end line
      const endLineNum = findBlockEnd(lines, i, indent) + 1;

      symbolIndex++;
      const classSymbolId = `symbol:${relPath}:${className}`;

      // In Python, classes at module level are "exported"
      const isExported = true;

      symbols.push({
        id: classSymbolId,
        fileId,
        name: className,
        kind: "class",
        exported: isExported,
        location: { startLine: lineNum, endLine: endLineNum },
        evidence: [
          createEvidence(
            `ev-symbol-${sha256(`${relPath}:${className}`).slice(0, 8)}`,
            relPath,
            lineNum,
            endLineNum,
            `node-${symbolIndex}`,
            classSymbolId
          ),
        ],
      });

      exportedSymbols.add(className);

      // Parse methods within class
      const classNames = new Set<string>();
      classNames.add(className);
      const currentClass = { name: className, exported: isExported };

      parseMethodsInClass(
        lines,
        i,
        indent,
        relPath,
        fileId,
        symbols,
        relations,
        currentClass,
        symbolIndex,
        exportedSymbols
      );
    }
  }
}

/**
 * Parse methods within a class body
 */
export function parseMethodsInClass(
  lines: string[],
  classStartIndex: number,
  classIndent: number,
  relPath: string,
  fileId: string,
  symbols: SymbolNode[],
  relations: GraphRelation[],
  currentClass: { name: string; exported: boolean },
  startIndex: number,
  exportedSymbols: Set<string>
): void {
  let symbolIndex = startIndex;

  // Pattern for: def name(self, args), async def name(self, args)
  const methodPattern = /^(async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/;

  for (let i = classStartIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;

    // Skip comments
    if (trimmed.startsWith("#") || trimmed === "") continue;

    // Check indentation - methods should be at class body indent
    const methodIndent = line.length - line.trimStart().length;

    // Stop if we're back at class level or lower
    if (methodIndent <= classIndent) break;

    const methodMatch = trimmed.match(methodPattern);
    if (methodMatch) {
      const isAsync = methodMatch[1] !== undefined;
      const methodName = methodMatch[2];

      // Get decorators
      const decorators = extractDecorators(lines, i);
      const decoratorStr = decorators.join(" ");

      // Find end line
      const endLineNum = findBlockEnd(lines, i, methodIndent) + 1;

      symbolIndex++;
      const methodSymbolId = `symbol:${relPath}:${currentClass.name}.${methodName}`;

      const symbolKind = getSymbolKind(methodName, relPath, true, decoratorStr);

      symbols.push({
        id: methodSymbolId,
        fileId,
        name: methodName,
        kind: symbolKind,
        exported: currentClass.exported,
        async: isAsync,
        location: { startLine: lineNum, endLine: endLineNum },
        evidence: [
          createEvidence(
            `ev-symbol-${sha256(`${relPath}:${currentClass.name}.${methodName}`).slice(0, 8)}`,
            relPath,
            lineNum,
            endLineNum,
            `node-${symbolIndex}`,
            methodSymbolId
          ),
        ],
      });

      // Parse calls within method body
      let relationIndex = 0;
      parseCallsInBlock(
        lines,
        i,
        methodIndent,
        relPath,
        methodSymbolId,
        relations,
        relationIndex
      );
    }
  }
}