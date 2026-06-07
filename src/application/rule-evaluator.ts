/**
 * Rule evaluator - evaluates rules against a graph to produce findings.
 * Extracted from reporters layer to keep reporters focused on artifact generation.
 *
 * This is an application-level use case that:
 * - Orchestrates rule evaluation
 * - Generates finding IDs and evidence IDs
 * - Applies domain tags
 */

import type { Finding, FindingsArtifact, EvidenceRef, RepoFile, UnsupportedClaim } from "../types/artifacts.js";
import type { RuleContext, SimpleGraph } from "../rules/index.js";
import { ALL_RULES } from "../rules/index.js";
import { domainTagForFinding, falsePositiveReviewTags } from "../core/domain-context.js";
import type { ArtifactHeader } from "../types/artifacts.js";
import type { ApplicationContext } from "./context.js";

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

/**
 * Create artifact header for findings
 * Uses injected clock service for timestamp generation
 */
export function createFindingsHeader(
  runId: string,
  repoRoot: string,
  applicationContext: ApplicationContext,
  policyId?: string
): ArtifactHeader {
  const now = applicationContext.clockService.now();
  return {
    version: SCHEMA_VERSION,
    generated_at: now,
    run_id: runId,
    repo: {
      root: repoRoot,
      dirty: false,
    },
    tool: {
      name: "code-to-gate",
      version: applicationContext.toolVersion,
      policy_id: policyId,
      plugin_versions: ALL_RULES.map((r) => ({
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
    repo: { root: string };
    stats: { partial: boolean };
  },
  applicationContext: ApplicationContext,
  policyId?: string
): FindingsArtifact {
  // Clear file content cache
  fileContentCache.clear();

  const repoRoot = graph.repo.root;
  const header = createFindingsHeader(graph.run_id, repoRoot, applicationContext, policyId);

  const allFindings: Finding[] = [];
  const unsupported_claims: UnsupportedClaim[] = [];

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
  for (const rule of ALL_RULES) {
    const findings = rule.evaluate(context);
    for (const finding of findings) {
      // Normalize evidence IDs
      const normalizedEvidence: EvidenceRef[] = finding.evidence.map((e, i) => ({
        ...e,
        id: generateEvidenceId(generateFindingId(rule.id, findingIndex), i),
        excerptHash: e.excerptHash || (e.kind === "text" ? applicationContext.hashService.sha256(e.path) : undefined),
      }));

      const normalizedFinding: Finding = {
        id: generateFindingId(rule.id, findingIndex),
        ruleId: rule.id,
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
      };

      // Apply domain tags
      const tags = new Set(normalizedFinding.tags ?? []);
      tags.add(domainTagForFinding(normalizedFinding));
      for (const tag of falsePositiveReviewTags(normalizedFinding)) {
        tags.add(tag);
      }
      normalizedFinding.tags = [...tags].sort();

      allFindings.push(normalizedFinding);
      findingIndex++;
    }
  }

  return {
    ...header,
    artifact: "findings",
    schema: "findings@v1",
    completeness: allFindings.length > 0 ? "complete" : "partial",
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