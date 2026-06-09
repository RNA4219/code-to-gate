/**
 * Public entrypoint and aggregate evaluator for diff semantic assurance rules.
 */
import type { Finding, UnsupportedClaim } from "../../types/artifacts.js";
import type { AssuranceFindingRuleId } from "../../types/assurance-findings.js";
import type { HashService } from "../../types/contracts.js";
import type { DiffAccess } from "../../types/diff-contracts.js";
import type { AssuranceGraph } from "./assurance-graph.js";
import type { AssuranceRuleEvaluator, AssuranceRuleResult } from "./detection-rules.js";
import { businessRuleLocalizedRule } from "./diff-rules/business-rule-localized.js";
import { errorPathSuccessFallbackRule } from "./diff-rules/error-path-success-fallback.js";
import { guardWeakenedRule } from "./diff-rules/guard-weakened.js";
import { validationRemovedRule } from "./diff-rules/validation-removed.js";

export type { DiffAccess, DiffAccessLimits, DiffHunk, DiffLine } from "../../types/diff-contracts.js";
export { businessRuleLocalizedRule } from "./diff-rules/business-rule-localized.js";
export { errorPathSuccessFallbackRule } from "./diff-rules/error-path-success-fallback.js";
export { guardWeakenedRule } from "./diff-rules/guard-weakened.js";
export { validationRemovedRule } from "./diff-rules/validation-removed.js";

export type DiffRuleId =
  | "GUARD_WEAKENED"
  | "VALIDATION_REMOVED"
  | "ERROR_PATH_SUCCESS_FALLBACK"
  | "BUSINESS_RULE_LOCALIZED";

export interface DiffRuleEvaluator extends AssuranceRuleEvaluator {
  evaluateDiff(
    graph: AssuranceGraph,
    diffAccess: DiffAccess,
    base: string,
    head: string,
    hashService: HashService
  ): AssuranceRuleResult;
}

export interface DiffRuleContext {
  graph: AssuranceGraph;
  diffAccess: DiffAccess;
  base: string;
  head: string;
  hashService: HashService;
}

export const DIFF_SEMANTIC_RULES: readonly DiffRuleEvaluator[] = [
  guardWeakenedRule,
  validationRemovedRule,
  errorPathSuccessFallbackRule,
  businessRuleLocalizedRule,
];

export function evaluateDiffRules(
  graph: AssuranceGraph,
  diffAccess: DiffAccess,
  base: string,
  head: string,
  hashService: HashService
): AssuranceRuleResult {
  const candidates: Finding[] = [];
  const unsupportedClaims: UnsupportedClaim[] = [];
  for (const rule of DIFF_SEMANTIC_RULES) {
    const result = rule.evaluateDiff(graph, diffAccess, base, head, hashService);
    candidates.push(...result.candidates);
    unsupportedClaims.push(...result.unsupportedClaims);
  }
  return { ruleId: "DIFF_RULES" as AssuranceFindingRuleId, candidates, unsupportedClaims };
}
