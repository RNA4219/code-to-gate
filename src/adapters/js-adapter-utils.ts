/**
 * JavaScript Adapter Utility Functions
 * Helper functions for parsing JavaScript files
 */

import { sha256, toPosix } from "../core/path-utils.js";
import type { EvidenceRef, SymbolNode } from "../types/graph.js";

/**
 * Get line number from position in source
 */
export function getLineFromPosition(source: string, position: number): number {
  const lines = source.slice(0, position).split("\n");
  return lines.length;
}

/**
 * Create evidence reference
 */
export function createEvidence(
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
 * Determine symbol kind from name and context
 */
export function getSymbolKind(name: string, filePath: string, nodeType: string): SymbolNode["kind"] {
  if (
    filePath.includes("/tests/") ||
    filePath.includes(".test.") ||
    filePath.includes(".spec.")
  ) {
    return "test";
  }

  if (
    name.toLowerCase().includes("route") ||
    name.toLowerCase().includes("handler") ||
    name.toLowerCase().includes("controller")
  ) {
    return "route";
  }

  switch (nodeType) {
    case "FunctionDeclaration":
    case "ArrowFunctionExpression":
      return "function";
    case "ClassDeclaration":
      return "class";
    case "MethodDefinition":
      return "method";
    case "VariableDeclarator":
      return "variable";
    default:
      return "unknown";
  }
}

/**
 * Get node location (start/end line)
 */
export function getNodeLoc(node: any, source: string): { startLine: number; endLine: number } {
  const startLine = node.loc?.start?.line ?? getLineFromPosition(source, node.start);
  const endLine = node.loc?.end?.line ?? getLineFromPosition(source, node.end);
  return { startLine, endLine };
}

/**
 * Get identifier name from AST node
 */
export function getIdName(id: any): string | null {
  if (!id) return null;
  if (id.type === "Identifier") return id.name;
  return null;
}