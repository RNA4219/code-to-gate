/**
 * Rust tree-sitter WASM adapter
 *
 * Provides accurate Rust AST parsing using tree-sitter WASM.
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
let rustLanguage: any = null;
let isInitialized = false;

/**
 * Initialize tree-sitter parser with Rust grammar
 */
export async function initRustParser(): Promise<boolean> {
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

    // Load Rust grammar
    const wasmUrl = resolveWasmPath("rust");
    rustLanguage = await LanguageClass.load(wasmUrl);
    parserInstance.setLanguage(rustLanguage);

    isInitialized = true;
    return true;
  } catch (error: any) {
    console.warn("Rust tree-sitter WASM init failed, using regex fallback:", error?.message || error);
    isInitialized = true;
    parserInstance = null;
    return false;
  }
}

/**
 * Parse Rust source using tree-sitter
 */
export async function parseRustTreeSitter(
  content: string,
  filePath: string
): Promise<ParseResult> {
  if (!isInitialized) {
    await initRustParser();
  }

  if (!parserInstance || !rustLanguage) {
    return parseRustRegexFallback(content, filePath);
  }

  const tree = parserInstance.parse(content);
  const root = tree.rootNode;

  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const diagnostics: ParseResult["diagnostics"] = [];

  if (root.hasError) {
    collectErrors(root, diagnostics);
  }

  // Extract use declarations
  extractUseDeclarations(root, filePath, symbols, relations);

  // Extract functions
  extractFunctionsTreeSitter(root, filePath, symbols);

  // Extract structs
  extractStructsTreeSitter(root, filePath, symbols);

  // Extract enums
  extractEnumsTreeSitter(root, filePath, symbols);

  // Extract traits
  extractTraitsTreeSitter(root, filePath, symbols);

  // Extract impl blocks
  extractImplBlocksTreeSitter(root, filePath, symbols);

  return {
    symbols,
    relations,
    diagnostics,
    parserStatus: diagnostics.length > 0 ? "parsed" : "parsed",
    parserAdapter: diagnostics.length > 0 ? "rs-tree-sitter-wasm-partial" : "rs-tree-sitter-wasm",
  };
}

/**
 * Synchronous parse function (requires pre-initialized parser)
 */
export function parseRustFileSync(
  content: string,
  filePath: string
): ParseResult {
  if (!parserInstance || !rustLanguage) {
    return parseRustRegexFallback(content, filePath);
  }

  const tree = parserInstance.parse(content);
  const root = tree.rootNode;

  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const diagnostics: ParseResult["diagnostics"] = [];

  if (root.hasError) {
    collectErrors(root, diagnostics);
  }

  extractUseDeclarations(root, filePath, symbols, relations);
  extractFunctionsTreeSitter(root, filePath, symbols);
  extractStructsTreeSitter(root, filePath, symbols);
  extractEnumsTreeSitter(root, filePath, symbols);
  extractTraitsTreeSitter(root, filePath, symbols);
  extractImplBlocksTreeSitter(root, filePath, symbols);

  return {
    symbols,
    relations,
    diagnostics,
    parserStatus: diagnostics.length > 0 ? "parsed" : "parsed",
    parserAdapter: diagnostics.length > 0 ? "rs-tree-sitter-wasm-partial" : "rs-tree-sitter-wasm",
  };
}

/**
 * Extract use declarations (imports)
 */
function extractUseDeclarations(
  node: any,
  filePath: string,
  symbols: SymbolNode[],
  relations: GraphRelation[]
): void {
  const useNodes = (node.children || []).filter(
    (child: any) => child.type === "use_declaration"
  );

  for (const useNode of useNodes) {
    const line = useNode.startPosition?.row + 1 || 1;
    const endLine = useNode.endPosition?.row + 1 || line;

    // Iterate children to find the use clause (scoped_identifier, scoped_use_list, identifier)
    for (const child of useNode.children || []) {
      if (child.type === "scoped_identifier" || child.type === "identifier") {
        addUseSymbol(child.text, filePath, line, endLine, symbols, relations);
      } else if (child.type === "scoped_use_list") {
        // use std::{io, fmt};
        // scoped_use_list contains: identifier (std), ::, use_list
        let baseModule = "";
        for (const sc of child.children || []) {
          if (sc.type === "identifier") {
            baseModule = sc.text;
          } else if (sc.type === "use_list") {
            // Extract items from use_list
            for (const item of sc.children || []) {
              if (item.type === "identifier" || item.type === "scoped_identifier") {
                const fullName = baseModule ? `${baseModule}::${item.text}` : item.text;
                addUseSymbol(fullName, filePath, line, endLine, symbols, relations);
              }
            }
          }
        }
        // Also add the base module
        if (baseModule) {
          addUseSymbol(baseModule, filePath, line, endLine, symbols, relations);
        }
      } else if (child.type === "use_list") {
        // use {module1, module2}
        for (const item of child.children || []) {
          if (item.type === "scoped_identifier" || item.type === "identifier") {
            addUseSymbol(item.text, filePath, line, endLine, symbols, relations);
          }
        }
      }
    }
  }
}

