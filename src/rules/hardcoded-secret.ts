/**
 * HARDCODED_SECRET Rule
 *
 * Detects hardcoded secrets in code:
 * - API keys, tokens, passwords in code
 * - High-entropy strings that look like secrets
 * - Common secret patterns (AWS, GitHub, JWT, etc.)
 */

import type { RulePlugin, RuleContext, Finding } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

// Common secret patterns
const SECRET_PATTERNS = [
  { pattern: /AKIA[0-9A-Z]{16}/g, name: "AWS Access Key" },
  { pattern: /ghp_[A-Za-z0-9]{36}/g, name: "GitHub PAT" },
  { pattern: /gho_[A-Za-z0-9]{36}/g, name: "GitHub OAuth Token" },
  { pattern: /ghu_[A-Za-z0-9]{36}/g, name: "GitHub App Token" },
  { pattern: /ghr_[A-Za-z0-9]{36}/g, name: "GitHub Refresh Token" },
  { pattern: /xox[baprs]-[0-9A-Za-z-]{10,}/g, name: "Slack Token" },
  { pattern: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g, name: "JWT Token" },
  { pattern: /BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY/g, name: "Private Key" },
];

// Variable names that suggest secrets
const SECRET_VAR_NAMES = [
  "password", "passwd", "pwd", "secret", "secret_key", "secretkey",
  "api_key", "apikey", "api_secret", "access_key", "access_token",
  "auth_token", "private_key", "client_secret", "encryption_key",
];

// Excluded patterns (test fixtures, examples, etc.)
const EXCLUDE_PATTERNS = [
  /test/i, /fixture/i, /example/i, /sample/i, /mock/i, /fake/i,
  /placeholder/i, /your[_-]?key/i, /replace[_-]?with/i, /changeme/i,
];

function isTestOrFixture(path: string): boolean {
  return EXCLUDE_PATTERNS.some(p => p.test(path));
}

function isRuleSelfReference(path: string): boolean {
  return /src[\\/]+rules[\\/]+hardcoded-secret\.ts$/.test(path);
}

function isSchemaPropertyDefinition(line: string): boolean {
  return /^\s*["']?[A-Za-z_$][\w$-]*["']?\s*:\s*(?:\{|schema|z\.|Type\.)/.test(line);
}

function isDescriptiveMetadataAssignment(name: string): boolean {
  return ["description", "summary", "title", "useCase", "recommendedAction", "narrative"].includes(name);
}

function isSecretVariableName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SECRET_VAR_NAMES.some(value => {
    const candidate = value.replace(/[^a-z0-9]/g, "");
    return normalized === candidate || normalized.startsWith(candidate) || normalized.endsWith(candidate);
  });
}

function isSafeValue(value: string): boolean {
  const safeValues = ["changeme", "your_key_here", "replace_me", "xxx", "test", "example"];
  return safeValues.some(s => value.toLowerCase().includes(s)) ||
    value.length < 16 ||
    /^[A-Za-z]+$/.test(value) && value.length < 20;
}

export const HARDCODED_SECRET_RULE: RulePlugin = {
  id: "HARDCODED_SECRET",
  name: "Hardcoded Secret",
  description:
    "Detects hardcoded secrets like API keys, passwords, and tokens in source code.",
  category: "security",
  defaultSeverity: "critical",
  defaultConfidence: 0.9,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of context.graph.files) {
      if (file.role !== "source") continue;
      if (isTestOrFixture(file.path)) continue;
      if (isRuleSelfReference(file.path)) continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      const lines = content.split("\n");

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        if (isSchemaPropertyDefinition(line)) continue;

        // Check for secret patterns
        for (const { pattern, name } of SECRET_PATTERNS) {
          const matches = line.matchAll(pattern);
          for (const match of matches) {
            const value = match[0];
            if (isSafeValue(value)) continue;

            const excerpt = line.trim();
            findings.push({
              id: generateFindingId("HARDCODED_SECRET", file.path, lineNum + 1),
              ruleId: "HARDCODED_SECRET",
              severity: "critical",
              confidence: 0.9,
              title: `Hardcoded secret: ${name}`,
              summary: `Found ${name} in ${file.path}:${lineNum + 1}`,
              evidence: [createEvidence(file.path, lineNum + 1, lineNum + 1, "text", excerpt)],
              category: "security",
            });
          }
        }

        // Check only assignments whose own variable name denotes a secret.
        for (const match of line.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*[=:]\s*["']([^"']{16,})["']/g)) {
          if (!isSecretVariableName(match[1]) || isSafeValue(match[2]) || isDescriptiveMetadataAssignment(match[1])) continue;

          const excerpt = line.trim();
          findings.push({
            id: generateFindingId("HARDCODED_SECRET_VAR", file.path, lineNum + 1),
            ruleId: "HARDCODED_SECRET",
            severity: "high",
            confidence: 0.7,
            title: `Possible secret in variable: ${match[1]}`,
            summary: `Variable "${match[1]}" may contain hardcoded secret`,
            evidence: [createEvidence(file.path, lineNum + 1, lineNum + 1, "text", excerpt)],
            category: "security",
          });
          break;
        }
      }
    }

    return findings;
  },
};
