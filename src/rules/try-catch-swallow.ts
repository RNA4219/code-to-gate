/**
 * TRY_CATCH_SWALLOW Rule
 *
 * Detects try-catch blocks that silently swallow exceptions:
 * - Empty catch blocks
 * - Catch blocks that only return null/undefined
 * - Catch blocks with no logging
 */

import type { RulePlugin, RuleContext, Finding, EvidenceRef } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

export const TRY_CATCH_SWALLOW_RULE: RulePlugin = {
  id: "TRY_CATCH_SWALLOW",
  name: "Try-Catch Swallow",
  description:
    "Detects try-catch blocks that silently swallow exceptions without proper handling or logging. This can hide errors and make debugging difficult.",
  category: "maintainability",
  defaultSeverity: "medium",
  defaultConfidence: 0.8,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of context.graph.files) {
      // Skip non-source and test files
      if (file.role !== "source") continue;
      if (!["ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "java", "php"].includes(file.language)) continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      const lines = content.split("\n");

      // Track try-catch block boundaries
      let _tryStartLine = 0;
      let _catchStartLine = 0;
      let braceDepth = 0;
      let _inTryBlock = false;
      let inCatchBlock = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;
        const trimmed = line.trim();

        // Skip comments and SMELL markers
        if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
          if (trimmed.includes("SMELL: TRY_CATCH_SWALLOW")) {
            inCatchBlock = true;
            _catchStartLine = lineNum;
          }
          continue;
        }

        // Track try keyword
        if (trimmed.startsWith("try") || trimmed === "try:") {
          _tryStartLine = lineNum;
          _inTryBlock = true;
        }

        // Track catch keyword (JS/TS)
        if (trimmed.startsWith("catch") && (trimmed.includes("{") || lines[i + 1]?.trim().startsWith("{"))) {
          _inTryBlock = false;
          inCatchBlock = true;
          _catchStartLine = lineNum;
        }

        // Track except keyword (Python)
        if (trimmed.startsWith("except") && !trimmed.includes("Exception as")) {
          _inTryBlock = false;
          inCatchBlock = true;
          _catchStartLine = lineNum;
        }

        // Track Ruby rescue keyword
        if (trimmed.startsWith("rescue") && !trimmed.includes("=>")) {
          _inTryBlock = false;
          inCatchBlock = true;
          _catchStartLine = lineNum;
        }

        // Count braces to track block depth
        const openBraces = (trimmed.match(/\{/g) || []).length;
        const closeBraces = (trimmed.match(/\}/g) || []).length;
        braceDepth += openBraces - closeBraces;

        // Detect empty catch block (single line catch with empty body)
        // Handle variations: } catch (e) {} , catch (e) {}, } catch(err) {}
        const singleLinePatterns = [
          /\}\s*catch\s*\(\s*\w+\s*\)\s*\{\s*\}/,  // } catch (e) {}
          /catch\s*\(\s*\w+\s*\)\s*\{\s*\}/,       // catch (e) {}
          /\}\s*catch\s*\{\s*\}/,                   // } catch {}
          /catch\s*\{\s*\}/,                        // catch {}
        ];

        for (const pattern of singleLinePatterns) {
          if (pattern.test(trimmed)) {
            const evidence: EvidenceRef = createEvidence(
              file.path,
              lineNum,
              lineNum,
              "text",
              trimmed
            );

            findings.push({
              id: generateFindingId("TRY_CATCH_SWALLOW", file.path, lineNum),
              ruleId: "TRY_CATCH_SWALLOW",
              category: "maintainability",
              severity: "medium",
              confidence: 0.95,
              title: "Empty catch block swallows exceptions",
              summary:
                "The catch block is empty, silently swallowing all exceptions. This hides errors and makes debugging difficult. Consider logging the error or handling it appropriately.",
              evidence: [evidence],
              tags: ["error-handling", "maintainability"],
              upstream: { tool: "native" },
            });
            break; // Only one finding per line
          }
        }

        // Detect catch block ending (brace depth goes back)
        if (inCatchBlock && braceDepth <= 0) {
          inCatchBlock = false;
        }
      }

      // Additional pattern: catch block with only return null/undefined
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;
        const trimmed = line.trim();

        // Pattern: catch block with only return null
        if (
          trimmed === "return null;" ||
          trimmed === "return undefined;" ||
          trimmed === "return;" ||
          trimmed === "return None;" || // Python
          trimmed === "nil" ||
          trimmed === "return nil"
        ) {
          // Check if this is inside a catch block
          const prevLines = lines.slice(Math.max(0, i - 5), i);
          const prevContent = prevLines.join("\n");

          if (
            prevContent.includes("catch") ||
            prevContent.includes("except") ||
            prevContent.includes("rescue") ||
            prevLines.some((l) => l.includes("SMELL: TRY_CATCH_SWALLOW"))
          ) {
            // Check if there's no logging before the return
            const hasLogging = prevLines.some((l) =>
              l.includes("console.log") ||
              l.includes("logger") ||
              l.includes("log.") ||
              l.includes("print") ||
              l.includes("warn") ||
              l.includes("error")
            );

            if (!hasLogging) {
              const startLine = Math.max(1, lineNum - 5);
              const endLine = lineNum + 1;
              const excerpt = lines.slice(startLine - 1, endLine).join("\n");

              const evidence: EvidenceRef = createEvidence(
                file.path,
                startLine,
                endLine,
                "text",
                excerpt
              );

              findings.push({
                id: generateFindingId("TRY_CATCH_SWALLOW", file.path, lineNum),
                ruleId: "TRY_CATCH_SWALLOW",
                category: "maintainability",
                severity: "medium",
                confidence: 0.85,
                title: "Catch block returns null without logging",
                summary:
                  "The catch block returns null/undefined without logging the error. This silently hides exceptions, making debugging difficult.",
                evidence: [evidence],
                tags: ["error-handling", "maintainability"],
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
