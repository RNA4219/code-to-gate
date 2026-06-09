import type { Finding, ReleaseReadinessArtifact, UnsupportedClaim } from "../../../types/artifacts.js";
import type { HashService } from "../../../types/contracts.js";
import type { AssuranceGraph, AssuranceNode } from "../assurance-graph.js";
import type { AssuranceRuleEvaluator, AssuranceRuleResult } from "../detection-rules.js";
import {
  createRuleCandidate,
  createRuleUnsupportedClaim,
  findNodesByKind,
  getNodeById,
  hasSufficientInput,
  registerAssuranceRule,
  type AssuranceEvidenceInput,
} from "../detection-rules.js";

const RULE_ID = "RELEASE_DECISION_UNSUPPORTED";
const SUPPORTED_STATUSES = new Set(["passed", "passed_with_risk"]);

interface ReadinessGap {
  kind: string;
  detail: string;
}

function referencedArtifactFiles(node: AssuranceNode): string[] {
  const refs = node.data.artifactRefs as ReleaseReadinessArtifact["artifactRefs"] | undefined;
  if (!refs) return [];
  return Object.values(refs).filter((value): value is string => typeof value === "string");
}

function artifactIsLoaded(graph: AssuranceGraph, reference: string): boolean {
  const normalized = reference.replaceAll("\\", "/");
  return graph.coverage.artifacts.some((artifact) => {
    const file = artifact.artifact.replaceAll("\\", "/");
    return artifact.loaded && (normalized === file || normalized.endsWith(`/${file}`));
  });
}

function findReadinessGaps(graph: AssuranceGraph, readiness: AssuranceNode): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];

  if (readiness.data.completeness === "partial") {
    gaps.push({ kind: "partial-readiness", detail: "release-readiness.json is marked partial" });
  }

  for (const reference of referencedArtifactFiles(readiness)) {
    if (!artifactIsLoaded(graph, reference)) {
      gaps.push({ kind: "missing-artifact", detail: `referenced artifact is not loaded: ${reference}` });
    }
  }

  const failedConditions =
    readiness.data.failedConditions as ReleaseReadinessArtifact["failedConditions"] | undefined;
  for (const condition of failedConditions ?? []) {
    const referencedIds = [
      ...(condition.matchedFindingIds ?? []),
      ...(condition.matchedRiskIds ?? []),
      ...(condition.matchedInputIds ?? []),
    ];
    for (const id of referencedIds) {
      if (!getNodeById(graph, id)) {
        gaps.push({ kind: "dangling-condition-ref", detail: `failed condition ${condition.id} references missing ID: ${id}` });
      }
    }
  }

  for (const finding of findNodesByKind(graph, "finding")) {
    const severity = finding.data.severity as string | undefined;
    const ruleId = finding.data.ruleId as string | undefined;
    if (severity === "critical" || severity === "high" || ruleId === "EVIDENCE_MISSING") {
      gaps.push({ kind: "evidence-gap", detail: `${severity ?? "unknown"} finding remains: ${finding.id}` });
    }
  }

  return gaps;
}

function buildEvidence(gaps: ReadinessGap[]): AssuranceEvidenceInput[] {
  return [{
    path: "release-readiness.json",
    kind: "external",
    externalRef: { tool: "code-to-gate", ruleId: RULE_ID },
  }, ...gaps.map((gap) => ({
    path: "release-readiness.json",
    kind: "external" as const,
    externalRef: { tool: "code-to-gate", ruleId: gap.kind },
  }))];
}

export const releaseDecisionUnsupportedRule: AssuranceRuleEvaluator = {
  ruleId: RULE_ID,

  evaluate(graph: AssuranceGraph, hashService: HashService): AssuranceRuleResult {
    const candidates: Finding[] = [];
    const unsupportedClaims: UnsupportedClaim[] = [];

    if (!hasSufficientInput(graph, ["release-readiness.json"])) {
      unsupportedClaims.push(createRuleUnsupportedClaim({
        ruleId: RULE_ID,
        claim: "Release decision support evaluation requires release-readiness.json",
        reason: "partial_input",
        sourceSection: "release-decision-support",
      }, hashService));
      return { ruleId: RULE_ID, candidates, unsupportedClaims };
    }

    const readiness = findNodesByKind(graph, "readiness-condition")[0];
    if (!readiness || !SUPPORTED_STATUSES.has(String(readiness.data.status))) {
      return { ruleId: RULE_ID, candidates, unsupportedClaims };
    }

    const gaps = findReadinessGaps(graph, readiness);
    if (gaps.length === 0) {
      return { ruleId: RULE_ID, candidates, unsupportedClaims };
    }

    candidates.push(createRuleCandidate({
      ruleId: RULE_ID,
      title: "Release readiness decision has review-required evidence gaps",
      summary: `Release readiness is ${String(readiness.data.status)}, but supporting evidence requires review: ${gaps.map((gap) => gap.detail).join("; ")}.`,
      evidence: buildEvidence(gaps),
      tags: ["evidence-gap"],
      identityHint: gaps.map((gap) => `${gap.kind}:${gap.detail}`).sort().join("|"),
    }, hashService));

    return { ruleId: RULE_ID, candidates, unsupportedClaims };
  },
};

registerAssuranceRule(releaseDecisionUnsupportedRule);
