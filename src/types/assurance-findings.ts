/**
 * Vocabulary for future Assurance Smell Detector work.
 *
 * These values describe review-required assurance gaps. They do not assert
 * that a finding is a confirmed bug or make a release decision.
 */
export const ASSURANCE_FINDING_RULE_IDS = [
  "INTENT_NOT_RECOVERABLE",
  "REQUIREMENT_LINK_MISSING",
  "RISK_WITHOUT_TEST",
  "EVIDENCE_MISSING",
  "INVARIANT_UNMAPPED",
  "GUARD_WEAKENED",
  "VALIDATION_REMOVED",
  "ERROR_PATH_SUCCESS_FALLBACK",
  "BUSINESS_RULE_LOCALIZED",
  "RELEASE_DECISION_UNSUPPORTED",
] as const;

export type AssuranceFindingRuleId = (typeof ASSURANCE_FINDING_RULE_IDS)[number];

export const ASSURANCE_FINDING_TAGS = {
  ASSURANCE_SMELL: "assurance-smell",
  INTENT_NOT_RECOVERABLE: "intent-not-recoverable",
  REQUIREMENT_LINK_MISSING: "requirement-link-missing",
  RISK_WITHOUT_TEST: "risk-without-test",
  MISSING_EVIDENCE: "missing-evidence",
  INVARIANT_UNMAPPED: "invariant-unmapped",
  RELEASE_DECISION_UNSUPPORTED: "release-decision-unsupported",
} as const;

export type AssuranceFindingTag =
  (typeof ASSURANCE_FINDING_TAGS)[keyof typeof ASSURANCE_FINDING_TAGS];

export function isAssuranceFindingRuleId(value: string): value is AssuranceFindingRuleId {
  return ASSURANCE_FINDING_RULE_IDS.some((ruleId) => ruleId === value);
}

export function assuranceFindingTags(...tags: AssuranceFindingTag[]): string[] {
  return [...new Set([ASSURANCE_FINDING_TAGS.ASSURANCE_SMELL, ...tags])];
}
