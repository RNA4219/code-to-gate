/**
 * RAW_SQL Rule
 *
 * Detects raw SQL queries that are vulnerable to SQL injection:
 * - String concatenation in SQL queries
 * - Template literals in SQL queries
 * - Direct use of client input in SQL
 */

import type { RulePlugin, RuleContext, Finding, EvidenceRef } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

export const RAW_SQL_RULE: RulePlugin = {
  id: "RAW_SQL",
  name: "Raw SQL Query",
  description:
    "Detects raw SQL queries constructed with string concatenation or template literals, which are vulnerable to SQL injection attacks. Use parameterized queries or prepared statements instead.",
  category: "data",
  defaultSeverity: "high",
  defaultConfidence: 0.85,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of context.graph.files) {
      // Skip non-source files
      if (file.role !== "source") continue;
      if (!["ts", "tsx", "js", "jsx", "py"].includes(file.language)) continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      const lines = content.split("\n");

      // SQL keywords that indicate a query
      const sqlKeywords = ["SELECT", "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER", "EXEC", "EXECUTE"];

      // Patterns that indicate raw SQL with potential injection
      const unsafeSqlPatterns = [
        // String concatenation: "SELECT * FROM " + table
        /["'`]\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\s+.*["'`]\s*\+\s*\w+/gi,
        // Template literals: `SELECT * FROM ${table}`
        /`(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)[^`]*\$\{[^}]+\}[^`]*`/gi,
        // String concatenation with + operator
        /\+\s*(?:req|request|ctx|context|event|params|body|data)\s*(?:\.\s*\w+|\[['"]\w+['"]])/gi,
        // Direct variable in query string: query("SELECT * FROM users WHERE id = " + userId)
        /(?:query|execute|exec|run)\s*\(\s*["'`][^"'`]*(?:SELECT|INSERT|UPDATE|DELETE)\s+[^"'`]*["'`]\s*\+/gi,
        // Python f-strings: f"SELECT * FROM {table}"
        /f["'](?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\s+[^"']*["']/gi,
        // Python format strings: "SELECT * FROM {}".format(table)
        /["'](?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\s+[^"']*["']\.format\s*\(/gi,
      ];

      // Patterns that indicate safe parameterized queries
      const safePatterns = [
        // Parameterized query placeholders: ?, :id, $1, @id
        /\?\s*[,)]/,
        /:\w+\s*[,)]/,
        /\$\d+\s*[,)]/,
        /@\w+\s*[,)]/,
        // Prepared statement usage
        /prepare\s*\(/i,
        /PreparedStatement/i,
        // ORM usage indicators
        /\.query\s*\(\s*\{[^}]*\}/,  // Object parameter
        /\.where\s*\(/,              // ORM where clause
        /\.find\s*\(/,               // ORM find
        /\.findOne\s*\(/,            // ORM findOne
      ];

      let inSmellComment = false;
      let smellStartLine = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Check for SMELL comment markers
        if (line.includes("SMELL: RAW_SQL") || line.includes("SMELL - Lines")) {
          inSmellComment = true;
          smellStartLine = lineNum;
          continue;
        }

        // Check for END SMELL marker
        if (inSmellComment && line.includes("END SMELL")) {
          inSmellComment = false;
          continue;
        }

        // Check for SQL keywords in the line
        const hasSqlKeyword = sqlKeywords.some((kw) => line.toUpperCase().includes(kw));

        if (!hasSqlKeyword && !inSmellComment) continue;

        // Check for unsafe patterns
        for (const pattern of unsafeSqlPatterns) {
          pattern.lastIndex = 0;
          const match = pattern.exec(line);

          if (match) {
            // Check if this line has safe patterns nearby
            const prevLines = lines.slice(Math.max(0, i - 3), i).join("\n");
            const nextLines = lines.slice(i + 1, Math.min(lines.length, i + 3)).join("\n");
            const contextLines = `${prevLines}\n${line}\n${nextLines}`;

            const hasSafePattern = safePatterns.some((p) => p.test(contextLines));

            // Skip if there are safe patterns
            if (hasSafePattern) continue;

            // Find the full context
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
              id: generateFindingId("RAW_SQL", file.path, lineNum),
              ruleId: "RAW_SQL",
              category: "data",
              severity: "high",
              confidence: inSmellComment ? 0.95 : 0.85,
              title: "Raw SQL query detected - potential SQL injection vulnerability",
              summary:
                "A raw SQL query is constructed using string concatenation or template literals, which can allow SQL injection if user input is incorporated. Use parameterized queries, prepared statements, or an ORM instead.",
              evidence: [evidence],
              tags: ["security", "sql-injection", "owasp-api3"],
              upstream: { tool: "native" },
            });
          }
        }

        // Check for explicit SMELL markers in comments
        if (inSmellComment) {
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

          if (!existingFinding && hasSqlKeyword) {
            const evidence: EvidenceRef = createEvidence(
              file.path,
              startLine,
              endLine,
              "text",
              excerpt
            );

            findings.push({
              id: generateFindingId("RAW_SQL", file.path, lineNum),
              ruleId: "RAW_SQL",
              category: "data",
              severity: "high",
              confidence: 0.95,
              title: "Raw SQL query detected (explicitly marked)",
              summary:
                "Code explicitly marked as vulnerable: raw SQL query with potential injection risk. Use parameterized queries instead.",
              evidence: [evidence],
              tags: ["security", "sql-injection", "owasp-api3"],
              upstream: { tool: "native" },
            });
          }
        }
      }
    }

    return findings;
  },
};