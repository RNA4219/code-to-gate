/**
 * Vocabulary for Assurance Smell Detector work.
 *
 * These values describe review-required assurance gaps. They do not assert
 * that a finding is a confirmed bug or make a release decision.
 *
 * Spec: docs/assurance-smell-detector-spec.md
 */

// ============================================================================
// Rule IDs (Section 8 of spec)
// ============================================================================

/**
 * All 10 Assurance Smell Detector rule IDs.
 * Ordered by spec section 8.1 (artifact-cross) then 8.2 (diff-semantic).
 */
export const ASSURANCE_FINDING_RULE_IDS = [
  // Artifact-cross rules (Section 8.1)
  "EVIDENCE_MISSING",
  "RISK_WITHOUT_TEST",
  "INVARIANT_UNMAPPED",
  "REQUIREMENT_LINK_MISSING",
  "INTENT_NOT_RECOVERABLE",
  "RELEASE_DECISION_UNSUPPORTED",
  // Diff-semantic rules (Section 8.2)
  "GUARD_WEAKENED",
  "VALIDATION_REMOVED",
  "ERROR_PATH_SUCCESS_FALLBACK",
  "BUSINESS_RULE_LOCALIZED",
] as const;

export type AssuranceFindingRuleId = (typeof ASSURANCE_FINDING_RULE_IDS)[number];

/**
 * Type guard for AssuranceFindingRuleId
 */
export function isAssuranceFindingRuleId(value: string): value is AssuranceFindingRuleId {
  return ASSURANCE_FINDING_RULE_IDS.some((ruleId) => ruleId === value);
}

// ============================================================================
// Tags (Section 9.1 of spec)
// ============================================================================

/**
 * Required tags for all assurance findings.
 */
export const REQUIRED_ASSURANCE_TAGS = {
  ASSURANCE_SMELL: "assurance-smell",
  REVIEW_REQUIRED: "review-required",
} as const;

/**
 * Rule-specific tags (lowercase kebab-case of rule ID).
 * Spec: "rule固有tagはrule IDをlower kebab-caseへ変換した値を正本とする"
 */
export const RULE_SPECIFIC_TAGS = {
  EVIDENCE_MISSING: "evidence-missing",
  RISK_WITHOUT_TEST: "risk-without-test",
  INVARIANT_UNMAPPED: "invariant-unmapped",
  REQUIREMENT_LINK_MISSING: "requirement-link-missing",
  INTENT_NOT_RECOVERABLE: "intent-not-recoverable",
  RELEASE_DECISION_UNSUPPORTED: "release-decision-unsupported",
  GUARD_WEAKENED: "guard-weakened",
  VALIDATION_REMOVED: "validation-removed",
  ERROR_PATH_SUCCESS_FALLBACK: "error-path-success-fallback",
  BUSINESS_RULE_LOCALIZED: "business-rule-localized",
} as const;

/**
 * Auxiliary tags (Section 9.1 of spec: "追加可能な補助tag")
 */
export const AUXILIARY_TAGS = {
  EVIDENCE_GAP: "evidence-gap",
  INTENT_RECOVERY_GAP: "intent-recovery-gap",
  RISK_TEST_LINKAGE_GAP: "risk-test-linkage-gap",
  DIFF_SEMANTIC_CANDIDATE: "diff-semantic-candidate",
  LOW_CONFIDENCE: "low-confidence",
  PARTIAL_INPUT: "partial-input",
} as const;

/**
 * All assurance-related tag values.
 */
export const ASSURANCE_FINDING_TAGS = {
  ...REQUIRED_ASSURANCE_TAGS,
  ...RULE_SPECIFIC_TAGS,
  ...AUXILIARY_TAGS,
} as const;

export type AssuranceFindingTag =
  (typeof ASSURANCE_FINDING_TAGS)[keyof typeof ASSURANCE_FINDING_TAGS];

/**
 * Type guard for AssuranceFindingTag
 */
export function isAssuranceFindingTag(value: string): value is AssuranceFindingTag {
  const allTags = Object.values(ASSURANCE_FINDING_TAGS) as string[];
  return allTags.includes(value);
}

// ============================================================================
// Category and Severity Mappings (Section 8 of spec)
// ============================================================================

export type AssuranceFindingCategory = "release-risk" | "testing" | "security" | "auth";

/**
 * Default category per rule (spec Section 8.1 table).
 */
