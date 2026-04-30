/**
 * Python file parser using regex-based AST extraction
 *
 * Supports:
 * - Import statements: import X, from X import Y, from X import Y as Z
 * - Function definitions: def name(), async def name()
 * - Class definitions: class Name, class Name(Base)
 * - Class methods: def method(self), async def method(self)
 * - Entrypoints: if __name__ == "__main__":, FastAPI/Flask routes
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export interface EvidenceRef {
  id: string;
  path: string;
  startLine?: number;
  endLine?: number;
  kind: "ast" | "text" | "import" | "external" | "test" | "coverage" | "diff";
  excerptHash?: string;
  nodeId?: string;
  symbolId?: string;
  externalRef?: {
    tool: string;
    ruleId?: string;
    url?: string;
  };
}

export interface SymbolNode {
  id: string;
  fileId: string;
  name: string;
  kind:
    | "function"
    | "class"
    | "method"
    | "variable"
    | "type"
    | "interface"
    | "route"
    | "test"
    | "unknown";
  exported: boolean;
  async?: boolean;
  location?: {
    startLine: number;
    endLine: number;
  };
  evidence: EvidenceRef[];
}

export interface GraphRelation {
  id: string;
  from: string;
  to: string;
  kind:
    | "imports"
    | "exports"
    | "calls"
    | "references"
    | "tests"
    | "configures"
    | "depends_on";
  confidence: number;
  evidence: EvidenceRef[];
}

export interface ParseResult {
  symbols: SymbolNode[];
  relations: GraphRelation[];
  diagnostics: Array<{
    id: string;
    severity: "info" | "warning" | "error";
    code: string;
    message: string;
    evidence?: EvidenceRef[];
  }>;
  parserStatus: "parsed" | "text_fallback" | "skipped" | "failed";
  parserAdapter: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

function createEvidence(
  id: string,
  filePath: string,
  startLine: number,
  endLine: number,
  nodeId?: string,
  symbolId?: string
): EvidenceRef {
  const excerptHash = sha256(`${filePath}:${startLine}-${endLine}`);
  return {
    id,
    path: filePath,
    startLine,
    endLine,
    kind: "ast",
    excerptHash,
    nodeId,
    symbolId,
  };
}

/**
 * Get the symbol kind based on name and context
 */
function getSymbolKind(
  name: string,
  filePath: string,
  isMethod: boolean,
  decorator?: string
): SymbolNode["kind"] {
  // Check if it's a test file
  if (
    filePath.includes("/tests/") ||
    filePath.includes("/test/") ||
    filePath.includes("_test.py") ||
    filePath.includes("test_") ||
    filePath.endsWith(".spec.py")
  ) {
    return "test";
  }

  // Check decorators for route handlers
  if (decorator) {
    const routeDecorators = [
      "@app.route",
      "@app.get",
      "@app.post",
      "@app.put",
      "@app.delete",
      "@app.patch",
      "@router.route",
      "@router.get",
      "@router.post",
      "@router.put",
      "@router.delete",
      "@router.patch",
      "@route",
    ];
    for (const routeDec of routeDecorators) {
      if (decorator.includes(routeDec)) {
        return "route";
      }
    }
  }

  // Check name patterns for route handlers
  const routePatterns = ["route", "handler", "controller", "endpoint", "view"];
  for (const pattern of routePatterns) {
    if (name.toLowerCase().includes(pattern)) {
      return "route";
    }
  }

  // Check name patterns for tests
  if (name.startsWith("test_") || name.endsWith("_test")) {
    return "test";
  }

  // Class methods
  if (isMethod) {
    return "method";
  }

  return "function";
}

/**
 * Check if a function/class is decorated as a route
 */
function isRouteDecorator(decorator: string): boolean {
  const routeDecorators = [
    "@app.route",
    "@app.get",
    "@app.post",
    "@app.put",
    "@app.delete",
    "@app.patch",
    "@router.route",
    "@router.get",
    "@router.post",
    "@router.put",
    "@router.delete",
    "@router.patch",
  ];
  return routeDecorators.some((d) => decorator.includes(d));
}

/**
 * Extract decorators preceding a definition
 */
function extractDecorators(
  lines: string[],
  startLineIndex: number
): string[] {
  const decorators: string[] = [];
  let currentLine = startLineIndex - 1;

  while (currentLine >= 0) {
    const line = lines[currentLine].trim();
    if (line.startsWith("@")) {
      decorators.push(line);
      currentLine--;
    } else if (line === "" || line.startsWith("#")) {
      currentLine--;
    } else {
      break;
    }
  }

  return decorators.reverse();
}

/**
 * Find the end line of a function/class by matching indentation
 */
