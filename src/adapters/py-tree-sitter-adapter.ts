/**
 * Python tree-sitter WASM adapter
 *
 * Provides accurate Python AST parsing using tree-sitter WASM.
 * Uses shared tree-sitter runtime to prevent parallel initialization race conditions.
 * Fallback to regex adapter if WASM not available.
 */

import type {
  SymbolNode,
  GraphRelation,
  EvidenceRef,
  ParseResult,
} from "../types/graph.js";

export type { SymbolNode, GraphRelation, EvidenceRef, ParseResult };
import { sha256 } from "../core/path-utils.js";
import {
  initializeTreeSitterGrammars,
  createParserWithLanguage,
  getLanguageInitStatus,
  isLanguageAvailable,
  type TreeSitterLanguageInitResult,
} from "./tree-sitter-initializer.js";

/**
 * Initialize Python tree-sitter parser
 *
 * Uses shared sequential initialization to prevent WASM race conditions.
 */
export async function initPythonParser(): Promise<boolean> {
  const report = await initializeTreeSitterGrammars();
  const pythonStatus = report.languages.find((l) => l.language === "python");
  return pythonStatus?.available ?? false;
}

/**
 * Get initialization status for diagnostics
 */
export function getPythonInitStatus(): TreeSitterLanguageInitResult | null {
  return getLanguageInitStatus("python");
}

/**
 * Check if tree-sitter is available for Python
 */
export function isTreeSitterAvailable(): boolean {
  return isLanguageAvailable("python");
}

/**
 * Parse Python source using tree-sitter (synchronous)
 *
 * Requires initPythonParser() to be called first.
 */
export function parsePythonFileSync(
  content: string,
  filePath: string
): ParseResult {
  const parser = createParserWithLanguage("python");
  if (!parser) {
    return parsePythonRegexFallback(content, filePath);
  }

  const tree = parser.parse(content);
  const root = tree.rootNode;

  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const diagnostics: ParseResult["diagnostics"] = [];

  if (root.hasError) {
    collectErrors(root, diagnostics);
  }

  extractImportsTreeSitter(root, filePath, symbols, relations);
  extractFunctionsTreeSitter(root, filePath, symbols);
  extractClassesTreeSitter(root, filePath, symbols);

  return {
    symbols,
    relations,
    diagnostics,
    parserStatus: diagnostics.length > 0 ? "parsed" : "parsed",
    parserAdapter: diagnostics.length > 0 ? "py-tree-sitter-wasm-partial" : "py-tree-sitter-wasm",
  };
}

/**
 * Parse Python source using tree-sitter (async wrapper)
 */
export async function parsePythonTreeSitter(
  content: string,
  filePath: string
): Promise<ParseResult> {
  await initPythonParser();
  return parsePythonFileSync(content, filePath);
}

/**
 * Extract import statements from tree-sitter AST
 */
function extractImportsTreeSitter(
  node: any,
  filePath: string,
  symbols: SymbolNode[],
  relations: GraphRelation[]
): void {
  const importNodes = (node.children || []).filter(
    (child: any) => child.type === "import_statement" || child.type === "import_from_statement"
  );

  for (const importNode of importNodes) {
    const line = importNode.startPosition?.row + 1 || 1;
    const endLine = importNode.endPosition?.row + 1 || line;

    if (importNode.type === "import_statement") {
      for (const child of importNode.children || []) {
        if (child.type === "identifier" || child.type === "dotted_name") {
          const moduleName = child.text;
          addImportSymbol(moduleName, filePath, line, endLine, symbols, relations);
        }
      }
    } else if (importNode.type === "import_from_statement") {
      const moduleNode = importNode.childForFieldName?.("module_name");
      if (moduleNode) {
        const moduleName = moduleNode.text;
        relations.push({
          id: `rel:${filePath}:imports:${moduleName}`,
          from: `file:${filePath}`,
          to: `module:${moduleName}`,
          kind: "imports",
          confidence: 1.0,
          evidence: [
            {
              id: `ev-rel-${sha256(moduleName).slice(0, 8)}`,
              path: filePath,
              startLine: line,
              endLine: endLine,
              kind: "ast",
            },
          ],
        });
      }

      for (const child of importNode.children || []) {
        if (child.type === "identifier" || child.type === "dotted_name") {
          if (moduleNode && child.id === moduleNode.id) continue;
          const importedName = child.text;
          addImportSymbol(importedName, filePath, line, endLine, symbols, relations);
        }
      }
    }
  }
}

