/**
 * ENV_DIRECT_ACCESS Rule
 *
 * Detects direct access to environment variables without validation:
 * - process.env.XYZ used directly without defaults or validation
 * - Missing environment variable checks in production code
 * - Unvalidated config from environment
 */

import type { RulePlugin, RuleContext, Finding, EvidenceRef } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

export const ENV_DIRECT_ACCESS_RULE: RulePlugin = {
  id: "ENV_DIRECT_ACCESS",
  name: "Direct Environment Variable Access",
  description:
    "Detects direct access to process.env without proper validation, defaults, or type checking. Environment variables should be validated and parsed before use to prevent runtime errors and security issues.",
  category: "config",
  defaultSeverity: "medium",
  defaultConfidence: 0.75,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of context.graph.files) {
      // Skip non-source files and test files
      if (file.role !== "source") continue;
      if (!["ts", "tsx", "js", "jsx"].includes(file.language)) continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      const lines = content.split("\n");

      // Skip config files (they're meant to handle env vars)
      const isConfigFile =
        file.path.includes("config") ||
        file.path.includes("env") ||
        file.path.includes("settings") ||
        file.path.endsWith(".env.ts") ||
        file.path.endsWith(".env.js");

      if (isConfigFile) continue;

      // Patterns for direct env access without validation
      const directEnvPatterns = [
        // process.env.VAR_NAME
        /process\.env\.(\w+)/g,
        // Destructuring: const { VAR_NAME } = process.env
        /(?:const|let|var)\s*\{\s*([^}]+)\s*\}\s*=\s*process\.env/g,
        // process.env['VAR_NAME']
        /process\.env\[['"](\w+)['"]]/g,
      ];

      // Patterns that indicate safe env usage
      const safePatterns = [
        // Using with defaults: process.env.VAR || 'default'
        /process\.env\.(\w+)\s*\|\|/,
        /process\.env\.(\w+)\s*\?\?\s*['"]/,
        // Using env-schema/validation
        /envSchema\.validate/,
        /validateEnv\s*\(/,
        /z\.object\s*\(\s*\{[^}]*\}/,
        /EnvConfig/i,
        /getEnv\s*\(/,
        // Type-safe env packages
        /@t3-oss\/env-nextjs/,
        /env-var/,
        /dotenv-safe/,
        /convict/,
      ];

      // Check for imports of validation libraries
      const hasValidationImport = content.includes("zod") ||
        content.includes("joi") ||
        content.includes("yup") ||
        content.includes("envSchema") ||
        content.includes("validateEnv");

      let inSmellComment = false;
      let smellStartLine = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Check for SMELL comment markers
        if (line.includes("SMELL: ENV_DIRECT_ACCESS") || line.includes("SMELL - Lines")) {
          inSmellComment = true;
          smellStartLine = lineNum;
          continue;
        }

        // Check for END SMELL marker
        if (inSmellComment && line.includes("END SMELL")) {
          inSmellComment = false;
          continue;
        }

        // Check each pattern
        for (const pattern of directEnvPatterns) {
          pattern.lastIndex = 0;
          const match = pattern.exec(line);

          if (match) {
            const envVarName = match[1] || match[0];

            // Check if this line has safe patterns
            const hasSafePattern = safePatterns.some((p) => p.test(line));

            // Check if next line has fallback
            const nextLine = lines[i + 1] || "";
            const hasNextLineDefault = nextLine.includes("||") ||
              nextLine.includes("??") ||
              nextLine.includes("default");

            // Check if this is in a validation context
            const prevLines = lines.slice(Math.max(0, i - 5), i).join("\n");
            const isInValidationContext = prevLines.includes("validate") ||
              prevLines.includes("schema") ||
              prevLines.includes("config");

            // Skip if safe patterns found
            if (hasSafePattern || hasNextLineDefault || isInValidationContext || hasValidationImport) {
              continue;
            }

            // Skip NODE_ENV (commonly used directly and acceptable)
            if (envVarName === "NODE_ENV") continue;

            // Find the full context
            const startLine = Math.max(1, lineNum - 2);
            const endLine = Math.min(lines.length, lineNum + 2);
            const excerpt = lines.slice(startLine - 1, endLine).join("\n");

            // Check if we already have a finding for this area
            const existingFinding = findings.find(
              (f) =>
                f.evidence[0]?.path === file.path &&
                f.evidence[0]?.startLine !== undefined &&
                Math.abs(f.evidence[0]?.startLine - lineNum) < 3
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
                id: generateFindingId("ENV_DIRECT_ACCESS", file.path, lineNum),
                ruleId: "ENV_DIRECT_ACCESS",
                category: "config",
                severity: "medium",
                confidence: inSmellComment ? 0.95 : 0.75,
                title: `Environment variable '${envVarName}' accessed without validation`,
                summary:
                  `The environment variable '${envVarName}' is accessed directly without validation, default values, or type checking. This can cause runtime errors if the variable is missing or incorrectly formatted. Use a config validation layer or provide fallback values.`,
                evidence: [evidence],
                tags: ["configuration", "robustness", "runtime-error-risk"],
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