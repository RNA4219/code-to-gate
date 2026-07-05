/**
 * Rule evaluator - evaluates rules against a graph to produce findings.
 * Extracted from reporters layer to keep reporters focused on artifact generation.
 *
 * This is an application-level use case that:
 * - Orchestrates rule evaluation
 * - Generates finding IDs and evidence IDs
 * - Applies domain tags
 */

import type { Finding, FindingsArtifact, EvidenceRef, RepoFile, RepoRef, UnsupportedClaim } from "../types/artifacts.js";
import type { RuleContext, RulePlugin, SimpleGraph } from "../rules/index.js";
import { CORE_RULES } from "../rules/index.js";
import { domainTagForFinding, falsePositiveReviewTags } from "../core/domain-context.js";
import type { ArtifactHeader } from "../types/artifacts.js";
import type { ApplicationContext } from "./context.js";
import { generateFindingFingerprint } from "../utils/fingerprint.js";
import { hashExcerpt } from "../core/evidence-utils.js";

// Import CTG_VERSION for header
import { CTG_VERSION as SCHEMA_VERSION } from "../types/artifacts.js";

/**
 * Generate a unique finding ID
 */
function generateFindingId(ruleId: string, index: number): string {
  return `finding-${ruleId}-${index.toString().padStart(3, "0")}`;
}

/**
 * Generate a unique evidence ID
 */
function generateEvidenceId(findingId: string, index: number): string {
  return `evidence-${findingId}-${index.toString().padStart(2, "0")}`;
}

function generateUnsupportedClaimId(ruleId: string, index: number): string {
  return `unsupported-${ruleId}-${index.toString().padStart(3, "0")}`;
}

function evidenceIssue(
  finding: Finding,
  reason: UnsupportedClaim["reason"],
  sourceSection: string
): Omit<UnsupportedClaim, "id"> {
  return {
    claim: `${finding.ruleId}: ${finding.title}`,
    reason,
    sourceSection,
  };
}

function normalizeEvidence(
  evidence: EvidenceRef,
  evidenceId: string,
  fileByPath: Map<string, RepoFile>,
  context: RuleContext
): EvidenceRef | Omit<UnsupportedClaim, "id"> {
  const file = fileByPath.get(evidence.path);
  if (!file) {
    return {
      claim: `Evidence path is not present in repo graph: ${evidence.path}`,
      reason: "missing_evidence",
      sourceSection: "rule-evaluator:evidence-path",
    };
  }

  if (evidence.startLine !== undefined || evidence.endLine !== undefined) {
    if (evidence.startLine === undefined || evidence.endLine === undefined) {
      return {
        claim: `Evidence line range is incomplete: ${evidence.path}`,
        reason: "schema_invalid",
        sourceSection: "rule-evaluator:evidence-range",
      };
    }
    if (evidence.startLine > evidence.endLine || evidence.endLine > file.lineCount) {
      return {
        claim: `Evidence line range is outside file bounds: ${evidence.path}:${evidence.startLine}-${evidence.endLine}`,
        reason: "schema_invalid",
        sourceSection: "rule-evaluator:evidence-range",
      };
    }
  }

  const normalized: EvidenceRef = {
    ...evidence,
    id: evidenceId,
  };

  if (evidence.kind === "text") {
    if (evidence.startLine === undefined || evidence.endLine === undefined) {
      return {
        claim: `Text evidence requires a concrete line range: ${evidence.path}`,
        reason: "schema_invalid",
        sourceSection: "rule-evaluator:text-evidence",
      };
    }

    const content = context.getFileContent(evidence.path);
    if (!content) {
      return {
        claim: `Text evidence cannot be hashed because source content is unavailable: ${evidence.path}`,
        reason: "missing_evidence",
        sourceSection: "rule-evaluator:text-evidence",
      };
    }

    const excerpt = content.split(/\r?\n/).slice(evidence.startLine - 1, evidence.endLine).join("\n");
    normalized.excerptHash = hashExcerpt(excerpt);
  }

  return normalized;
}

/**
 * Create artifact header for findings
 * Uses injected clock service for timestamp generation
 */
export function createFindingsHeader(
  runId: string,
  repo: string | RepoRef,
  applicationContext: ApplicationContext,
  policyId?: string,
  rules: RulePlugin[] = CORE_RULES
): ArtifactHeader {
  const now = applicationContext.clockService.now();
  const repoRef = typeof repo === "string" ? { root: repo } : repo;
  return {
    version: SCHEMA_VERSION,
    generated_at: now,
    run_id: runId,
    repo: repoRef,
    tool: {
      name: "code-to-gate",
      version: applicationContext.toolVersion,
      policy_id: policyId,
      plugin_versions: rules.map((r) => ({
        name: r.id,
        version: applicationContext.toolVersion,
        visibility: "public" as const,
      })),
    },
  };
}

/**
 * File content cache for rule evaluation
 */
const fileContentCache: Map<string, string> = new Map();

/**
 * Create rule context with file content access
 * Uses injected application context for portability
 */
