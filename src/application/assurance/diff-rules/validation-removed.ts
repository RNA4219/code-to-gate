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
import { createDiffEvidence, createDiffFindingId, isExcludedRole } from "../diff-rule-shared.js";
import type { DiffRuleEvaluator } from "../diff-rules.js";

const VALIDATION_PATTERNS = [
  /\b(validate|validateSchema|validateRequest|validateInput|sanitize|sanitizeInput|checkSchema)\s*\(/gi,
  /\b(Joi\.|Zod\.|ajv\.| Yup\.)/gi,
  /\b(schema\.validate|validate\(.*schema)/gi,
];

export const validationRemovedRule: DiffRuleEvaluator = {
  ruleId: "VALIDATION_REMOVED" as AssuranceFindingRuleId,

  evaluate(): AssuranceRuleResult {
    return { ruleId: "VALIDATION_REMOVED" as AssuranceFindingRuleId, candidates: [], unsupportedClaims: [] };
  },

  evaluateDiff(graph, diffAccess, base, head, hashService): AssuranceRuleResult {
    const candidates: Finding[] = [];
    const unsupportedClaims: UnsupportedClaim[] = [];
    for (const filePath of diffAccess.getChangedFiles(base, head)) {
      if (isExcludedRole(filePath, graph)) continue;
      const diff = diffAccess.getFileDiff(base, head, filePath);
      if (!diff) continue;
      const beforeContent = diffAccess.getFileContent(base, filePath);
      const afterContent = diffAccess.getFileContent(head, filePath);

      for (const hunk of diff) {
        const addedLines = hunk.lines.filter((line) => line.type === "added");
        for (const removedLine of hunk.lines.filter((line) => line.type === "removed")) {
          const match = findValidationMatch(removedLine.content);
          if (!match) continue;
          const symbolId = findValidationSymbol(match, graph, filePath);
          const affectedEntrypoints = findEntrypoints(symbolId, graph, filePath);
          const hasAlternative =
            hasValidation(addedLines.map((line) => line.content).join("\n")) ||
            hasEquivalentValidation(addedLines, afterContent, symbolId, graph) ||
            Boolean(afterContent && hasValidation(afterContent));
          if (hasAlternative) continue;

          const signals = [];
          if (symbolId) signals.push(`validation symbol: ${symbolId}`);
          if (affectedEntrypoints.length > 0) signals.push(`affected input paths: ${affectedEntrypoints.length}`);
          const signalsText = signals.length > 0 ? ` (${signals.join(", ")})` : "";

          candidates.push({
            id: createDiffFindingId("VALIDATION_REMOVED", filePath, `${base}:${head}:${hunk.oldStart}`, hashService),
            ruleId: "VALIDATION_REMOVED",
            severity: RULE_SEVERITY_MAP.VALIDATION_REMOVED,
            category: RULE_CATEGORY_MAP.VALIDATION_REMOVED,
            confidence: calculateConfidence(symbolId, affectedEntrypoints, beforeContent),
            title: `Review required: Validation call potentially removed in ${filePath}`,
            summary: `Review required: Validation "${match}" was removed at line ${hunk.oldStart}. No alternative validation signal recovered in dataflow.${signalsText}`,
            evidence: [
              createDiffEvidence(filePath, hunk.oldStart, hunk.oldStart, removedLine.content.trim(), hashService),
            ],
            tags: [
              ASSURANCE_FINDING_TAGS.ASSURANCE_SMELL,
              RULE_SPECIFIC_TAGS.VALIDATION_REMOVED,
              AUXILIARY_TAGS.DIFF_SEMANTIC_CANDIDATE,
              ASSURANCE_FINDING_TAGS.REVIEW_REQUIRED,
            ],
            affectedSymbols: symbolId ? [symbolId] : [],
            affectedEntrypoints,
          });
        }
      }
    }
    return { ruleId: "VALIDATION_REMOVED" as AssuranceFindingRuleId, candidates, unsupportedClaims };
  },
};

function findValidationMatch(content: string): string | null {
  for (const pattern of VALIDATION_PATTERNS) {
    const match = pattern.exec(content);
    if (match) return match[0];
  }
  return null;
}

function hasValidation(content: string): boolean {
  return VALIDATION_PATTERNS.some((pattern) => pattern.test(content));
}

function findValidationSymbol(match: string, graph: AssuranceGraph, filePath: string): string | null {
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

function hasEquivalentValidation(
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
  if (beforeContent && !symbolId && VALIDATION_PATTERNS[1].test(beforeContent)) confidence += 0.05;
  return Math.min(confidence, 0.90);
}
