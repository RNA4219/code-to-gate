import type { Finding, UnsupportedClaim } from "../../../types/artifacts.js";
import {
  ASSURANCE_FINDING_TAGS,
  AUXILIARY_TAGS,
  RULE_CATEGORY_MAP,
  RULE_SEVERITY_MAP,
  RULE_SPECIFIC_TAGS,
  type AssuranceFindingRuleId,
} from "../../../types/assurance-findings.js";
import type { HashService } from "../../../types/contracts.js";
import type { DiffAccess, DiffLine } from "../../../types/diff-contracts.js";
import type { AssuranceGraph } from "../assurance-graph.js";
import {
  createDiffEvidence,
  createDiffFindingId,
  isExcludedRole,
} from "../diff-rule-shared.js";
import type { AssuranceRuleResult } from "../detection-rules.js";
import type { DiffRuleEvaluator } from "../diff-rules.js";

const BUSINESS_RULE_CALL_PATTERN =
  /\b(calculate|compute|determine|resolve|get)[A-Z][a-zA-Z]*\s*\(/gi;

export const businessRuleLocalizedRule: DiffRuleEvaluator = {
  ruleId: "BUSINESS_RULE_LOCALIZED" as AssuranceFindingRuleId,

  evaluate(_graph: AssuranceGraph, _hashService: HashService): AssuranceRuleResult {
    return {
      ruleId: "BUSINESS_RULE_LOCALIZED" as AssuranceFindingRuleId,
      candidates: [],
      unsupportedClaims: [],
    };
  },

  evaluateDiff(
    graph: AssuranceGraph,
    diffAccess: DiffAccess,
    base: string,
    head: string,
    hashService: HashService
  ): AssuranceRuleResult {
    const candidates: Finding[] = [];
    const unsupportedClaims: UnsupportedClaim[] = [];

    for (const filePath of diffAccess.getChangedFiles(base, head)) {
      if (isExcludedRole(filePath, graph)) continue;

      const diff = diffAccess.getFileDiff(base, head, filePath);
      if (!diff) continue;
      const beforeContent = diffAccess.getFileContent(base, filePath);

      for (const hunk of diff) {
        const removedLines = hunk.lines.filter((line) => line.type === "removed");
        const addedLines = hunk.lines.filter((line) => line.type === "added");

        for (const removedLine of removedLines) {
          const callMatch = findBusinessRuleCallMatch(removedLine.content);
          const inlineMatch = findInlineCondition(addedLines);
          if (!callMatch || !inlineMatch) continue;

          const businessRuleSymbolId = findBusinessRuleSymbolInGraph(
            callMatch.functionName,
            graph
          );
          const siblingCallers = findSiblingCallersOfBusinessRule(
            businessRuleSymbolId,
            graph,
            filePath,
            beforeContent,
            callMatch.functionName
          );
          if (siblingCallers.length === 0) continue;

          const confidence = calculateBusinessRuleLocalizedConfidence(
            businessRuleSymbolId,
            siblingCallers,
            inlineMatch.branchComplexity
          );
          const signals = [
            ...(businessRuleSymbolId ? [`rule symbol: ${businessRuleSymbolId}`] : []),
            `sibling callers: ${siblingCallers.length}`,
          ];
          const removedText = removedLines.map((line) => line.content).join("\n");
          const addedText = addedLines.map((line) => line.content).join("\n");

          candidates.push({
            id: createDiffFindingId(
              "BUSINESS_RULE_LOCALIZED",
              filePath,
              `${base}:${head}:${hunk.oldStart}`,
              hashService
            ),
            ruleId: "BUSINESS_RULE_LOCALIZED",
            severity: RULE_SEVERITY_MAP.BUSINESS_RULE_LOCALIZED,
            category: RULE_CATEGORY_MAP.BUSINESS_RULE_LOCALIZED,
            confidence,
            title: `Review required: Business rule potentially localized in ${filePath}`,
            summary: `Review required: Shared business rule call '${callMatch.functionName}' replaced by inline condition. Potential inconsistency with ${siblingCallers.length} sibling callers. (${signals.join(", ")})`,
            evidence: [
              createDiffEvidence(
                filePath,
                hunk.oldStart,
                hunk.oldStart + removedLines.length,
                removedText.trim(),
                hashService
              ),
              createDiffEvidence(
                filePath,
                hunk.newStart,
                hunk.newStart + addedLines.length,
                addedText.trim(),
                hashService
              ),
            ],
            tags: [
              ASSURANCE_FINDING_TAGS.ASSURANCE_SMELL,
              RULE_SPECIFIC_TAGS.BUSINESS_RULE_LOCALIZED,
              AUXILIARY_TAGS.DIFF_SEMANTIC_CANDIDATE,
              ASSURANCE_FINDING_TAGS.REVIEW_REQUIRED,
              AUXILIARY_TAGS.LOW_CONFIDENCE,
            ],
            affectedSymbols: businessRuleSymbolId ? [businessRuleSymbolId] : [],
            affectedEntrypoints: [],
          });
        }
      }
    }

    return {
      ruleId: "BUSINESS_RULE_LOCALIZED" as AssuranceFindingRuleId,
      candidates,
      unsupportedClaims,
    };
  },
};

function findBusinessRuleCallMatch(content: string): { functionName: string } | null {
  const match = BUSINESS_RULE_CALL_PATTERN.exec(content);
  return match ? { functionName: match[0].slice(0, -1).trim() } : null;
}

function findInlineCondition(addedLines: DiffLine[]): { branchComplexity: number } | null {
  const addedText = addedLines.map((line) => line.content).join("\n");
  const hasIfBranch = /\bif\s*\(/.test(addedText);
  const hasReturn = /\breturn\s/.test(addedText);
  if (!hasIfBranch && !hasReturn) return null;
  return { branchComplexity: hasIfBranch && hasReturn ? 0.10 : 0.05 };
}

function findBusinessRuleSymbolInGraph(
  functionName: string,
  graph: AssuranceGraph
): string | null {
  return graph.nodes.find(
    (node) => node.kind === "symbol" && node.data?.name === functionName
  )?.id ?? null;
}

function findSiblingCallersOfBusinessRule(
  businessRuleSymbolId: string | null,
  graph: AssuranceGraph,
  filePath: string,
  beforeContent: string | null,
  functionName: string
): string[] {
  if (!businessRuleSymbolId) {
    const matches = beforeContent?.match(new RegExp(`\\b${functionName}\\s*\\(`, "g"));
    return matches && matches.length >= 2
      ? [`content-based:${filePath}:${functionName}:callers=${matches.length}`]
      : [];
  }

  return graph.nodes
    .filter((node) => node.kind === "symbol" && node.id !== businessRuleSymbolId)
    .filter((node) => {
      const fileId = node.data?.fileId as string | undefined;
      return graph.nodes.some(
        (candidate) =>
          candidate.kind === "file" &&
          candidate.id === fileId &&
          candidate.data.path === filePath
      );
    })
    .map((node) => node.id);
}

function calculateBusinessRuleLocalizedConfidence(
  businessRuleSymbolId: string | null,
  siblingCallers: string[],
  branchComplexity: number
): number {
  let confidence = 0.60;
  if (businessRuleSymbolId) confidence += 0.10;
  if (siblingCallers.length > 1) confidence += 0.05;
  return Math.min(confidence + branchComplexity, 0.80);
}
