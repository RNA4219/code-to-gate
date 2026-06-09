/**
 * EVIDENCE_MISSING detection rule.
 *
 * Detects:
 * - Missing evidence in findings, risks, invariants, test-seeds
 * - Evidence path not in repo graph file paths
 * - Invalid line ranges (startLine > endLine, < 1, > file line count)
 * - Dangling references in graph edges
 *
 * Spec: docs/assurance-smell-detector-spec.md Section 8.1
 */

import type {
  Finding,
  EvidenceRef,
  UnsupportedClaim,
} from "../../../types/artifacts.js";
import type { HashService } from "../../../types/contracts.js";
import type {
  AssuranceGraph,
  AssuranceNode,
} from "../assurance-graph.js";
import type { AssuranceRuleResult, AssuranceRuleEvaluator } from "../detection-rules.js";
import {
  createRuleCandidate,
  createRuleUnsupportedClaim,
  hasSufficientInput,
  findNodesByKind,
  nodeExists,
  getNodeById,
  type AssuranceEvidenceInput,
} from "../detection-rules.js";

const RULE_ID = "EVIDENCE_MISSING";
const REQUIRED_ARTIFACTS = ["findings.json", "repo-graph.json"];

// ============================================================================
// Evidence Validation Types
// ============================================================================

// Internal evidence type for validation (doesn't need externalRef)
interface EvidenceForValidation {
  id: string;
  path: string;
  kind: EvidenceRef["kind"];
  startLine?: number;
  endLine?: number;
}

interface EvidenceValidationResult {
  valid: boolean;
  reason?: "missing_evidence" | "path_not_found" | "invalid_lines" | "dangling_ref";
  evidence?: EvidenceForValidation;
  sourceFindingId?: string;
  sourceRiskId?: string;
  sourceInvariantId?: string;
  sourceTestSeedId?: string;
  sourceArtifact: string;
  // Additional details for line validation
  lineValidationDetail?: string;
}

// ============================================================================
// Path Validation
// ============================================================================

/**
 * Check if evidence path exists in repo graph files.
 */
function pathExistsInRepoGraph(graph: AssuranceGraph, evidencePath: string): boolean {
  const fileNodes = findNodesByKind(graph, "file");
  const normalizedPath = evidencePath.replaceAll("\\", "/");

  return fileNodes.some((file) => {
    const filePath = (file.data.path as string)?.replaceAll("\\", "/");
    return filePath === normalizedPath;
  });
}

/**
 * Get file line count from repo graph.
 */
function getFileLineCount(graph: AssuranceGraph, evidencePath: string): number | null {
  const fileNodes = findNodesByKind(graph, "file");
  const normalizedPath = evidencePath.replaceAll("\\", "/");

  const fileNode = fileNodes.find((file) => {
    const filePath = (file.data.path as string)?.replaceAll("\\", "/");
    return filePath === normalizedPath;
  });

  if (!fileNode) return null;
  return (fileNode.data.lineCount as number) ?? null;
}

// ============================================================================
// Line Range Validation
// ============================================================================

/**
 * Validate line range for evidence.
 */
function validateLineRange(
  graph: AssuranceGraph,
  evidence: EvidenceForValidation
): { valid: boolean; reason?: string } {
  // No line info = valid (text evidence without lines)
  if (evidence.startLine === undefined || evidence.endLine === undefined) {
    return { valid: true };
  }

  const startLine = evidence.startLine;
  const endLine = evidence.endLine;

  // Check startLine > endLine
  if (startLine > endLine) {
    return { valid: false, reason: "startLine > endLine" };
  }

  // Check < 1
  if (startLine < 1 || endLine < 1) {
    return { valid: false, reason: "line < 1" };
  }

  // Check > file line count
  const lineCount = getFileLineCount(graph, evidence.path);
  if (lineCount !== null && endLine > lineCount) {
    return { valid: false, reason: `endLine ${endLine} > file lineCount ${lineCount}` };
  }

  return { valid: true };
}

// ============================================================================
// Evidence Gap Detection
// ============================================================================

/**
 * Validate evidence nodes and collect gaps.
 */
