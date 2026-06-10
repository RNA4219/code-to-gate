import type { Finding, UnsupportedClaim } from "../../../types/artifacts.js";
import type { AssuranceFindingRuleId } from "../../../types/assurance-findings.js";
import {
  ASSURANCE_FINDING_TAGS,
  AUXILIARY_TAGS,
  RULE_CATEGORY_MAP,
  RULE_SEVERITY_MAP,
  RULE_SPECIFIC_TAGS,
} from "../../../types/assurance-findings.js";
import type { DiffLine } from "../../../types/diff-contracts.js";
import type { AssuranceGraph } from "../assurance-graph.js";
import type { AssuranceRuleResult } from "../detection-rules.js";
import {
  createDiffEvidence,
  createDiffFindingId,
  isExcludedRole,
} from "../diff-rule-shared.js";
import type { DiffRuleEvaluator } from "../diff-rules.js";

const GUARD_PATTERNS = [
  /\b(isAuthorized|hasPermission|checkRole|checkPermission|canAccess|verifyAuth|authenticate|authorize)\s*\(/gi,
  /\bif\s*\(\s*(user\.role|user\.permissions|req\.user|context\.user|auth\.role)/gi,
  /\b(authGuard|authMiddleware|requireAuth|ensureAuth|protectRoute)\s*\(/gi,
];

export const guardWeakenedRule: DiffRuleEvaluator = {
  ruleId: "GUARD_WEAKENED" as AssuranceFindingRuleId,

  evaluate(): AssuranceRuleResult {
    return { ruleId: "GUARD_WEAKENED" as AssuranceFindingRuleId, candidates: [], unsupportedClaims: [] };
  },

  evaluateDiff(graph, diffAccess, base, head, hashService): AssuranceRuleResult {
    const candidates: Finding[] = [];
    const unsupportedClaims: UnsupportedClaim[] = [];
    const changedFiles = diffAccess.getChangedFiles(base, head);

    if (changedFiles.length >= diffAccess.getLimits().maxFiles) {
      unsupportedClaims.push({
        id: `unsupported-guard-weakened-${hashService.fingerprint(base + head)}`,
        claim: "Guard weakened detection was incomplete due to file limit",
        reason: "missing_evidence",
        sourceSection: "diff-semantic",
      });
    }

    for (const filePath of changedFiles) {
      if (isExcludedRole(filePath, graph)) continue;
      const diff = diffAccess.getFileDiff(base, head, filePath);
      if (!diff) continue;
      const beforeContent = diffAccess.getFileContent(base, filePath);
      const afterContent = diffAccess.getFileContent(head, filePath);

      for (const hunk of diff) {
        const removedLines = hunk.lines.filter((line) => line.type === "removed");
        const addedLines = hunk.lines.filter((line) => line.type === "added");

        for (const removedLine of removedLines) {
          const guardMatch = findGuardMatch(removedLine.content);
          if (!guardMatch) continue;
          const guardSymbolId = findGuardSymbolInGraph(guardMatch, graph, filePath);
          const affectedEntrypoints = findEntrypointsUsingSymbol(guardSymbolId, graph, filePath);
          const hasAlternative =
            hasGuardInLines(addedLines) ||
            hasEquivalentGuard(addedLines, afterContent, guardSymbolId, graph) ||
            Boolean(afterContent && hasGuard(afterContent));
          if (hasAlternative) continue;

          const signals = [];
          if (guardSymbolId) signals.push(`guard symbol: ${guardSymbolId}`);
          if (affectedEntrypoints.length > 0) signals.push(`affected entrypoints: ${affectedEntrypoints.length}`);
          const signalsText = signals.length > 0 ? ` (${signals.join(", ")})` : "";

          candidates.push({
            id: createDiffFindingId("GUARD_WEAKENED", filePath, `${base}:${head}:${hunk.oldStart}`, hashService),
            ruleId: "GUARD_WEAKENED",
            severity: RULE_SEVERITY_MAP.GUARD_WEAKENED,
            category: RULE_CATEGORY_MAP.GUARD_WEAKENED,
            confidence: calculateConfidence(guardSymbolId, affectedEntrypoints, beforeContent),
            title: `Review required: Guard call potentially weakened in ${filePath}`,
            summary: `Review required: Guard call "${guardMatch}" was removed at line ${hunk.oldStart}. No equivalent guard signal recovered in changed path.${signalsText}`,
            evidence: [
              createDiffEvidence(filePath, hunk.oldStart, hunk.oldStart, removedLine.content.trim(), hashService),
            ],
            tags: [
              ASSURANCE_FINDING_TAGS.ASSURANCE_SMELL,
              RULE_SPECIFIC_TAGS.GUARD_WEAKENED,
              AUXILIARY_TAGS.DIFF_SEMANTIC_CANDIDATE,
              ASSURANCE_FINDING_TAGS.REVIEW_REQUIRED,
            ],
            affectedSymbols: guardSymbolId ? [guardSymbolId] : [],
            affectedEntrypoints,
          });
        }
      }
    }
    return { ruleId: "GUARD_WEAKENED" as AssuranceFindingRuleId, candidates, unsupportedClaims };
  },
};

function findGuardMatch(content: string): string | null {
  for (const pattern of GUARD_PATTERNS) {
    const match = pattern.exec(content);
    if (match) return match[0];
  }
  return null;
}

function hasGuard(content: string): boolean {
  return GUARD_PATTERNS.some((pattern) => pattern.test(content));
}

function hasGuardInLines(lines: DiffLine[]): boolean {
  return hasGuard(lines.map((line) => line.content).join("\n"));
}

function findGuardSymbolInGraph(match: string, graph: AssuranceGraph, filePath: string): string | null {
  const name = match.replace(/\s*\($/, "").trim();
  for (const symbol of graph.nodes.filter((node) => node.kind === "symbol")) {
    if (symbol.data?.name !== name) continue;
    const fileId = symbol.data?.fileId as string | undefined;
    if (!fileId || graph.nodes.some((node) => node.kind === "file" && node.id === fileId && node.data.path === filePath)) {
      return symbol.id;
    }
    return symbol.id;
  }
  return null;
}

function findEntrypointsUsingSymbol(symbolId: string | null, graph: AssuranceGraph, filePath: string): string[] {
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

function hasEquivalentGuard(
  addedLines: DiffLine[],
  afterContent: string | null,
  symbolId: string | null,
  graph: AssuranceGraph
): boolean {
  const name = graph.nodes.find((node) => node.id === symbolId)?.data?.name as string | undefined;
  if (!name) return false;
  const pattern = new RegExp(`\\b${name}\\s*\\(`, "gi");
  return pattern.test(addedLines.map((line) => line.content).join("\n")) || Boolean(afterContent && pattern.test(afterContent));
}

function calculateConfidence(symbolId: string | null, entrypoints: string[], beforeContent: string | null): number {
  let confidence = 0.70;
  if (symbolId) confidence += 0.10;
  if (entrypoints.length > 0) confidence += 0.10;
  if (beforeContent && !symbolId && (/\bfunction\b/.test(beforeContent) || /\bclass\b/.test(beforeContent))) {
    confidence += 0.05;
  }
  return Math.min(confidence, 0.90);
}
