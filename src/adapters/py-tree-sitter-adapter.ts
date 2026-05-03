/**
 * Python tree-sitter WASM adapter
 *
 * Provides accurate Python AST parsing using tree-sitter WASM.
 * Fallback to regex adapter if WASM not available.
 */

import type {
  SymbolNode,
  GraphRelation,
  EvidenceRef,
} from "../types/graph.js";

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
import { sha256 } from "../core/path-utils.js";
import { resolveWasmPath } from "./tree-sitter-wasm-resolver.js";

// Dynamic import for web-tree-sitter
let ParserClass: any = null;
let LanguageClass: any = null;
let parserInstance: any = null;
let pythonLanguage: any = null;
let isInitialized = false;

/**
 * Initialize tree-sitter parser with Python grammar
 */
export async function initPythonParser(): Promise<boolean> {
  if (isInitialized) {
    return parserInstance !== null;
  }

  try {
    // Dynamic import - get Parser and Language classes from module
    const module = await import("web-tree-sitter");
    ParserClass = module.Parser;
    LanguageClass = module.Language;

    await ParserClass.init();
    parserInstance = new ParserClass();

    // Load Python grammar - use local file in Node.js, CDN in browser
    const wasmUrl = resolveWasmPath("python");
    pythonLanguage = await LanguageClass.load(wasmUrl);
    parserInstance.setLanguage(pythonLanguage);

    isInitialized = true;
    return true;
  } catch (error: any) {
    console.warn("tree-sitter WASM init failed, using regex fallback:", error?.message || error);
    isInitialized = true;
    parserInstance = null;
    return false;
  }
}

/**
 * Parse Python source using tree-sitter
 */
export async function parsePythonTreeSitter(
  content: string,
  filePath: string
): Promise<ParseResult> {
  if (!isInitialized) {
    await initPythonParser();
  }

  if (!parserInstance || !pythonLanguage) {
    return parsePythonRegexFallback(content, filePath);
  }

  const tree = parserInstance.parse(content);
  const root = tree.rootNode;

  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const diagnostics: Array<{
    id: string;
    severity: "info" | "warning" | "error";
    code: string;
    message: string;
    evidence?: EvidenceRef[];
  }> = [];

  // Check for syntax errors
  if (root.hasError) {
    collectErrors(root, diagnostics);
  }

  // Extract imports
  extractImportsTreeSitter(root, filePath, symbols, relations);

  // Extract functions
  extractFunctionsTreeSitter(root, filePath, symbols);

  // Extract classes
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
      // Simple import: import X
      // Children: [identifier/dotted_name]
      for (const child of importNode.children || []) {
        if (child.type === "identifier" || child.type === "dotted_name") {
          const moduleName = child.text;
          addImportSymbol(moduleName, filePath, line, endLine, symbols, relations);
        }
      }
    } else if (importNode.type === "import_from_statement") {
      // from X import Y, Z
      // Children: [from, dotted_name(module), import, dotted_name(Y), comma, dotted_name(Z), ...]
      const moduleNode = importNode.childForFieldName?.("module_name");
      if (moduleNode) {
        const moduleName = moduleNode.text;
        // Record the module import relation
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

      // Extract imported names from children (skip keywords and module)
      for (const child of importNode.children || []) {
        if (child.type === "identifier" || child.type === "dotted_name") {
          // Skip the module name (first dotted_name after 'from')
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

    // Get inheritance from argument_list child (not field)
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

    // Extract methods from class body
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
        code: "PARSE_ERROR",
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
  const diagnostics: Array<{
    id: string;
    severity: "info" | "warning" | "error";
    code: string;
    message: string;
    evidence?: EvidenceRef[];
  }> = [];

  const lines = content.split("\n");

  // Simple regex extraction
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Import statements
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

    // Function
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

    // Class
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

export function isTreeSitterAvailable(): boolean {
  return parserInstance !== null && pythonLanguage !== null;
}

/**
 * Synchronous parse function (requires pre-initialized parser)
 * Use this after calling initPythonParser() successfully
 */
export function parsePythonFileSync(
  content: string,
  filePath: string
): ParseResult {
  if (!parserInstance || !pythonLanguage) {
    return parsePythonRegexFallback(content, filePath);
  }

  // parser.parse() is synchronous
  const tree = parserInstance.parse(content);
  const root = tree.rootNode;

  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const diagnostics: ParseResult["diagnostics"] = [];

  if (root.hasError) {
    collectErrors(root, diagnostics);
  }

  // Extract symbols using tree-sitter
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