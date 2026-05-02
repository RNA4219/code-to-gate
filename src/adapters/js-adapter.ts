/**
 * JavaScript Adapter - Parse JavaScript/TypeScript files using Acorn
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import * as acorn from "acorn";
import { sha256, toPosix } from "../core/path-utils.js";
import type { EvidenceRef, SymbolNode, GraphRelation } from "../types/graph.js";
import { walkNode, HandlerContext } from "./js-ast-handlers.js";
import { getNodeLoc } from "./js-adapter-utils.js";

export type { EvidenceRef, SymbolNode, GraphRelation };

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

/**
 * Parse a JavaScript file and extract symbols/relations
 */
export function parseJavaScriptFile(
  filePath: string,
  repoRoot: string,
  fileId: string
): ParseResult {
  const symbols: SymbolNode[] = [];
  const relations: GraphRelation[] = [];
  const diagnostics: ParseResult["diagnostics"] = [];

  const relPath = toPosix(path.relative(repoRoot, filePath));

  try {
    const source = readFileSync(filePath, "utf8");

    const ast = acorn.parse(source, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    });

    const exportedNames = new Set<string>();
    const symbolMap = new Map<string, SymbolNode>();

    // Create handler context
    const ctx: HandlerContext = {
      relPath,
      fileId,
      source,
      exportedNames,
      symbolMap,
      symbols,
      relations,
      symbolIndex: 0,
      relationIndex: 0,
    };

    // Walk the AST tree
    walkNode(ast, ctx);

    return {
      symbols,
      relations,
      diagnostics,
      parserStatus: "parsed",
      parserAdapter: "acorn-v0",
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
      parserAdapter: "acorn-v0",
    };
  }
}