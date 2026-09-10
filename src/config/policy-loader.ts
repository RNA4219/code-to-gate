/**
 * Policy file loader
 * Based on docs/product-spec-v1.md section 5
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { makeRe, minimatch } from "minimatch";
import type { FindingCategory, Severity } from "../types/artifacts.js";
import {
  POLICY_VERSION,
  createDefaultPolicy,
  DEFAULT_SUPPRESSION_CLASS,
  type CtgPolicy,
  type SuppressionFile,
  type SuppressionEntry,
  type SuppressionClass,
  type PolicyDslAction,
  type PolicyDslBaseline,
  type PolicyDslManualEvidence,
} from "./policy-types.js";
import { parseYamlPolicy, mergeWithDefaults, parseSuppressionFile } from "./policy-yaml-parser.js";

// Re-export types and constants
export {
  POLICY_VERSION,
  createDefaultPolicy,
  DEFAULT_BLOCKING_SEVERITY,
  DEFAULT_BLOCKING_CATEGORY,
  DEFAULT_CONFIDENCE,
  DEFAULT_SUPPRESSION_CLASS,
  BlockingSeverityConfig,
  BlockingCategoryConfig,
  BlockingRulesConfig,
  BlockingCountThreshold,
  BlockingConfig,
  ConfidenceConfig,
  SuppressionConfig,
  SuppressionEntry,
  SuppressionFile,
  SuppressionClass,
  LlmPolicyConfig,
  PartialConfig,
  BaselineConfig,
  ExitConfig,
  PolicyDslAction,
  PolicyDslBaseline,
  PolicyDslConfig,
  PolicyDslManualEvidence,
  PolicyDslRule,
  PolicyDslWhen,
  CtgPolicy,
  SeverityOverride,
} from "./policy-types.js";
export type { LargeModuleRuleOptions, RuleOptionsConfig } from "../types/rule-options.js";

/**
 * Validate policy version
 */
export function isValidPolicyVersion(version: string): boolean {
  return version === POLICY_VERSION;
}

/**
 * Validate policy
 */
