/**
 * UNTESTED_CRITICAL_PATH Rule
 *
 * Detects entrypoints (HTTP routes, API handlers) that have no associated tests.
 * Critical paths like payment/order processing should have integration tests.
 */

import type { RulePlugin, RuleContext, Finding, EvidenceRef } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

export const UNTESTED_CRITICAL_PATH_RULE: RulePlugin = {
  id: "UNTESTED_CRITICAL_PATH",
  name: "Untested Critical Path",
  description:
    "Detects critical entrypoints (payment, auth, order handlers) that have no associated tests. Critical business logic should be tested to prevent regressions.",
  category: "testing",
  defaultSeverity: "high",
  defaultConfidence: 0.75,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    // Collect all test files and their targets
    const testFiles: Set<string> = new Set();
    const testedPaths: Set<string> = new Set();

    for (const file of context.graph.files) {
      if (file.role === "test") {
        testFiles.add(file.path);

        // Infer what the test targets based on naming conventions
        const content = context.getFileContent(file.path);
        if (content) {
          // Check for imports that indicate what's being tested
          const importMatches = content.matchAll(/import\s+.*\s+from\s+['"]([^'"]+)['"]/g);
          for (const match of importMatches) {
            const importedPath = match[1];
            // Resolve relative import
            if (importedPath.startsWith(".")) {
              // Simple resolution: ../domain/cart -> domain/cart.ts
              const parts = importedPath.split("/");
              const testParts = file.path.split("/");
              // Remove test file's directory and go up
              testParts.pop(); // Remove test file name
              if (parts[0] === "..") {
                testParts.pop(); // Go up one level
                const resolved = [...testParts, ...parts.slice(1)].join("/");
                testedPaths.add(`${resolved}.ts`);
                testedPaths.add(`${resolved}.js`);
              } else if (parts[0] === ".") {
                const resolved = [...testParts, ...parts.slice(1)].join("/");
                testedPaths.add(`${resolved}.ts`);
                testedPaths.add(`${resolved}.js`);
              }
            }
          }
        }
      }
    }

    // Find critical entrypoints
    const criticalPatterns = [
      "order",
      "payment",
      "checkout",
      "purchase",
      "auth",
      "login",
      "register",
      "user",
      "admin",
    ];

    for (const file of context.graph.files) {
      if (file.role !== "source") continue;
      if (!["ts", "tsx", "js", "jsx"].includes(file.language)) continue;

      // Skip example/demo/documentation directories - not production code
      const pathLower = file.path.toLowerCase();
      if (
        pathLower.includes("examples/") ||
        pathLower.includes("example/") ||
        pathLower.includes("demo/") ||
        pathLower.includes("docs/") ||
        pathLower.includes("documentation/") ||
        pathLower.includes("samples/") ||
        pathLower.startsWith("example") ||
        pathLower.startsWith("demo")
      ) {
        continue;
      }

      const content = context.getFileContent(file.path);
      if (!content) continue;

      // Check if this is a critical path
      const isCritical = criticalPatterns.some((p) =>
        file.path.toLowerCase().includes(p)
      );

      // Check if this is an entrypoint (route handler)
      const isEntrypoint =
        content.includes("export async function") ||
        content.includes("export function") ||
        content.includes("router.") ||
        content.includes("app.") ||
        content.includes("Route") ||
        content.includes("handler") ||
        file.path.includes("api") ||
        file.path.includes("routes");

      // Check for explicit SMELL comment
      const hasSmellComment =
        content.includes("UNTESTED_CRITICAL_PATH") ||
        content.includes("MISSING: Integration tests") ||
        content.includes("MISSING: tests");

      // Check if this file has associated tests
      const hasTests = testedPaths.has(file.path) ||
        testFiles.has(file.path.replace("src/", "tests/").replace(".ts", ".test.ts")) ||
        testFiles.has(file.path.replace("src/", "src/tests/").replace(".ts", ".test.ts")) ||
        testFiles.has(file.path.replace(".ts", ".test.ts")) ||
        testFiles.has(file.path.replace(".ts", ".spec.ts"));

      if ((isCritical && isEntrypoint && !hasTests) || hasSmellComment) {
        const lines = content.split("\n");
        let startLine = 1;

        // Find the entrypoint function
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (
            line.includes("export async function") ||
            line.includes("export function") ||
            line.includes("SMELL")
          ) {
            startLine = i + 1;
            break;
          }
        }

        const endLine = Math.min(lines.length, startLine + 5);
        const excerpt = lines.slice(startLine - 1, endLine).join("\n");

        const evidence: EvidenceRef = createEvidence(
          file.path,
          startLine,
          endLine,
          "test",
          excerpt
        );

        findings.push({
          id: generateFindingId("UNTESTED_CRITICAL_PATH", file.path, startLine),
          ruleId: "UNTESTED_CRITICAL_PATH",
          category: "testing",
          severity: "high",
          confidence: hasSmellComment ? 0.95 : 0.75,
          title: "Critical entrypoint has no associated tests",
          summary:
            `The file '${file.path}' appears to be a critical entrypoint (${isEntrypoint ? "route handler" : "business logic"}) but has no associated tests. Critical paths like payment and order processing should have integration tests to prevent regressions and security issues.`,
          evidence: [evidence],
          tags: ["testing", "coverage", "critical-path"],
          upstream: { tool: "native" },
        });
      }
    }

    return findings;
  },
};