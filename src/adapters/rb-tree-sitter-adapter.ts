/**
 * Ruby tree-sitter WASM adapter
 *
 * Provides accurate Ruby AST parsing using tree-sitter WASM.
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
let rubyLanguage: any = null;
let isInitialized = false;

/**
 * Initialize tree-sitter parser with Ruby grammar
 */
export async function initRubyParser(): Promise<boolean> {
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

    // Load Ruby grammar - use local file in Node.js, CDN in browser
    const wasmUrl = resolveWasmPath("ruby");
    rubyLanguage = await LanguageClass.load(wasmUrl);
    parserInstance.setLanguage(rubyLanguage);

    isInitialized = true;
    return true;
  } catch (error: any) {
    console.warn("Ruby tree-sitter WASM init failed, using regex fallback:", error?.message || error);
    isInitialized = true;
    parserInstance = null;
    return false;
  }
}

/**
 * Parse Ruby source using tree-sitter
 */
export async function parseRubyTreeSitter(
  content: string,
  filePath: string
): Promise<ParseResult> {
  if (!isInitialized) {
    await initRubyParser();
  }

  if (!parserInstance || !rubyLanguage) {
    return parseRubyRegexFallback(content, filePath);
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

  if (root.hasError) {
    collectErrors(root, diagnostics);
  }

  // Extract requires
  extractRequiresTreeSitter(root, filePath, relations);

  // Extract methods
  extractMethodsRuby(root, filePath, symbols);

  // Extract classes/modules
  extractClassesRuby(root, filePath, symbols);

  return {
    symbols,
    relations,
    diagnostics,
    parserStatus: diagnostics.length > 0 ? "parsed" : "parsed",
    parserAdapter: diagnostics.length > 0 ? "rb-tree-sitter-wasm-partial" : "rb-tree-sitter-wasm",
  };
}

/**
 * Extract require statements
 */
function extractRequiresTreeSitter(
  node: any,
  filePath: string,
  relations: GraphRelation[]
): void {
  // Ruby: require 'module' or require_relative 'path'
  const callNodes = (node.children || []).filter((child: any) => child.type === "call");

  for (const callNode of callNodes) {
    // Find method name and arguments
    let methodName = "";
    let moduleName = "";
    const line = callNode.startPosition?.row + 1 || 1;

    for (const child of callNode.children || []) {
      if (child.type === "identifier") {
        methodName = child.text;
      } else if (child.type === "argument_list") {
        // Find the argument (simple_symbol or string)
        for (const arg of child.children || []) {
          if (arg.type === "simple_symbol" || arg.type === "string") {
            moduleName = arg.text;
            // Clean up the module name
            moduleName = moduleName.replace(/^['"]|['"]$/g, "").replace(/^:/, "");
          }
        }
      }
    }

    if (methodName === "require" || methodName === "require_relative") {
      if (moduleName) {
        relations.push({
          id: `rel:${filePath}:requires:${moduleName}`,
          from: `file:${filePath}`,
          to: `module:${moduleName}`,
          kind: "imports",
          confidence: methodName === "require" ? 1.0 : 0.9,
          evidence: [
            {
              id: `ev-rel-${sha256(moduleName).slice(0, 8)}`,
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
}

/**
 * Extract method definitions
 */
function extractMethodsRuby(
  node: any,
  filePath: string,
  symbols: SymbolNode[]
): void {
  const methodNodes = (node.children || []).filter((child: any) => child.type === "method");

  for (const methodNode of methodNodes) {
    let name = "";
    const line = methodNode.startPosition?.row + 1 || 1;
    const endLine = methodNode.endPosition?.row + 1 || line;

    for (const child of methodNode.children || []) {
      if (child.type === "identifier") {
        name = child.text;
        break;
      }
    }

    if (!name) continue;

    const symbolId = `symbol:${filePath}:method:${name}`;

    symbols.push({
      id: symbolId,
      fileId: `file:${filePath}`,
      name,
      kind: "method",
      exported: true, // Ruby methods are public by default
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

  // Also handle singleton methods (def self.method)
  const singletonNodes = (node.children || []).filter(
    (child: any) => child.type === "singleton_method"
  );
  for (const singletonNode of singletonNodes) {
    let objectName = "";
    let methodName = "";

    for (const child of singletonNode.children || []) {
      if (child.type === "self") {
        objectName = "self";
      } else if (child.type === "identifier") {
        methodName = child.text;
      }
    }

    if (methodName) {
      const fullName = objectName ? `${objectName}.${methodName}` : methodName;
      const line = singletonNode.startPosition?.row + 1 || 1;
      const symbolId = `symbol:${filePath}:method:${fullName}`;

      symbols.push({
        id: symbolId,
        fileId: `file:${filePath}`,
        name: fullName,
        kind: "method",
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
 * Extract class/module definitions
 */
function extractClassesRuby(
  node: any,
  filePath: string,
  symbols: SymbolNode[]
): void {
  const classNodes = (node.children || []).filter((child: any) => child.type === "class");

  for (const classNode of classNodes) {
    let name = "";
    const inherits: string[] = [];

    for (const child of classNode.children || []) {
      if (child.type === "constant") {
        name = child.text;
      } else if (child.type === "superclass") {
        // superclass text is "< BaseClass" or has children
        for (const sc of child.children || []) {
          if (sc.type === "constant") {
            inherits.push(sc.text);
          }
        }
        // If no children, extract from text
        if (inherits.length === 0 && child.text) {
          const match = child.text.match(/<\s*(\w+)/);
          if (match) {
            inherits.push(match[1]);
          }
        }
      } else if (child.type === "body_statement") {
        // Extract methods from class body
        extractMethodsRuby(child, filePath, symbols);
      }
    }

    if (!name) continue;

    const line = classNode.startPosition?.row + 1 || 1;
    const endLine = classNode.endPosition?.row + 1 || line;
    const symbolId = `symbol:${filePath}:class:${name}`;

    symbols.push({
      id: symbolId,
      fileId: `file:${filePath}`,
      name,
      kind: "class",
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
      typeInfo: inherits.length > 0 ? { implements: inherits } : undefined,
    });
  }

  // Ruby modules
  const moduleNodes = (node.children || []).filter((child: any) => child.type === "module");
  for (const moduleNode of moduleNodes) {
    let name = "";

    for (const child of moduleNode.children || []) {
      if (child.type === "constant") {
        name = child.text;
      }
    }

    if (!name) continue;

    const line = moduleNode.startPosition?.row + 1 || 1;
    const symbolId = `symbol:${filePath}:module:${name}`;

    symbols.push({
      id: symbolId,
      fileId: `file:${filePath}`,
      name,
      kind: "interface", // Modules act like interfaces/mixins
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

/**
 * Collect syntax errors
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
    if ((child.children || []).length > 0) {
      collectErrors(child, diagnostics);
    }
  }
}

/**
 * Regex fallback for Ruby
 */
function parseRubyRegexFallback(content: string, filePath: string): ParseResult {
  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const diagnostics: Array<{
    id: string;
    severity: "info" | "warning" | "error";
    code: string;
    message: string;
    evidence?: EvidenceRef[];
  }> = [];

  // require statements
  const requireRegex = /^require\s+['"]([\w.]+)['"]/gm;
  const requireRelRegex = /^require_relative\s+['"]([\w./]+)['"]/gm;

  let match;
  while ((match = requireRegex.exec(content)) !== null) {
    const moduleName = match[1];
    const line = content.substring(0, match.index).split("\n").length;

    relations.push({
      id: `rel:${filePath}:requires:${moduleName}`,
      from: `file:${filePath}`,
      to: `module:${moduleName}`,
      kind: "imports",
      confidence: 1.0,
      evidence: [
        {
          id: `ev-${sha256(moduleName).slice(0, 8)}`,
          path: filePath,
          startLine: line,
          endLine: line,
          kind: "text",
        },
      ],
    });
  }

  while ((match = requireRelRegex.exec(content)) !== null) {
    const moduleName = match[1];
    const line = content.substring(0, match.index).split("\n").length;

    relations.push({
      id: `rel:${filePath}:requires:${moduleName}`,
      from: `file:${filePath}`,
      to: `module:${moduleName}`,
      kind: "imports",
      confidence: 0.9,
      evidence: [
        {
          id: `ev-${sha256(moduleName).slice(0, 8)}`,
          path: filePath,
          startLine: line,
          endLine: line,
          kind: "text",
        },
      ],
    });
  }

  // method definitions
  const methodRegex = /^def\s+(\w+)(?:\.\w+)?/gm;
  while ((match = methodRegex.exec(content)) !== null) {
    const name = match[1];
    const line = content.substring(0, match.index).split("\n").length;
    const symbolId = `symbol:${filePath}:method:${name}`;

    symbols.push({
      id: symbolId,
      fileId: `file:${filePath}`,
      name,
      kind: "method",
      exported: true,
      location: { startLine: line, endLine: line },
      evidence: [
        {
          id: `ev-${sha256(symbolId).slice(0, 8)}`,
          path: filePath,
          startLine: line,
          endLine: line,
          kind: "text",
        },
      ],
    });
  }

  // class definitions
  const classRegex = /^class\s+(\w+)(?:\s*<\s*(\w+))?/gm;
  while ((match = classRegex.exec(content)) !== null) {
    const name = match[1];
    const inherits = match[2] ? [match[2]] : [];
    const line = content.substring(0, match.index).split("\n").length;
    const symbolId = `symbol:${filePath}:class:${name}`;

    symbols.push({
      id: symbolId,
      fileId: `file:${filePath}`,
      name,
      kind: "class",
      exported: true,
      location: { startLine: line, endLine: line },
      evidence: [
        {
          id: `ev-${sha256(symbolId).slice(0, 8)}`,
          path: filePath,
          startLine: line,
          endLine: line,
          kind: "text",
        },
      ],
      typeInfo: {
        implements: inherits,
      },
    });
  }

  // module definitions
  const moduleRegex = /^module\s+(\w+)/gm;
  while ((match = moduleRegex.exec(content)) !== null) {
    const name = match[1];
    const line = content.substring(0, match.index).split("\n").length;
    const symbolId = `symbol:${filePath}:module:${name}`;

    symbols.push({
      id: symbolId,
      fileId: `file:${filePath}`,
      name,
      kind: "interface",
      exported: true,
      location: { startLine: line, endLine: line },
      evidence: [
        {
          id: `ev-${sha256(symbolId).slice(0, 8)}`,
          path: filePath,
          startLine: line,
          endLine: line,
          kind: "text",
        },
      ],
    });
  }

  return {
    symbols,
    relations,
    diagnostics,
    parserStatus: "parsed",
    parserAdapter: "rb-regex-fallback",
  };
}

export function isRubyTreeSitterAvailable(): boolean {
  return parserInstance !== null && rubyLanguage !== null;
}

/**
 * Synchronous parse function (requires pre-initialized parser)
 * Use this after calling initRubyParser() successfully
 */
export function parseRubyFileSync(
  content: string,
  filePath: string
): ParseResult {
  if (!parserInstance || !rubyLanguage) {
    return parseRubyRegexFallback(content, filePath);
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
  extractRequiresTreeSitter(root, filePath, relations);
  extractMethodsRuby(root, filePath, symbols);
  extractClassesRuby(root, filePath, symbols);

  return {
    symbols,
    relations,
    diagnostics,
    parserStatus: diagnostics.length > 0 ? "parsed" : "parsed",
    parserAdapter: diagnostics.length > 0 ? "rb-tree-sitter-wasm-partial" : "rb-tree-sitter-wasm",
  };
}