function addUseSymbol(
  name: string,
  filePath: string,
  line: number,
  endLine: number,
  symbols: SymbolNode[],
  relations: GraphRelation[]
): void {
  const symbolId = `symbol:${filePath}:use:${name}`;
  symbols.push({
    id: symbolId,
    fileId: `file:${filePath}`,
    name,
    kind: "variable",
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
  });
  relations.push({
    id: `rel:${filePath}:uses:${name}`,
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
    (child: any) => child.type === "function_item"
  );

  for (const funcNode of functionNodes) {
    const nameNode = funcNode.childForFieldName?.("name");
    if (!nameNode) continue;

    const name = nameNode.text;
    const line = funcNode.startPosition?.row + 1 || 1;
    const endLine = funcNode.endPosition?.row + 1 || line;
    const symbolId = `symbol:${filePath}:function:${name}`;

    // Check for async - can be in function_modifiers child
    let isAsync = false;
    let isPublic = false;
    for (const child of funcNode.children || []) {
      if (child.type === "function_modifiers") {
        // Check for async inside modifiers
        for (const mod of child.children || []) {
          if (mod.type === "async" || mod.text === "async") {
            isAsync = true;
          }
        }
      } else if (child.type === "visibility_modifier") {
        isPublic = child.text === "pub";
      }
    }

    // Get parameters
    const paramsNode = funcNode.childForFieldName?.("parameters");
    const parameterTypes: Array<{ name: string; type: string }> = [];
    if (paramsNode) {
      for (const param of paramsNode.children || []) {
        if (param.type === "parameter") {
          const paramName = param.childForFieldName?.("pattern")?.text || "unknown";
          const paramType = param.childForFieldName?.("type")?.text || "unknown";
          parameterTypes.push({ name: paramName, type: paramType });
        }
      }
    }

    // Get return type
    const returnTypeNode = funcNode.childForFieldName?.("return_type");
    const returnType = returnTypeNode ? returnTypeNode.text : "()";

    symbols.push({
      id: symbolId,
      fileId: `file:${filePath}`,
      name,
      kind: "function",
      exported: isPublic,
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
 * Extract struct declarations
 */
function extractStructsTreeSitter(
  node: any,
  filePath: string,
  symbols: SymbolNode[]
): void {
  const structNodes = (node.children || []).filter(
    (child: any) => child.type === "struct_item"
  );

  for (const structNode of structNodes) {
    const nameNode = structNode.childForFieldName?.("name");
    if (!nameNode) continue;

    const name = nameNode.text;
    const line = structNode.startPosition?.row + 1 || 1;
    const endLine = structNode.endPosition?.row + 1 || line;
    const symbolId = `symbol:${filePath}:struct:${name}`;

    // Check for pub
    const isPublic = (structNode.children || []).some(
      (child: any) => child.type === "pub"
    );

    symbols.push({
      id: symbolId,
      fileId: `file:${filePath}`,
      name,
      kind: "class",
      exported: isPublic,
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
 * Extract enum declarations
 */
function extractEnumsTreeSitter(
  node: any,
  filePath: string,
  symbols: SymbolNode[]
): void {
  const enumNodes = (node.children || []).filter(
    (child: any) => child.type === "enum_item"
  );

  for (const enumNode of enumNodes) {
    const nameNode = enumNode.childForFieldName?.("name");
    if (!nameNode) continue;

    const name = nameNode.text;
    const line = enumNode.startPosition?.row + 1 || 1;
    const endLine = enumNode.endPosition?.row + 1 || line;
    const symbolId = `symbol:${filePath}:enum:${name}`;

    const isPublic = (enumNode.children || []).some(
      (child: any) => child.type === "pub"
    );

    symbols.push({
      id: symbolId,
      fileId: `file:${filePath}`,
      name,
      kind: "type",
      exported: isPublic,
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

    // Extract enum variants
    const bodyNode = enumNode.childForFieldName?.("body");
    if (bodyNode) {
      for (const variant of bodyNode.children || []) {
        if (variant.type === "enum_variant") {
          const variantName = variant.childForFieldName?.("name")?.text;
          if (variantName) {
            const variantId = `symbol:${filePath}:enum_variant:${name}.${variantName}`;
            symbols.push({
              id: variantId,
              fileId: `file:${filePath}`,
              name: `${name}.${variantName}`,
              kind: "variable",
              exported: isPublic,
              location: {
                startLine: variant.startPosition?.row + 1 || line,
                endLine: variant.endPosition?.row + 1 || line,
              },
              evidence: [
                {
                  id: `ev-${sha256(variantId).slice(0, 8)}`,
                  path: filePath,
                  startLine: variant.startPosition?.row + 1 || line,
                  endLine: variant.endPosition?.row + 1 || line,
                  kind: "ast",
                },
              ],
            });
          }
        }
      }
    }
  }
}

/**
 * Extract trait declarations
 */
function extractTraitsTreeSitter(
  node: any,
  filePath: string,
  symbols: SymbolNode[]
): void {
  const traitNodes = (node.children || []).filter(
    (child: any) => child.type === "trait_item"
  );

  for (const traitNode of traitNodes) {
    const nameNode = traitNode.childForFieldName?.("name");
    if (!nameNode) continue;

    const name = nameNode.text;
    const line = traitNode.startPosition?.row + 1 || 1;
    const endLine = traitNode.endPosition?.row + 1 || line;
    const symbolId = `symbol:${filePath}:trait:${name}`;

    const isPublic = (traitNode.children || []).some(
      (child: any) => child.type === "pub"
    );

    symbols.push({
      id: symbolId,
      fileId: `file:${filePath}`,
      name,
      kind: "interface",
      exported: isPublic,
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

    // Extract trait methods
    const bodyNode = traitNode.childForFieldName?.("body");
    if (bodyNode) {
      for (const method of bodyNode.children || []) {
        if (method.type === "function_signature_item") {
          const methodName = method.childForFieldName?.("name")?.text;
          if (methodName) {
            const methodId = `symbol:${filePath}:trait_method:${name}.${methodName}`;
            symbols.push({
              id: methodId,
              fileId: `file:${filePath}`,
              name: `${name}.${methodName}`,
              kind: "method",
              exported: isPublic,
              location: {
                startLine: method.startPosition?.row + 1 || line,
                endLine: method.endPosition?.row + 1 || line,
              },
              evidence: [
                {
                  id: `ev-${sha256(methodId).slice(0, 8)}`,
                  path: filePath,
                  startLine: method.startPosition?.row + 1 || line,
                  endLine: method.endPosition?.row + 1 || line,
                  kind: "ast",
                },
              ],
            });
          }
        }
      }
    }
  }
}

/**
 * Extract impl blocks
 */
function extractImplBlocksTreeSitter(
  node: any,
  filePath: string,
  symbols: SymbolNode[]
): void {
  const implNodes = (node.children || []).filter(
    (child: any) => child.type === "impl_item"
  );

  for (const implNode of implNodes) {
    const typeNode = implNode.childForFieldName?.("type");
    if (!typeNode) continue;

    const typeName = typeNode.text;
    const line = implNode.startPosition?.row + 1 || 1;
    const endLine = implNode.endPosition?.row + 1 || line;

    // Check for trait implementation (impl Trait for Type)
    const traitNode = implNode.childForFieldName?.("trait");
    const traitName = traitNode ? traitNode.text : undefined;

    const implId = `symbol:${filePath}:impl:${typeName}`;
    symbols.push({
      id: implId,
      fileId: `file:${filePath}`,
      name: `impl${traitName ? ` ${traitName} for` : ""} ${typeName}`,
      kind: "interface",
      exported: true,
      location: { startLine: line, endLine: endLine },
      evidence: [
        {
          id: `ev-${sha256(implId).slice(0, 8)}`,
          path: filePath,
          startLine: line,
          endLine: endLine,
          kind: "ast",
        },
      ],
      typeInfo: {
        implements: traitName ? [traitName] : [],
      },
    });

    // Extract impl methods
    const bodyNode = implNode.childForFieldName?.("body");
    if (bodyNode) {
      for (const method of bodyNode.children || []) {
        if (method.type === "function_item") {
          const methodName = method.childForFieldName?.("name")?.text;
          if (methodName) {
            const methodId = `symbol:${filePath}:method:${typeName}.${methodName}`;
            symbols.push({
              id: methodId,
              fileId: `file:${filePath}`,
              name: `${typeName}.${methodName}`,
              kind: "method",
              exported: true,
              location: {
                startLine: method.startPosition?.row + 1 || line,
                endLine: method.endPosition?.row + 1 || line,
              },
              evidence: [
                {
                  id: `ev-${sha256(methodId).slice(0, 8)}`,
                  path: filePath,
                  startLine: method.startPosition?.row + 1 || line,
                  endLine: method.endPosition?.row + 1 || line,
                  kind: "ast",
                },
              ],
            });
          }
        }
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
 * Regex fallback for Rust
 */
function parseRustRegexFallback(content: string, filePath: string): ParseResult {
  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const diagnostics: ParseResult["diagnostics"] = [];

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Use declarations - handle simple use and use with braces
    const simpleUseMatch = line.match(/^\s*use\s+([\w:]+(?:<[^>]+>)?)/);
    if (simpleUseMatch && !line.includes("{")) {
      addUseSymbol(simpleUseMatch[1].replace(/;$/, ""), filePath, lineNum, lineNum, symbols, relations);
    }

    // Use declarations with braces: use std::{io, fmt};
    const braceUseMatch = line.match(/^\s*use\s+(\w+)::\{([^}]+)\}/);
    if (braceUseMatch) {
      const baseModule = braceUseMatch[1];
      const items = braceUseMatch[2].split(",").map(s => s.trim()).filter(s => s);
      for (const item of items) {
        addUseSymbol(`${baseModule}::${item}`, filePath, lineNum, lineNum, symbols, relations);
      }
    }

    // Function declarations
    const funcMatch = line.match(/^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/);
    if (funcMatch) {
      const funcName = funcMatch[1];
      const symbolId = `symbol:${filePath}:function:${funcName}`;
      const isPublic = /^\s*pub/.test(line);
      const isAsync = /\basync\b/.test(line);
      symbols.push({
        id: symbolId,
        fileId: `file:${filePath}`,
        name: funcName,
        kind: "function",
        exported: isPublic,
        async: isAsync,
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

    // Struct declarations
    const structMatch = line.match(/^\s*(?:pub\s+)?struct\s+(\w+)/);
    if (structMatch) {
      const structName = structMatch[1];
      const symbolId = `symbol:${filePath}:struct:${structName}`;
      symbols.push({
        id: symbolId,
        fileId: `file:${filePath}`,
        name: structName,
        kind: "class",
        exported: /^\s*pub/.test(line),
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

    // Enum declarations
    const enumMatch = line.match(/^\s*(?:pub\s+)?enum\s+(\w+)/);
    if (enumMatch) {
      const enumName = enumMatch[1];
      const symbolId = `symbol:${filePath}:enum:${enumName}`;
      symbols.push({
        id: symbolId,
        fileId: `file:${filePath}`,
        name: enumName,
        kind: "type",
        exported: /^\s*pub/.test(line),
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

    // Trait declarations
    const traitMatch = line.match(/^\s*(?:pub\s+)?trait\s+(\w+)/);
    if (traitMatch) {
      const traitName = traitMatch[1];
      const symbolId = `symbol:${filePath}:trait:${traitName}`;
      symbols.push({
        id: symbolId,
        fileId: `file:${filePath}`,
        name: traitName,
        kind: "interface",
        exported: /^\s*pub/.test(line),
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

    // Impl blocks
    const implMatch = line.match(/^\s*impl(?:<[^>]+>)?\s+(?:(\w+)\s+for\s+)?(\w+)/);
    if (implMatch) {
      const traitName = implMatch[1];
      const typeName = implMatch[2];
      const implId = `symbol:${filePath}:impl:${typeName}`;
      symbols.push({
        id: implId,
        fileId: `file:${filePath}`,
        name: `impl${traitName ? ` ${traitName} for` : ""} ${typeName}`,
        kind: "interface",
        exported: true,
        location: { startLine: lineNum, endLine: lineNum },
        evidence: [
          {
            id: `ev-${sha256(implId).slice(0, 8)}`,
            path: filePath,
            startLine: lineNum,
            endLine: lineNum,
            kind: "text",
          },
        ],
        typeInfo: {
          implements: traitName ? [traitName] : [],
        },
      });
    }
  }

  return {
    symbols,
    relations,
    diagnostics,
    parserStatus: "parsed",
    parserAdapter: "rs-regex-fallback",
  };
}

export function isRustTreeSitterAvailable(): boolean {
  return parserInstance !== null && rustLanguage !== null;
}