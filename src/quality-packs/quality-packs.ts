import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import yaml from "js-yaml";

import type {
  FindingCategory,
  QualityPackArtifact,
  QualityPackDefinition,
  QualityPackId,
  Severity,
} from "../types/artifacts.js";

export interface QualityPackOptions {
  id: string;
  version: string;
  out?: string;
  now?: Date;
}

export interface QualityPackResult {
  artifact: QualityPackArtifact;
  outputPath: string;
}

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

const ALL_CATEGORIES: FindingCategory[] = [
  "auth",
  "payment",
  "validation",
  "data",
  "config",
  "maintainability",
  "testing",
  "compatibility",
  "release-risk",
  "security",
];

function severityProfile(values: Partial<Record<Severity, boolean>> = {}): Partial<Record<Severity, boolean>> {
  return {
    critical: true,
    high: true,
    medium: false,
    low: false,
    ...values,
  };
}

function categoryProfile(enabled: FindingCategory[]): Partial<Record<FindingCategory, boolean>> {
  const enabledSet = new Set(enabled);
  return Object.fromEntries(ALL_CATEGORIES.map((category) => [category, enabledSet.has(category)]));
}

function rulesProfile(ruleIds: string[]): Record<string, boolean> {
  return Object.fromEntries(ruleIds.map((ruleId) => [ruleId, true]));
}

function pack(
  definition: Omit<QualityPackDefinition, "policy" | "distribution"> & {
    distribution?: QualityPackDefinition["distribution"];
    policy: Omit<QualityPackDefinition["policy"], "blocking"> & {
      blocking: {
        severity?: Partial<Record<Severity, boolean>>;
        categories: FindingCategory[];
        rules: string[];
      };
    };
  }
): QualityPackDefinition {
  return {
    ...definition,
    distribution: definition.distribution ?? {
      sampleRepo: `fixtures/quality-packs/${definition.id}`,
      expectedArtifacts: definition.exports.map((target) => target === "sarif" ? "results.sarif" : `${target}.json`),
    },
    policy: {
      ...definition.policy,
      blocking: {
        severity: severityProfile(definition.policy.blocking.severity),
        category: categoryProfile(definition.policy.blocking.categories),
        rules: rulesProfile(definition.policy.blocking.rules),
      },
    },
  };
}

