/**
 * RISK_WITHOUT_TEST detection rule.
 *
 * Detects:
 * - Risk without connected test seed (via sourceRiskIds or sourceFindingIds)
 *
 * Suppression conditions:
 * - No risk or test-seeds input
 * - Risk is low severity and policy exempt
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
  type AssuranceEvidenceInput,
} from "../detection-rules.js";

const RULE_ID = "RISK_WITHOUT_TEST";
const REQUIRED_ARTIFACTS = ["risk-register.yaml", "test-seeds.json"];

// ============================================================================
// Test Coverage Check
// ============================================================================

/**
 * Check if a risk has test coverage.
 * Test seed can be linked via sourceRiskIds or common sourceFindingIds.
 */
function hasTestCoverage(
  graph: AssuranceGraph,
  riskId: string,
  sourceFindingIds: string[]
): boolean {
  const testSeedNodes = findNodesByKind(graph, "test-seed");

  for (const testSeed of testSeedNodes) {
    // Check direct link via sourceRiskIds
    const testSourceRiskIds = testSeed.data.sourceRiskIds as string[] | undefined;
    if (testSourceRiskIds && testSourceRiskIds.includes(riskId)) {
      return true;
    }

    // Check indirect link via common sourceFindingIds
    const testSourceFindingIds = testSeed.data.sourceFindingIds as string[] | undefined;
    if (testSourceFindingIds && sourceFindingIds) {
      const commonFindings = sourceFindingIds.some(
        (findingId) => testSourceFindingIds.includes(findingId)
      );
      if (commonFindings) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if risk is low severity and should be exempt.
 */
function isLowSeverityExempt(riskNode: AssuranceGraph["nodes"][0]): boolean {
  const severity = riskNode.data.severity as string | undefined;
  return severity === "low";
}

// ============================================================================
// Risk Coverage Analysis
// ============================================================================

interface RiskCoverageResult {
  riskId: string;
  riskTitle: string;
  hasTestCoverage: boolean;
  sourceFindingIds: string[];
  severity: string;
}

/**
 * Analyze all risks for test coverage.
 */
function analyzeRiskCoverage(graph: AssuranceGraph): RiskCoverageResult[] {
  const results: RiskCoverageResult[] = [];
  const riskNodes = findNodesByKind(graph, "risk");

  for (const riskNode of riskNodes) {
    const riskId = riskNode.id;
    const sourceFindingIds = (riskNode.data.sourceFindingIds as string[] | undefined) ?? [];
    const severity = (riskNode.data.severity as string | undefined) ?? "unknown";

    const hasCoverage = hasTestCoverage(graph, riskId, sourceFindingIds);

    results.push({
      riskId,
      riskTitle: riskNode.data.title as string,
      hasTestCoverage: hasCoverage,
      sourceFindingIds,
      severity,
    });
  }

  return results;
}

// ============================================================================
// Candidate Generation
// ============================================================================

/**
 * Build title for risk coverage gap finding.
 */
function buildTitle(result: RiskCoverageResult): string {
  return `Review required: Risk "${result.riskTitle}" (${result.riskId}) has no linked test seed`;
}

/**
 * Build summary for risk coverage gap finding.
 */
function buildSummary(result: RiskCoverageResult): string {
  const lines: string[] = [];

  lines.push(`Risk "${result.riskTitle}" (${result.riskId}) lacks test coverage.`);
  lines.push(`No test seed found linked via sourceRiskIds or common sourceFindingIds.`);
  lines.push(`Risk severity: ${result.severity}.`);

  if (result.sourceFindingIds.length > 0) {
    lines.push(`Source findings: ${result.sourceFindingIds.join(", ")}.`);
  } else {
    lines.push(`No source findings linked to this risk.`);
  }

  lines.push(`Consider creating a test seed to validate risk mitigation.`);
  lines.push(`Source artifact: risk-register.yaml`);

  return lines.join(" ");
}

/**
 * Build evidence input for candidate.
 */
function buildCandidateEvidence(
  result: RiskCoverageResult,
  graph: AssuranceGraph
): AssuranceEvidenceInput[] {
  const evidenceInputs: AssuranceEvidenceInput[] = [];

  // Add risk as evidence source
  const riskNode = getNodeById(graph, result.riskId);
  if (riskNode && riskNode.data.sourceArtifact) {
    evidenceInputs.push({
      path: riskNode.sourceArtifact,
      kind: "external",
      externalRef: {
        tool: "code-to-gate",
        ruleId: `risk:${result.riskId}`,
      },
    });
  }

  // Add test-seeds artifact as reference
  evidenceInputs.push({
    path: "test-seeds.json",
    kind: "external",
    externalRef: {
      tool: "code-to-gate",
      ruleId: "no-linked-test-seed",
    },
  });

  return evidenceInputs;
}

// ============================================================================
// Rule Implementation
// ============================================================================

/**
 * RISK_WITHOUT_TEST rule evaluator.
 */
export const riskWithoutTestRule: AssuranceRuleEvaluator = {
  ruleId: RULE_ID,

  evaluate(graph: AssuranceGraph, hashService: HashService): AssuranceRuleResult {
    const candidates: Finding[] = [];
    const unsupportedClaims: UnsupportedClaim[] = [];

    // Check for sufficient input - need both risk and test-seeds
    if (!hasSufficientInput(graph, REQUIRED_ARTIFACTS)) {
      unsupportedClaims.push(
        createRuleUnsupportedClaim(
          {
            ruleId: RULE_ID,
            claim: "Risk test coverage validation requires risk-register.yaml and test-seeds.json",
            reason: "partial_input",
            sourceSection: "risk-test-linkage",
          },
          hashService
        )
      );
      return { ruleId: RULE_ID, candidates, unsupportedClaims };
    }

    // Analyze risk coverage
    const riskCoverageResults = analyzeRiskCoverage(graph);

    // Generate candidates for risks without test coverage
    for (const result of riskCoverageResults) {
      // Skip if risk has test coverage
      if (result.hasTestCoverage) {
        continue;
      }

      // Skip if low severity (policy exemption)
      const riskNode = getNodeById(graph, result.riskId);
      if (riskNode && isLowSeverityExempt(riskNode)) {
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
registerAssuranceRule(riskWithoutTestRule);