function addImportSymbol(
  name: string,
  filePath: string,
  line: number,
  endLine: number,
  symbols: SymbolNode[],
  relations: GraphRelation[]
): void {
  const symbolId = `symbol:${filePath}:import:${name}`;
  symbols.push({
    id: symbolId,
    fileId: `file:${filePath}`,
    name,
    kind: "variable",
    exported: false,
    evidence: [
      {
        id: `ev-${sha256(symbolId).slice(0, 8)}`,
        path: filePath,
        startLine: line,
        endLine: endLine,
        kind: "ast",
      },
    ],
  });
  relations.push({
    id: `rel:${filePath}:imports:${name}`,
    from: `file:${filePath}`,
    to: `module:${name}`,
    kind: "imports",
    confidence: 1.0,
    evidence: [
      {
        id: `ev-rel-${sha256(name).slice(0, 8)}`,
        path: filePath,
        startLine: line,
        endLine: endLine,
        kind: "ast",
      },
    ],
  });
}

/**
 * Extract function definitions from tree-sitter AST
 */
function extractFunctionsTreeSitter(
  node: any,
  filePath: string,
  symbols: SymbolNode[]
): void {
  const functionNodes = (node.children || []).filter(
    (child: any) => child.type === "function_definition"
  );

  for (const funcNode of functionNodes) {
    const nameNode = funcNode.childForFieldName?.("name");
    if (!nameNode) continue;

    const name = nameNode.text;
    const line = funcNode.startPosition?.row + 1 || 1;
    const endLine = funcNode.endPosition?.row + 1 || line;
    const symbolId = `symbol:${filePath}:function:${name}`;

    const isAsync = (funcNode.children || []).some(
      (child: any) => child.type === "async"
    );

    const paramsNode = funcNode.childForFieldName?.("parameters");
    const parameterTypes: Array<{ name: string; type: string }> = [];
    if (paramsNode) {
      for (const param of paramsNode.children || []) {
        if (param.type === "identifier" || param.type === "typed_parameter") {
          const paramName = param.childForFieldName?.("name")?.text || param.text;
          const paramType = param.childForFieldName?.("type")?.text || "unknown";
          parameterTypes.push({ name: paramName, type: paramType });
        }
      }
    }

    const returnTypeNode = funcNode.childForFieldName?.("return_type");
    const returnType = returnTypeNode ? returnTypeNode.text : "unknown";

    symbols.push({
      id: symbolId,
      fileId: `file:${filePath}`,
      name,
      kind: "function",
      exported: false,
      async: isAsync,
      location: { startLine: line, endLine: endLine },
      evidence: [
        {
          id: `ev-${sha256(symbolId).slice(0, 8)}`,
          path: filePath,
          startLine: line,
          endLine: endLine,
          kind: "ast",
        },
      ],
      typeInfo: {
        returnType,
        parameterTypes,
      },
    });
  }
}

/**
 * Extract class definitions from tree-sitter AST
 */
function extractClassesTreeSitter(
  node: any,
  filePath: string,
  symbols: SymbolNode[]
): void {
  const classNodes = (node.children || []).filter((child: any) => child.type === "class_definition");

  for (const classNode of classNodes) {
    const nameNode = classNode.childForFieldName?.("name");
    if (!nameNode) continue;

    const name = nameNode.text;
    const line = classNode.startPosition?.row + 1 || 1;
    const endLine = classNode.endPosition?.row + 1 || line;
    const symbolId = `symbol:${filePath}:class:${name}`;

    const inherits: string[] = [];
    for (const child of classNode.children || []) {
      if (child.type === "argument_list") {
        for (const arg of child.children || []) {
          if (arg.type === "identifier" || arg.type === "dotted_name") {
            inherits.push(arg.text);
          }
        }
      }
    }

    symbols.push({
      id: symbolId,
      fileId: `file:${filePath}`,
      name,
      kind: "class",
      exported: false,
      location: { startLine: line, endLine: endLine },
      evidence: [
        {
          id: `ev-${sha256(symbolId).slice(0, 8)}`,
          path: filePath,
          startLine: line,
          endLine: endLine,
          kind: "ast",
        },
      ],
      typeInfo: inherits.length > 0 ? { implements: inherits } : undefined,
    });

    for (const child of classNode.children || []) {
      if (child.type === "block") {
        extractMethodsTreeSitter(child, filePath, name, symbols);
      }
    }
  }
}

