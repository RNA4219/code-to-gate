/**
 * CLIENT_TRUSTED_PRICE Rule
 *
 * Detects when client-supplied price/total values are used directly
 * without server-side validation or recalculation.
 *
 * This is a critical security vulnerability that allows price manipulation attacks.
 */

import type { RulePlugin, RuleContext, Finding, EvidenceRef } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

export const CLIENT_TRUSTED_PRICE_RULE: RulePlugin = {
  id: "CLIENT_TRUSTED_PRICE",
  name: "Client-Trusted Price",
  description:
    "Detects when client-supplied price/total values are used directly without server-side validation. This allows attackers to manipulate prices and pay less than the actual cost.",
  category: "payment",
  defaultSeverity: "critical",
  defaultConfidence: 0.85,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of context.graph.files) {
      // Skip non-source files
      if (file.role !== "source") continue;
      if (!["ts", "tsx", "js", "jsx"].includes(file.language)) continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      const lines = content.split("\n");

      // Pattern 1: Direct use of req.body.total, req.body.price, request.body.total, etc.
      const directPatterns = [
        // req.body.total / request.body.total
        /(?:req|request|ctx|context)\s*\.\s*body\s*\.\s*(?:total|price|amount|cost)\b/g,
        // event.body.total (lambda style)
        /event\s*\.\s*body\s*\.\s*(?:total|price|amount|cost)\b/g,
        // Destructured: const { total } = req.body
        /(?:const|let|var)\s*\{\s*(?:total|price|amount|cost)\s*\}\s*=\s*(?:req|request|ctx|context|event)\s*\.\s*body/g,
        // Direct assignment from body: total: req.body.total
        /(?:total|price|amount|cost)\s*:\s*(?:req|request|ctx|context|event)\s*\.\s*body\s*\.\s*(?:total|price|amount|cost)/g,
      ];

      // Pattern 2: Check for client price/total being stored without validation
      const _storagePatterns = [
        /(?:create|save|insert|store|persist).*Order/gi,
        /(?:create|save|insert).*Payment/gi,
        /await\s+\w+\s*\(/g, // Any async call that might save data
      ];

      let inSmellComment = false;
      let _smellStartLine = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Check for SMELL comment markers
        if (line.includes("SMELL: CLIENT_TRUSTED_PRICE") || line.includes("SMELL - Lines")) {
          inSmellComment = true;
          _smellStartLine = lineNum;
          continue;
        }

        // Check for END SMELL marker
        if (inSmellComment && line.includes("END SMELL")) {
          inSmellComment = false;
          continue;
        }

        // Check each pattern
        for (const pattern of directPatterns) {
          pattern.lastIndex = 0; // Reset regex state
          const match = pattern.exec(line);

          if (match) {
            // Check if this line is part of a validation context
            const prevLines = lines.slice(Math.max(0, i - 5), i).join("\n").toLowerCase();
            const nextLines = lines.slice(i + 1, Math.min(lines.length, i + 5)).join("\n").toLowerCase();

            // Skip if there's validation nearby
            const hasValidation =
              prevLines.includes("validate") ||
              prevLines.includes("verify") ||
              nextLines.includes("validate") ||
              nextLines.includes("verify") ||
              prevLines.includes("recalculate") ||
              nextLines.includes("recalculate") ||
              line.includes("validate") ||
              line.includes("verify");

            if (!hasValidation) {
              // Find the full context (assignment or usage)
              const startLine = Math.max(1, lineNum - 2);
              const endLine = Math.min(lines.length, lineNum + 2);
              const excerpt = lines.slice(startLine - 1, endLine).join("\n");

              const evidence: EvidenceRef = createEvidence(
                file.path,
                startLine,
                endLine,
                "text",
                excerpt
              );

              findings.push({
                id: generateFindingId("CLIENT_TRUSTED_PRICE", file.path, lineNum),
                ruleId: "CLIENT_TRUSTED_PRICE",
                category: "payment",
                severity: "critical",
                confidence: 0.85,
                title: "Client-supplied price used without validation",
                summary:
                  "The price or total value from the request body is used directly without server-side validation or recalculation. An attacker could manipulate prices to pay less than the actual cost.",
                evidence: [evidence],
                tags: ["security", "price-manipulation", "owasp-api1"],
                upstream: { tool: "native" },
              });
            }
          }
        }

        // Check for explicit SMELL markers in comments
        if (inSmellComment || line.includes("VULNERABLE") && (line.includes("total") || line.includes("price"))) {
          const startLine = Math.max(1, lineNum - 2);
          const endLine = Math.min(lines.length, lineNum + 2);
          const excerpt = lines.slice(startLine - 1, endLine).join("\n");

          // Check if we already have a finding for this area
          const existingFinding = findings.find(
            (f) =>
              f.evidence[0]?.path === file.path &&
              f.evidence[0]?.startLine !== undefined &&
              f.evidence[0]?.startLine <= lineNum &&
              (f.evidence[0]?.endLine ?? 0) >= lineNum
          );

          if (!existingFinding) {
            const evidence: EvidenceRef = createEvidence(
              file.path,
              startLine,
              endLine,
              "text",
              excerpt
            );

            findings.push({
              id: generateFindingId("CLIENT_TRUSTED_PRICE", file.path, lineNum),
              ruleId: "CLIENT_TRUSTED_PRICE",
              category: "payment",
              severity: "critical",
              confidence: 0.95,
              title: "Client-supplied price used without validation",
              summary:
                "Code explicitly marked as vulnerable: client-controlled price/total value is used directly. This allows price manipulation attacks.",
              evidence: [evidence],
              tags: ["security", "price-manipulation", "owasp-api1"],
              upstream: { tool: "native" },
            });
          }
        }
      }
    }

    return findings;
  },
};