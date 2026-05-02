/**
 * MISSING_SERVER_VALIDATION Rule
 *
 * Detects when validation modules are imported but not used in critical paths.
 * Specifically checks for pricing/validation imports in payment/order routes.
 */

import type { RulePlugin, RuleContext, Finding, EvidenceRef } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

export const MISSING_SERVER_VALIDATION_RULE: RulePlugin = {
  id: "MISSING_SERVER_VALIDATION",
  name: "Missing Server Validation",
  description:
    "Detects when server-side validation modules (e.g., pricing, validation) are imported but not used in critical paths like payment/order processing.",
  category: "validation",
  defaultSeverity: "critical",
  defaultConfidence: 0.8,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    // Track files that import validation/pricing modules
    const filesWithValidationImport: Map<string, { imports: string[]; content: string }> = new Map();

    for (const file of context.graph.files) {
      if (file.role !== "source") continue;
      if (!["ts", "tsx", "js", "jsx"].includes(file.language)) continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      // Check for imports of validation/pricing modules
      const validationImports = [];

      // Pattern: import from pricing/validation modules
      const importPatterns = [
        /import\s+.*\s+from\s+['"].*pricing.*['"]/g,
        /import\s+.*\s+from\s+['"].*validation.*['"]/g,
        /import\s+.*\s+from\s+['"].*validate.*['"]/g,
        /import\s+.*\s+from\s+['"].*sanitize.*['"]/g,
        /require\s*\(['"].*pricing.*['"]\)/g,
        /require\s*\(['"].*validation.*['"]\)/g,
      ];

      for (const pattern of importPatterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content)) !== null) {
          validationImports.push(match[0]);
        }
      }

      if (validationImports.length > 0) {
        filesWithValidationImport.set(file.path, {
          imports: validationImports,
          content,
        });
      }
    }

    // Now check each file that imports validation
    for (const [filePath, data] of filesWithValidationImport) {
      const { imports, content } = data;
      const lines = content.split("\n");

      // Extract imported function names
      const importedFunctions: string[] = [];
      for (const importLine of imports) {
        // Match: import { func1, func2 } from '...'
        const funcMatch = importLine.match(/import\s+\{\s*([^}]+)\s*\}/);
        if (funcMatch) {
          const funcs = funcMatch[1].split(",").map((f) => f.trim().split(" as ")[0].trim());
          importedFunctions.push(...funcs);
        }
        // Match: import func from '...'
        const defaultMatch = importLine.match(/import\s+(\w+)\s+from/);
        if (defaultMatch) {
          importedFunctions.push(defaultMatch[1]);
        }
      }

      // Check if imported functions are used
      for (const func of importedFunctions) {
        // Skip 'type' imports (they're just types, not runtime usage)
        if (imports.some((i) => i.includes(`import type`) || i.includes(`type ${func}`))) {
          continue;
        }

        // Check if function is called in the content
        const isUsed =
          content.includes(`${func}(`) ||
          content.includes(`${func}.`) ||
          content.includes(`await ${func}`) ||
          content.includes(`.${func}`);

        // Check for SMELL comments that explicitly mention this
        const hasSmellComment = content.includes("MISSING_SERVER_VALIDATION") ||
          content.includes("SMELL: MISSING_SERVER_VALIDATION");

        if (!isUsed || hasSmellComment) {
          // Find the import line and the context
          let importLineNum = 0;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(func) && lines[i].includes("import")) {
              importLineNum = i + 1;
              break;
            }
          }

          // Check if this file handles orders/payments (critical path)
          const isCriticalPath =
            filePath.includes("order") ||
            filePath.includes("payment") ||
            filePath.includes("checkout") ||
            filePath.includes("purchase") ||
            content.includes("createOrder") ||
            content.includes("processPayment");

          if (!isUsed && isCriticalPath) {
            const startLine = Math.max(1, importLineNum - 1);
            const endLine = Math.min(lines.length, importLineNum + 5);
            const excerpt = lines.slice(startLine - 1, endLine).join("\n");

            const evidence: EvidenceRef = createEvidence(
              filePath,
              startLine,
              endLine,
              "import",
              excerpt
            );

            findings.push({
              id: generateFindingId("MISSING_SERVER_VALIDATION", filePath, importLineNum),
              ruleId: "MISSING_SERVER_VALIDATION",
              category: "validation",
              severity: "critical",
              confidence: 0.8,
              title: `Server validation function '${func}' imported but not used`,
              summary:
                `The function '${func}' from a validation/pricing module is imported but never called in this critical path. This indicates that server-side validation is missing, allowing client-supplied values to be trusted without verification.`,
              evidence: [evidence],
              tags: ["security", "validation", "missing-implementation"],
              upstream: { tool: "native" },
            });
          } else if (hasSmellComment && isCriticalPath) {
            // Explicit SMELL marker
            let smellLineNum = 0;
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes("MISSING_SERVER_VALIDATION") || lines[i].includes("SMELL: MISSING")) {
                smellLineNum = i + 1;
                break;
              }
            }

            const startLine = Math.max(1, smellLineNum - 2);
            const endLine = Math.min(lines.length, smellLineNum + 3);
            const excerpt = lines.slice(startLine - 1, endLine).join("\n");

            const evidence: EvidenceRef = createEvidence(
              filePath,
              startLine,
              endLine,
              "text",
              excerpt
            );

            findings.push({
              id: generateFindingId("MISSING_SERVER_VALIDATION", filePath, smellLineNum),
              ruleId: "MISSING_SERVER_VALIDATION",
              category: "validation",
              severity: "critical",
              confidence: 0.95,
              title: `Server validation module imported but not used`,
              summary:
                "A validation/pricing module is imported but explicitly not used (marked with SMELL comment). Server-side validation is missing, allowing client-supplied values to bypass verification.",
              evidence: [evidence],
              tags: ["security", "validation", "missing-implementation"],
              upstream: { tool: "native" },
            });
          }
        }
      }
    }

    return findings;
  },
};