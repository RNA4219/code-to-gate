/**
 * Python variable and type parser
 * Parse variable assignments and type definitions
 */

import { SymbolNode } from "./py-parser-types.js";
import { sha256, createEvidence, findBlockEnd } from "./py-parser-helpers.js";
import { extractDecorators } from "./py-parser-syntax.js";

/**
 * Parse variable assignments
 */
export function parseVariables(
  lines: string[],
  relPath: string,
  fileId: string,
  symbols: SymbolNode[],
  exportedSymbols: Set<string>
): void {
  let symbolIndex = 0;

  // Pattern for: name = value, name: Type = value
  const varPattern =
    /^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:[:]\s*[a-zA-Z_][a-zA-Z0-9_[\],\s]*)?\s*=/;

  // Skip patterns that are not simple assignments
  const skipPatterns = [
    /^def\s+/,
    /^class\s+/,
    /^async\s+def\s+/,
    /^for\s+/,
    /^while\s+/,
    /^if\s+/,
    /^elif\s+/,
    /^else\s+/,
    /^try\s+/,
    /^except\s+/,
    /^finally\s+/,
    /^with\s+/,
    /^return\s+/,
    /^import\s+/,
    /^from\s+/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;

    // Skip comments
    if (trimmed.startsWith("#") || trimmed === "") continue;

    // Check if line matches skip patterns
    for (const pattern of skipPatterns) {
      if (pattern.test(trimmed)) continue;
    }

    const varMatch = trimmed.match(varPattern);
    if (varMatch) {
      const varName = varMatch[1];

      // Skip if already defined as function or class
      if (exportedSymbols.has(varName)) continue;

      // Skip common Python built-ins and special names
      if (
        ["self", "__init__", "__name__", "__file__", "__doc__"].includes(varName)
      )
        continue;

      symbolIndex++;
      const symbolId = `symbol:${relPath}:${varName}`;

      // Check if it's a lambda assignment
      const isLambda = /\s*=\s*lambda\s/.test(trimmed);

      symbols.push({
        id: symbolId,
        fileId,
        name: varName,
        kind: isLambda ? "function" : "variable",
        exported: true,
        location: { startLine: lineNum, endLine: lineNum },
        evidence: [
          createEvidence(
            `ev-symbol-${sha256(`${relPath}:${varName}`).slice(0, 8)}`,
            relPath,
            lineNum,
            lineNum,
            `node-${symbolIndex}`,
            symbolId
          ),
        ],
      });

      exportedSymbols.add(varName);
    }
  }
}

/**
 * Parse class/type definitions (TypedDict, dataclass)
 */
export function parseTypes(
  lines: string[],
  relPath: string,
  fileId: string,
  symbols: SymbolNode[],
  exportedSymbols: Set<string>
): void {
  let symbolIndex = 0;

  // Pattern for: class Name(TypedDict), @dataclass class Name
  const typedDictPattern =
    /^class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*TypedDict\s*\)/;
  const dataclassPattern = /@dataclass/;
  const classPattern = /^class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\([^)]*\))?/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;

    // Skip comments
    if (trimmed.startsWith("#") || trimmed === "") continue;

    // Check for TypedDict
    const typedDictMatch = trimmed.match(typedDictPattern);
    if (typedDictMatch) {
      const typeName = typedDictMatch[1];
      const indent = line.length - line.trimStart().length;
      const endLineNum = findBlockEnd(lines, i, indent) + 1;

      symbolIndex++;
      const symbolId = `symbol:${relPath}:${typeName}`;

      symbols.push({
        id: symbolId,
        fileId,
        name: typeName,
        kind: "type",
        exported: true,
        location: { startLine: lineNum, endLine: endLineNum },
        evidence: [
          createEvidence(
            `ev-symbol-${sha256(`${relPath}:${typeName}`).slice(0, 8)}`,
            relPath,
            lineNum,
            endLineNum,
            `node-${symbolIndex}`,
            symbolId
          ),
        ],
      });

      exportedSymbols.add(typeName);
      continue;
    }

    // Check for dataclass
    const decorators = extractDecorators(lines, i);
    if (decorators.some((d) => dataclassPattern.test(d))) {
      const classMatch = trimmed.match(classPattern);
      if (classMatch) {
        const className = classMatch[1];
        const indent = line.length - line.trimStart().length;
        const endLineNum = findBlockEnd(lines, i, indent) + 1;

        symbolIndex++;
        const symbolId = `symbol:${relPath}:${className}`;

        // Update existing class symbol to be a type if it exists
        const existingClass = symbols.find((s) => s.id === symbolId);
        if (existingClass) {
          existingClass.kind = "type";
        } else {
          symbols.push({
            id: symbolId,
            fileId,
            name: className,
            kind: "type",
            exported: true,
            location: { startLine: lineNum, endLine: endLineNum },
            evidence: [
              createEvidence(
                `ev-symbol-${sha256(`${relPath}:${className}`).slice(0, 8)}`,
                relPath,
                lineNum,
                endLineNum,
                `node-${symbolIndex}`,
                symbolId
              ),
            ],
          });
          exportedSymbols.add(className);
        }
      }
    }
  }
}