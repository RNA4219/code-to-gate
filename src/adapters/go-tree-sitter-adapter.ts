/**
 * Go tree-sitter WASM adapter
 *
 * Provides accurate Go AST parsing using tree-sitter WASM.
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
import { resolveWasmPath, loadWasmBuffer } from "./tree-sitter-wasm-resolver.js";

// Dynamic import for web-tree-sitter
let ParserClass: any = null;
let LanguageClass: any = null;
let parserInstance: any = null;
let goLanguage: any = null;
let isInitialized = false;

/**
 * Initialize tree-sitter parser with Go grammar
 */
export async function initGoParser(): Promise<boolean> {
  if (isInitialized) {
    return parserInstance !== null;
  }

  try {
    // Dynamic import
    const module = await import("web-tree-sitter");
    ParserClass = module.Parser;
    LanguageClass = module.Language;

    await ParserClass.init();
    parserInstance = new ParserClass();

    // Load Go grammar - use Buffer in Node.js, URL in browser
    const wasmBuffer = loadWasmBuffer("go");
    if (wasmBuffer) {
      // Node.js: load WASM from Buffer
      goLanguage = await LanguageClass.load(wasmBuffer);
    } else {
      // Browser or fallback: load from URL
      const wasmUrl = resolveWasmPath("go");
      goLanguage = await LanguageClass.load(wasmUrl);
    }
    parserInstance.setLanguage(goLanguage);

    isInitialized = true;
    return true;
  } catch (error: any) {
    console.warn("Go tree-sitter WASM init failed, using regex fallback:", error?.message || error);
    isInitialized = true;
    parserInstance = null;
    return false;
  }
}

/**
 * Parse Go source using tree-sitter
 */
export async function parseGoTreeSitter(
  content: string,
  filePath: string
): Promise<ParseResult> {
  if (!isInitialized) {
    await initGoParser();
  }

  if (!parserInstance || !goLanguage) {
    return parseGoRegexFallback(content, filePath);
  }

  const tree = parserInstance.parse(content);
  const root = tree.rootNode;

  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const diagnostics: ParseResult["diagnostics"] = [];

  if (root.hasError) {
    collectErrors(root, diagnostics);
  }

  // Extract package declaration
  extractPackageDeclaration(root, filePath, symbols);

  // Extract imports
  extractImportsTreeSitter(root, filePath, symbols, relations);

  // Extract functions
  extractFunctionsTreeSitter(root, filePath, symbols);

  // Extract types (struct, interface)
  extractTypesTreeSitter(root, filePath, symbols);

  return {
    symbols,
    relations,
    diagnostics,
    parserStatus: diagnostics.length > 0 ? "parsed" : "parsed",
    parserAdapter: diagnostics.length > 0 ? "go-tree-sitter-wasm-partial" : "go-tree-sitter-wasm",
  };
}

/**
 * Synchronous parse function (requires pre-initialized parser)
 */
export function parseGoFileSync(
  content: string,
  filePath: string
): ParseResult {
  if (!parserInstance || !goLanguage) {
    return parseGoRegexFallback(content, filePath);
  }

  const tree = parserInstance.parse(content);
  const root = tree.rootNode;

  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const diagnostics: ParseResult["diagnostics"] = [];

  if (root.hasError) {
    collectErrors(root, diagnostics);
  }

  extractPackageDeclaration(root, filePath, symbols);
  extractImportsTreeSitter(root, filePath, symbols, relations);
  extractFunctionsTreeSitter(root, filePath, symbols);
  extractTypesTreeSitter(root, filePath, symbols);

  return {
    symbols,
    relations,
    diagnostics,
    parserStatus: diagnostics.length > 0 ? "parsed" : "parsed",
    parserAdapter: diagnostics.length > 0 ? "go-tree-sitter-wasm-partial" : "go-tree-sitter-wasm",
  };
}

/**
 * Extract package declaration
 */
function extractPackageDeclaration(
  node: any,
  filePath: string,
  symbols: SymbolNode[]
): void {
  const packageNodes = (node.children || []).filter(
    (child: any) => child.type === "package_clause"
  );

  for (const packageNode of packageNodes) {
    // package_identifier is a child of package_clause
    const nameNode = (packageNode.children || []).find(
      (child: any) => child.type === "package_identifier"
    );
    if (nameNode) {
      const packageName = nameNode.text;
      const line = packageNode.startPosition?.row + 1 || 1;
      const symbolId = `symbol:${filePath}:package:${packageName}`;

      symbols.push({
        id: symbolId,
        fileId: `file:${filePath}`,
        name: packageName,
        kind: "interface", // Package acts as module/interface
        exported: true,
        location: { startLine: line, endLine: line },
        evidence: [
          {
            id: `ev-${sha256(symbolId).slice(0, 8)}`,
            path: filePath,
            startLine: line,
            endLine: line,
            kind: "ast",
          },
        ],
      });
    }
  }
}

