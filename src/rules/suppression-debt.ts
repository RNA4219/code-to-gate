/**
 * SUPPRESSION_DEBT Rule
 *
 * Detects suppression files that hide broad sets of findings for a long time.
 */

import type { RulePlugin, RuleContext, Finding } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

interface ParsedSuppression {
  startLine: number;
  ruleId?: string;
  path?: string;
  reason?: string;
  expiry?: string;
}

const BROAD_PATH_PATTERNS = [
  /^\*\*?$/,
  /^\*\*\/\*$/,
  /^[^*]+\/\*$/,
  /^[^*]+\/\*\*$/,
  /^src\/\*$/,
  /^src\/\*\*$/,
  /^fixtures\/\*$/,
  /^tests?\/\*$/,
];

const LONG_LIVED_DAYS = 180;

export const SUPPRESSION_DEBT_RULE: RulePlugin = {
  id: "SUPPRESSION_DEBT",
  name: "Suppression Debt",
  description:
    "Detects broad or long-lived suppressions that can hide technical debt and reduce finding accuracy over time.",
  category: "maintainability",
  defaultSeverity: "medium",
  defaultConfidence: 0.85,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of context.graph.files) {
      if (!isSuppressionFile(file.path)) continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      const suppressions = parseSuppressions(content);
      for (const suppression of suppressions) {
        const pathValue = suppression.path ?? "";
        const broadPath = isBroadPath(pathValue);
        const longLived = isLongLived(suppression.expiry);
        const missingExpiry = !suppression.expiry;
        const genericReason = isGenericReason(suppression.reason);

        if (!broadPath && !longLived && !missingExpiry && !genericReason) continue;

        const issues = [
          broadPath ? "broad path pattern" : undefined,
          longLived ? `expiry longer than ${LONG_LIVED_DAYS} days` : undefined,
          missingExpiry ? "missing expiry" : undefined,
          genericReason ? "generic reason" : undefined,
        ].filter(Boolean);

        findings.push({
          id: generateFindingId("SUPPRESSION_DEBT", file.path, suppression.startLine),
          ruleId: "SUPPRESSION_DEBT",
          category: "maintainability",
          severity: broadPath && (longLived || missingExpiry) ? "high" : "medium",
          confidence: broadPath ? 0.9 : 0.8,
          title: `Suppression may hide debt (${suppression.ruleId ?? "unknown rule"})`,
          summary:
            `This suppression has ${issues.join(", ")}. Narrow the path, add a near-term expiry, or replace the suppression with a tracked remediation item.`,
          evidence: [
            createEvidence(
              file.path,
              suppression.startLine,
              suppression.startLine,
              "text",
              `${suppression.ruleId ?? ""} ${pathValue} ${suppression.reason ?? ""}`.trim()
            ),
          ],
          tags: ["maintainability", "technical-debt", "suppression"],
          upstream: { tool: "native" },
        });
      }
    }

    return findings;
  },
};

function isSuppressionFile(filePath: string): boolean {
  return /(^|\/)(suppressions?|ctg-suppressions)\.(ya?ml|json)$/i.test(filePath) ||
    filePath.includes("/suppressions.");
}

function parseSuppressions(content: string): ParsedSuppression[] {
  const blocks: ParsedSuppression[] = [];
  const lines = content.split(/\r?\n/);
  let current: ParsedSuppression | undefined;

  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed === "-" || trimmed.startsWith("- ")) {
      if (current) blocks.push(current);
      current = { startLine: index + 1 };
      const inline = trimmed.slice(1).trim();
      if (inline) applyKeyValue(current, inline);
      continue;
    }

    if (!current) continue;
    applyKeyValue(current, trimmed);
  }

  if (current) blocks.push(current);
  return blocks.filter((block) => block.ruleId || block.path || block.reason || block.expiry);
}

function applyKeyValue(block: ParsedSuppression, line: string): void {
  const match = /^([A-Za-z_]+)\s*:\s*(.*)$/.exec(line);
  if (!match) return;

  const key = match[1];
  const value = stripQuotes(match[2]);

  if (key === "rule_id" || key === "ruleId") block.ruleId = value;
  if (key === "path") block.path = value;
  if (key === "reason") block.reason = value;
  if (key === "expiry") block.expiry = value;
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, "").trim();
}

function isBroadPath(pathValue: string): boolean {
  return BROAD_PATH_PATTERNS.some((pattern) => pattern.test(pathValue));
}

function isLongLived(expiry?: string): boolean {
  if (!expiry) return false;
  const expiryDate = new Date(expiry);
  if (Number.isNaN(expiryDate.getTime())) return false;

  const days = (expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  return days > LONG_LIVED_DAYS;
}

function isGenericReason(reason?: string): boolean {
  if (!reason) return true;
  return /\b(architecture decision|intentional|acceptable|normal|temporary|todo|tbd)\b/i.test(reason) &&
    reason.length < 120;
}
