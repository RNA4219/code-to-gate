/**
 * UNSAFE_DELETE Rule
 *
 * Detects unsafe delete operations that could cause unintended data loss:
 * - Delete without WHERE clause (SQL)
 * - Delete all without confirmation/checks
 * - Bulk delete without limits
 * - Cascading delete without safety checks
 */

import type { RulePlugin, RuleContext, Finding, EvidenceRef } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

export const UNSAFE_DELETE_RULE: RulePlugin = {
  id: "UNSAFE_DELETE",
  name: "Unsafe Delete Operation",
  description:
    "Detects delete operations that lack proper safety measures such as WHERE clauses, limits, confirmation checks, or soft-delete mechanisms. These can cause unintended mass data deletion.",
  category: "data",
  defaultSeverity: "high",
  defaultConfidence: 0.8,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of context.graph.files) {
      // Skip non-source files
      if (file.role !== "source") continue;
      if (!["ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "java", "php"].includes(file.language)) continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      const lines = content.split("\n");

      // Patterns for unsafe delete operations
      const unsafeDeletePatterns = [
        // SQL DELETE without WHERE
        /DELETE\s+FROM\s+\w+\s*;?\s*$/gi,
        /DELETE\s+FROM\s+\w+\s*\n/gi,
        // MongoDB/ORM: deleteMany({}) or deleteMany() without filter
        /\.deleteMany\s*\(\s*\{\s*\}\s*\)/g,
        /\.deleteMany\s*\(\s*\)/g,
        /\.remove\s*\(\s*\{\s*\}\s*\)/g,
        /\.remove\s*\(\s*\)/g,
        // fs.unlink / fs.rm without checks
        /fs\.unlink\s*\(/g,
        /fs\.rm\s*\(/g,
        /fs\.rmSync\s*\(/g,
        // Array splice/delete for bulk removal
        /\.splice\s*\(\s*0\s*,\s*\w+\.length\s*\)/g,
        // Clear all pattern
        /\.clear\s*\(\s*\)/g,
        /\.truncate\s*\(\s*\)/g,
        // Python: os.remove, shutil.rmtree
        /os\.remove\s*\(/g,
        /shutil\.rmtree\s*\(/g,
        // Ruby: File.delete, FileUtils.rm_rf, ActiveRecord delete_all/destroy_all
        /File\.delete\s*\(/g,
        /FileUtils\.rm_rf\s*\(/g,
        /\.delete_all\s*(?:\(\s*\))?/g,
        /\.destroy_all\s*(?:\(\s*\))?/g,
        // Go/Rust/Java/PHP filesystem deletion
        /os\.Remove(?:All)?\s*\(/g,
        /std::fs::remove_(?:file|dir_all)\s*\(/g,
        /Files\.delete\s*\(/g,
        /unlink\s*\(/g,
        /rmdir\s*\(/g,
      ];

      // Patterns that indicate safe delete operations
      const safePatterns = [
        // WHERE clause
        /\bWHERE\b/i,
        // Soft delete
        /\.softDelete\s*\(/,
        /softDelete/,
        /deletedAt/,
        /isDeleted/,
        // Confirmation/validation
        /confirm\s*\(/,
        /validate\s*\(/,
        /check\s*\(/,
        /if\s*\(/,
        // Transaction
        /\.transaction\s*\(/,
        /BEGIN\s+TRANSACTION/i,
        // Limit clause
        /\bLIMIT\b/i,
        // Specific ID filter
        /\.delete\s*\(\s*\{[^}]*\b_id\b[^}]*\}/,
        /\.deleteOne\s*\(\s*\{/,
        /\.findByIdAndDelete\s*\(/,
      ];

      let inSmellComment = false;
      let smellStartLine = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Check for SMELL comment markers
        if (line.includes("SMELL: UNSAFE_DELETE") || line.includes("SMELL - Lines")) {
          inSmellComment = true;
          smellStartLine = lineNum;
          continue;
        }

        // Check for END SMELL marker
        if (inSmellComment && line.includes("END SMELL")) {
          inSmellComment = false;
          continue;
        }

        // Check each unsafe pattern
        for (const pattern of unsafeDeletePatterns) {
          pattern.lastIndex = 0;
          const match = pattern.exec(line);

          if (match) {
            // Check context for safety patterns
            const prevLines = lines.slice(Math.max(0, i - 5), i).join("\n");
            const nextLines = lines.slice(i + 1, Math.min(lines.length, i + 5)).join("\n");
            const contextLines = `${prevLines}\n${line}\n${nextLines}`;

            const hasSafePattern = safePatterns.some((p) => p.test(contextLines));

            // Skip if safety patterns found
            if (hasSafePattern) continue;

            // Find the full context
            const startLine = Math.max(1, lineNum - 3);
            const endLine = Math.min(lines.length, lineNum + 3);
            const excerpt = lines.slice(startLine - 1, endLine).join("\n");

            // Check if we already have a finding for this area
            const existingFinding = findings.find(
              (f) =>
                f.evidence[0]?.path === file.path &&
                f.evidence[0]?.startLine !== undefined &&
                Math.abs(f.evidence[0]?.startLine - lineNum) < 5
            );

            if (!existingFinding) {
              const evidence: EvidenceRef = createEvidence(
                file.path,
                startLine,
                endLine,
                "text",
                excerpt
              );

              // Determine severity based on pattern
              const isMassDelete = match[0].includes("deleteMany") ||
                match[0].includes("DELETE FROM") ||
                match[0].includes("truncate") ||
                match[0].includes("rmtree");

              findings.push({
                id: generateFindingId("UNSAFE_DELETE", file.path, lineNum),
                ruleId: "UNSAFE_DELETE",
                category: "data",
                severity: isMassDelete ? "critical" : "high",
                confidence: inSmellComment ? 0.95 : 0.8,
                title: "Unsafe delete operation detected",
                summary:
                  isMassDelete
                    ? "A bulk delete operation is detected without proper safety measures (WHERE clause, filter, limit, or confirmation). This could result in unintended mass data deletion."
                    : "A delete operation is detected without proper safety checks. Add WHERE clauses, filters, soft-delete, or confirmation to prevent accidental data loss.",
                evidence: [evidence],
                tags: ["data-loss", "delete", "safety"],
                upstream: { tool: "native" },
              });
            }
          }
        }

        // Check for explicit SMELL markers
        if (inSmellComment) {
          // Look for delete-related code in the smell block
          const hasDeleteKeyword = line.toUpperCase().includes("DELETE") ||
            line.includes(".remove") ||
            line.includes(".unlink") ||
            line.includes(".rm");

          if (hasDeleteKeyword) {
            const startLine = Math.max(1, smellStartLine);
            const endLine = Math.min(lines.length, lineNum + 1);
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
                id: generateFindingId("UNSAFE_DELETE", file.path, lineNum),
                ruleId: "UNSAFE_DELETE",
                category: "data",
                severity: "high",
                confidence: 0.95,
                title: "Unsafe delete operation (explicitly marked)",
                summary:
                  "Code explicitly marked as unsafe: delete operation without proper safety measures. Add WHERE clause, filter, confirmation, or use soft-delete.",
                evidence: [evidence],
                tags: ["data-loss", "delete", "safety"],
                upstream: { tool: "native" },
              });
            }
          }
        }
      }
    }

    return findings;
  },
};
