/**
 * REQUIREMENT_LINK_MISSING detection rule.
 *
 * Detects:
 * - Intake has requirement with ID, but no finding/risk/invariant/test seed has requirement:<id> link
 *
 * Suppression conditions:
 * - No intake input
 * - No requirement ID in intake
 * - Scope determination impossible
 *
 * Spec: docs/assurance-smell-detector-spec.md Section 8.1
 */

import type {
  Finding,
  UnsupportedClaim,
} from "../../../types/artifacts.js";
import type { HashService } from "../../../types/contracts.js";
import type { AssuranceGraph } from "../assurance-graph.js";
import type { AssuranceRuleResult, AssuranceRuleEvaluator } from "../detection-rules.js";
import {
  createRuleCandidate,
  createRuleUnsupportedClaim,
  hasSufficientInput,
  findNodesByKind,
  getNodeById,
  findEdgesByKind,
  type AssuranceEvidenceInput,
} from "../detection-rules.js";

const RULE_ID = "REQUIREMENT_LINK_MISSING";
const REQUIRED_ARTIFACTS = ["intake.json"];

// ============================================================================
// Requirement Link Check
// ============================================================================

/**
 * Check if a node has requirement:<id> link in its data or tags.
 */
function hasRequirementLink(
  node: AssuranceGraph["nodes"][0],
  requirementId: string
): boolean {
  // Check sourceRequirementIds in node data
  const sourceRequirementIds = node.data.sourceRequirementIds as string[] | undefined;
  if (sourceRequirementIds && sourceRequirementIds.includes(requirementId)) {
    return true;
  }

  // Check requirement link in tags (e.g., "requirement:req-001")
  const tags = node.data.tags as string[] | undefined;
  if (tags) {
    const requirementTag = `requirement:${requirementId}`;
    if (tags.includes(requirementTag)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if requirement node has scope defined.
 * Scope could be via affects edges to files/symbols/entrypoints.
 */
function hasDefinedScope(
  graph: AssuranceGraph,
  requirementId: string
): boolean {
  // Check affects edges (requirement → file/symbol/entrypoint)
  const affectsEdges = findEdgesByKind(graph, "affects");
  const scopeEdges = affectsEdges.filter((edge) => {
    if (edge.sourceId !== requirementId) return false;
    const targetNode = getNodeById(graph, edge.targetId);
    return (
      targetNode?.kind === "file" ||
      targetNode?.kind === "symbol" ||
      targetNode?.kind === "entrypoint"
    );
  });

  return scopeEdges.length > 0;
}

// ============================================================================
// Requirement Traceability Analysis
// ============================================================================

interface RequirementTraceabilityResult {
  requirementId: string;
  requirementTitle: string;
  hasScope: boolean;
  hasLinkedNodes: boolean;
  linkedNodeCount: number;
  scopeNodes: string[];
}

/**
 * Analyze all requirements for traceability to findings/risks/invariants/test seeds.
 */
function analyzeRequirementTraceability(graph: AssuranceGraph): RequirementTraceabilityResult[] {
  const results: RequirementTraceabilityResult[] = [];
  const requirementNodes = findNodesByKind(graph, "requirement");

  for (const requirementNode of requirementNodes) {
    const requirementId = requirementNode.id;
    const requirementTitle = requirementNode.data.title as string || `Requirement ${requirementId}`;

    // Check scope
    const hasScope = hasDefinedScope(graph, requirementId);
    const scopeNodes: string[] = [];

    // Find nodes that should be linked based on scope
    const affectsEdges = findEdgesByKind(graph, "affects");
    for (const edge of affectsEdges) {
      if (edge.sourceId === requirementId) {
        const targetNode = getNodeById(graph, edge.targetId);
        if (targetNode) {
          scopeNodes.push(`${targetNode.kind}:${targetNode.id}`);
        }
      }
    }

    // Find nodes that have requirement link
    const linkableNodes = graph.nodes.filter(
      (node) =>
        node.kind === "finding" ||
        node.kind === "risk" ||
        node.kind === "invariant" ||
        node.kind === "test-seed"
    );

    const linkedNodes = linkableNodes.filter((node) =>
      hasRequirementLink(node, requirementId)
    );

    results.push({
      requirementId,
      requirementTitle,
      hasScope,
      hasLinkedNodes: linkedNodes.length > 0,
      linkedNodeCount: linkedNodes.length,
      scopeNodes,
    });
  }

  return results;
}

// ============================================================================
// Candidate Generation
// ============================================================================

/**
 * Build title for requirement link missing finding.
 */
function buildTitle(result: RequirementTraceabilityResult): string {
  return `Review required: Requirement "${result.requirementTitle}" (${result.requirementId}) has no linked findings/risks/invariants/test seeds`;
}

/**
 * Build summary for requirement link missing finding.
 */
function buildSummary(result: RequirementTraceabilityResult): string {
  const lines: string[] = [];

  lines.push(`Requirement "${result.requirementTitle}" (${result.requirementId}) lacks traceability.`);
  lines.push(`No finding/risk/invariant/test seed linked via requirement:${result.requirementId} tag or sourceRequirementIds.`);

  if (result.scopeNodes.length > 0) {
    lines.push(`Scope defined: ${result.scopeNodes.length} nodes (${result.scopeNodes.slice(0, 3).join(", ")}${result.scopeNodes.length > 3 ? "..." : ""}).`);
  } else {
    lines.push(`No scope defined for requirement.`);
  }

  lines.push(`Consider linking findings/risks/invariants to requirement.`);
  lines.push(`Source artifact: intake.json`);

  return lines.join(" ");
}

/**
 * Build evidence input for candidate.
 */
function buildCandidateEvidence(
  result: RequirementTraceabilityResult,
  graph: AssuranceGraph
): AssuranceEvidenceInput[] {
  const evidenceInputs: AssuranceEvidenceInput[] = [];

  // Add requirement node as evidence source
  const requirementNode = getNodeById(graph, result.requirementId);
  if (requirementNode && requirementNode.sourceArtifact) {
    evidenceInputs.push({
      path: requirementNode.sourceArtifact,
      kind: "external",
      externalRef: {
        tool: "intake",
        ruleId: `requirement:${result.requirementId}`,
      },
    });
  }

  // Add intake artifact as reference
  evidenceInputs.push({
    path: "intake.json",
    kind: "external",
    externalRef: {
      tool: "code-to-gate",
      ruleId: "requirement-link-missing",
    },
  });

  return evidenceInputs;
}

// ============================================================================
// Rule Implementation
// ============================================================================

/**
 * REQUIREMENT_LINK_MISSING rule evaluator.
 */
export const requirementLinkMissingRule: AssuranceRuleEvaluator = {
  ruleId: RULE_ID,

  evaluate(graph: AssuranceGraph, hashService: HashService): AssuranceRuleResult {
    const candidates: Finding[] = [];
    const unsupportedClaims: UnsupportedClaim[] = [];

    // Check for sufficient input - need intake
    if (!hasSufficientInput(graph, REQUIRED_ARTIFACTS)) {
      unsupportedClaims.push(
        createRuleUnsupportedClaim(
          {
            ruleId: RULE_ID,
            claim: "Requirement link validation requires intake.json",
            reason: "partial_input",
            sourceSection: "requirement-traceability",
          },
          hashService
        )
      );
      return { ruleId: RULE_ID, candidates, unsupportedClaims };
    }

    // Analyze requirement traceability
    const traceabilityResults = analyzeRequirementTraceability(graph);

    // If no requirement nodes, generate unsupported claim (scope determination impossible)
    if (traceabilityResults.length === 0) {
      unsupportedClaims.push(
        createRuleUnsupportedClaim(
          {
            ruleId: RULE_ID,
            claim: "Intake has no requirement nodes with IDs",
            reason: "partial_input",
            sourceSection: "requirement-traceability",
          },
          hashService
        )
      );
      return { ruleId: RULE_ID, candidates, unsupportedClaims };
    }

    // Generate candidates for requirements without linked nodes
    for (const result of traceabilityResults) {
      // Skip if requirement has linked nodes
      if (result.hasLinkedNodes) {
        continue;
      }

      // Skip if scope determination impossible (no scope defined)
      if (!result.hasScope) {
        // Scope not defined - cannot determine which nodes should be linked
        continue;
      }

      const candidateEvidence = buildCandidateEvidence(result, graph);
      if (candidateEvidence.length === 0) {
        continue;
      }

      const candidate = createRuleCandidate(
        {
          ruleId: RULE_ID,
          title: buildTitle(result),
          summary: buildSummary(result),
          evidence: candidateEvidence,
        },
        hashService
      );

      candidates.push(candidate);
    }

    return { ruleId: RULE_ID, candidates, unsupportedClaims };
  },
};

// Register the rule
import { registerAssuranceRule } from "../detection-rules.js";
registerAssuranceRule(requirementLinkMissingRule);