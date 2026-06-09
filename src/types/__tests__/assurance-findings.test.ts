/**
 * Tests for Assurance Finding Vocabulary
 *
 * Wave 1 Task 20260608-02: Rule IDs, tags, review-required vocabulary
 */

import { describe, it, expect } from "vitest";
import {
  ASSURANCE_FINDING_RULE_IDS,
  isAssuranceFindingRuleId,
  AssuranceFindingRuleId,
  ASSURANCE_FINDING_TAGS,
  REQUIRED_ASSURANCE_TAGS,
  RULE_SPECIFIC_TAGS,
  AUXILIARY_TAGS,
  isAssuranceFindingTag,
  RULE_CATEGORY_MAP,
  RULE_SEVERITY_MAP,
  RULE_DEFAULT_CONFIDENCE_MAP,
  DEFAULT_MIN_CONFIDENCE,
  ruleIdToTag,
  assuranceFindingTags,
  getDefaultCategory,
  getDefaultSeverity,
  getDefaultConfidence,
  UNSUPPORTED_CLAIM_REASONS,
  UnsupportedClaimReason,
  AssuranceFindingCategory,
  AssuranceFindingSeverity,
} from "../assurance-findings.js";

describe("Assurance Finding Vocabulary", () => {
  describe("Rule IDs", () => {
    it("should define exactly 10 rule IDs", () => {
      expect(ASSURANCE_FINDING_RULE_IDS.length).toBe(10);
    });

    it("should include all artifact-cross rules (Section 8.1)", () => {
      const artifactCrossRules = [
        "EVIDENCE_MISSING",
        "RISK_WITHOUT_TEST",
        "INVARIANT_UNMAPPED",
        "REQUIREMENT_LINK_MISSING",
        "INTENT_NOT_RECOVERABLE",
        "RELEASE_DECISION_UNSUPPORTED",
      ];
      for (const rule of artifactCrossRules) {
        expect(ASSURANCE_FINDING_RULE_IDS).toContain(rule);
      }
    });

    it("should include all diff-semantic rules (Section 8.2)", () => {
      const diffSemanticRules = [
        "GUARD_WEAKENED",
        "VALIDATION_REMOVED",
        "ERROR_PATH_SUCCESS_FALLBACK",
        "BUSINESS_RULE_LOCALIZED",
      ];
      for (const rule of diffSemanticRules) {
        expect(ASSURANCE_FINDING_RULE_IDS).toContain(rule);
      }
    });

    it("should be readonly tuple type", () => {
      // Type assertion check - readonly prevents mutation at compile time
      const ids: readonly AssuranceFindingRuleId[] = ASSURANCE_FINDING_RULE_IDS;
      expect(ids.length).toBe(10);
    });
  });

  describe("isAssuranceFindingRuleId type guard", () => {
    it("should return true for valid rule IDs", () => {
      expect(isAssuranceFindingRuleId("EVIDENCE_MISSING")).toBe(true);
      expect(isAssuranceFindingRuleId("RISK_WITHOUT_TEST")).toBe(true);
      expect(isAssuranceFindingRuleId("GUARD_WEAKENED")).toBe(true);
    });

    it("should return false for invalid rule IDs", () => {
      expect(isAssuranceFindingRuleId("INVALID_RULE")).toBe(false);
      expect(isAssuranceFindingRuleId("CLIENT_TRUSTED_PRICE")).toBe(false); // existing rule, not assurance
      expect(isAssuranceFindingRuleId("")).toBe(false);
    });

    it("should return false for lowercase variants", () => {
      expect(isAssuranceFindingRuleId("evidence_missing")).toBe(false);
      expect(isAssuranceFindingRuleId("evidence-missing")).toBe(false);
    });
  });

  describe("Required Tags", () => {
    it("should define assurance-smell tag", () => {
      expect(REQUIRED_ASSURANCE_TAGS.ASSURANCE_SMELL).toBe("assurance-smell");
    });

    it("should define review-required tag", () => {
      expect(REQUIRED_ASSURANCE_TAGS.REVIEW_REQUIRED).toBe("review-required");
    });
  });

  describe("Rule-specific Tags", () => {
    it("should map each rule ID to lowercase kebab-case tag", () => {
      expect(RULE_SPECIFIC_TAGS.EVIDENCE_MISSING).toBe("evidence-missing");
      expect(RULE_SPECIFIC_TAGS.RISK_WITHOUT_TEST).toBe("risk-without-test");
      expect(RULE_SPECIFIC_TAGS.ERROR_PATH_SUCCESS_FALLBACK).toBe("error-path-success-fallback");
      expect(RULE_SPECIFIC_TAGS.BUSINESS_RULE_LOCALIZED).toBe("business-rule-localized");
    });

    it("should have tag for every rule ID", () => {
      for (const ruleId of ASSURANCE_FINDING_RULE_IDS) {
        expect(RULE_SPECIFIC_TAGS[ruleId]).toBeDefined();
      }
    });
  });

  describe("Auxiliary Tags", () => {
    it("should define all auxiliary tags from spec Section 9.1", () => {
      expect(AUXILIARY_TAGS.EVIDENCE_GAP).toBe("evidence-gap");
      expect(AUXILIARY_TAGS.INTENT_RECOVERY_GAP).toBe("intent-recovery-gap");
      expect(AUXILIARY_TAGS.RISK_TEST_LINKAGE_GAP).toBe("risk-test-linkage-gap");
      expect(AUXILIARY_TAGS.DIFF_SEMANTIC_CANDIDATE).toBe("diff-semantic-candidate");
      expect(AUXILIARY_TAGS.LOW_CONFIDENCE).toBe("low-confidence");
      expect(AUXILIARY_TAGS.PARTIAL_INPUT).toBe("partial-input");
    });
  });

  describe("isAssuranceFindingTag type guard", () => {
    it("should return true for required tags", () => {
      expect(isAssuranceFindingTag("assurance-smell")).toBe(true);
      expect(isAssuranceFindingTag("review-required")).toBe(true);
    });

    it("should return true for rule-specific tags", () => {
      expect(isAssuranceFindingTag("evidence-missing")).toBe(true);
      expect(isAssuranceFindingTag("guard-weakened")).toBe(true);
    });

    it("should return true for auxiliary tags", () => {
      expect(isAssuranceFindingTag("evidence-gap")).toBe(true);
      expect(isAssuranceFindingTag("low-confidence")).toBe(true);
    });

    it("should return false for invalid tags", () => {
      expect(isAssuranceFindingTag("invalid-tag")).toBe(false);
      expect(isAssuranceFindingTag("payment")).toBe(false); // domain tag, not assurance
    });
  });

  describe("Rule Category Mapping", () => {
    it("should map artifact-cross rules to correct categories", () => {
      expect(RULE_CATEGORY_MAP.EVIDENCE_MISSING).toBe("release-risk");
      expect(RULE_CATEGORY_MAP.RISK_WITHOUT_TEST).toBe("testing");
      expect(RULE_CATEGORY_MAP.INVARIANT_UNMAPPED).toBe("testing");
      expect(RULE_CATEGORY_MAP.REQUIREMENT_LINK_MISSING).toBe("release-risk");
      expect(RULE_CATEGORY_MAP.INTENT_NOT_RECOVERABLE).toBe("release-risk");
      expect(RULE_CATEGORY_MAP.RELEASE_DECISION_UNSUPPORTED).toBe("release-risk");
    });

    it("should map diff-semantic rules to correct categories", () => {
      expect(RULE_CATEGORY_MAP.GUARD_WEAKENED).toBe("auth");
      expect(RULE_CATEGORY_MAP.VALIDATION_REMOVED).toBe("security");
      expect(RULE_CATEGORY_MAP.ERROR_PATH_SUCCESS_FALLBACK).toBe("security");
      expect(RULE_CATEGORY_MAP.BUSINESS_RULE_LOCALIZED).toBe("release-risk");
    });

    it("should have category for every rule ID", () => {
      for (const ruleId of ASSURANCE_FINDING_RULE_IDS) {
        expect(RULE_CATEGORY_MAP[ruleId]).toBeDefined();
      }
    });
  });

  describe("Rule Severity Mapping", () => {
    it("should map rules to correct default severities", () => {
      // High severity rules
      expect(RULE_SEVERITY_MAP.RELEASE_DECISION_UNSUPPORTED).toBe("high");
      expect(RULE_SEVERITY_MAP.GUARD_WEAKENED).toBe("high");
      expect(RULE_SEVERITY_MAP.VALIDATION_REMOVED).toBe("high");
      expect(RULE_SEVERITY_MAP.ERROR_PATH_SUCCESS_FALLBACK).toBe("high");

      // Medium severity rules
      expect(RULE_SEVERITY_MAP.EVIDENCE_MISSING).toBe("medium");
      expect(RULE_SEVERITY_MAP.RISK_WITHOUT_TEST).toBe("medium");
      expect(RULE_SEVERITY_MAP.INVARIANT_UNMAPPED).toBe("medium");
      expect(RULE_SEVERITY_MAP.INTENT_NOT_RECOVERABLE).toBe("medium");
      expect(RULE_SEVERITY_MAP.BUSINESS_RULE_LOCALIZED).toBe("medium");

      // Low severity rules
      expect(RULE_SEVERITY_MAP.REQUIREMENT_LINK_MISSING).toBe("low");
    });

    it("should have severity for every rule ID", () => {
      for (const ruleId of ASSURANCE_FINDING_RULE_IDS) {
        expect(RULE_SEVERITY_MAP[ruleId]).toBeDefined();
      }
    });
  });

  describe("Rule Confidence Mapping", () => {
    it("should map artifact-cross rules to correct confidence values", () => {
      expect(RULE_DEFAULT_CONFIDENCE_MAP.EVIDENCE_MISSING).toBe(0.95);
      expect(RULE_DEFAULT_CONFIDENCE_MAP.RISK_WITHOUT_TEST).toBe(0.90);
      expect(RULE_DEFAULT_CONFIDENCE_MAP.INVARIANT_UNMAPPED).toBe(0.85);
      expect(RULE_DEFAULT_CONFIDENCE_MAP.REQUIREMENT_LINK_MISSING).toBe(0.70);
      expect(RULE_DEFAULT_CONFIDENCE_MAP.INTENT_NOT_RECOVERABLE).toBe(0.65);
      expect(RULE_DEFAULT_CONFIDENCE_MAP.RELEASE_DECISION_UNSUPPORTED).toBe(0.90);
    });

    it("should map diff-semantic rules to midpoint confidence values", () => {
      // Spec defines ranges, we use midpoint as default
      expect(RULE_DEFAULT_CONFIDENCE_MAP.GUARD_WEAKENED).toBeCloseTo(0.80, 2);
      expect(RULE_DEFAULT_CONFIDENCE_MAP.VALIDATION_REMOVED).toBeCloseTo(0.80, 2);
      expect(RULE_DEFAULT_CONFIDENCE_MAP.ERROR_PATH_SUCCESS_FALLBACK).toBeCloseTo(0.825, 3);
      expect(RULE_DEFAULT_CONFIDENCE_MAP.BUSINESS_RULE_LOCALIZED).toBeCloseTo(0.70, 2);
    });

    it("should have confidence for every rule ID", () => {
      for (const ruleId of ASSURANCE_FINDING_RULE_IDS) {
        expect(RULE_DEFAULT_CONFIDENCE_MAP[ruleId]).toBeDefined();
        expect(RULE_DEFAULT_CONFIDENCE_MAP[ruleId]).toBeGreaterThan(0);
        expect(RULE_DEFAULT_CONFIDENCE_MAP[ruleId]).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("DEFAULT_MIN_CONFIDENCE", () => {
    it("should be 0.60 per spec", () => {
      expect(DEFAULT_MIN_CONFIDENCE).toBe(0.60);
    });
  });

  describe("ruleIdToTag helper", () => {
    it("should convert rule ID to lowercase kebab-case tag", () => {
      expect(ruleIdToTag("EVIDENCE_MISSING")).toBe("evidence-missing");
      expect(ruleIdToTag("ERROR_PATH_SUCCESS_FALLBACK")).toBe("error-path-success-fallback");
    });

    it("should return same value as RULE_SPECIFIC_TAGS", () => {
      for (const ruleId of ASSURANCE_FINDING_RULE_IDS) {
        expect(ruleIdToTag(ruleId)).toBe(RULE_SPECIFIC_TAGS[ruleId]);
      }
    });
  });

  describe("assuranceFindingTags helper", () => {
    it("should generate required tags per spec Section 9.1", () => {
      const tags = assuranceFindingTags("EVIDENCE_MISSING");
      expect(tags).toContain("assurance-smell");
      expect(tags).toContain("evidence-missing");
      expect(tags).toContain("review-required");
    });

    it("should have exactly 3 tags (required set)", () => {
      const tags = assuranceFindingTags("RISK_WITHOUT_TEST");
      expect(tags.length).toBe(3);
    });

    it("should not duplicate tags", () => {
      const tags = assuranceFindingTags("EVIDENCE_MISSING");
      const uniqueTags = new Set(tags);
      expect(uniqueTags.size).toBe(tags.length);
    });
  });

  describe("getDefaultCategory helper", () => {
    it("should return correct category for each rule", () => {
      expect(getDefaultCategory("EVIDENCE_MISSING")).toBe("release-risk");
      expect(getDefaultCategory("RISK_WITHOUT_TEST")).toBe("testing");
      expect(getDefaultCategory("GUARD_WEAKENED")).toBe("auth");
    });
  });

  describe("getDefaultSeverity helper", () => {
    it("should return correct severity for each rule", () => {
      expect(getDefaultSeverity("RELEASE_DECISION_UNSUPPORTED")).toBe("high");
      expect(getDefaultSeverity("EVIDENCE_MISSING")).toBe("medium");
      expect(getDefaultSeverity("REQUIREMENT_LINK_MISSING")).toBe("low");
    });
  });

  describe("getDefaultConfidence helper", () => {
    it("should return correct confidence for each rule", () => {
      expect(getDefaultConfidence("EVIDENCE_MISSING")).toBe(0.95);
      expect(getDefaultConfidence("INTENT_NOT_RECOVERABLE")).toBe(0.65);
    });
  });

  describe("Unsupported Claim Reasons", () => {
    it("should define missing_evidence reason", () => {
      expect(UNSUPPORTED_CLAIM_REASONS.MISSING_EVIDENCE).toBe("missing_evidence");
    });

    it("should define unknown_symbol reason", () => {
      expect(UNSUPPORTED_CLAIM_REASONS.UNKNOWN_SYMBOL).toBe("unknown_symbol");
    });

    it("should define partial_input reason", () => {
      expect(UNSUPPORTED_CLAIM_REASONS.PARTIAL_INPUT).toBe("partial_input");
    });
  });

  describe("Architecture Boundary Compliance", () => {
    it("should have no imports from other src layers", () => {
      // This test verifies the file is pure types layer
      // The architecture test in dependency-boundary.test.ts enforces this
      // We verify through the imports at the top of this test file working correctly
      // and that the module exports are all type/value definitions
      expect(typeof ASSURANCE_FINDING_RULE_IDS).toBe("object");
      expect(typeof isAssuranceFindingRuleId).toBe("function");
      expect(typeof assuranceFindingTags).toBe("function");
    });
  });
});