function createRuleContext(
  graph: SimpleGraph,
  repoRoot: string,
  context: ApplicationContext
): RuleContext {
  return {
    graph,
    getFileContent: (filePath: string): string | null => {
      // Check cache first
      if (fileContentCache.has(filePath)) {
        return fileContentCache.get(filePath) || null;
      }
      // Read file using injected service
      const fullPath = context.pathService.join(repoRoot, filePath);
      const content = context.fileAccess.readFile(fullPath);
      if (content) {
        fileContentCache.set(filePath, content);
      }
      return content;
    },
  };
}

/**
 * Evaluate all rules against a graph and produce findings.
 * This is the core use case extracted from reporters.
 *
 * @param graph Repository graph with files and metadata
 * @param applicationContext Application context with injected services
 * @param policyId Optional policy identifier for findings header
 */
export function evaluateRules(
  graph: {
    files: RepoFile[];
    run_id: string;
    generated_at: string;
    repo: { root: string; dirty?: boolean; revision?: string; branch?: string; base_ref?: string; head_ref?: string };
    stats: { partial: boolean };
  },
  applicationContext: ApplicationContext,
  policyId?: string,
  rules: RulePlugin[] = CORE_RULES
): FindingsArtifact {
  // Clear file content cache
  fileContentCache.clear();

  const repoRoot = graph.repo.root;
  const header = createFindingsHeader(graph.run_id, graph.repo, applicationContext, policyId, rules);

  const allFindings: Finding[] = [];
  const unsupported_claims: UnsupportedClaim[] = [];
  let unsupportedClaimIndex = 0;

  // Create simple graph for rule context
  const simpleGraph: SimpleGraph = {
    files: graph.files,
    run_id: graph.run_id,
    generated_at: graph.generated_at,
    repo: graph.repo,
    stats: graph.stats,
  };

  // Create rule context
  const context = createRuleContext(simpleGraph, repoRoot, applicationContext);

  // Evaluate all rules
  let findingIndex = 0;
  for (const rule of rules) {
    const findings = rule.evaluate(context);
    for (const finding of findings) {
      const findingId = generateFindingId(rule.id, findingIndex);
      if (!finding.evidence || finding.evidence.length === 0) {
        unsupported_claims.push({
          id: generateUnsupportedClaimId(rule.id, unsupportedClaimIndex++),
          ...evidenceIssue(finding, "missing_evidence", "rule-evaluator:evidence"),
        });
        continue;
      }

      // Normalize evidence IDs
      const normalizedEvidence: EvidenceRef[] = [];
      const evidenceIssues: Array<Omit<UnsupportedClaim, "id">> = [];
      const fileByPath = new Map(graph.files.map((file) => [file.path, file]));
      for (let i = 0; i < finding.evidence.length; i++) {
        const normalized = normalizeEvidence(
          finding.evidence[i],
          generateEvidenceId(findingId, i),
          fileByPath,
          context
        );
        if ("reason" in normalized) {
          evidenceIssues.push(normalized);
        } else {
          normalizedEvidence.push(normalized);
        }
      }

      if (normalizedEvidence.length === 0 || evidenceIssues.length > 0) {
        for (const issue of evidenceIssues.length > 0
          ? evidenceIssues
          : [evidenceIssue(finding, "missing_evidence", "rule-evaluator:evidence")]) {
          unsupported_claims.push({
            id: generateUnsupportedClaimId(rule.id, unsupportedClaimIndex++),
            ...issue,
          });
        }
        continue;
      }

      const normalizedFinding: Finding = {
        id: findingId,
        ruleId: finding.ruleId || rule.id, // Preserve finding's ruleId if set (for granular IDs)
        category: finding.category,
        severity: finding.severity,
        confidence: finding.confidence,
        title: finding.title,
        summary: finding.summary,
        evidence: normalizedEvidence,
        affectedSymbols: finding.affectedSymbols,
        affectedEntrypoints: finding.affectedEntrypoints,
        tags: finding.tags,
        upstream: finding.upstream,
        // Preserve existing fingerprint if rule provided one (Phase C)
        // Only generate if not already set
        fingerprint: finding.fingerprint,
      };

      // Generate fingerprint BEFORE domain tag addition (Phase C)
      // This ensures fingerprint doesn't change when tags are added
      const findingWithFingerprint: Finding = normalizedFinding.fingerprint
        ? normalizedFinding
        : {
            ...normalizedFinding,
            fingerprint: generateFindingFingerprint(normalizedFinding),
          };

      // Apply domain tags (after fingerprint generation to avoid affecting it)
      const tags = new Set(findingWithFingerprint.tags ?? []);
      tags.add(domainTagForFinding(findingWithFingerprint));
      for (const tag of falsePositiveReviewTags(findingWithFingerprint)) {
        tags.add(tag);
      }
      findingWithFingerprint.tags = [...tags].sort();

      allFindings.push(findingWithFingerprint);
      findingIndex++;
    }
  }

  return {
    ...header,
    artifact: "findings",
    schema: "findings@v1",
    completeness: graph.stats.partial || allFindings.length === 0 ? "partial" : "complete",
    findings: allFindings,
    unsupported_claims,
  };
}

/**
 * Clear the file content cache (useful for testing)
 */
export function clearFileContentCache(): void {
  fileContentCache.clear();
}
