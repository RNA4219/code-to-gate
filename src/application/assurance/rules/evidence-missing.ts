/**
 * EVIDENCE_MISSING detection rule.
 *
 * Detects missing evidence, evidence paths absent from repo-graph, invalid line
 * ranges, and dangling graph references.
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
  buildEvidenceMissingCandidateEvidence,
  buildEvidenceMissingSummary,
  buildEvidenceMissingTitle,
} from "./evidence-missing-candidate.js";
import { findEvidenceGaps } from "./evidence-missing-validation.js";

const RULE_ID = "EVIDENCE_MISSING";
const REQUIRED_ARTIFACTS = ["findings.json", "repo-graph.json"];

export const evidenceMissingRule: AssuranceRuleEvaluator = {
  ruleId: RULE_ID,

  evaluate(graph: AssuranceGraph, hashService: HashService): AssuranceRuleResult {
    const candidates: Finding[] = [];
    const unsupportedClaims: UnsupportedClaim[] = [];

    if (!hasSufficientInput(graph, REQUIRED_ARTIFACTS)) {
      unsupportedClaims.push(
        createRuleUnsupportedClaim(
          {
            ruleId: RULE_ID,
            claim: "Evidence validation requires findings.json and repo-graph.json",
            reason: "partial_input",
            sourceSection: "evidence-validation",
          },
          hashService
        )
      );
      return { ruleId: RULE_ID, candidates, unsupportedClaims };
    }

    for (const gap of findEvidenceGaps(graph)) {
      if (!gap.reason) continue;

      const evidence = buildEvidenceMissingCandidateEvidence(gap, graph);
      if (evidence.length === 0) continue;

      candidates.push(
        createRuleCandidate(
          {
            ruleId: RULE_ID,
            title: buildEvidenceMissingTitle(gap),
            summary: buildEvidenceMissingSummary(gap),
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
registerAssuranceRule(evidenceMissingRule);