/**
 * Extract method definitions from class body
 */
function extractMethodsTreeSitter(
  bodyNode: any,
  filePath: string,
  className: string,
  symbols: SymbolNode[]
): void {
  const methodNodes = (bodyNode.children || []).filter(
    (child: any) => child.type === "function_definition"
  );

  for (const methodNode of methodNodes) {
    const nameNode = methodNode.childForFieldName?.("name");
    if (!nameNode) continue;

    const name = nameNode.text;
    const line = methodNode.startPosition?.row + 1 || 1;
    const endLine = methodNode.endPosition?.row + 1 || line;
    const symbolId = `symbol:${filePath}:method:${className}.${name}`;

    const isAsync = (methodNode.children || []).some((child: any) => child.type === "async");

    symbols.push({
      id: symbolId,
      fileId: `file:${filePath}`,
      name: `${className}.${name}`,
      kind: "method",
      exported: false,
      async: isAsync,
      location: { startLine: line, endLine: endLine },
      evidence: [
        {
          id: `ev-${sha256(symbolId).slice(0, 8)}`,
          path: filePath,
          startLine: line,
          endLine: endLine,
          kind: "ast",
        },
      ],
    });
  }
}

/**
 * Collect syntax errors from tree
 */
function collectErrors(
  node: any,
  diagnostics: Array<{
    id: string;
    severity: "info" | "warning" | "error";
    code: string;
    message: string;
    evidence?: EvidenceRef[];
  }>
): void {
  for (const child of node.children || []) {
    if (child.isError || child.type === "ERROR") {
      const line = (child.startPosition?.row || 0) + 1;
      diagnostics.push({
        id: `err-${line}`,
        severity: "error",
        code: "PARSER_FAILED",
        message: `Syntax error at line ${line}`,
      });
    }
    if (child.children?.length > 0) {
      collectErrors(child, diagnostics);
    }
  }
}

/**
 * Regex fallback parser (when WASM unavailable)
 */
function parsePythonRegexFallback(
  content: string,
  filePath: string
): ParseResult {
  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const diagnostics: ParseResult["diagnostics"] = [];

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    const importMatch = line.match(/^import\s+([\w.]+)/);
    if (importMatch) {
      addImportSymbol(importMatch[1], filePath, lineNum, lineNum, symbols, relations);
    }

    const fromImportMatch = line.match(/^from\s+([\w.]+)\s+import\s+(.+)/);
    if (fromImportMatch) {
      const names = fromImportMatch[2].split(",").map((n) => n.trim());
      for (const name of names) {
        addImportSymbol(name, filePath, lineNum, lineNum, symbols, relations);
      }
    }

    const funcMatch = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(/);
    if (funcMatch) {
      const name = funcMatch[1];
      const symbolId = `symbol:${filePath}:function:${name}`;
      symbols.push({
        id: symbolId,
        fileId: `file:${filePath}`,
        name,
        kind: "function",
        exported: false,
        async: line.startsWith("async"),
        location: { startLine: lineNum, endLine: lineNum },
        evidence: [
          {
            id: `ev-${sha256(symbolId).slice(0, 8)}`,
            path: filePath,
            startLine: lineNum,
            endLine: lineNum,
            kind: "text",
          },
        ],
      });
    }

    const classMatch = line.match(/^class\s+(\w+)(?:\s*\(([^)]*)\))?/);
    if (classMatch) {
      const name = classMatch[1];
      const inherits = classMatch[2] ? classMatch[2].split(",").map((n) => n.trim()) : [];
      const symbolId = `symbol:${filePath}:class:${name}`;
      symbols.push({
        id: symbolId,
        fileId: `file:${filePath}`,
        name,
        kind: "class",
        exported: false,
        location: { startLine: lineNum, endLine: lineNum },
        evidence: [
          {
            id: `ev-${sha256(symbolId).slice(0, 8)}`,
            path: filePath,
            startLine: lineNum,
            endLine: lineNum,
            kind: "text",
          },
        ],
        typeInfo: {
          implements: inherits,
        },
      });
    }
  }

  return {
    symbols,
    relations,
    diagnostics,
    parserStatus: "parsed",
    parserAdapter: "py-regex-fallback",
  };
}
