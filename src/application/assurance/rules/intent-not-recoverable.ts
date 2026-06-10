/**
 * INTENT_NOT_RECOVERABLE detection rule.
 *
 * Detects:
 * - Changed critical entrypoint/business/security path has no trace to intent, requirement, invariant, or test
 *
 * Suppression conditions:
 * - Diff input missing
 * - Intake/invariant/test input missing (cannot evaluate intent recoverability)
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

const RULE_ID = "INTENT_NOT_RECOVERABLE";
const TRACEABILITY_ARTIFACTS = ["intake.json", "invariants.json", "test-seeds.json"];
const REQUIRED_ARTIFACTS_FOR_DIFF = ["diff-analysis.json"];

// ============================================================================
// Intent Traceability Check
// ============================================================================

/**
 * Check if an entrypoint has traceability to intent/requirement/invariant/test.
 */
function hasIntentTraceability(
  graph: AssuranceGraph,
  entrypointId: string
): boolean {
  // Check if entrypoint has declared intent
  const entrypointNode = getNodeById(graph, entrypointId);
  if (!entrypointNode) return false;

  // Check intent in entrypoint data
  const intent = entrypointNode.data.intent as string | undefined;
  if (intent) {
    return true;
  }

  // Check maps-to edges (entrypoint → intent/requirement)
  const mapsToEdges = findEdgesByKind(graph, "maps-to");
  const hasIntentLink = mapsToEdges.some((edge) => {
    if (edge.sourceId !== entrypointId) return false;
    const targetNode = getNodeById(graph, edge.targetId);
    return targetNode?.kind === "intent" || targetNode?.kind === "requirement";
  });
  if (hasIntentLink) {
    return true;
  }

  // Check affects edges (intent/requirement/invariant → entrypoint)
  const affectsEdges = findEdgesByKind(graph, "affects");
  const hasInvariantLink = affectsEdges.some((edge) => {
    if (edge.targetId !== entrypointId) return false;
    const sourceNode = getNodeById(graph, edge.sourceId);
    return sourceNode?.kind === "intent" ||
      sourceNode?.kind === "requirement" ||
      sourceNode?.kind === "invariant";
  });
  if (hasInvariantLink) {
    return true;
  }

  // Check tested-by edges (test-seed → entrypoint via symbol coverage)
  // Test seeds may cover symbols that belong to entrypoints
  const testedByEdges = findEdgesByKind(graph, "tested-by");
  const hasTestLink = testedByEdges.some((edge) => {
    if (edge.targetId !== entrypointId) return false;
    const sourceNode = getNodeById(graph, edge.sourceId);
    return sourceNode?.kind === "test-seed";
  });
  if (hasTestLink) {
    return true;
  }

  // Check if entrypoint's symbolId has test coverage
  const symbolId = entrypointNode.data.symbolId as string | undefined;
  if (symbolId) {
    const symbolNode = getNodeById(graph, symbolId);
    if (symbolNode) {
      const symbolTestedBy = testedByEdges.some((edge) => {
        if (edge.targetId !== symbolId) return false;
        const sourceNode = getNodeById(graph, edge.sourceId);
        return sourceNode?.kind === "test-seed";
      });
      if (symbolTestedBy) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if entrypoint is critical (high risk level or business/security category).
 */
function isCriticalEntrypoint(
  entrypointNode: AssuranceGraph["nodes"][0]
): boolean {
  // Check riskLevel in entrypoint data
  const riskLevel = entrypointNode.data.riskLevel as string | undefined;
  if (riskLevel === "critical" || riskLevel === "high") {
    return true;
  }

  // Check kind indicates critical path (business/security)
  const kind = entrypointNode.data.kind as string | undefined;
  if (kind === "business" || kind === "security") {
    return true;
  }

  // Check tags for critical indicator
  const tags = entrypointNode.data.tags as string[] | undefined;
  if (tags && (tags.includes("critical-path") || tags.includes("security-path") || tags.includes("business-path"))) {
    return true;
  }

  return false;
}

/**
 * Check if entrypoint is changed (has changed-by edge).
 */
function isChangedEntrypoint(
  graph: AssuranceGraph,
  entrypointId: string
): boolean {
  const changedByEdges = findEdgesByKind(graph, "changed-by");
  return changedByEdges.some((edge) => edge.targetId === entrypointId);
}

// ============================================================================
// Intent Recoverability Analysis
// ============================================================================

interface EntrypointIntentResult {
  entrypointId: string;
  entrypointName: string;
  isCritical: boolean;
  isChanged: boolean;
  hasIntentTrace: boolean;
  traceDetails: string[];
}

/**
 * Analyze all entrypoints for intent recoverability.
 */
function analyzeEntrypointIntentRecoverability(graph: AssuranceGraph): EntrypointIntentResult[] {
  const results: EntrypointIntentResult[] = [];
  const entrypointNodes = findNodesByKind(graph, "entrypoint");

  for (const entrypointNode of entrypointNodes) {
    const entrypointId = entrypointNode.id;
    const entrypointName = entrypointNode.data.name as string || `Entrypoint ${entrypointId}`;

    const traceDetails: string[] = [];

    // Check for intent declaration
    const intent = entrypointNode.data.intent as string | undefined;
    if (intent) {
      traceDetails.push("has declared intent");
    }

    // Check for requirement link
    const mapsToEdges = findEdgesByKind(graph, "maps-to");
    const requirementLinks = mapsToEdges.filter(
      (edge) => edge.sourceId === entrypointId
    );
    if (requirementLinks.length > 0) {
      traceDetails.push(`linked to ${requirementLinks.length} requirements`);
    }

    // Check for invariant link
    const affectsEdges = findEdgesByKind(graph, "affects");
    const invariantLinks = affectsEdges.filter((edge) => {
      if (edge.targetId !== entrypointId) return false;
      const sourceNode = getNodeById(graph, edge.sourceId);
      return sourceNode?.kind === "invariant";
    });
    if (invariantLinks.length > 0) {
      traceDetails.push(`covered by ${invariantLinks.length} invariants`);
    }

    // Check for test link
    const testedByEdges = findEdgesByKind(graph, "tested-by");
    const testLinks = testedByEdges.filter((edge) => {
      if (edge.targetId !== entrypointId) return false;
      const sourceNode = getNodeById(graph, edge.sourceId);
      return sourceNode?.kind === "test-seed";
    });
    if (testLinks.length > 0) {
      traceDetails.push(`tested by ${testLinks.length} tests`);
    }

    results.push({
      entrypointId,
      entrypointName,
      isCritical: isCriticalEntrypoint(entrypointNode),
      isChanged: isChangedEntrypoint(graph, entrypointId),
      hasIntentTrace: hasIntentTraceability(graph, entrypointId),
      traceDetails,
    });
  }

  return results;
}

// ============================================================================
// Candidate Generation
// ============================================================================

/**
 * Build title for intent not recoverable finding.
 */
function buildTitle(result: EntrypointIntentResult): string {
  return `Review required: Changed critical entrypoint "${result.entrypointName}" (${result.entrypointId}) has no intent traceability`;
}

/**
 * Build summary for intent not recoverable finding.
 */
function buildSummary(result: EntrypointIntentResult): string {
  const lines: string[] = [];

  lines.push(`Changed critical entrypoint "${result.entrypointName}" (${result.entrypointId}) lacks intent traceability.`);
  lines.push(`No link found to intent, requirement, invariant, or test.`);

  if (result.traceDetails.length > 0) {
    lines.push(`Existing references: ${result.traceDetails.join("; ")}.`);
  } else {
    lines.push(`No intent/requirement/invariant/test references found.`);
  }

  lines.push(`Consider documenting intent, linking to requirement, or adding tests.`);
  lines.push(`Source artifact: repo-graph.json`);

  return lines.join(" ");
}

/**
 * Build evidence input for candidate.
 */
function buildCandidateEvidence(
  result: EntrypointIntentResult,
  graph: AssuranceGraph
): AssuranceEvidenceInput[] {
  const evidenceInputs: AssuranceEvidenceInput[] = [];

  // Add entrypoint as evidence source
  const entrypointNode = getNodeById(graph, result.entrypointId);
  if (entrypointNode && entrypointNode.sourceArtifact) {
    evidenceInputs.push({
      path: entrypointNode.sourceArtifact,
      kind: "external",
      externalRef: {
        tool: "code-to-gate",
        ruleId: `entrypoint:${result.entrypointId}`,
      },
    });
  }

  // Add repo-graph artifact as reference
  evidenceInputs.push({
    path: "repo-graph.json",
    kind: "external",
    externalRef: {
      tool: "code-to-gate",
      ruleId: "intent-not-recoverable",
    },
  });

  return evidenceInputs;
}

// ============================================================================
// Rule Implementation
// ============================================================================

/**
 * INTENT_NOT_RECOVERABLE rule evaluator.
 */
export const intentNotRecoverableRule: AssuranceRuleEvaluator = {
  ruleId: RULE_ID,

  evaluate(graph: AssuranceGraph, hashService: HashService): AssuranceRuleResult {
    const candidates: Finding[] = [];
    const unsupportedClaims: UnsupportedClaim[] = [];

    // A changed path must be proven by diff, with at least one source available
    // for recovering intent. Without both, no candidate can be supported.
    const hasTraceabilityInput = TRACEABILITY_ARTIFACTS.some((artifact) =>
      hasSufficientInput(graph, [artifact])
    );
    const hasDiffInput = hasSufficientInput(graph, REQUIRED_ARTIFACTS_FOR_DIFF);

    if (!hasTraceabilityInput || !hasDiffInput) {
      unsupportedClaims.push(
        createRuleUnsupportedClaim(
          {
            ruleId: RULE_ID,
            claim: "Intent recoverability evaluation requires diff-analysis.json and at least one intake/invariant/test artifact",
            reason: "partial_input",
            sourceSection: "intent-recoverability",
          },
          hashService
        )
      );
      return { ruleId: RULE_ID, candidates, unsupportedClaims };
    }

    // Analyze entrypoint intent recoverability
    const recoverabilityResults = analyzeEntrypointIntentRecoverability(graph);

    // Generate candidates for changed critical entrypoints without intent trace
    for (const result of recoverabilityResults) {
      // Skip if not critical
      if (!result.isCritical) {
        continue;
      }

      // Diff input is mandatory, so only explicitly changed entrypoints qualify.
      if (!result.isChanged) {
        continue;
      }

      // Skip if has intent trace
      if (result.hasIntentTrace) {
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
registerAssuranceRule(intentNotRecoverableRule);
