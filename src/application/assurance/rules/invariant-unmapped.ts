/**
 * INVARIANT_UNMAPPED detection rule.
 *
 * Detects:
 * - Invariant not traceable to source finding, test seed, or symbol/entrypoint
 *
 * Suppression conditions:
 * - No invariants input
 * - Invariant explicitly marked needs_human_confirmation
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

const RULE_ID = "INVARIANT_UNMAPPED";
const REQUIRED_ARTIFACTS = ["invariants.json"];

// ============================================================================
// Traceability Check
// ============================================================================

/**
 * Check if an invariant is traceable to findings or test seeds.
 * Note: Symbol/entrypoint traceability requires extended Invariant type.
 */
function hasTraceability(
  graph: AssuranceGraph,
  invariantId: string,
  invariantNode: AssuranceGraph["nodes"][0]
): boolean {
  // Check derived-from edges (invariant → finding)
  const derivedFromEdges = findEdgesByKind(graph, "derived-from");
  const hasFindingLink = derivedFromEdges.some((edge) => {
    if (edge.sourceId !== invariantId) return false;
    const targetNode = getNodeById(graph, edge.targetId);
    return targetNode?.kind === "finding";
  });
  if (hasFindingLink) {
    return true;
  }

  // Check sourceFindingIds in invariant data
  const sourceFindingIds = invariantNode.data.sourceFindingIds as string[] | undefined;
  if (sourceFindingIds && sourceFindingIds.length > 0) {
    return true;
  }

  // Check tested-by edges (test-seed → invariant)
  const testedByEdges = findEdgesByKind(graph, "tested-by");
  const hasTestSeedLink = testedByEdges.some((edge) => {
    if (edge.targetId !== invariantId) return false;
    const sourceNode = getNodeById(graph, edge.sourceId);
    return sourceNode?.kind === "test-seed";
  });
  if (hasTestSeedLink) {
    return true;
  }

  return false;
}

/**
 * Check if invariant needs human confirmation (policy exemption).
 * Note: This requires extended Invariant type with needs_human_confirmation field.
 * Currently returns false as the base type doesn't have this field.
 */
function needsHumanConfirmation(invariantNode: AssuranceGraph["nodes"][0]): boolean {
  const needsConfirmation = invariantNode.data.needs_human_confirmation as boolean | undefined;
  return needsConfirmation === true;
}

// ============================================================================
// Invariant Traceability Analysis
// ============================================================================

interface InvariantTraceabilityResult {
  invariantId: string;
  invariantStatement: string;
  hasTraceability: boolean;
  traceDetails: string[];
  needsHumanConfirmation: boolean;
}

/**
 * Analyze all invariants for traceability.
 */
function analyzeInvariantTraceability(graph: AssuranceGraph): InvariantTraceabilityResult[] {
  const results: InvariantTraceabilityResult[] = [];
  const invariantNodes = findNodesByKind(graph, "invariant");

  for (const invariantNode of invariantNodes) {
    const invariantId = invariantNode.id;
    const traceDetails: string[] = [];

    // Check various traceability paths
    const derivedFromEdges = findEdgesByKind(graph, "derived-from");
    const findingLinks = derivedFromEdges.filter((edge) => {
      if (edge.sourceId !== invariantId) return false;
      const targetNode = getNodeById(graph, edge.targetId);
      return targetNode?.kind === "finding";
    });
    if (findingLinks.length > 0) {
      traceDetails.push(`linked to ${findingLinks.length} findings via derived-from edges`);
    }

    const sourceFindingIds = invariantNode.data.sourceFindingIds as string[] | undefined;
    if (sourceFindingIds && sourceFindingIds.length > 0) {
      traceDetails.push(`has ${sourceFindingIds.length} sourceFindingIds`);
    }

    const testedByEdges = findEdgesByKind(graph, "tested-by");
    const testSeedLinks = testedByEdges.filter((edge) => {
      if (edge.targetId !== invariantId) return false;
      const sourceNode = getNodeById(graph, edge.sourceId);
      return sourceNode?.kind === "test-seed";
    });
    if (testSeedLinks.length > 0) {
      traceDetails.push(`linked to ${testSeedLinks.length} test seeds via tested-by edges`);
    }

    const hasTrace = hasTraceability(graph, invariantId, invariantNode);
    const needsConfirm = needsHumanConfirmation(invariantNode);

    results.push({
      invariantId,
      invariantStatement: invariantNode.data.statement as string,
      hasTraceability: hasTrace,
      traceDetails,
      needsHumanConfirmation: needsConfirm,
    });
  }

  return results;
}

