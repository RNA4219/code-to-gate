/**
 * JavaScript Adapter Utility Functions
 * Helper functions for parsing JavaScript files
 */

import { createAstEvidence } from "../core/evidence-utils.js";
import { getBaseSymbolKind, mapNodeTypeToKind } from "./symbol-kind-utils.js";
import type { SymbolNode } from "../types/graph.js";

// Re-export createAstEvidence for convenience
export { createAstEvidence as createEvidence };

/**
 * Get line number from position in source
 */
export function getLineFromPosition(source: string, position: number): number {
  const lines = source.slice(0, position).split("\n");
  return lines.length;
}

/**
 * Determine symbol kind from name and context
 */
export function getSymbolKind(name: string, filePath: string, nodeType: string): SymbolNode["kind"] {
  const baseKind = getBaseSymbolKind(filePath, name);
  if (baseKind) return baseKind;
  return mapNodeTypeToKind(nodeType);
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