function validateEvidenceNodes(graph: AssuranceGraph): EvidenceValidationResult[] {
  const results: EvidenceValidationResult[] = [];
  const evidenceNodes = findNodesByKind(graph, "evidence");

  for (const evidenceNode of evidenceNodes) {
    const evidence: EvidenceForValidation = {
      id: evidenceNode.id,
      path: evidenceNode.data.path as string,
      kind: evidenceNode.data.kind as EvidenceRef["kind"],
      startLine: evidenceNode.data.startLine as number | undefined,
      endLine: evidenceNode.data.endLine as number | undefined,
    };

    // External evidence is always valid (no path validation)
    if (evidence.kind === "external") {
      continue;
    }

    // Check empty path
    if (!evidence.path || evidence.path.trim() === "") {
      results.push({
        valid: false,
        reason: "missing_evidence",
        evidence,
        sourceArtifact: evidenceNode.sourceArtifact,
        sourceFindingId: evidenceNode.data.parentFindingId as string,
        sourceRiskId: evidenceNode.data.parentRiskId as string,
        sourceInvariantId: evidenceNode.data.parentInvariantId as string,
        sourceTestSeedId: evidenceNode.data.parentTestSeedId as string,
      });
      continue;
    }

    // Check path in repo graph
    if (!pathExistsInRepoGraph(graph, evidence.path)) {
      results.push({
        valid: false,
        reason: "path_not_found",
        evidence,
        sourceArtifact: evidenceNode.sourceArtifact,
        sourceFindingId: evidenceNode.data.parentFindingId as string,
        sourceRiskId: evidenceNode.data.parentRiskId as string,
        sourceInvariantId: evidenceNode.data.parentInvariantId as string,
        sourceTestSeedId: evidenceNode.data.parentTestSeedId as string,
      });
      continue;
    }

    // Validate line range
    const lineValidation = validateLineRange(graph, evidence);
    if (!lineValidation.valid) {
      results.push({
        valid: false,
        reason: "invalid_lines",
        evidence,
        sourceArtifact: evidenceNode.sourceArtifact,
        sourceFindingId: evidenceNode.data.parentFindingId as string,
        sourceRiskId: evidenceNode.data.parentRiskId as string,
        sourceInvariantId: evidenceNode.data.parentInvariantId as string,
        sourceTestSeedId: evidenceNode.data.parentTestSeedId as string,
        lineValidationDetail: lineValidation.reason,
      });
    }
  }

  return results;
}

// ============================================================================
// Dangling Reference Detection
// ============================================================================

/**
 * Check for dangling references in graph edges.
 */
function findDanglingReferences(graph: AssuranceGraph): EvidenceValidationResult[] {
  const results: EvidenceValidationResult[] = [];
  const edges = graph.edges;

  for (const edge of edges) {
    // Check source node exists
    if (!nodeExists(graph, edge.sourceId)) {
      results.push({
        valid: false,
        reason: "dangling_ref",
        sourceArtifact: edge.sourceArtifact,
      });
    }

    // Check target node exists
    if (!nodeExists(graph, edge.targetId)) {
      results.push({
        valid: false,
        reason: "dangling_ref",
        sourceArtifact: edge.sourceArtifact,
      });
    }
  }

  return results;
}

// ============================================================================
// Candidate Generation
// ============================================================================

/**
 * Build title for evidence gap finding.
 */
function buildTitle(result: EvidenceValidationResult): string {
  const reasonText: Record<string, string> = {
    missing_evidence: "Evidence missing",
    path_not_found: "Evidence path not found in repo",
    invalid_lines: "Evidence line range invalid",
    dangling_ref: "Dangling reference in artifact",
  };

  const sourceId = result.sourceFindingId || result.sourceRiskId ||
                   result.sourceInvariantId || result.sourceTestSeedId || "unknown";

  const reason = result.reason ?? "unknown";
  return `${reasonText[reason] ?? "Evidence issue"} in ${result.sourceArtifact}: ${sourceId}`;
}

/**
 * Build summary for evidence gap finding.
 */
