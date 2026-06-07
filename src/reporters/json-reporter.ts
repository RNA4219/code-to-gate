/**
 * JSON Reporter - generates findings.json
 *
 * This module handles JSON artifact formatting and writing only.
 * Rule evaluation is in application layer - import directly from application/rule-evaluator.ts
 *
 * For rule evaluation, use:
 * - application/rule-evaluator.ts: evaluateRules()
 * - reporters/json-writer.ts: writeFindingsJson() (file I/O)
 */

// Re-export writeFindingsJson from json-writer for file I/O
export { writeFindingsJson } from "./json-writer.js";

// Re-export domain functions from core for backward compatibility
export { domainTagForFinding, falsePositiveReviewTags, escapeMarkdownCell } from "../core/domain-context.js";