/**
 * Extract import declarations
 */
function extractImportsTreeSitter(
  node: any,
  filePath: string,
  symbols: SymbolNode[],
  relations: GraphRelation[]
): void {
  const importNodes = (node.children || []).filter(
    (child: any) => child.type === "import_declaration"
  );

  for (const importNode of importNodes) {
    const line = importNode.startPosition?.row + 1 || 1;
    const endLine = importNode.endPosition?.row + 1 || line;

    // Look for import_spec or import_spec_list children
    for (const child of importNode.children || []) {
      if (child.type === "import_spec") {
        // Single import: find interpreted_string_literal child
        for (const specChild of child.children || []) {
          if (specChild.type === "interpreted_string_literal") {
            const importPath = specChild.text.replace(/^"|"$/g, "");
            addImportSymbol(importPath, filePath, line, endLine, symbols, relations);
          }
        }
      } else if (child.type === "import_spec_list") {
        // Multiple imports
        for (const spec of child.children || []) {
          if (spec.type === "import_spec") {
            for (const specChild of spec.children || []) {
              if (specChild.type === "interpreted_string_literal") {
                const specLine = spec.startPosition?.row + 1 || line;
                const importPath = specChild.text.replace(/^"|"$/g, "");
                addImportSymbol(importPath, filePath, specLine, specLine, symbols, relations);
              }
            }
          }
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
 * Extract function declarations
 */
function extractFunctionsTreeSitter(
  node: any,
  filePath: string,
  symbols: SymbolNode[]
): void {
  const functionNodes = (node.children || []).filter(
    (child: any) => child.type === "function_declaration"
  );

  for (const funcNode of functionNodes) {
    const nameNode = funcNode.childForFieldName?.("name");
    if (!nameNode) continue;

    const name = nameNode.text;
    const line = funcNode.startPosition?.row + 1 || 1;
    const endLine = funcNode.endPosition?.row + 1 || line;
    const symbolId = `symbol:${filePath}:function:${name}`;

    // Get parameters
    const paramsNode = funcNode.childForFieldName?.("parameters");
    const parameterTypes: Array<{ name: string; type: string }> = [];
    if (paramsNode) {
      for (const param of paramsNode.children || []) {
        if (param.type === "parameter_declaration") {
          const paramName = param.childForFieldName?.("name")?.text || "unknown";
          const paramType = param.childForFieldName?.("type")?.text || "unknown";
          parameterTypes.push({ name: paramName, type: paramType });
        }
      }
    }

    // Get return type
    const resultNode = funcNode.childForFieldName?.("result");
    const returnType = resultNode ? resultNode.text : "void";

    symbols.push({
      id: symbolId,
      fileId: `file:${filePath}`,
      name,
      kind: "function",
      exported: true, // Go functions are public if name starts with uppercase
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

  // Extract methods (function with receiver)
  const methodNodes = (node.children || []).filter(
    (child: any) => child.type === "method_declaration"
  );

  for (const methodNode of methodNodes) {
    const nameNode = methodNode.childForFieldName?.("name");
    if (!nameNode) continue;

    const name = nameNode.text;
    const line = methodNode.startPosition?.row + 1 || 1;
    const endLine = methodNode.endPosition?.row + 1 || line;

    // Get receiver
    const receiverNode = methodNode.childForFieldName?.("receiver");
    let receiverType = "";
    if (receiverNode) {
      const typeNode = receiverNode.childForFieldName?.("type");
      if (typeNode) {
        receiverType = typeNode.text;
      }
    }

    const symbolId = `symbol:${filePath}:method:${receiverType}.${name}`;

    // Get parameters
    const paramsNode = methodNode.childForFieldName?.("parameters");
    const parameterTypes: Array<{ name: string; type: string }> = [];
    if (paramsNode) {
      for (const param of paramsNode.children || []) {
        if (param.type === "parameter_declaration") {
          const paramName = param.childForFieldName?.("name")?.text || "unknown";
          const paramType = param.childForFieldName?.("type")?.text || "unknown";
          parameterTypes.push({ name: paramName, type: paramType });
        }
      }
    }

    // Get return type
    const resultNode = methodNode.childForFieldName?.("result");
    const returnType = resultNode ? resultNode.text : "void";

    symbols.push({
      id: symbolId,
      fileId: `file:${filePath}`,
      name: `${receiverType}.${name}`,
      kind: "method",
      exported: true,
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
 * Extract type declarations (struct, interface)
 */
function extractTypesTreeSitter(
  node: any,
  filePath: string,
  symbols: SymbolNode[]
): void {
  const typeNodes = (node.children || []).filter(
    (child: any) => child.type === "type_declaration"
  );

  for (const typeDecl of typeNodes) {
    const line = typeDecl.startPosition?.row + 1 || 1;
    const endLine = typeDecl.endPosition?.row + 1 || line;

    // Find type_spec child which contains the name and type
    for (const child of typeDecl.children || []) {
      if (child.type === "type_spec") {
        let name = "";
        let kind: "class" | "interface" = "class";
        let implMethods: string[] = [];

        for (const specChild of child.children || []) {
          if (specChild.type === "type_identifier") {
            name = specChild.text;
          } else if (specChild.type === "struct_type") {
            kind = "class";
          } else if (specChild.type === "interface_type") {
            kind = "interface";
            // Extract interface methods
            for (const bodyChild of specChild.children || []) {
              if (bodyChild.type === "method_spec") {
                for (const methodChild of bodyChild.children || []) {
                  if (methodChild.type === "field_identifier") {
                    implMethods.push(methodChild.text);
                  }
                }
              }
            }
          }
        }

        if (!name) continue;

        const symbolId = `symbol:${filePath}:type:${name}`;
        symbols.push({
          id: symbolId,
          fileId: `file:${filePath}`,
          name,
          kind,
          exported: true,
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
          typeInfo: implMethods.length > 0 ? { implements: implMethods } : undefined,
        });
      }
    }
  }
}

/**
 * Collect syntax errors
 */
function collectErrors(
  node: any,
  diagnostics: ParseResult["diagnostics"]
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
    if ((child.children || []).length > 0) {
      collectErrors(child, diagnostics);
    }
  }
}

/**
 * Regex fallback for Go
 */
function parseGoRegexFallback(content: string, filePath: string): ParseResult {
  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const diagnostics: ParseResult["diagnostics"] = [];

  const lines = content.split("\n");

  // Package declaration
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    const packageMatch = line.match(/^\s*package\s+(\w+)/);
    if (packageMatch) {
      const packageName = packageMatch[1];
      const symbolId = `symbol:${filePath}:package:${packageName}`;
      symbols.push({
        id: symbolId,
        fileId: `file:${filePath}`,
        name: packageName,
        kind: "interface",
        exported: true,
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

    // Import statements
    const importMatch = line.match(/^\s*import\s+"([^"]+)"/);
    if (importMatch) {
      addImportSymbol(importMatch[1], filePath, lineNum, lineNum, symbols, relations);
    }

    // Multi-line imports
    if (line.trim().startsWith("import (")) {
      // Find closing parenthesis
      for (let j = i + 1; j < lines.length; j++) {
        const innerLine = lines[j].trim();
        if (innerLine === ")") break;

        const multiImportMatch = innerLine.match(/^"([^"]+)"/);
        if (multiImportMatch) {
          addImportSymbol(multiImportMatch[1], filePath, j + 1, j + 1, symbols, relations);
        }
      }
    }

    // Function declarations
    const funcMatch = line.match(/^\s*func\s+(\w+)\s*\(/);
    if (funcMatch) {
      const funcName = funcMatch[1];
      const symbolId = `symbol:${filePath}:function:${funcName}`;
      symbols.push({
        id: symbolId,
        fileId: `file:${filePath}`,
        name: funcName,
        kind: "function",
        exported: true,
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

    // Method declarations
    const methodMatch = line.match(/^\s*func\s+\([^)]+\)\s+(\w+)\s*\(/);
    if (methodMatch) {
      const methodName = methodMatch[1];
      const receiverMatch = line.match(/^\s*func\s+\((\w+)\s+\*?(\w+)\)/);
      let receiverType = "";
      if (receiverMatch) {
        receiverType = receiverMatch[2];
      }
      const symbolId = `symbol:${filePath}:method:${receiverType}.${methodName}`;
      symbols.push({
        id: symbolId,
        fileId: `file:${filePath}`,
        name: `${receiverType}.${methodName}`,
        kind: "method",
        exported: true,
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

    // Type declarations (struct, interface)
    const typeMatch = line.match(/^\s*type\s+(\w+)\s+(struct|interface)/);
    if (typeMatch) {
      const typeName = typeMatch[1];
      const typeKind = typeMatch[2];
      const symbolId = `symbol:${filePath}:type:${typeName}`;
      symbols.push({
        id: symbolId,
        fileId: `file:${filePath}`,
        name: typeName,
        kind: typeKind === "struct" ? "class" : "interface",
        exported: true,
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
  }

  return {
    symbols,
    relations,
    diagnostics,
    parserStatus: "parsed",
    parserAdapter: "go-regex-fallback",
  };
}

export function isGoTreeSitterAvailable(): boolean {
  return parserInstance !== null && goLanguage !== null;
}