function findBlockEnd(
  lines: string[],
  startLineIndex: number,
  baseIndent: number
): number {
  let endLine = startLineIndex;

  for (let i = startLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    // Calculate indentation
    const indent = line.length - line.trimStart().length;

    // If we hit a line with same or less indentation that's not a continuation, we're done
    if (indent <= baseIndent && !trimmed.startsWith("elif") && !trimmed.startsWith("else") && !trimmed.startsWith("except") && !trimmed.startsWith("finally")) {
      return endLine;
    }

    endLine = i;
  }

  return endLine;
}

/**
 * Parse import statements
 */
function parseImports(
  content: string,
  lines: string[],
  relPath: string,
  fileId: string,
  relations: GraphRelation[]
): void {
  let relationIndex = 0;

  // Pattern for: import X, import X as Y, import X.Y
  const basicImportPattern = /^import\s+([a-zA-Z_][a-zA-Z0-9_.]*(?:\s+as\s+[a-zA-Z_][a-zA-Z0-9_]*)?(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_.]*(?:\s+as\s+[a-zA-Z_][a-zA-Z0-9_]*)?)*)/;

  // Pattern for: from X import Y, from X import Y as Z, from X import Y, Z
  const fromImportPattern = /^from\s+([a-zA-Z_][a-zA-Z0-9_.]*(?:\.\.[a-zA-Z_][a-zA-Z0-9_.]*)*)\s+import\s+(.+)/;

  // Pattern for relative imports: from .X import Y, from .. import X
  const relativeImportPattern = /^from\s+(\.{1,2}[a-zA-Z_][a-zA-Z0-9_.]*)\s+import\s+(.+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // Skip comments
    if (line.startsWith("#") || line === "") continue;

    // Check for basic import: import X
    const basicMatch = line.match(basicImportPattern);
    if (basicMatch) {
      relationIndex++;
      const imports = basicMatch[1].split(",").map((s) => s.trim());

      for (const imp of imports) {
        const parts = imp.split(/\s+as\s+/);
        const moduleName = parts[0];
        const alias = parts.length > 1 ? parts[1] : undefined;

        relations.push({
          id: `relation:${relPath}:import:${relationIndex}`,
          from: fileId,
          to: moduleName,
          kind: "imports",
          confidence: 1.0,
          evidence: [
            createEvidence(
              `ev-import-${sha256(`${relPath}:${relationIndex}`).slice(0, 8)}`,
              relPath,
              lineNum,
              lineNum
            ),
          ],
        });

        if (alias) {
          relations.push({
            id: `relation:${relPath}:import-alias:${relationIndex}`,
            from: fileId,
            to: `symbol:${moduleName}:${alias}`,
            kind: "references",
            confidence: 0.9,
            evidence: [
              createEvidence(
                `ev-import-alias-${sha256(`${relPath}:${alias}`).slice(0, 8)}`,
                relPath,
                lineNum,
                lineNum
              ),
            ],
          });
        }
      }
    }

    // Check for from import: from X import Y
    const fromMatch = line.match(fromImportPattern);
    if (fromMatch && !line.match(relativeImportPattern)) {
      relationIndex++;
      const moduleName = fromMatch[1];
      const importSpec = fromMatch[2];

      // Parse import specifications
      // Handle: Y, Y as Z, Y, Z as W
      const symbols = importSpec
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("*"));

      relations.push({
        id: `relation:${relPath}:from-import:${relationIndex}`,
        from: fileId,
        to: moduleName,
        kind: "imports",
        confidence: 1.0,
        evidence: [
          createEvidence(
            `ev-import-${sha256(`${relPath}:${relationIndex}`).slice(0, 8)}`,
            relPath,
            lineNum,
            lineNum
          ),
        ],
      });

      for (const sym of symbols) {
        const parts = sym.split(/\s+as\s+/);
        const symbolName = parts[0];
        const alias = parts.length > 1 ? parts[1] : undefined;

        relations.push({
          id: `relation:${relPath}:import-symbol:${symbolName}:${relationIndex}`,
          from: fileId,
          to: `symbol:${moduleName}:${symbolName}`,
          kind: "references",
          confidence: 0.9,
          evidence: [
            createEvidence(
              `ev-import-symbol-${sha256(`${relPath}:${symbolName}`).slice(0, 8)}`,
              relPath,
              lineNum,
              lineNum
            ),
          ],
        });

        if (alias) {
          relations.push({
            id: `relation:${relPath}:import-alias:${alias}:${relationIndex}`,
            from: fileId,
            to: `symbol:${moduleName}:${symbolName}`,
            kind: "references",
            confidence: 0.9,
            evidence: [
              createEvidence(
                `ev-import-alias-${sha256(`${relPath}:${alias}`).slice(0, 8)}`,
                relPath,
                lineNum,
                lineNum
              ),
            ],
          });
        }
      }
    }

    // Check for relative imports: from .X import Y, from ..X import Y
    const relativeMatch = line.match(relativeImportPattern);
    if (relativeMatch) {
      relationIndex++;
      const moduleName = relativeMatch[1];
      const importSpec = relativeMatch[2];

      relations.push({
        id: `relation:${relPath}:relative-import:${relationIndex}`,
        from: fileId,
        to: moduleName,
        kind: "imports",
        confidence: 0.8,
        evidence: [
          createEvidence(
            `ev-import-${sha256(`${relPath}:${relationIndex}`).slice(0, 8)}`,
            relPath,
            lineNum,
            lineNum
          ),
        ],
      });

      const symbols = importSpec
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("*"));

      for (const sym of symbols) {
        relations.push({
          id: `relation:${relPath}:import-symbol:${sym}:${relationIndex}`,
          from: fileId,
          to: `symbol:${moduleName}:${sym}`,
          kind: "references",
          confidence: 0.85,
          evidence: [
            createEvidence(
              `ev-import-symbol-${sha256(`${relPath}:${sym}`).slice(0, 8)}`,
              relPath,
              lineNum,
              lineNum
            ),
          ],
        });
      }
    }
  }
}

