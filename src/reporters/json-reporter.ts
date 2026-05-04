/**
 * JSON Reporter - generates findings.json
 */

import { VERSION } from "../cli/exit-codes.js";
import {
  ArtifactHeader,
  EvidenceRef,
  Finding,
  FindingsArtifact,
  UnsupportedClaim,
  CTG_VERSION,
  RepoFile,
} from "../types/artifacts.js";

import { createHash } from "node:crypto";
import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

import { RulePlugin, RuleContext, SimpleGraph, ALL_RULES } from "../rules/index.js";
import { domainTagForFinding, falsePositiveReviewTags } from "./domain-context.js";

// File content cache for rule evaluation
const fileContentCache: Map<string, string> = new Map();

// All rules to evaluate
const RULES: RulePlugin[] = ALL_RULES;

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
 * Create default artifact header
 */
export function createArtifactHeader(
  runId: string,
  repoRoot: string,
  policyId?: string
): ArtifactHeader {
  const now = new Date().toISOString();
  return {
    version: CTG_VERSION,
    generated_at: now,
    run_id: runId,
    repo: {
      root: repoRoot,
      dirty: false,
    },
    tool: {
      name: "code-to-gate",
      version: VERSION,
      policy_id: policyId,
      plugin_versions: RULES.map((r) => ({
        name: r.id,
        version: VERSION,
        visibility: "public" as const,
      })),
    },
  };
}

/**
 * Create rule context with file content access
 */
function createRuleContext(graph: SimpleGraph, repoRoot: string): RuleContext {
  return {
    graph,
    getFileContent: (filePath: string): string | null => {
      // Check cache first
      if (fileContentCache.has(filePath)) {
        return fileContentCache.get(filePath) || null;
      }
      // Try to read the file
      try {
        const fullPath = path.join(repoRoot, filePath);
        const content = readFileSync(fullPath, "utf8");
        fileContentCache.set(filePath, content);
        return content;
      } catch {
        return null;
      }
    },
  };
}

/**
 * Build findings from repo graph using rule evaluation.
 */
export function buildFindingsFromGraph(
  graph: {
    files: RepoFile[];
    run_id: string;
    generated_at: string;
    repo: { root: string };
    stats: { partial: boolean };
  },
  runId: string,
  repoRoot: string,
  policyId?: string
): FindingsArtifact {
  // Clear file content cache
  fileContentCache.clear();

  const header = createArtifactHeader(runId, repoRoot, policyId);

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
  const context = createRuleContext(simpleGraph, repoRoot);

  // Evaluate all rules
  let findingIndex = 0;
  for (const rule of RULES) {
    const findings = rule.evaluate(context);
    for (const finding of findings) {
      // Normalize evidence IDs
      const normalizedEvidence: EvidenceRef[] = finding.evidence.map((e, i) => ({
        ...e,
        id: generateEvidenceId(generateFindingId(rule.id, findingIndex), i),
        excerptHash: e.excerptHash || (e.kind === "text" ? createHash("sha256").update(e.path).digest("hex") : undefined),
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
 * Write findings.json to output directory
 */
export function writeFindingsJson(outDir: string, artifact: FindingsArtifact): string {
  const filePath = path.join(outDir, "findings.json");
  writeFileSync(filePath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  return filePath;
}
