/**
 * INTENT_NOT_RECOVERABLE detection rule.
 *
 * Detects changed critical entrypoints or business/security paths with no trace
 * to intent, requirement, invariant, or test evidence.
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
} from "../detection-rules.js";
import {
  buildIntentNotRecoverableCandidateEvidence,
  buildIntentNotRecoverableSummary,
  buildIntentNotRecoverableTitle,
} from "./intent-not-recoverable-candidate.js";
import { analyzeEntrypointIntentRecoverability } from "./intent-not-recoverable-analysis.js";

const RULE_ID = "INTENT_NOT_RECOVERABLE";
const TRACEABILITY_ARTIFACTS = ["intake.json", "invariants.json", "test-seeds.json"];
const REQUIRED_ARTIFACTS_FOR_DIFF = ["diff-analysis.json"];

export const intentNotRecoverableRule: AssuranceRuleEvaluator = {
  ruleId: RULE_ID,

  evaluate(graph: AssuranceGraph, hashService: HashService): AssuranceRuleResult {
    const candidates: Finding[] = [];
    const unsupportedClaims: UnsupportedClaim[] = [];

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

    for (const result of analyzeEntrypointIntentRecoverability(graph)) {
      if (!result.isCritical || !result.isChanged || result.hasIntentTrace) continue;

      const evidence = buildIntentNotRecoverableCandidateEvidence(result, graph);
      if (evidence.length === 0) continue;

      candidates.push(
        createRuleCandidate(
          {
            ruleId: RULE_ID,
            title: buildIntentNotRecoverableTitle(result),
            summary: buildIntentNotRecoverableSummary(result),
            evidence,
          },
          hashService
        )
      );
    }

    return { ruleId: RULE_ID, candidates, unsupportedClaims };
  },
};

import { registerAssuranceRule } from "../detection-rules.js";
registerAssuranceRule(intentNotRecoverableRule);