/**
 * Parse function definitions
 */
function parseFunctions(
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
  let relationIndex = 0;

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

      const symbolKind = getSymbolKind(
        funcName,
        relPath,
        isMethod,
        decoratorStr
      );

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
      parseCallsInBlock(
        lines,
        i,
        indent,
        relPath,
        symbolId,
        relations,
        relationIndex
      );
    }
  }
}

/**
 * Parse call expressions within a function/method body
 */
function parseCallsInBlock(
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
  const callPattern = /(?:await\s+)?([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\s*\(/g;

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

/**
 * Parse class definitions
 */
function parseClasses(
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
function parseMethodsInClass(
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

      const symbolKind = getSymbolKind(
        methodName,
        relPath,
        true,
        decoratorStr
      );

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

/**
 * Parse variable assignments
 */
function parseVariables(
  lines: string[],
  relPath: string,
  fileId: string,
  symbols: SymbolNode[],
  exportedSymbols: Set<string>
): void {
  let symbolIndex = 0;

  // Pattern for: name = value, name: Type = value
  const varPattern = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:[:]\s*[a-zA-Z_][a-zA-Z0-9_\[\],\s]*)?\s*=/;

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
      if (["self", "__init__", "__name__", "__file__", "__doc__"].includes(varName)) continue;

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
function parseTypes(
  lines: string[],
  relPath: string,
  fileId: string,
  symbols: SymbolNode[],
  exportedSymbols: Set<string>
): void {
  let symbolIndex = 0;

  // Pattern for: class Name(TypedDict), @dataclass class Name
  const typedDictPattern = /^class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*TypedDict\s*\)/;
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

/**
 * Check for entrypoint patterns
 */
function parseEntrypoints(
  lines: string[],
  relPath: string,
  fileId: string,
  relations: GraphRelation[]
): void {
  let relationIndex = 0;

  // Pattern for: if __name__ == "__main__":
  const mainPattern = /^if\s+__name__\s*==\s*["']__main__["']\s*:/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    if (mainPattern.test(line)) {
      relationIndex++;
      relations.push({
        id: `relation:${relPath}:entrypoint:${relationIndex}`,
        from: fileId,
        to: `entrypoint:__main__`,
        kind: "configures",
        confidence: 1.0,
        evidence: [
          createEvidence(
            `ev-entrypoint-${sha256(`${relPath}:${lineNum}`).slice(0, 8)}`,
            relPath,
            lineNum,
            lineNum
          ),
        ],
      });
    }

    // FastAPI/Flask app initialization
    const appPatterns = [
      /app\s*=\s*FastAPI\s*\(/,
      /app\s*=\s*Flask\s*\(/,
      /router\s*=\s*APIRouter\s*\(/,
      /app\.run\s*\(/,
      /uvicorn\.run\s*\(/,
    ];

    for (const pattern of appPatterns) {
      if (pattern.test(line)) {
        relationIndex++;
        relations.push({
          id: `relation:${relPath}:framework:${relationIndex}`,
          from: fileId,
          to: `framework:${pattern.source}`,
          kind: "configures",
          confidence: 0.9,
          evidence: [
            createEvidence(
              `ev-framework-${sha256(`${relPath}:${lineNum}`).slice(0, 8)}`,
              relPath,
              lineNum,
              lineNum
            ),
          ],
        });
      }
    }
  }
}

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

      // Skip triple-quoted strings
      if (line.includes('"""') || line.includes("'''")) {
        if (!inTripleString) {
          inTripleString = true;
          tripleStringChar = line.includes('"""') ? '"""' : "'''";
        } else if (line.includes(tripleStringChar)) {
          inTripleString = false;
        }
        continue;
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