export const QUALITY_PACKS: QualityPackDefinition[] = [
  pack({
    id: "security-basic",
    name: "Security Basic",
    description: "Baseline security policy for secrets, auth guards, input validation, redirects, rate limits, and SQL usage.",
    useCase: "Default OSS security posture for repositories that need fast CI adoption without custom rule tuning.",
    maturity: "stable",
    tags: ["security", "baseline", "ci"],
    rules: {
      include: [
        "HARDCODED_SECRET",
        "WEAK_AUTH_GUARD",
        "MISSING_INPUT_SANITIZATION",
        "UNSAFE_REDIRECT",
        "MISSING_RATE_LIMIT",
        "RAW_SQL",
      ],
      block: [
        "HARDCODED_SECRET",
        "WEAK_AUTH_GUARD",
        "MISSING_INPUT_SANITIZATION",
        "UNSAFE_REDIRECT",
        "MISSING_RATE_LIMIT",
        "RAW_SQL",
      ],
      warn: [],
    },
    policy: {
      blocking: {
        categories: ["security", "auth", "validation", "data"],
        rules: [
          "HARDCODED_SECRET",
          "WEAK_AUTH_GUARD",
          "MISSING_INPUT_SANITIZATION",
          "UNSAFE_REDIRECT",
          "MISSING_RATE_LIMIT",
          "RAW_SQL",
        ],
      },
      confidence: { minConfidence: 0.6, lowConfidenceThreshold: 0.4, filterLow: true },
      baseline: { enabled: true, newFindingsBlock: true },
      llm: { mode: "local-only", requireLlm: false },
    },
    exports: ["findings", "release-readiness", "sarif", "qeg-code-to-gate", "evidence-dag"],
    recommendedCommands: [
      "code-to-gate analyze . --policy .ctg/policy.yaml --emit all --out .qh",
      "code-to-gate readiness . --policy .ctg/policy.yaml --from .qh --out .qh --baseline .qh/baseline-findings.json",
      "code-to-gate export qeg-code-to-gate --from .qh --out .qh/qeg-code-to-gate.json",
    ],
  }),
  pack({
    id: "release-evidence",
    name: "Release Evidence",
    description: "Release gate profile focused on suppression debt, untested critical paths, debt markers, and evidence exports.",
    useCase: "Projects preparing release artifacts, CI evidence bundles, or human go/no-go reviews.",
    maturity: "stable",
    tags: ["release", "evidence", "ci"],
    rules: {
      include: ["SUPPRESSION_DEBT", "DEBT_MARKER", "UNTESTED_CRITICAL_PATH", "LARGE_MODULE"],
      block: ["SUPPRESSION_DEBT", "UNTESTED_CRITICAL_PATH"],
      warn: ["DEBT_MARKER", "LARGE_MODULE"],
    },
    policy: {
      blocking: {
        categories: ["release-risk", "testing", "maintainability"],
        rules: ["SUPPRESSION_DEBT", "UNTESTED_CRITICAL_PATH"],
      },
      confidence: { minConfidence: 0.55, lowConfidenceThreshold: 0.35, filterLow: true },
      baseline: { enabled: true, newFindingsBlock: true },
      llm: { mode: "local-only", requireLlm: false },
    },
    exports: ["release-readiness", "workflow-evidence", "manual-bb", "state-gate", "qeg-code-to-gate", "evidence-dag"],
    recommendedCommands: [
      "code-to-gate doctor --from .qh --out .qh",
      "code-to-gate readiness . --policy .ctg/policy.yaml --from .qh --out .qh --baseline .qh/baseline-findings.json",
      "code-to-gate export evidence-dag --from .qh --out .qh/evidence-dag.json",
    ],
  }),
  pack({
    id: "frontend-risk",
    name: "Frontend Risk",
    description: "Frontend and edge-app profile for client-trusted values, server validation gaps, redirects, env access, and deprecated APIs.",
    useCase: "React, Astro, Next.js, or SPA repositories where client-side assumptions can leak into payment, auth, or validation paths.",
    maturity: "stable",
    tags: ["frontend", "validation", "payment"],
    rules: {
      include: [
        "CLIENT_TRUSTED_PRICE",
        "MISSING_SERVER_VALIDATION",
        "UNSAFE_REDIRECT",
        "ENV_DIRECT_ACCESS",
        "DEPRECATED_API_USAGE",
      ],
      block: ["CLIENT_TRUSTED_PRICE", "MISSING_SERVER_VALIDATION", "UNSAFE_REDIRECT"],
      warn: ["ENV_DIRECT_ACCESS", "DEPRECATED_API_USAGE"],
    },
    policy: {
      blocking: {
        categories: ["payment", "validation", "security", "config"],
        rules: ["CLIENT_TRUSTED_PRICE", "MISSING_SERVER_VALIDATION", "UNSAFE_REDIRECT"],
      },
      confidence: { minConfidence: 0.6, lowConfidenceThreshold: 0.4, filterLow: true },
      baseline: { enabled: true, newFindingsBlock: true },
      llm: { mode: "local-only", requireLlm: false },
    },
    exports: ["findings", "test-seeds", "manual-bb", "qeg-code-to-gate", "evidence-dag"],
    recommendedCommands: [
      "code-to-gate diff . --base main --head HEAD --out .qh/pr",
      "code-to-gate test-plan --from .qh/pr --out .qh/pr",
      "code-to-gate analyze . --policy .ctg/policy.yaml --emit all --out .qh",
    ],
  }),
  pack({
    id: "api-contract",
    name: "API Contract",
    description: "API and backend service profile for auth guards, server validation, rate limits, SQL, and database change safety.",
    useCase: "Service repositories where request boundaries, persistence, and migration operations are release-critical.",
    maturity: "stable",
    tags: ["api", "backend", "database"],
    rules: {
      include: [
        "WEAK_AUTH_GUARD",
        "MISSING_SERVER_VALIDATION",
        "MISSING_RATE_LIMIT",
        "RAW_SQL",
        "DB_DESTRUCTIVE_OPS",
        "DB_SCHEMA_CHANGE",
        "DB_MIGRATION_OPS",
      ],
      block: [
        "WEAK_AUTH_GUARD",
        "MISSING_SERVER_VALIDATION",
        "MISSING_RATE_LIMIT",
        "RAW_SQL",
        "DB_DESTRUCTIVE_OPS",
        "DB_SCHEMA_CHANGE",
      ],
      warn: ["DB_MIGRATION_OPS"],
    },
    policy: {
      blocking: {
        categories: ["auth", "validation", "data", "security"],
        rules: [
          "WEAK_AUTH_GUARD",
          "MISSING_SERVER_VALIDATION",
          "MISSING_RATE_LIMIT",
          "RAW_SQL",
          "DB_DESTRUCTIVE_OPS",
          "DB_SCHEMA_CHANGE",
        ],
      },
      confidence: { minConfidence: 0.65, lowConfidenceThreshold: 0.45, filterLow: true },
      baseline: { enabled: true, newFindingsBlock: true },
      llm: { mode: "local-only", requireLlm: false },
    },
    exports: ["findings", "release-readiness", "sarif", "qeg-code-to-gate", "evidence-dag"],
    recommendedCommands: [
      "code-to-gate analyze . --policy .ctg/policy.yaml --emit all --database-analysis --out .qh",
      "code-to-gate readiness . --policy .ctg/policy.yaml --from .qh --out .qh",
      "code-to-gate export sarif --from .qh --out .qh/results.sarif",
    ],
  }),
  pack({
    id: "ai-generated-code",
    name: "AI Generated Code",
    description: "Review profile for generated or agent-authored code where validation, swallowed errors, test gaps, and large modules are common.",
    useCase: "Agent workflows that need a deterministic guard before accepting AI-generated diffs.",
    maturity: "preview",
    tags: ["ai", "review", "testing"],
    rules: {
      include: [
        "TRY_CATCH_SWALLOW",
        "MISSING_INPUT_SANITIZATION",
        "MISSING_SERVER_VALIDATION",
        "UNTESTED_CRITICAL_PATH",
        "DEPRECATED_API_USAGE",
        "LARGE_MODULE",
        "CIRCULAR_DEPENDENCY",
      ],
      block: ["MISSING_INPUT_SANITIZATION", "MISSING_SERVER_VALIDATION", "UNTESTED_CRITICAL_PATH"],
      warn: ["TRY_CATCH_SWALLOW", "DEPRECATED_API_USAGE", "LARGE_MODULE", "CIRCULAR_DEPENDENCY"],
    },
    policy: {
      blocking: {
        categories: ["validation", "testing", "maintainability", "compatibility"],
        rules: ["MISSING_INPUT_SANITIZATION", "MISSING_SERVER_VALIDATION", "UNTESTED_CRITICAL_PATH"],
      },
      confidence: { minConfidence: 0.5, lowConfidenceThreshold: 0.3, filterLow: false },
      baseline: { enabled: true, newFindingsBlock: true },
      llm: { mode: "local-only", requireLlm: false },
    },
    exports: ["findings", "test-plan", "manual-bb", "workflow-evidence", "qeg-code-to-gate", "evidence-dag"],
    recommendedCommands: [
      "code-to-gate diff . --base main --head HEAD --out .qh/pr",
      "code-to-gate test-plan --from .qh/pr --out .qh/pr",
      "code-to-gate export manual-bb --from .qh --out .qh/manual-bb-seed.json",
    ],
  }),
  pack({
    id: "compliance-lite",
    name: "Compliance Lite",
    description: "Lightweight compliance profile for secrets, env access, suppression debt, debt markers, and destructive data changes.",
    useCase: "Small teams that need auditable CI evidence without adopting a heavyweight compliance platform.",
    maturity: "preview",
    tags: ["compliance", "audit", "data"],
    rules: {
      include: [
        "HARDCODED_SECRET",
        "ENV_DIRECT_ACCESS",
        "SUPPRESSION_DEBT",
        "DEBT_MARKER",
        "DB_DESTRUCTIVE_OPS",
        "DB_SCHEMA_CHANGE",
      ],
      block: ["HARDCODED_SECRET", "SUPPRESSION_DEBT", "DB_DESTRUCTIVE_OPS", "DB_SCHEMA_CHANGE"],
      warn: ["ENV_DIRECT_ACCESS", "DEBT_MARKER"],
    },
    policy: {
      blocking: {
        categories: ["security", "config", "data", "maintainability"],
        rules: ["HARDCODED_SECRET", "SUPPRESSION_DEBT", "DB_DESTRUCTIVE_OPS", "DB_SCHEMA_CHANGE"],
      },
      confidence: { minConfidence: 0.6, lowConfidenceThreshold: 0.4, filterLow: true },
      baseline: { enabled: true, newFindingsBlock: true },
      llm: { mode: "none", requireLlm: false },
    },
    exports: ["findings", "release-readiness", "workflow-evidence", "qeg-code-to-gate", "evidence-dag"],
    recommendedCommands: [
      "code-to-gate analyze . --policy .ctg/policy.yaml --emit all --database-analysis --out .qh",
      "code-to-gate readiness . --policy .ctg/policy.yaml --from .qh --out .qh --baseline .qh/baseline-findings.json",
      "code-to-gate schema validate-all .qh --profile full",
    ],
  }),
];

