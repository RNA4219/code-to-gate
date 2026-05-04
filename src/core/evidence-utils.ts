/**
 * Evidence utility functions
 * Shared evidence creation for adapters and rules
 */

import { sha256 } from "./path-utils.js";
import type { EvidenceRef } from "../types/graph.js";

/**
 * Create an evidence reference for AST-based findings (adapters)
 */
export function createAstEvidence(
  id: string,
  filePath: string,
  startLine: number,
  endLine: number,
  nodeId?: string,
  symbolId?: string
): EvidenceRef {
  return {
    id,
    path: filePath,
    startLine,
    endLine,
    kind: "ast",
    excerptHash: sha256(`${filePath}:${startLine}-${endLine}`),
    nodeId,
    symbolId,
  };
}

/**
 * Create an evidence reference for rule findings
 */
export function createRuleEvidence(
  path: string,
  startLine: number,
  endLine: number,
  kind: EvidenceRef["kind"] = "text",
  excerpt?: string
): EvidenceRef {
  const evidence: EvidenceRef = {
    id: `evidence:${path}:${startLine}-${endLine}`,
    path,
    startLine,
    endLine,
    kind,
  };

  if (kind === "text" && excerpt) {
    evidence.excerptHash = hashExcerpt(excerpt);
  }

  return evidence;
}

/**
 * Hash excerpt for evidence tracking (32-bit hash, 8 chars)
 * Used for rule findings - faster than SHA-256
 */
export function hashExcerpt(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}