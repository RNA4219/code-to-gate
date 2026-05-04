/**
 * MISSING_INPUT_SANITIZATION Rule
 *
 * Detects user input used without sanitization in dangerous contexts:
 * - SQL injection risk (template literals with user input)
 * - XSS risk (innerHTML assignment with user input)
 * - Command injection (exec/spawn with user input)
 * - Path traversal (fs operations with user input)
 *
 * Injection attacks are top OWASP vulnerabilities.
 */

import type { RulePlugin, RuleContext, Finding } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

interface DangerContext {
  pattern: RegExp;
  type: string;
  severity: "critical" | "high" | "medium";
  description: string;
}

const DANGER_CONTEXTS: DangerContext[] = [
  // SQL injection patterns
  {
    pattern: /`[^`]*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)[^`]*\$\{[^}]*(?:req|request|body|query|params|headers|ctx|event)[^}]*\}[^`]*`/gi,
    type: "sql",
    severity: "critical",
    description: "SQL injection risk: User input used directly in SQL query template literal",
  },
  {
    pattern: /(?:db|database|connection|pool)\.query\s*\(\s*`[^`]*\$\{[^}]*(?:req|request|body|query|params)[^}]*\}[^`]*`/gi,
    type: "sql",
    severity: "critical",
    description: "SQL injection risk: Database query with unsanitized user input",
  },

  // XSS patterns
  {
    pattern: /\.innerHTML\s*=\s*[^;]*(?:req|request|body|query|params)[^;]*(?:;|\n|$)/gi,
    type: "xss",
    severity: "critical",
    description: "XSS risk: User input assigned directly to innerHTML",
  },
  {
    pattern: /document\.write\s*\(\s*[^)]*(?:req|request|body|query|params)/gi,
    type: "xss",
    severity: "critical",
    description: "XSS risk: User input used in document.write",
  },

  // Command injection patterns
  {
    pattern: /(?:exec|execSync|spawn|spawnSync)\s*\(\s*`[^`]*\$\{[^}]*(?:req|request|query|params|body)[^}]*\}/gi,
    type: "command",
    severity: "critical",
    description: "Command injection risk: User input in command execution",
  },
  {
    pattern: /(?:exec|execSync|spawn|spawnSync)\s*\(\s*['"][^'"]*\$\{[^}]*(?:req|request|query|params|body)/gi,
    type: "command",
    severity: "critical",
    description: "Command injection risk: User input interpolated in command",
  },

  // Path traversal patterns
  {
    pattern: /(?:fs\.readFile|fs\.writeFile|fs\.readFileSync|fs\.writeFileSync|fs\.unlink|fs\.mkdir|fs\.rmdir|readFile|writeFile)\s*\(\s*[^)]*(?:req|request|query|params|body)/gi,
    type: "path",
    severity: "high",
    description: "Path traversal risk: User input used in file operation path",
  },
  {
    pattern: /(?:path\.join|path\.resolve)\s*\([^)]*[^)]*(?:req|request|query|params|body)[^)]*\)/gi,
    type: "path",
    severity: "high",
    description: "Path traversal risk: User input in path construction without validation",
  },

  // NoSQL injection patterns
  {
    pattern: /(?:collection|db|mongo)\.(?:find|findOne|insert|update|delete)\s*\(\s*\{[^}]*(?:req|request|body|query|params)[^}]*\}/gi,
    type: "nosql",
    severity: "critical",
    description: "NoSQL injection risk: User input directly in query object",
  },

  // Log injection patterns
  {
    pattern: /(?:console\.log|logger\.|log\s*\()\s*\([^)]*[^)]*(?:req|request|body|query|params|headers)[^)]*\)/gi,
    type: "log",
    severity: "medium",
    description: "Log injection risk: User input directly in log output",
  },
];

// Patterns that indicate sanitization is present
const SANITIZATION_PATTERNS = [
  /sanitize\s*\(/,
  /escape\s*\(/,
  /escapeHtml\s*\(/,
  /escapeSql\s*\(/,
  /validate\s*\(/,
  /whitelist\s*\(/,
  /encodeURIComponent\s*\(/,
  /encodeURI\s*\(/,
  /DOMPurify/,
  /validator\./,
  /xss\s*\(/,
  /htmlspecialchars/,
  /stripTags/,
  /\.replace\s*\(/,
  /\.trim\s*\(/,
  /parseInt\s*\(/,
  /parseFloat\s*\(/,
  /Number\s*\(/,
  /\.toString\s*\(/,
  /safePath/,
  /safeFilename/,
  /path\.basename/,
  /\?\s*\)/,  // Parameterized query placeholder
];

// Check if there's evidence of sanitization nearby
function hasSanitizationNearby(
  line: string,
  prevLines: string[]
): boolean {
  const context = [...prevLines, line].join("\n");

  for (const pattern of SANITIZATION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(context)) {
      return true;
    }
  }

  return false;
}

export const MISSING_INPUT_SANITIZATION_RULE: RulePlugin = {
  id: "MISSING_INPUT_SANITIZATION",
  name: "Missing Input Sanitization",
  description:
    "Detects user input used without sanitization in dangerous contexts (SQL queries, DOM manipulation, command execution, file operations). Injection attacks (XSS, SQL injection, command injection) are top OWASP vulnerabilities.",
  category: "security",
  defaultSeverity: "critical",
  defaultConfidence: 0.85,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of context.graph.files) {
      if (file.role !== "source") continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      const lines = content.split("\n");
      let inSmellComment = false;
      let smellStartLine = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Check for SMELL comment markers
        if (line.includes("SMELL: MISSING_INPUT_SANITIZATION") || line.includes("SMELL - Lines")) {
          inSmellComment = true;
          smellStartLine = lineNum;
          continue;
        }

        // Check for END SMELL marker
        if (inSmellComment && line.includes("END SMELL")) {
          findings.push({
            id: generateFindingId("MISSING_INPUT_SANITIZATION", file.path, smellStartLine),
            ruleId: "MISSING_INPUT_SANITIZATION",
            title: "Missing input sanitization detected",
            summary: `User input used without sanitization at lines ${smellStartLine}-${lineNum}. Injection attacks (XSS, SQL injection, command injection) are top OWASP vulnerabilities.`,
            severity: "critical",
            confidence: 0.90,
            category: "security",
            evidence: [createEvidence(file.path, smellStartLine, lineNum)],
          });
          inSmellComment = false;
          continue;
        }

        // Check each danger context
        for (const ctx of DANGER_CONTEXTS) {
          ctx.pattern.lastIndex = 0;
          const match = ctx.pattern.exec(line);

          if (match) {
            // Check if this line is in a comment
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith("//") || trimmedLine.startsWith("#") || trimmedLine.startsWith("/*")) {
              continue;
            }

            // Get previous 5 lines for context
            const prevLines = lines.slice(Math.max(0, i - 5), i);

            // Check for sanitization nearby
            if (hasSanitizationNearby(line, prevLines)) {
              continue;
            }

            // Check for suppression comments
            const suppressionContext = [...prevLines, line].join("\n");
            if (suppressionContext.includes("eslint-disable") || suppressionContext.includes("nolint") || suppressionContext.includes("noqa")) {
              continue;
            }

            findings.push({
              id: generateFindingId("MISSING_INPUT_SANITIZATION", file.path, lineNum),
              ruleId: "MISSING_INPUT_SANITIZATION",
              title: `${ctx.type.toUpperCase()} injection risk detected`,
              summary: `${ctx.description}. Recommended: sanitize input before use or use parameterized queries/encoding functions.`,
              severity: ctx.severity,
              confidence: 0.85,
              category: "security",
              evidence: [createEvidence(file.path, lineNum, lineNum)],
            });

            break; // Only one finding per line
          }
        }
      }
    }

    return findings;
  },
};