export const QUALITY_PACK_IDS = QUALITY_PACKS.map((qualityPack) => qualityPack.id);

export function isQualityPackId(value: string): value is QualityPackId {
  return QUALITY_PACK_IDS.includes(value as QualityPackId);
}

export function getQualityPack(id: string): QualityPackDefinition | undefined {
  return QUALITY_PACKS.find((qualityPack) => qualityPack.id === id);
}

function outputPath(out: string | undefined): string {
  if (!out) {
    return path.resolve(process.cwd(), ".qh", "quality-pack.json");
  }
  const absolute = path.resolve(process.cwd(), out);
  return out.endsWith(".json") ? absolute : path.join(absolute, "quality-pack.json");
}

export function createQualityPackArtifact(options: QualityPackOptions): QualityPackResult {
  const selected = getQualityPack(options.id);
  if (!selected) {
    throw new Error(`unknown quality pack: ${options.id}`);
  }

  const generatedAt = (options.now ?? new Date()).toISOString();
  return {
    outputPath: outputPath(options.out),
    artifact: {
      version: "ctg/v1",
      generated_at: generatedAt,
      run_id: `quality-pack-${selected.id}-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
      repo: { root: process.cwd() },
      tool: { name: "code-to-gate", version: options.version, plugin_versions: [] },
      artifact: "quality-pack",
      schema: "quality-pack@v1",
      completeness: "complete",
      pack: selected,
    },
  };
}

export function writeQualityPackArtifact(result: QualityPackResult): void {
  mkdirSync(path.dirname(result.outputPath), { recursive: true });
  writeFileSync(result.outputPath, JSON.stringify(result.artifact, null, 2) + "\n", "utf8");
}

function toPolicyCategoryKey(category: FindingCategory): string {
  return category === "release-risk" ? "releaseRisk" : category;
}

function orderedRecord<T extends string>(keys: T[], values: Partial<Record<T, boolean>>): Record<string, boolean> {
  return Object.fromEntries(keys.map((key) => [key, values[key] ?? false]));
}

export function qualityPackToPolicyYaml(qualityPack: QualityPackDefinition): string {
  const categoryEntries = Object.fromEntries(
    ALL_CATEGORIES.map((category) => [toPolicyCategoryKey(category), qualityPack.policy.blocking.category[category] ?? false])
  );
  const llmMode = qualityPack.policy.llm?.mode ?? "local-only";
  const policy = {
    version: "ctg/v1",
    policy_id: `pack-${qualityPack.id}`,
    blocking: {
      severity: orderedRecord(SEVERITIES, qualityPack.policy.blocking.severity),
      category: categoryEntries,
      rules: qualityPack.policy.blocking.rules,
      count_threshold: {
        critical_max: 0,
        high_max: 5,
        medium_max: 20,
      },
    },
    confidence: {
      min_confidence: qualityPack.policy.confidence.minConfidence,
      low_confidence_threshold: qualityPack.policy.confidence.lowConfidenceThreshold,
      filter_low: qualityPack.policy.confidence.filterLow,
    },
    baseline: qualityPack.policy.baseline
      ? {
          enabled: qualityPack.policy.baseline.enabled,
          new_findings_block: qualityPack.policy.baseline.newFindingsBlock,
        }
      : undefined,
    llm: {
      enabled: llmMode !== "none",
      mode: llmMode,
      min_confidence: qualityPack.policy.confidence.minConfidence,
      require_llm: qualityPack.policy.llm?.requireLlm ?? false,
    },
    partial: {
      allow_partial: false,
      partial_warning_threshold: 0.2,
    },
    exit: {
      fail_on_critical: true,
      fail_on_high: true,
      warn_only: false,
    },
  };

  return yaml.dump(policy, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
}

export function writeQualityPackPolicy(qualityPack: QualityPackDefinition, out: string): string {
  const output = path.resolve(process.cwd(), out);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, qualityPackToPolicyYaml(qualityPack), "utf8");
  return output;
}
