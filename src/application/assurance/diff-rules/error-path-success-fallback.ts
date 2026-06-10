import type { Finding, UnsupportedClaim } from "../../../types/artifacts.js";
import type { AssuranceFindingRuleId } from "../../../types/assurance-findings.js";
import {
  ASSURANCE_FINDING_TAGS,
  AUXILIARY_TAGS,
  RULE_CATEGORY_MAP,
  RULE_SEVERITY_MAP,
  RULE_SPECIFIC_TAGS,
} from "../../../types/assurance-findings.js";
import type { AssuranceGraph } from "../assurance-graph.js";
import type { AssuranceRuleResult } from "../detection-rules.js";
import { createDiffEvidence, createDiffFindingId, isExcludedRole } from "../diff-rule-shared.js";
import type { DiffRuleEvaluator } from "../diff-rules.js";

const ERROR_WEAKENING_PATTERNS = [
  /\bcatch\s*\([^)]*\)\s*\{[^}]*return\s*\{[^}]*success:\s*true[^}]*\}/gi,
  /\bcatch\s*\([^)]*\)\s*\{[^}]*return\s*(null|undefined|{})[^}]*\}/gi,
  /\bcatch\s*\([^)]*\)\s*\{\s*\}/gi,
];

export const errorPathSuccessFallbackRule: DiffRuleEvaluator = {
  ruleId: "ERROR_PATH_SUCCESS_FALLBACK" as AssuranceFindingRuleId,

  evaluate(): AssuranceRuleResult {
    return { ruleId: "ERROR_PATH_SUCCESS_FALLBACK" as AssuranceFindingRuleId, candidates: [], unsupportedClaims: [] };
  },

  evaluateDiff(graph, diffAccess, base, head, hashService): AssuranceRuleResult {
    const candidates: Finding[] = [];
    const unsupportedClaims: UnsupportedClaim[] = [];
    for (const filePath of diffAccess.getChangedFiles(base, head)) {
      if (isExcludedRole(filePath, graph)) continue;
      const diff = diffAccess.getFileDiff(base, head, filePath);
      if (!diff) continue;
      const afterContent = diffAccess.getFileContent(head, filePath);

      for (const hunk of diff) {
        const addedLines = hunk.lines.filter((line) => line.type === "added");
        const addedText = addedLines.map((line) => line.content).join("\n");
        const severityBonus = findWeakeningSeverityBonus(addedText);
        if (severityBonus === null) continue;
        const symbolId = findContainingSymbol(graph, filePath, hunk.newStart);
        const affectedEntrypoints = findEntrypoints(symbolId, graph, filePath);
        if (afterContent && hasExplicitErrorHandling(afterContent, hunk.newStart)) continue;

        const signals = [];
        if (symbolId) signals.push(`affected function: ${symbolId}`);
        if (affectedEntrypoints.length > 0) signals.push(`affected routes: ${affectedEntrypoints.length}`);
        const signalsText = signals.length > 0 ? ` (${signals.join(", ")})` : "";

        candidates.push({
          id: createDiffFindingId("ERROR_PATH_SUCCESS_FALLBACK", filePath, `${base}:${head}:${hunk.newStart}`, hashService),
          ruleId: "ERROR_PATH_SUCCESS_FALLBACK",
          severity: RULE_SEVERITY_MAP.ERROR_PATH_SUCCESS_FALLBACK,
          category: RULE_CATEGORY_MAP.ERROR_PATH_SUCCESS_FALLBACK,
          confidence: calculateConfidence(symbolId, affectedEntrypoints, severityBonus),
          title: `Review required: Error path potentially weakened in ${filePath}`,
          summary: `Review required: Catch/error branch at line ${hunk.newStart} returns success status or empty value without explicit error contract.${signalsText}`,
          evidence: [
            createDiffEvidence(filePath, hunk.newStart, hunk.newStart + addedLines.length, addedText.trim(), hashService),
          ],
          tags: [
            ASSURANCE_FINDING_TAGS.ASSURANCE_SMELL,
            RULE_SPECIFIC_TAGS.ERROR_PATH_SUCCESS_FALLBACK,
            AUXILIARY_TAGS.DIFF_SEMANTIC_CANDIDATE,
            ASSURANCE_FINDING_TAGS.REVIEW_REQUIRED,
          ],
          affectedSymbols: symbolId ? [symbolId] : [],
          affectedEntrypoints,
        });
      }
    }
    return { ruleId: "ERROR_PATH_SUCCESS_FALLBACK" as AssuranceFindingRuleId, candidates, unsupportedClaims };
  },
};

function findWeakeningSeverityBonus(content: string): number | null {
  for (const pattern of ERROR_WEAKENING_PATTERNS) {
    if (pattern.test(content)) return content.includes("catch") && content.includes("{ }") ? 0.15 : 0.10;
  }
  return null;
}

function hasExplicitErrorHandling(content: string, aroundLine: number): boolean {
  const range = content.split("\n").slice(Math.max(0, aroundLine - 5), aroundLine + 10).join("\n");
  return (
    /\b(logError|logger\.error|console\.error|reportError)\s*\(/.test(range) ||
    /\bthrow\s/.test(range) ||
    /\bfinally\s*\{/.test(range) ||
    /@throws/.test(range) ||
    /error contract/.test(range)
  );
}

function findContainingSymbol(graph: AssuranceGraph, filePath: string, line: number): string | null {
  for (const symbol of graph.nodes.filter((node) => node.kind === "symbol")) {
    const fileId = symbol.data?.fileId as string | undefined;
    const startLine = symbol.data?.startLine as number | undefined;
    const endLine = symbol.data?.endLine as number | undefined;
    const sameFile = fileId && graph.nodes.some((node) => node.kind === "file" && node.id === fileId && node.data.path === filePath);
    if (sameFile && startLine && endLine && line >= startLine && line <= endLine) return symbol.id;
  }
  return null;
}

function findEntrypoints(symbolId: string | null, graph: AssuranceGraph, filePath: string): string[] {
  if (!symbolId) return [];
  return graph.nodes
    .filter((node) => node.kind === "entrypoint")
    .filter((entrypoint) => {
      const fileId = entrypoint.data?.fileId as string | undefined;
      return (
        entrypoint.data?.symbolId === symbolId ||
        Boolean(fileId && graph.nodes.some((node) => node.kind === "file" && node.id === fileId && node.data.path === filePath))
      );
    })
    .map((entrypoint) => entrypoint.id);
}

function calculateConfidence(symbolId: string | null, entrypoints: string[], severityBonus: number): number {
  return Math.min(0.75 + (symbolId ? 0.05 : 0) + (entrypoints.length > 0 ? 0.05 : 0) + severityBonus, 0.90);
}
