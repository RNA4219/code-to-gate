import type { Finding, FindingsArtifact, UnsupportedClaim } from "../types/artifacts.js";
import { domainTagForFinding } from "./domain-context.js";

const CATEGORY_KEYWORDS: Array<{ category: Finding["category"]; words: string[] }> = [
  { category: "auth", words: ["auth", "login", "session", "permission", "rbac", "admin"] },
  { category: "payment", words: ["payment", "price", "pricing", "checkout", "cart", "order", "billing"] },
  { category: "validation", words: ["validation", "validate", "input", "schema", "sanitize"] },
  { category: "data", words: ["data", "database", "db", "sql", "query", "persistence"] },
  { category: "config", words: ["config", "secret", "password", "token", "credential", "api key", "env"] },
  { category: "testing", words: ["test", "coverage", "assertion", "fixture"] },
  { category: "security", words: ["security", "vulnerability", "injection", "xss", "csrf", "exposure"] },
  { category: "release-risk", words: ["release", "deploy", "rollback", "readiness"] },
  { category: "maintainability", words: ["maintainability", "complexity", "duplication", "refactor"] },
  { category: "compatibility", words: ["compatibility", "runtime", "node", "browser"] },
];

function normalizeClaim(line: string): string {
  return line
    .replace(/^\s*[-*]\s+/, "")
    .replace(/^\s*\[[^\]]+\]\s*/, "")
    .replace(/^\s*(low|medium|high|critical)\s*:\s*/i, "")
    .trim();
}

function splitClaims(llmText: string): string[] {
  return llmText
    .split(/\r?\n/)
    .map(normalizeClaim)
    .filter((line) => line.length > 0)
    .filter((line) => !/^deterministic analysis completed/i.test(line))
    .filter((line) => !/^recommend enabling llm provider/i.test(line));
}

function categoriesForClaim(claim: string): Set<Finding["category"]> {
  const lower = claim.toLowerCase();
  const categories = new Set<Finding["category"]>();
  for (const item of CATEGORY_KEYWORDS) {
    if (item.words.some((word) => lower.includes(word))) {
      categories.add(item.category);
    }
  }
  return categories;
}

function scoreFindingForClaim(finding: Finding, claim: string, categories: Set<Finding["category"]>): number {
  let score = 0;
  const lower = claim.toLowerCase();
  if (categories.has(finding.category)) {
    score += 3;
  }
  if (lower.includes(finding.ruleId.toLowerCase())) {
    score += 3;
  }
  for (const token of `${finding.title} ${finding.summary}`.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length >= 5 && lower.includes(token)) {
      score += 1;
    }
  }
  for (const evidence of finding.evidence) {
    const parts = evidence.path.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length >= 4);
    if (parts.some((part) => lower.includes(part))) {
      score += 1;
    }
  }
  return score;
}

function appendLlmSummary(summary: string, claim: string): string {
  const note = claim.length > 180 ? `${claim.slice(0, 177)}...` : claim;
  if (summary.includes("LLM review:")) {
    return summary;
  }
  return `${summary} LLM review: ${note}`;
}

export function applyLlmEnrichment(
  artifact: FindingsArtifact,
  llmText: string | undefined,
  provider: string
): FindingsArtifact {
  if (!llmText?.trim()) {
    return artifact;
  }

  const claims = splitClaims(llmText);
  if (claims.length === 0) {
    return artifact;
  }

  const findings = artifact.findings.map((finding) => ({ ...finding }));
  const unsupportedClaims: UnsupportedClaim[] = [...artifact.unsupported_claims];
  const usedFindingIds = new Set<string>();

  claims.forEach((claim, index) => {
    const categories = categoriesForClaim(claim);
    const scored = findings
      .map((finding) => ({
        finding,
        score: scoreFindingForClaim(finding, claim, categories),
      }))
      .filter((item) => item.score >= 3)
      .sort((a, b) => b.score - a.score);

    const target = scored[0]?.finding;
    if (!target) {
      unsupportedClaims.push({
        id: `unsupported-llm-${String(index + 1).padStart(3, "0")}`,
        claim,
        reason: "missing_evidence",
        sourceSection: `llm:${provider}`,
      });
      return;
    }

    const tags = new Set(target.tags ?? []);
    tags.add("llm-reviewed");
    tags.add(`llm-provider:${provider}`);
    tags.add(domainTagForFinding(target));
    target.tags = [...tags].sort();
    target.summary = appendLlmSummary(target.summary, claim);
    usedFindingIds.add(target.id);
  });

  for (const finding of findings) {
    if (!usedFindingIds.has(finding.id)) {
      const tags = new Set(finding.tags ?? []);
      tags.add(domainTagForFinding(finding));
      finding.tags = [...tags].sort();
    }
  }

  return {
    ...artifact,
    findings,
    unsupported_claims: unsupportedClaims,
  };
}
