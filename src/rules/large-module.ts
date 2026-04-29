/**
 * LARGE_MODULE Rule
 *
 * Detects oversized modules/files that hurt maintainability:
 * - Files exceeding line count threshold
 * - Files with too many functions/classes
 * - Files exceeding size limits
 */

import type { RulePlugin, RuleContext, Finding, EvidenceRef } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

// Default thresholds (configurable via policy)
const DEFAULT_MAX_LINES = 500;
const DEFAULT_MAX_FUNCTIONS = 20;
const DEFAULT_MAX_SIZE_KB = 50; // 50KB

export const LARGE_MODULE_RULE: RulePlugin = {
  id: "LARGE_MODULE",
  name: "Large Module",
  description:
    "Detects oversized modules/files that exceed reasonable size thresholds, making them hard to maintain, test, and understand. Large files should be split into smaller, focused modules.",
  category: "maintainability",
  defaultSeverity: "medium",
  defaultConfidence: 0.9,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    // Thresholds (could be overridden by policy in future)
    const maxLines = DEFAULT_MAX_LINES;
    const maxFunctions = DEFAULT_MAX_FUNCTIONS;
    const maxSizeKB = DEFAULT_MAX_SIZE_KB;

    for (const file of context.graph.files) {
      // Skip non-source files and generated files
      if (file.role !== "source") continue;
      if (file.language !== "ts" && file.language !== "tsx" && file.language !== "js" && file.language !== "jsx" && file.language !== "py") continue;

      // Skip config, index, and entry files (they often aggregate imports)
      if (
        file.path.endsWith("index.ts") ||
        file.path.endsWith("index.js") ||
        file.path.includes("config/") ||
        file.path.includes("__tests__/") ||
        file.path.includes("tests/") ||
        file.path.includes("test/")
      ) {
        continue;
      }

      const content = context.getFileContent(file.path);
      if (!content) continue;

      const lines = content.split("\n");
      const lineCount = file.lineCount || lines.length;
      const sizeKB = file.sizeBytes / 1024;

      // Check line count threshold
      if (lineCount > maxLines) {
        // Find representative lines (top of file)
        const excerptLines = lines.slice(0, Math.min(20, lines.length));
        const excerpt = excerptLines.join("\n");

        const evidence: EvidenceRef = createEvidence(
          file.path,
          1,
          Math.min(20, lineCount),
          "text",
          excerpt
        );

        findings.push({
          id: generateFindingId("LARGE_MODULE", file.path),
          ruleId: "LARGE_MODULE",
          category: "maintainability",
          severity: lineCount > maxLines * 2 ? "high" : "medium",
          confidence: 0.9,
          title: `Module exceeds line count threshold (${lineCount} lines)`,
          summary:
            `This file has ${lineCount} lines, exceeding the ${maxLines} line threshold. Large files are hard to maintain, test, and understand. Consider splitting into smaller, focused modules.`,
          evidence: [evidence],
          tags: ["maintainability", "size", "refactoring"],
          upstream: { tool: "native" },
        });
      }

      // Check file size threshold
      if (sizeKB > maxSizeKB) {
        const excerptLines = lines.slice(0, Math.min(20, lines.length));
        const excerpt = excerptLines.join("\n");

        const evidence: EvidenceRef = createEvidence(
          file.path,
          1,
          Math.min(20, lineCount),
          "text",
          excerpt
        );

        // Avoid duplicate findings for the same file
        const existingFinding = findings.find(
          (f) =>
            f.ruleId === "LARGE_MODULE" &&
            f.evidence[0]?.path === file.path
        );

        if (!existingFinding) {
          findings.push({
            id: generateFindingId("LARGE_MODULE", file.path, 1),
            ruleId: "LARGE_MODULE",
            category: "maintainability",
            severity: sizeKB > maxSizeKB * 2 ? "high" : "medium",
            confidence: 0.9,
            title: `Module exceeds size threshold (${Math.round(sizeKB)}KB)`,
            summary:
              `This file is ${Math.round(sizeKB)}KB, exceeding the ${maxSizeKB}KB threshold. Large files can slow down IDE performance and code review. Consider splitting into smaller modules.`,
            evidence: [evidence],
            tags: ["maintainability", "size", "performance"],
            upstream: { tool: "native" },
          });
        }
      }

      // Count functions/classes for complexity check
      const functionCount = countFunctions(content, file.language);
      if (functionCount > maxFunctions) {
        const excerptLines = lines.slice(0, Math.min(30, lines.length));
        const excerpt = excerptLines.join("\n");

        // Avoid duplicate findings
        const existingFinding = findings.find(
          (f) =>
            f.ruleId === "LARGE_MODULE" &&
            f.evidence[0]?.path === file.path
        );

        if (!existingFinding) {
          const evidence: EvidenceRef = createEvidence(
            file.path,
            1,
            Math.min(30, lineCount),
            "text",
            excerpt
          );

          findings.push({
            id: generateFindingId("LARGE_MODULE", file.path, 2),
            ruleId: "LARGE_MODULE",
            category: "maintainability",
            severity: "medium",
            confidence: 0.85,
            title: `Module has too many functions (${functionCount})`,
            summary:
              `This file has ${functionCount} function definitions, exceeding the ${maxFunctions} threshold. Files with many functions are hard to understand and test. Consider grouping related functions into separate modules.`,
            evidence: [evidence],
            tags: ["maintainability", "complexity", "refactoring"],
            upstream: { tool: "native" },
          });
        }
      }
    }

    return findings;
  },
};

/**
 * Count function definitions in source code
 */
function countFunctions(content: string, language: string): number {
  let count = 0;

  if (language === "py") {
    // Python: def and async def
    const defMatches = content.match(/^\s*(?:async\s+)?def\s+\w+/gm);
    count = defMatches ? defMatches.length : 0;
  } else {
    // JavaScript/TypeScript patterns
    // function declarations
    const funcDeclMatches = content.match(/(?:export\s+)?(?:async\s+)?function\s+\w+/g);
    count += funcDeclMatches ? funcDeclMatches.length : 0;

    // Arrow functions assigned to variables (exported)
    const arrowFuncMatches = content.match(/(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g);
    count += arrowFuncMatches ? arrowFuncMatches.length : 0;

    // Class methods (public/private)
    const classMethodMatches = content.match(/(?:public|private|protected|static)?\s*(?:async\s+)?\w+\s*\([^)]*\)\s*\{/g);
    // Filter out constructor and lifecycle hooks that are often necessary
    const filteredMethods = classMethodMatches?.filter(
      (m) => !m.includes("constructor") &&
             !m.includes("ngOnInit") &&
             !m.includes("componentDidMount") &&
             !m.includes("render")
    ) || [];
    count += filteredMethods.length;
  }

  return count;
}