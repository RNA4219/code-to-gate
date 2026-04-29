/**
 * Rule Plugin Interface for code-to-gate
 *
 * Each rule plugin detects a specific code smell or security issue.
 */

import type { RepoFile, Finding, EvidenceRef, FindingCategory, Severity, UpstreamTool } from "../types/artifacts.js";

// Re-export types for rule implementations
export type { Finding, EvidenceRef, FindingCategory, Severity, UpstreamTool };

/**
 * Simple graph structure for rule evaluation
 */
export interface SimpleGraph {
  files: RepoFile[];
  run_id: string;
  generated_at: string;
  repo: { root: string };
  stats: { partial: boolean };
}

/**
 * Context provided to rules during evaluation
 */
export interface RuleContext {
  graph: SimpleGraph;
  getFileContent(path: string): string | null;
}

/**
 * Rule Plugin Interface
 */
export interface RulePlugin {
  /** Unique identifier for the rule */
  id: string;

  /** Human-readable name */
  name: string;

  /** Detailed description of what the rule detects */
  description: string;

  /** Category of issues this rule detects */
  category: Finding["category"];

  /** Default severity for findings from this rule */
  defaultSeverity: Finding["severity"];

  /** Default confidence for findings (0.0 - 1.0) */
  defaultConfidence: number;

  /**
   * Evaluate the rule against the codebase
   * @param context Evaluation context with graph and helper methods
   * @returns Array of findings
   */
  evaluate(context: RuleContext): Finding[];
}

/**
 * Create a hash for evidence excerpt
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

/**
 * Generate a unique finding ID
 */
export function generateFindingId(ruleId: string, path: string, line?: number): string {
  const linePart = line !== undefined ? `:L${line}` : "";
  const pathHash = hashExcerpt(path);
  return `finding:${ruleId}:${pathHash}${linePart}`;
}

/**
 * Create an evidence reference
 */
export function createEvidence(
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

// === Rule Exports ===

// Existing rules
export { CLIENT_TRUSTED_PRICE_RULE } from "./client-trusted-price.js";
export { WEAK_AUTH_GUARD_RULE } from "./weak-auth-guard.js";
export { TRY_CATCH_SWALLOW_RULE } from "./try-catch-swallow.js";
export { MISSING_SERVER_VALIDATION_RULE } from "./missing-server-validation.js";
export { UNTESTED_CRITICAL_PATH_RULE } from "./untested-critical-path.js";

// New rules (Phase 1)
export { RAW_SQL_RULE } from "./raw-sql.js";
export { ENV_DIRECT_ACCESS_RULE } from "./env-direct-access.js";
export { UNSAFE_DELETE_RULE } from "./unsafe-delete.js";
export { LARGE_MODULE_RULE } from "./large-module.js";

// All rules array for easy import
import { CLIENT_TRUSTED_PRICE_RULE } from "./client-trusted-price.js";
import { WEAK_AUTH_GUARD_RULE } from "./weak-auth-guard.js";
import { TRY_CATCH_SWALLOW_RULE } from "./try-catch-swallow.js";
import { MISSING_SERVER_VALIDATION_RULE } from "./missing-server-validation.js";
import { UNTESTED_CRITICAL_PATH_RULE } from "./untested-critical-path.js";
import { RAW_SQL_RULE } from "./raw-sql.js";
import { ENV_DIRECT_ACCESS_RULE } from "./env-direct-access.js";
import { UNSAFE_DELETE_RULE } from "./unsafe-delete.js";
import { LARGE_MODULE_RULE } from "./large-module.js";

export const ALL_RULES: RulePlugin[] = [
  CLIENT_TRUSTED_PRICE_RULE,
  WEAK_AUTH_GUARD_RULE,
  TRY_CATCH_SWALLOW_RULE,
  MISSING_SERVER_VALIDATION_RULE,
  UNTESTED_CRITICAL_PATH_RULE,
  RAW_SQL_RULE,
  ENV_DIRECT_ACCESS_RULE,
  UNSAFE_DELETE_RULE,
  LARGE_MODULE_RULE,
];