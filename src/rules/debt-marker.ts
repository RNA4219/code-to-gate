/**
 * DEBT_MARKER Rule
 *
 * Detects explicit technical-debt markers in source comments.
 */

import type { RulePlugin, RuleContext, Finding } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";
import { ts } from "ts-morph";

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

// TypeScript suppression comments that should NOT be treated as debt markers
const TYPE_COMMENT_EXCLUSIONS = [
  /@ts-expect-error/,
  /@ts-ignore/,
  /@ts-check/,
  /@ts-nocheck/,
];

const ACTIONABLE_CONTEXT = /\b(remove|replace|refactor|cleanup|clean up|fix|migrate|deprecated|legacy|unsafe|slow|broken|until|after|before|because|blocked)\b/i;

function isFixtureOrTestPath(path: string): boolean {
  return /(^|[\\/])(?:fixtures?|__tests__|test|tests)([\\/]|$)/i.test(path);
}

function isAcceptedCompatibilityNote(text: string): boolean {
  return /\b(?:interop|compatibility|esm\/cjs|cjs\/esm|adapter compatibility|known upstream)\b/i.test(text) &&
    /\bwork\s*around\b|\bworkaround\b/i.test(text);
}

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
      if (isFixtureOrTestPath(file.path)) continue;
      if (!["ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "java", "php"].includes(file.language)) continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      const comments = extractCommentLines(content, file.language);
      for (const comment of comments) {
        // Skip TypeScript suppression comments (not debt markers)
        if (TYPE_COMMENT_EXCLUSIONS.some((ex) => ex.test(comment.text))) {
          continue;
        }

        const marker = MARKERS.find((candidate) => candidate.pattern.test(comment.text));
        if (!marker) continue;
        if (isAcceptedCompatibilityNote(comment.text)) continue;

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

  if (["ts", "tsx", "js", "jsx"].includes(language)) {
    return extractTypeScriptCommentLines(content, language);
  }

  return extractSlashComments(content);
}

function extractTypeScriptCommentLines(content: string, language: string): CommentLine[] {
  const scriptKind = language === "tsx"
    ? ts.ScriptKind.TSX
    : language === "jsx"
      ? ts.ScriptKind.JSX
      : language === "js"
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    `comments.${language}`,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );
  const ranges = new Map<string, ts.CommentRange>();

  const addRanges = (candidates: readonly ts.CommentRange[] | undefined): void => {
    for (const range of candidates ?? []) {
      ranges.set(`${range.pos}:${range.end}`, range);
    }
  };

  const visit = (node: ts.Node): void => {
    addRanges(ts.getLeadingCommentRanges(content, node.getFullStart()));
    addRanges(ts.getTrailingCommentRanges(content, node.getEnd()));
    for (const child of node.getChildren(sourceFile)) {
      visit(child);
    }
  };
  visit(sourceFile);

  const comments: CommentLine[] = [];
  for (const range of [...ranges.values()].sort((left, right) => left.pos - right.pos)) {
    const startLine = sourceFile.getLineAndCharacterOfPosition(range.pos).line + 1;
    const raw = content.slice(range.pos, range.end);
    if (range.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
      comments.push({ line: startLine, text: raw.slice(2) });
      continue;
    }

    const blockText = raw.slice(2, -2);
    const lines = blockText.split(/\r\n|\r|\n/);
    for (let offset = 0; offset < lines.length; offset++) {
      comments.push({ line: startLine + offset, text: lines[offset] });
    }
  }

  return comments;
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
