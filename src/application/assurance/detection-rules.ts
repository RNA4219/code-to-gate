/**
 * Assurance detection rule infrastructure.
 *
 * Rules inspect AssuranceGraph and produce candidates or unsupported claims.
 * They are pure functions - no I/O, no side effects.
 *
 * Spec: docs/assurance-smell-detector-spec.md Section 7-8
 */

import type {
  Finding,
  UnsupportedClaim,
} from "../../types/artifacts.js";
import type {
  AssuranceFindingRuleId,
} from "../../types/assurance-findings.js";
import type {
  AssuranceGraph,
  AssuranceNode,
  AssuranceEdge,
} from "./assurance-graph.js";
import type { HashService } from "../../types/contracts.js";
import {
  createAssuranceFinding,
  createAssuranceUnsupportedClaim,
  type CreateAssuranceFindingInput,
  type CreateAssuranceUnsupportedClaimInput,
  type AssuranceEvidenceInput,
} from "./finding-factory.js";

// ============================================================================
// Rule Result Types
// ============================================================================

export interface AssuranceRuleResult {
  ruleId: AssuranceFindingRuleId;
  candidates: Finding[];
  unsupportedClaims: UnsupportedClaim[];
}

// ============================================================================
// Rule Evaluator Interface
// ============================================================================

/**
 * Interface for assurance detection rules.
 * Rules receive AssuranceGraph and produce candidates/unsupported claims.
 */
export interface AssuranceRuleEvaluator {
  readonly ruleId: AssuranceFindingRuleId;
  evaluate(
    graph: AssuranceGraph,
    hashService: HashService
  ): AssuranceRuleResult;
}

// ============================================================================
// Rule Registry
// ============================================================================

const ruleRegistry = new Map<AssuranceFindingRuleId, AssuranceRuleEvaluator>();

/**
 * Register a rule evaluator.
 */
export function registerAssuranceRule(rule: AssuranceRuleEvaluator): void {
  ruleRegistry.set(rule.ruleId, rule);
}

/**
 * Get a registered rule by ID.
 */
export function getAssuranceRule(
  ruleId: AssuranceFindingRuleId
): AssuranceRuleEvaluator | undefined {
  return ruleRegistry.get(ruleId);
}

/**
 * Get all registered rules.
 */
export function getAllAssuranceRules(): AssuranceRuleEvaluator[] {
  return [...ruleRegistry.values()];
}

// ============================================================================
// Helper Functions for Rules
// ============================================================================

/**
 * Create a candidate finding from rule detection.
 */
export function createRuleCandidate(
  input: CreateAssuranceFindingInput,
  hashService: HashService
): Finding {
  return createAssuranceFinding(input, hashService);
}

/**
 * Create an unsupported claim when input is insufficient.
 */
export function createRuleUnsupportedClaim(
  input: CreateAssuranceUnsupportedClaimInput,
  hashService: HashService
): UnsupportedClaim {
  return createAssuranceUnsupportedClaim(input, hashService);
}

// Re-export evidence input type for rules
export type { AssuranceEvidenceInput };

/**
 * Check if the graph has sufficient input for a rule.
 */
export function hasSufficientInput(
  graph: AssuranceGraph,
  requiredArtifacts: string[]
): boolean {
  for (const artifact of requiredArtifacts) {
    const coverage = graph.coverage.artifacts.find(
      (a) => a.artifact === artifact
    );
    if (!coverage || !coverage.loaded) {
      return false;
    }
  }
  return true;
}

/**
 * Get missing artifacts for unsupported claim generation.
 */
export function getMissingArtifacts(graph: AssuranceGraph): string[] {
  return graph.coverage.missingArtifacts;
}

/**
 * Find nodes by kind in the graph.
 */
export function findNodesByKind(
  graph: AssuranceGraph,
  kind: string
): AssuranceNode[] {
  return graph.nodes.filter((node) => node.kind === kind);
}

/**
 * Find edges by kind in the graph.
 */
export function findEdgesByKind(
  graph: AssuranceGraph,
  kind: string
): AssuranceEdge[] {
  return graph.edges.filter((edge) => edge.kind === kind);
}

/**
 * Check if a node exists in the graph.
 */
export function nodeExists(graph: AssuranceGraph, nodeId: string): boolean {
  return graph.nodes.some((node) => node.id === nodeId);
}

/**
 * Get a node by ID.
 */
export function getNodeById(
  graph: AssuranceGraph,
  nodeId: string
): AssuranceNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}