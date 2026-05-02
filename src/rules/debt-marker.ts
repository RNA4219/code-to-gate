/**
 * DEBT_MARKER Rule
 *
 * Detects explicit technical-debt markers in source comments.
 */

import type { RulePlugin, RuleContext, Finding } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

interface CommentLine {
  line: number;
  text: string;
}

interface DebtMarker {
  label: string;
  pattern: RegExp;
  severity: Finding["severity"];
  confidence: number;
}

const MARKERS: DebtMarker[] = [
  { label: "FIXME", pattern: /\bFIXME\b/i, severity: "medium", confidence: 0.9 },
  { label: "HACK", pattern: /\bHACK\b/i, severity: "medium", confidence: 0.85 },
  { label: "TODO", pattern: /\bTODO\b/i, severity: "low", confidence: 0.8 },
  { label: "XXX", pattern: /\bXXX\b/i, severity: "low", confidence: 0.75 },
  { label: "workaround", pattern: /\bwork\s*around\b|\bworkaround\b/i, severity: "medium", confidence: 0.85 },
  // 'temporary' pattern: only match when explicitly flagged as a short-term measure
  { label: "temporary", pattern: /\btemporary\s+(solution|fix|implementation|code|hack|measure)\b/i, severity: "medium", confidence: 0.85 },
  { label: "technical debt", pattern: /\btech(?:nical)?\s+debt\b/i, severity: "medium", confidence: 0.9 },
];

const ACTIONABLE_CONTEXT = /\b(remove|replace|refactor|cleanup|clean up|fix|migrate|deprecated|legacy|unsafe|slow|broken|until|after|before|because|blocked)\b/i;

export const DEBT_MARKER_RULE: RulePlugin = {
  id: "DEBT_MARKER",
  name: "Technical Debt Marker",
  description:
    "Detects explicit technical-debt markers in source comments, such as TODO, FIXME, HACK, workaround, and temporary implementation notes.",
  category: "maintainability",
  defaultSeverity: "low",
  defaultConfidence: 0.8,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of context.graph.files) {
      if (file.role !== "source") continue;
      if (!["ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "java", "php"].includes(file.language)) continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      const comments = extractCommentLines(content, file.language);
      for (const comment of comments) {
        const marker = MARKERS.find((candidate) => candidate.pattern.test(comment.text));
        if (!marker) continue;

        const actionable = ACTIONABLE_CONTEXT.test(comment.text);
        const severity = actionable && marker.severity === "low" ? "medium" : marker.severity;
        const confidence = Math.min(0.95, marker.confidence + (actionable ? 0.05 : 0));
        const excerpt = comment.text.trim().slice(0, 240);

        findings.push({
          id: generateFindingId("DEBT_MARKER", file.path, comment.line),
          ruleId: "DEBT_MARKER",
          category: "maintainability",
          severity,
          confidence,
          title: `Explicit debt marker found (${marker.label})`,
          summary:
            `A source comment contains an explicit ${marker.label} debt marker. Track or resolve the note so known maintainability debt does not become invisible.`,
          evidence: [
            createEvidence(file.path, comment.line, comment.line, "text", excerpt),
          ],
          tags: ["maintainability", "technical-debt", "comment"],
          upstream: { tool: "native" },
        });
      }
    }

    return findings;
  },
};

function extractCommentLines(content: string, language: string): CommentLine[] {
  if (language === "py" || language === "rb") {
    return extractHashComments(content);
  }

  return extractSlashComments(content);
}

function extractHashComments(content: string): CommentLine[] {
  const comments: CommentLine[] = [];
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const hashIndex = lines[index].indexOf("#");
    if (hashIndex >= 0) {
      comments.push({ line: index + 1, text: lines[index].slice(hashIndex + 1) });
    }
  }

  return comments;
}

function extractSlashComments(content: string): CommentLine[] {
  const comments: CommentLine[] = [];
  const lines = content.split(/\r?\n/);
  let inBlock = false;

  for (let index = 0; index < lines.length; index++) {
    let cursor = 0;
    const line = lines[index];

    while (cursor < line.length) {
      if (inBlock) {
        const end = line.indexOf("*/", cursor);
        const text = end >= 0 ? line.slice(cursor, end) : line.slice(cursor);
        comments.push({ line: index + 1, text });
        if (end < 0) break;
        inBlock = false;
        cursor = end + 2;
        continue;
      }

      const blockStart = line.indexOf("/*", cursor);
      const lineStart = line.indexOf("//", cursor);

      if (lineStart >= 0 && (blockStart < 0 || lineStart < blockStart)) {
        comments.push({ line: index + 1, text: line.slice(lineStart + 2) });
        break;
      }

      if (blockStart >= 0) {
        const end = line.indexOf("*/", blockStart + 2);
        const text = end >= 0 ? line.slice(blockStart + 2, end) : line.slice(blockStart + 2);
        comments.push({ line: index + 1, text });
        if (end < 0) {
          inBlock = true;
          break;
        }
        cursor = end + 2;
        continue;
      }

      break;
    }
  }

  return comments;
}