export const RULE_CATEGORY_MAP: Record<AssuranceFindingRuleId, AssuranceFindingCategory> = {
  EVIDENCE_MISSING: "release-risk",
  RISK_WITHOUT_TEST: "testing",
  INVARIANT_UNMAPPED: "testing",
  REQUIREMENT_LINK_MISSING: "release-risk",
  INTENT_NOT_RECOVERABLE: "release-risk",
  RELEASE_DECISION_UNSUPPORTED: "release-risk",
  GUARD_WEAKENED: "auth",
  VALIDATION_REMOVED: "security",
  ERROR_PATH_SUCCESS_FALLBACK: "security",
  BUSINESS_RULE_LOCALIZED: "release-risk",
};

/**
 * Severity levels per spec.
 */
export type AssuranceFindingSeverity = "low" | "medium" | "high";

/**
 * Default severity per rule (spec Section 8.1 table).
 */
export const RULE_SEVERITY_MAP: Record<AssuranceFindingRuleId, AssuranceFindingSeverity> = {
  EVIDENCE_MISSING: "medium",
  RISK_WITHOUT_TEST: "medium",
  INVARIANT_UNMAPPED: "medium",
  REQUIREMENT_LINK_MISSING: "low",
  INTENT_NOT_RECOVERABLE: "medium",
  RELEASE_DECISION_UNSUPPORTED: "high",
  GUARD_WEAKENED: "high",
  VALIDATION_REMOVED: "high",
  ERROR_PATH_SUCCESS_FALLBACK: "high",
  BUSINESS_RULE_LOCALIZED: "medium",
};

// ============================================================================
// Confidence Bounds (Section 8 of spec)
// ============================================================================

/**
 * Default confidence per rule (spec Section 8.1 table).
 */
export const RULE_DEFAULT_CONFIDENCE_MAP: Record<AssuranceFindingRuleId, number> = {
  EVIDENCE_MISSING: 0.95,
  RISK_WITHOUT_TEST: 0.90,
  INVARIANT_UNMAPPED: 0.85,
  REQUIREMENT_LINK_MISSING: 0.70,
  INTENT_NOT_RECOVERABLE: 0.65,
  RELEASE_DECISION_UNSUPPORTED: 0.90,
  GUARD_WEAKENED: 0.80, // midpoint of 0.70-0.90 range
  VALIDATION_REMOVED: 0.80, // midpoint of 0.70-0.90 range
  ERROR_PATH_SUCCESS_FALLBACK: 0.825, // midpoint of 0.75-0.90 range
  BUSINESS_RULE_LOCALIZED: 0.70, // midpoint of 0.60-0.80 range
};

/**
 * Minimum confidence threshold for output.
 * Spec: "--min-confidence <n> 既定値 0.60"
 */
export const DEFAULT_MIN_CONFIDENCE = 0.60;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert rule ID to its specific tag (lowercase kebab-case).
 */
export function ruleIdToTag(ruleId: AssuranceFindingRuleId): string {
  return RULE_SPECIFIC_TAGS[ruleId];
}

/**
 * Generate required tags for an assurance finding.
 * Spec Section 9.1: "assurance-smell + <rule固有tag> + review-required"
 */
export function assuranceFindingTags(ruleId: AssuranceFindingRuleId): string[] {
  return [
    REQUIRED_ASSURANCE_TAGS.ASSURANCE_SMELL,
    ruleIdToTag(ruleId),
    REQUIRED_ASSURANCE_TAGS.REVIEW_REQUIRED,
  ];
}

/**
 * Get default category for a rule.
 */
export function getDefaultCategory(ruleId: AssuranceFindingRuleId): AssuranceFindingCategory {
  return RULE_CATEGORY_MAP[ruleId];
}

/**
 * Get default severity for a rule.
 */
export function getDefaultSeverity(ruleId: AssuranceFindingRuleId): AssuranceFindingSeverity {
  return RULE_SEVERITY_MAP[ruleId];
}

/**
 * Get default confidence for a rule.
 */
export function getDefaultConfidence(ruleId: AssuranceFindingRuleId): number {
  return RULE_DEFAULT_CONFIDENCE_MAP[ruleId];
}

// ============================================================================
// Unsupported Claim Reasons
// ============================================================================

/**
 * Reasons for unsupported claims (spec Section 4.2).
 * "入力不足によるrule skipはunsupported_claimsへ記録し、
 *  reasonはmissing_evidenceまたはunknown_symbolを使用"
 */
export const UNSUPPORTED_CLAIM_REASONS = {
  MISSING_EVIDENCE: "missing_evidence",
  UNKNOWN_SYMBOL: "unknown_symbol",
  PARTIAL_INPUT: "partial_input",
} as const;

export type UnsupportedClaimReason = (typeof UNSUPPORTED_CLAIM_REASONS)[keyof typeof UNSUPPORTED_CLAIM_REASONS];