export function validatePolicy(policy: CtgPolicy): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const isValidFraction = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 1;

  if (!isValidPolicyVersion(policy.version)) {
    errors.push(`Invalid policy version: ${policy.version}. Expected: ${POLICY_VERSION}`);
  }

  if (!policy.policyId) {
    errors.push(`Policy policy_id is required`);
  }

  if (!isValidFraction(policy.confidence.minConfidence)) {
    errors.push(`Invalid min_confidence: ${policy.confidence.minConfidence}. Must be between 0 and 1`);
  }

  if (policy.confidence.lowConfidenceThreshold !== undefined) {
    if (!isValidFraction(policy.confidence.lowConfidenceThreshold)) {
      errors.push(`Invalid low_confidence_threshold: ${policy.confidence.lowConfidenceThreshold}. Must be between 0 and 1`);
    }
  }

  if (policy.llm?.minConfidence !== undefined) {
    if (!isValidFraction(policy.llm.minConfidence)) {
      errors.push(`Invalid LLM min_confidence: ${policy.llm.minConfidence}. Must be between 0 and 1`);
    }
  }

  if (policy.partial?.partialWarningThreshold !== undefined && !isValidFraction(policy.partial.partialWarningThreshold)) {
    errors.push(`Invalid partial_warning_threshold: ${policy.partial.partialWarningThreshold}. Must be between 0 and 1`);
  }

  if (policy.blocking.countThreshold) {
    const thresholds = [
      ["critical_max", policy.blocking.countThreshold.criticalMax],
      ["high_max", policy.blocking.countThreshold.highMax],
      ["medium_max", policy.blocking.countThreshold.mediumMax],
      ["low_max", policy.blocking.countThreshold.lowMax],
    ] as const;
    for (const [name, value] of thresholds) {
      if (value !== undefined && (!Number.isFinite(value) || !Number.isInteger(value) || value < 0)) {
        errors.push(`Invalid count threshold ${name}: ${value}. Must be a non-negative integer`);
      }
    }
  }

  const largeModuleOptions = policy.ruleOptions?.LARGE_MODULE;
  if (largeModuleOptions) {
    const thresholds = [
      ["max_lines", largeModuleOptions.maxLines],
      ["max_functions", largeModuleOptions.maxFunctions],
      ["max_size_kb", largeModuleOptions.maxSizeKB],
    ] as const;
    for (const [name, value] of thresholds) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
        errors.push(`Invalid LARGE_MODULE ${name}: ${value}. Must be a non-negative number`);
      }
    }
  }

  const validDslActions: PolicyDslAction[] = ["block", "hold", "allow"];
  const validBaseline: PolicyDslBaseline[] = ["new_or_worsened"];
  const validManualEvidence: PolicyDslManualEvidence[] = ["present", "absent"];
  const validSeverities = ["critical", "high", "medium", "low"];
  const validCategories = ["auth", "payment", "validation", "data", "config", "maintainability", "testing", "compatibility", "release-risk", "security"];
  const dslRuleIds = new Set<string>();

  const validOverrideSeverities: Severity[] = ["critical", "high", "medium", "low"];
  const validOverrideCategories: FindingCategory[] = ["auth", "payment", "validation", "data", "config", "maintainability", "testing", "compatibility", "release-risk", "security"];
  if (policy.severityOverrides !== undefined) {
    if (!Array.isArray(policy.severityOverrides)) errors.push("severity_overrides must be an array");
    else for (const [index, override] of policy.severityOverrides.entries()) {
      if (!override || typeof override !== "object") { errors.push(`Invalid severity override at index ${index}`); continue; }
      if (!override.ruleId && !override.path && !override.category) errors.push(`severity_overrides[${index}] requires at least one selector`);
      if (!validOverrideSeverities.includes(override.severity)) errors.push(`Invalid severity override severity at index ${index}`);
      if (typeof override.reason !== "string" || !override.reason.trim()) errors.push(`severity_overrides[${index}].reason is required`);
      if (override.category !== undefined && (typeof override.category !== "string" || !override.category.trim() || !validOverrideCategories.includes(override.category))) errors.push(`Invalid severity override category at index ${index}`);
      if (override.ruleId !== undefined && (typeof override.ruleId !== "string" || !override.ruleId.trim())) errors.push(`Invalid severity override rule_id at index ${index}`);
      if (override.path !== undefined && (typeof override.path !== "string" || !override.path.trim() || override.path.trim() !== override.path || override.path.startsWith("!") || !makeRe(override.path.replace(/\\/g, "/")))) errors.push(`Invalid severity override path at index ${index}`);
    }
  }

  for (const rule of policy.dsl?.rules ?? []) {
    if (!rule.id) {
      errors.push("Policy DSL rule id is required");
    } else if (dslRuleIds.has(rule.id)) {
      errors.push(`Duplicate Policy DSL rule id: ${rule.id}`);
    } else {
      dslRuleIds.add(rule.id);
    }
    if (!validDslActions.includes(rule.action)) {
      errors.push(`Invalid Policy DSL action for ${rule.id}: ${rule.action}`);
    }
    const when = rule.when;
    if (!when || Object.values(when).every((value) => value === undefined || value === "")) {
      errors.push(`Policy DSL rule ${rule.id} requires at least one when condition`);
      continue;
    }
    if (when.severity && !validSeverities.includes(when.severity)) {
      errors.push(`Invalid Policy DSL severity for ${rule.id}: ${when.severity}`);
    }
    if (when.category && !validCategories.includes(when.category)) {
      errors.push(`Invalid Policy DSL category for ${rule.id}: ${when.category}`);
    }
    if (when.baseline && !validBaseline.includes(when.baseline)) {
      errors.push(`Invalid Policy DSL baseline for ${rule.id}: ${when.baseline}`);
    }
    if (when.manualEvidence && !validManualEvidence.includes(when.manualEvidence)) {
      errors.push(`Invalid Policy DSL manual_evidence for ${rule.id}: ${when.manualEvidence}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Load policy file
 */
export function loadPolicyFile(
  policyPath: string,
  cwd: string
): { policy: CtgPolicy; source: string; errors: string[] } {
  const errors: string[] = [];

  const absolutePath = path.resolve(cwd, policyPath);

  if (!existsSync(absolutePath)) {
    errors.push(`Policy file not found: ${policyPath}`);
    return {
      policy: createDefaultPolicy(),
      source: policyPath,
      errors,
    };
  }

  const source = absolutePath;
  const content = readFileSync(absolutePath, "utf8");
  let parsedPolicy: Partial<CtgPolicy>;
  try {
    parsedPolicy = parseYamlPolicy(content);
  } catch (error) {
    return {
      policy: createDefaultPolicy(),
      source,
      errors: [`severity override invalid: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const policy = mergeWithDefaults(parsedPolicy);
  const validation = validatePolicy(policy);

  return {
    policy,
    source,
    errors: [...errors, ...validation.errors],
  };
}

/**
 * Load suppression file
 */
export function loadSuppressionFile(
  suppressionPath: string,
  cwd: string
): SuppressionFile {
  const absolutePath = path.resolve(cwd, suppressionPath);

  if (!existsSync(absolutePath)) {
    return {
      version: POLICY_VERSION,
      suppressions: [],
    };
  }

  const content = readFileSync(absolutePath, "utf8");
  return parseSuppressionFile(content);
}

/**
 * Check if a finding is suppressed
 */
export function isSuppressed(
  ruleId: string,
  findingPath: string,
  suppressions: SuppressionEntry[]
): { suppressed: boolean; reason?: string; expiry?: string; class?: SuppressionClass } {
  for (const suppression of suppressions) {
    if (suppression.ruleId !== ruleId) {
      continue;
    }

    if (!minimatch(findingPath, suppression.path)) {
      continue;
    }

    if (suppression.expiry) {
      const expiryDate = new Date(suppression.expiry);
      const now = new Date();
      if (now > expiryDate) {
        continue;
      }
    }

    return {
      suppressed: true,
      reason: suppression.reason,
      expiry: suppression.expiry,
      class: suppression.class || DEFAULT_SUPPRESSION_CLASS,
    };
  }

  return { suppressed: false };
}

/**
 * Suppression expiry status
 */
export interface SuppressionExpiryWarning {
  path: string;
  ruleId: string;
  expiry: string;
  status: "expired" | "expiring_soon";
  daysUntilExpiry?: number;
}

/**
 * Check suppressions for expiry issues
 * Returns warnings for expired suppressions and those expiring within warningDays
 */
export function checkSuppressionExpiry(
  suppressions: SuppressionEntry[],
  warningDays: number = 30
): SuppressionExpiryWarning[] {
  const warnings: SuppressionExpiryWarning[] = [];
  const now = new Date();

  for (const suppression of suppressions) {
    if (!suppression.expiry) {
      continue;
    }

    const expiryDate = new Date(suppression.expiry);
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      warnings.push({
        path: suppression.path,
        ruleId: suppression.ruleId,
        expiry: suppression.expiry,
        status: "expired",
        daysUntilExpiry: Math.abs(daysUntilExpiry),
      });
    } else if (daysUntilExpiry <= warningDays) {
      warnings.push({
        path: suppression.path,
        ruleId: suppression.ruleId,
        expiry: suppression.expiry,
        status: "expiring_soon",
        daysUntilExpiry,
      });
    }
  }

  return warnings;
}

/**
 * Broad suppression detection
 * Patterns that match entire directories or wide file sets
 */
export interface BroadSuppression {
  ruleId: string;
  path: string;
  reason: string;
  class?: SuppressionClass;
  broadType: "directory-wide" | "rule-wide" | "extension-wide" | "mixed-wide";
}

/**
 * Broad patterns that indicate wide suppression scope
 */
const BROAD_PATTERNS = [
  { pattern: "src/**", type: "directory-wide" as const },
  { pattern: "**/src/**", type: "directory-wide" as const },
  { pattern: "fixtures/**", type: "directory-wide" as const },
  { pattern: "**/fixtures/**", type: "directory-wide" as const },
  { pattern: "tests/**", type: "directory-wide" as const },
  { pattern: "**/tests/**", type: "directory-wide" as const },
  { pattern: "test/**", type: "directory-wide" as const },
  { pattern: "**/*.ts", type: "extension-wide" as const },
  { pattern: "**/*.js", type: "extension-wide" as const },
  { pattern: "**/*.py", type: "extension-wide" as const },
  { pattern: "*", type: "rule-wide" as const },
  { pattern: "**", type: "rule-wide" as const },
];

/**
 * Check if a suppression path pattern is broad (covers large scope)
 */
export function isBroadSuppression(pathPattern: string): boolean {
  // Exact broad patterns
  const exactBroadPatterns = [
    "src/**",
    "fixtures/**",
    "tests/**",
    "test/**",
    "**/*.ts",
    "**/*.js",
    "**/*.py",
    "*",
    "**",
    "src/**/*",
    "fixtures/**/*",
  ];

  if (exactBroadPatterns.includes(pathPattern)) {
    return true;
  }

  // Check for double wildcard at directory root level (e.g., "dir/**", "dir/**/*")
  // This means entire directory and all subdirectories
  const segments = pathPattern.split("/");

  // Pattern like "dir/**" is broad
  if (segments.length === 2 && segments[1] === "**") {
    return true;
  }

  // Pattern like "dir/**/*" is broad
  if (segments.length === 3 && segments[1] === "**") {
    return true;
  }

  // Pattern starting with "**" is broad
  if (segments[0] === "**") {
    return true;
  }

  return false;
}

/**
 * Detect broad suppressions from suppression list
 */
export function detectBroadSuppressions(suppressions: SuppressionEntry[]): BroadSuppression[] {
  const broadSuppressions: BroadSuppression[] = [];

  for (const suppression of suppressions) {
    if (isBroadSuppression(suppression.path)) {
      let broadType: BroadSuppression["broadType"] = "mixed-wide";

      for (const pattern of BROAD_PATTERNS) {
        if (suppression.path === pattern.pattern ||
            suppression.path.startsWith(pattern.pattern.slice(0, -2))) {
          broadType = pattern.type;
          break;
        }
      }

      broadSuppressions.push({
        ruleId: suppression.ruleId,
        path: suppression.path,
        reason: suppression.reason,
        class: suppression.class,
        broadType,
      });
    }
  }

  return broadSuppressions;
}