// ============================================================================
// Candidate Generation
// ============================================================================

/**
 * Build title for invariant unmapped finding.
 */
function buildTitle(result: InvariantTraceabilityResult): string {
  return `Review required: Invariant "${result.invariantStatement.slice(0, 50)}..." (${result.invariantId}) has no traceability`;
}

/**
 * Build summary for invariant unmapped finding.
 */
function buildSummary(result: InvariantTraceabilityResult): string {
  const lines: string[] = [];

  lines.push(`Invariant "${result.invariantStatement}" (${result.invariantId}) lacks traceability.`);
  lines.push(`No linkage found to source finding or test seed.`);

  if (result.traceDetails.length > 0) {
    lines.push(`Existing references: ${result.traceDetails.join("; ")}.`);
  } else {
    lines.push(`No references found in invariant data.`);
  }

  lines.push(`Consider linking invariant to source finding.`);
  lines.push(`Source artifact: invariants.json`);

  return lines.join(" ");
}

/**
 * Build evidence input for candidate.
 */
function buildCandidateEvidence(
  result: InvariantTraceabilityResult,
  graph: AssuranceGraph
): AssuranceEvidenceInput[] {
  const evidenceInputs: AssuranceEvidenceInput[] = [];

  // Add invariant as evidence source
  const invariantNode = getNodeById(graph, result.invariantId);
  if (invariantNode && invariantNode.data.sourceArtifact) {
    evidenceInputs.push({
      path: invariantNode.sourceArtifact,
      kind: "external",
      externalRef: {
        tool: "code-to-gate",
        ruleId: `invariant:${result.invariantId}`,
      },
    });
  }

  // Add invariants artifact as reference
  evidenceInputs.push({
    path: "invariants.json",
    kind: "external",
    externalRef: {
      tool: "code-to-gate",
      ruleId: "unmapped-invariant",
    },
  });

  return evidenceInputs;
}

// ============================================================================
// Rule Implementation
// ============================================================================

/**
 * INVARIANT_UNMAPPED rule evaluator.
 */
export const invariantUnmappedRule: AssuranceRuleEvaluator = {
  ruleId: RULE_ID,

  evaluate(graph: AssuranceGraph, hashService: HashService): AssuranceRuleResult {
    const candidates: Finding[] = [];
    const unsupportedClaims: UnsupportedClaim[] = [];

    // Check for sufficient input - need invariants
    if (!hasSufficientInput(graph, REQUIRED_ARTIFACTS)) {
      unsupportedClaims.push(
        createRuleUnsupportedClaim(
          {
            ruleId: RULE_ID,
            claim: "Invariant traceability validation requires invariants.json",
            reason: "partial_input",
            sourceSection: "invariant-traceability",
          },
          hashService
        )
      );
      return { ruleId: RULE_ID, candidates, unsupportedClaims };
    }

    // Analyze invariant traceability
    const traceabilityResults = analyzeInvariantTraceability(graph);

    // Generate candidates for invariants without traceability
    for (const result of traceabilityResults) {
      // Skip if invariant has traceability
      if (result.hasTraceability) {
        continue;
      }

      // Skip if needs human confirmation (policy exemption)
      if (result.needsHumanConfirmation) {
        continue;
      }

      const candidateEvidence = buildCandidateEvidence(result, graph);
      if (candidateEvidence.length === 0) {
        // Must have at least one evidence for a finding
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
registerAssuranceRule(invariantUnmappedRule);