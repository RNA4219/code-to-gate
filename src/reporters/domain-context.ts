import type { Finding, FindingCategory } from "../types/artifacts.js";

export interface DomainSignal {
  domain: string;
  label: string;
  confidence: number;
  reason: string;
}

const CATEGORY_DOMAIN: Record<FindingCategory, DomainSignal> = {
  auth: {
    domain: "auth",
    label: "Authentication and authorization",
    confidence: 0.9,
    reason: "finding category is auth",
  },
  payment: {
    domain: "commerce",
    label: "Commerce, pricing, or checkout",
    confidence: 0.9,
    reason: "finding category is payment",
  },
  validation: {
    domain: "input-boundary",
    label: "Input validation boundary",
    confidence: 0.82,
    reason: "finding category is validation",
  },
  data: {
    domain: "data-access",
    label: "Data access or persistence",
    confidence: 0.82,
    reason: "finding category is data",
  },
  config: {
    domain: "runtime-config",
    label: "Runtime configuration",
    confidence: 0.82,
    reason: "finding category is config",
  },
  maintainability: {
    domain: "code-health",
    label: "Code health and maintainability",
    confidence: 0.7,
    reason: "finding category is maintainability",
  },
  testing: {
    domain: "test-assurance",
    label: "Test assurance",
    confidence: 0.86,
    reason: "finding category is testing",
  },
  compatibility: {
    domain: "compatibility",
    label: "Runtime compatibility",
    confidence: 0.75,
    reason: "finding category is compatibility",
  },
  "release-risk": {
    domain: "release-gate",
    label: "Release gate readiness",
    confidence: 0.8,
    reason: "finding category is release-risk",
  },
  security: {
    domain: "security-boundary",
    label: "Security boundary",
    confidence: 0.86,
    reason: "finding category is security",
  },
};

const PATH_DOMAIN_RULES: Array<{ pattern: RegExp; signal: DomainSignal }> = [
  { pattern: /(^|\/)(auth|login|session|permission|rbac|admin)(\/|\.|-|_)/i, signal: CATEGORY_DOMAIN.auth },
  { pattern: /(^|\/)(cart|checkout|payment|price|pricing|order|billing)(\/|\.|-|_)/i, signal: CATEGORY_DOMAIN.payment },
  { pattern: /(^|\/)(schema|validator|validation|input|form)(\/|\.|-|_)/i, signal: CATEGORY_DOMAIN.validation },
  { pattern: /(^|\/)(db|database|repo|repository|model|migration|sql)(\/|\.|-|_)/i, signal: CATEGORY_DOMAIN.data },
  { pattern: /(^|\/)(config|env|secret|token|credential)(\/|\.|-|_)/i, signal: CATEGORY_DOMAIN.config },
  { pattern: /(^|\/)(__tests__|tests?|spec|fixtures?)(\/|\.|-|_)/i, signal: CATEGORY_DOMAIN.testing },
  { pattern: /(^|\/)(api|route|controller|handler|endpoint)(\/|\.|-|_)/i, signal: { domain: "api-boundary", label: "API boundary", confidence: 0.78, reason: "evidence path looks like an API boundary" } },
];

export function inferFindingDomain(finding: Finding): DomainSignal {
  const evidencePath = finding.evidence[0]?.path ?? "";
  for (const rule of PATH_DOMAIN_RULES) {
    if (rule.pattern.test(evidencePath)) {
      return {
        ...rule.signal,
        reason: `${rule.signal.reason}; evidence path: ${evidencePath}`,
      };
    }
  }

  return CATEGORY_DOMAIN[finding.category];
}

export function domainTagForFinding(finding: Finding): string {
  return `domain:${inferFindingDomain(finding).domain}`;
}

export function falsePositiveReviewTags(finding: Finding): string[] {
  const tags = new Set<string>();
  if (finding.confidence < 0.7) {
    tags.add("fp-review:low-confidence");
  }
  if (finding.evidence.length === 0) {
    tags.add("fp-review:missing-evidence");
  }

  const paths = finding.evidence.map((e) => e.path.toLowerCase());
  if (paths.some((p) => /(^|\/)(__tests__|tests?|spec)(\/|\.|-|_)/.test(p))) {
    tags.add("fp-review:test-path");
  }
  if (paths.some((p) => /(^|\/)(fixtures?|mocks?|examples?)(\/|\.|-|_)/.test(p))) {
    tags.add("fp-review:fixture-path");
  }
  if (paths.some((p) => /(^|\/)(dist|build|generated|coverage)(\/|\.|-|_)/.test(p))) {
    tags.add("fp-review:generated-path");
  }

  if (tags.size > 0) {
    tags.add("fp-review");
  }
  return [...tags];
}

export function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