function buildSummary(result: EvidenceValidationResult): string {
  const lines: string[] = [];

  if (result.reason === "missing_evidence") {
    lines.push("Evidence has empty or missing path.");
  } else if (result.reason === "path_not_found") {
    lines.push(`Evidence path "${result.evidence?.path}" not found in repo-graph.json files.`);
  } else if (result.reason === "invalid_lines") {
    const ev = result.evidence;
    lines.push(`Evidence line range invalid: startLine=${ev?.startLine}, endLine=${ev?.endLine}.`);
    if (result.lineValidationDetail) {
      lines.push(`Detail: ${result.lineValidationDetail}.`);
    }
  } else if (result.reason === "dangling_ref") {
    lines.push("Graph edge references node that does not exist.");
  }

  lines.push(`Source artifact: ${result.sourceArtifact}`);

  if (result.sourceFindingId) {
    lines.push(`Source finding: ${result.sourceFindingId}`);
  }
  if (result.sourceRiskId) {
    lines.push(`Source risk: ${result.sourceRiskId}`);
  }
  if (result.sourceInvariantId) {
    lines.push(`Source invariant: ${result.sourceInvariantId}`);
  }
  if (result.sourceTestSeedId) {
    lines.push(`Source test seed: ${result.sourceTestSeedId}`);
  }

  return lines.join(" ");
}

/**
 * Build evidence input for candidate.
 */
function buildCandidateEvidence(
  result: EvidenceValidationResult,
  graph: AssuranceGraph
): AssuranceEvidenceInput[] {
  const evidenceInputs: AssuranceEvidenceInput[] = [];

  // If there's evidence from the artifact (even with empty path), add it as external reference
  if (result.evidence) {
    evidenceInputs.push({
      path: result.evidence.path || "unknown",
      kind: "external",
      externalRef: {
        tool: "code-to-gate",
        ruleId: result.reason,
      },
    });
  }

  // Add source artifact location as evidence
  const sourceNode = findSourceNode(graph, result);
  if (sourceNode && sourceNode.data.path) {
    evidenceInputs.push({
      path: sourceNode.data.path as string,
      kind: "external",
      externalRef: {
        tool: "code-to-gate",
        ruleId: `source-artifact:${result.sourceArtifact}`,
      },
    });
  }

  return evidenceInputs;
}

/**
 * Find the source node for a validation result.
 */
function findSourceNode(
  graph: AssuranceGraph,
  result: EvidenceValidationResult
): AssuranceNode | undefined {
  if (result.sourceFindingId) {
    return getNodeById(graph, result.sourceFindingId);
  }
  if (result.sourceRiskId) {
    return getNodeById(graph, result.sourceRiskId);
  }
  if (result.sourceInvariantId) {
    return getNodeById(graph, result.sourceInvariantId);
  }
  if (result.sourceTestSeedId) {
    return getNodeById(graph, result.sourceTestSeedId);
  }
  return undefined;
}

// ============================================================================
// Rule Implementation
// ============================================================================

/**
 * EVIDENCE_MISSING rule evaluator.
 */
export const evidenceMissingRule: AssuranceRuleEvaluator = {
  ruleId: RULE_ID,

  evaluate(graph: AssuranceGraph, hashService: HashService): AssuranceRuleResult {
    const candidates: Finding[] = [];
    const unsupportedClaims: UnsupportedClaim[] = [];

    // Check for sufficient input
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

    // Validate evidence nodes
    const evidenceGaps = validateEvidenceNodes(graph);

    // Find dangling references
    const danglingRefs = findDanglingReferences(graph);

    // Combine all gaps
    const allGaps = [...evidenceGaps, ...danglingRefs];

    // Generate candidates for each gap
    for (const gap of allGaps) {
      if (!gap.reason) continue;

      const candidateEvidence = buildCandidateEvidence(gap, graph);
      if (candidateEvidence.length === 0) {
        // Must have at least one evidence for a finding
        continue;
      }

      const candidate = createRuleCandidate(
        {
          ruleId: RULE_ID,
          title: buildTitle(gap),
          summary: buildSummary(gap),
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
registerAssuranceRule(evidenceMissingRule);