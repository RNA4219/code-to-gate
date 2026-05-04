/**
 * MISSING_RATE_LIMIT Rule
 *
 * Detects API endpoints without rate limiting:
 * - Express/Fastify routes without rate limit middleware
 * - FastAPI/Flask routes without rate limiting decorators
 */

import type { RulePlugin, RuleContext, Finding, EvidenceRef } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

// Route patterns by language
const ROUTE_PATTERNS_BY_LANG: Record<string, RegExp[]> = {
  ts: [
    /\.(?:get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]/g,
  ],
  js: [
    /\.(?:get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]/g,
  ],
  py: [
    /@(?:app|router)\.(?:get|post|put|delete)\s*\(\s*["']([^"']+)["']/g,
  ],
  go: [
    /\.(?:GET|POST|PUT|DELETE)\s*\(\s*["']([^"']+)["']/g,
  ],
};

// Rate limit patterns by language
const RATE_LIMIT_BY_LANG: Record<string, RegExp[]> = {
  ts: [/rateLimit|rateLimiter|express-rate-limit|limiter|slowDown|throttle/],
  js: [/rateLimit|rateLimiter|express-rate-limit|limiter|slowDown|throttle/],
  py: [/@limiter|@rate_limit|slowapi|flask-limiter|limits/],
  go: [/RateLimit|Limiter|Throttle|rate\.Limiter|gin-limiter/],
};

// Sensitive routes
const SENSITIVE_ROUTES = [
  /(?:auth|login|register|password|token|api[_-]?key)/i,
  /(?:user|account|delete|reset)/i,
];

// Safe routes
const SAFE_ROUTES = [
  /(?:static|assets|health|status|ping|favicon|robots)/i,
  /(?:docs|swagger|openapi|api-docs)/i,
];

function getLanguage(path: string): string {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "ts";
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "js";
  if (path.endsWith(".py")) return "py";
  if (path.endsWith(".go")) return "go";
  return "ts";
}

function isSensitive(route: string): boolean {
  return SENSITIVE_ROUTES.some(p => p.test(route));
}

function isSafe(route: string): boolean {
  return SAFE_ROUTES.some(p => p.test(route));
}

export const MISSING_RATE_LIMIT_RULE: RulePlugin = {
  id: "MISSING_RATE_LIMIT",
  name: "Missing Rate Limit",
  description:
    "Detects API endpoints, especially auth/login, that lack rate limiting.",
  category: "security",
  defaultSeverity: "medium",
  defaultConfidence: 0.75,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const lang = getLanguage(context.graph.files[0]?.path || "ts");
    const routePatterns = ROUTE_PATTERNS_BY_LANG[lang] || ROUTE_PATTERNS_BY_LANG.ts;
    const rateLimitPatterns = RATE_LIMIT_BY_LANG[lang] || RATE_LIMIT_BY_LANG.ts;

    for (const file of context.graph.files) {
      if (file.role !== "source") continue;

      const langFile = getLanguage(file.path);
      const patterns = ROUTE_PATTERNS_BY_LANG[langFile] || ROUTE_PATTERNS_BY_LANG.ts;
      const rlPatterns = RATE_LIMIT_BY_LANG[langFile] || RATE_LIMIT_BY_LANG.ts;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      const hasRateLimit = rlPatterns.some(p => p.test(content));
      const lines = content.split("\n");

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];

        for (const pattern of patterns) {
          const matches = line.matchAll(pattern);
          for (const match of matches) {
            const route = match[1];
            if (!route || isSafe(route)) continue;

            const hasLineRL = rlPatterns.some(p => p.test(line));
            if (!hasLineRL && !hasRateLimit && isSensitive(route)) {
              const excerpt = line.trim();
              findings.push({
                id: generateFindingId("MISSING_RATE_LIMIT", file.path, lineNum + 1),
                ruleId: "MISSING_RATE_LIMIT",
                severity: "high",
                confidence: 0.85,
                title: `Sensitive endpoint lacks rate limiting: ${route}`,
                summary: `Endpoint "${route}" in ${file.path}:${lineNum + 1} should have rate limiting`,
                evidence: [createEvidence(file.path, lineNum + 1, lineNum + 1, "text", excerpt)],
                category: "security",
              });
            }
          }
        }
      }
    }

    return findings;
  },
};