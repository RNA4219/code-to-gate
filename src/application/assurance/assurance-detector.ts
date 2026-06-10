import type { Finding, Severity, UnsupportedClaim } from "../../types/artifacts.js";
import type { AssuranceFindingRuleId } from "../../types/assurance-findings.js";
import type { HashService } from "../../types/contracts.js";
import { buildAssuranceGraph, type AssuranceArtifactBundle, type AssuranceGraph } from "./assurance-graph.js";
import type { AssuranceRuleEvaluator } from "./detection-rules.js";
import type { DiffAccess } from "../../types/diff-contracts.js";
import { evidenceMissingRule } from "./rules/evidence-missing.js";
import { riskWithoutTestRule } from "./rules/risk-without-test.js";
import { invariantUnmappedRule } from "./rules/invariant-unmapped.js";
import { requirementLinkMissingRule } from "./rules/requirement-link-missing.js";
import { intentNotRecoverableRule } from "./rules/intent-not-recoverable.js";
import { releaseDecisionUnsupportedRule } from "./rules/release-decision-unsupported.js";
import { evaluateDiffRules, DIFF_SEMANTIC_RULES, type DiffRuleEvaluator } from "./diff-rules.js";

const DEFAULT_MIN_CONFIDENCE = 0.6;
const DEFAULT_CANDIDATE_LIMIT = 500;
const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export interface InspectAssuranceOptions {
  minConfidence?: number;
  candidateLimit?: number;
  rules?: readonly AssuranceRuleEvaluator[];
}

export interface AssuranceInspectionResult {
  graph: AssuranceGraph;
  candidates: Finding[];
  unsupportedClaims: UnsupportedClaim[];
  executedRuleIds: AssuranceFindingRuleId[];
  truncated: boolean;
}

export const ARTIFACT_ONLY_ASSURANCE_RULES: readonly AssuranceRuleEvaluator[] = [
  evidenceMissingRule,
  riskWithoutTestRule,
  invariantUnmappedRule,
  requirementLinkMissingRule,
  intentNotRecoverableRule,
  releaseDecisionUnsupportedRule,
];

export const DIFF_SEMANTIC_ASSURANCE_RULES: readonly DiffRuleEvaluator[] = DIFF_SEMANTIC_RULES;

export interface DiffEvaluationOptions {
  diffAccess: DiffAccess;
  base: string;
  head: string;
}

function sortCandidates(left: Finding, right: Finding): number {
  return SEVERITY_ORDER[right.severity] - SEVERITY_ORDER[left.severity]
    || left.ruleId.localeCompare(right.ruleId)
    || left.id.localeCompare(right.id);
}

function sortUnsupportedClaims(left: UnsupportedClaim, right: UnsupportedClaim): number {
  return left.id.localeCompare(right.id);
}

export function inspectAssurance(
  bundle: AssuranceArtifactBundle,
  hashService: HashService,
  options: InspectAssuranceOptions = {}
): AssuranceInspectionResult {
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const candidateLimit = options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT;
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    throw new Error("minConfidence must be between 0 and 1");
  }
  if (!Number.isInteger(candidateLimit) || candidateLimit < 1) {
    throw new Error("candidateLimit must be a positive integer");
  }

  const graph = buildAssuranceGraph(bundle);
  const rules = options.rules ?? ARTIFACT_ONLY_ASSURANCE_RULES;
  const candidateMap = new Map<string, Finding>();
  const unsupportedMap = new Map<string, UnsupportedClaim>();

  for (const rule of rules) {
    const result = rule.evaluate(graph, hashService);
    for (const candidate of result.candidates) {
      if (candidate.confidence >= minConfidence) candidateMap.set(candidate.id, candidate);
    }
    for (const unsupported of result.unsupportedClaims) {
      unsupportedMap.set(unsupported.id, unsupported);
    }
  }

  const sortedCandidates = [...candidateMap.values()].sort(sortCandidates);
  const truncated = sortedCandidates.length > candidateLimit;

  return {
    graph,
    candidates: sortedCandidates.slice(0, candidateLimit),
    unsupportedClaims: [...unsupportedMap.values()].sort(sortUnsupportedClaims),
    executedRuleIds: rules.map((rule) => rule.ruleId),
    truncated,
  };
}

/**
 * Evaluate diff semantic rules when base/head refs are provided.
 */
export function inspectAssuranceWithDiff(
  bundle: AssuranceArtifactBundle,
  hashService: HashService,
  diffOptions: DiffEvaluationOptions,
  options: InspectAssuranceOptions = {}
): AssuranceInspectionResult {
  // First run artifact-only rules
  const artifactResult = inspectAssurance(bundle, hashService, options);
  const candidateMap = new Map<string, Finding>(artifactResult.candidates.map((c) => [c.id, c]));
  const unsupportedMap = new Map<string, UnsupportedClaim>(
    artifactResult.unsupportedClaims.map((u) => [u.id, u])
  );

  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;

  // Run diff rules
  const diffResult = evaluateDiffRules(
    artifactResult.graph,
    diffOptions.diffAccess,
    diffOptions.base,
    diffOptions.head,
    hashService
  );

  for (const candidate of diffResult.candidates) {
    if (candidate.confidence >= minConfidence) candidateMap.set(candidate.id, candidate);
  }
  for (const unsupported of diffResult.unsupportedClaims) {
    unsupportedMap.set(unsupported.id, unsupported);
  }

  const candidateLimit = options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT;
  const sortedCandidates = [...candidateMap.values()].sort(sortCandidates);
  const truncated = sortedCandidates.length > candidateLimit;

  // Collect all executed rule IDs
  const artifactRuleIds = artifactResult.executedRuleIds;
  const diffRuleIds = DIFF_SEMANTIC_RULES.map((r) => r.ruleId);

  return {
    graph: artifactResult.graph,
    candidates: sortedCandidates.slice(0, candidateLimit),
    unsupportedClaims: [...unsupportedMap.values()].sort(sortUnsupportedClaims),
    executedRuleIds: [...artifactRuleIds, ...diffRuleIds],
    truncated,
  };
}
