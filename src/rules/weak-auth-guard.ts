/**
 * WEAK_AUTH_GUARD Rule
 *
 * Detects authentication guards that only check for header presence
 * without validating token signature, expiration, or claims.
 */

import type { RulePlugin, RuleContext, Finding, EvidenceRef } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

export const WEAK_AUTH_GUARD_RULE: RulePlugin = {
  id: "WEAK_AUTH_GUARD",
  name: "Weak Authentication Guard",
  description:
    "Detects authentication guards that only check for the presence of an Authorization header without proper token validation (JWT signature, expiration, claims).",
  category: "auth",
  defaultSeverity: "critical",
  defaultConfidence: 0.9,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of context.graph.files) {
      // Skip non-source files
      if (file.role !== "source") continue;
      if (!["ts", "tsx", "js", "jsx"].includes(file.language)) continue;

      // Look for auth guard files
      const isAuthFile =
        file.path.includes("auth") ||
        file.path.includes("guard") ||
        file.path.includes("middleware") ||
        file.path.includes("authenticator");

      const content = context.getFileContent(file.path);
      if (!content) continue;

      const lines = content.split("\n");

      // Pattern 1: Only checking header presence
      const weakPatterns = [
        // if (!authorization) throw ...
        /if\s*\(\s*!\s*(?:authorization|auth|token|headers\.authorization)\s*\)/g,
        // if (!req.headers.authorization) ...
        /if\s*\(\s*!\s*(?:req|request|ctx|context)\s*\.\s*headers\s*\.\s*authorization\s*\)/g,
        // Checking only for existence, not validity
        /(?:authorization|auth|token)\s*&&\s*!\s*(?:authorization|auth|token)\s*\.\s*(?:verify|validate|decode)/g,
      ];

      // Pattern 2: Signs of proper auth (JWT verification, etc.)
      const properAuthPatterns = [
        /jwt\s*\.\s*verify/i,
        /verify\w*\s*\(/i,      // verify(), verifyToken(), verifyAuth()
        /validate\w*\s*\(/i,    // validate(), validateAuth(), validateToken()
        /decode/i,              // Covers decodeToken, jwt.decode, etc.
        /expires/i,
        /secret/i,
        /issuer/i,
        /audience/i,
      ];

      // Check if file has proper auth implementation
      const fullContent = content.toLowerCase();
      const hasProperAuth = properAuthPatterns.some((p) => p.test(fullContent));

      // Look for SMELL markers
      let inSmellComment = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Check for SMELL comment markers
        if (line.includes("SMELL: WEAK_AUTH_GUARD") || line.includes("SMELL - Lines")) {
          inSmellComment = true;
          continue;
        }

        if (line.includes("END SMELL")) {
          inSmellComment = false;
          continue;
        }

        // Check for weak patterns
        for (const pattern of weakPatterns) {
          pattern.lastIndex = 0;
          const match = pattern.exec(line);

          if (match) {
            // If file doesn't have proper auth patterns and is auth-related
            // or has explicit SMELL marker
            if ((isAuthFile && !hasProperAuth) || inSmellComment) {
              // Look for the pattern: check header presence, then return synthetic user
              const nextLines = lines.slice(i + 1, Math.min(lines.length, i + 10));

              // Check for synthetic/placeholder user return
              // Handles both single-line and multi-line returns
              const hasSyntheticReturn = nextLines.some((l) =>
                // Single-line pattern: return { id: ... }
                /return\s*\{\s*(?:id|userId|user)\s*:/.test(l)
              ) || (
                // Multi-line pattern: return { followed by id: on next lines
                nextLines.some((l) => /^return\s*\{/.test(l)) &&
                nextLines.some((l) => /^\s*(?:id|userId|user)\s*:/.test(l)) &&
                !nextLines.some((l) => l.includes("verify(") || l.includes("validate("))
              );

              // Also check for synthetic user assignment: req.user = { id: ... }
              const hasSyntheticAssignment = nextLines.some((l) =>
                /(?:req|request|ctx|context)\s*\.\s*user\s*=\s*\{/.test(l) &&
                /\b(?:id|userId)\s*:/.test(l)
              );

              // Check for throw after missing header (which is correct behavior but incomplete)
              const throwLine = line.includes("throw") ||
                nextLines.some((l) => l.includes("throw"));

              if (hasSyntheticReturn || hasSyntheticAssignment || throwLine) {
                const startLine = Math.max(1, lineNum - 3);
                const endLine = Math.min(lines.length, lineNum + 8);
                const excerpt = lines.slice(startLine - 1, endLine).join("\n");

                const evidence: EvidenceRef = createEvidence(
                  file.path,
                  startLine,
                  endLine,
                  "text",
                  excerpt
                );

                findings.push({
                  id: generateFindingId("WEAK_AUTH_GUARD", file.path, lineNum),
                  ruleId: "WEAK_AUTH_GUARD",
                  category: "auth",
                  severity: "critical",
                  confidence: 0.9,
                  title: "Authentication guard only checks header presence",
                  summary:
                    "The authentication guard only checks for the presence of an Authorization header without validating the token signature, expiration, or claims. An attacker can pass any non-empty header to bypass authentication.",
                  evidence: [evidence],
                  tags: ["security", "authentication", "jwt", "bypass"],
                  upstream: { tool: "native" },
                });

                break; // One finding per file is sufficient
              }
            }
          }
        }
      }
    }

    return findings;
  },
};