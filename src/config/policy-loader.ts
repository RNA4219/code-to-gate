/**
 * Policy file loader
 * Based on docs/product-spec-v1.md section 5
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { minimatch } from "minimatch";
import {
  POLICY_VERSION,
  createDefaultPolicy,
  DEFAULT_SUPPRESSION_CLASS,
  type CtgPolicy,
  type SuppressionFile,
  type SuppressionEntry,
  type SuppressionClass,
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
  CtgPolicy,
} from "./policy-types.js";

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

  if (!isValidPolicyVersion(policy.version)) {
    errors.push(`Invalid policy version: ${policy.version}. Expected: ${POLICY_VERSION}`);
  }

  if (!policy.policyId) {
    errors.push(`Policy policy_id is required`);
  }

  if (policy.confidence.minConfidence < 0 || policy.confidence.minConfidence > 1) {
    errors.push(`Invalid min_confidence: ${policy.confidence.minConfidence}. Must be between 0 and 1`);
  }

  if (policy.confidence.lowConfidenceThreshold !== undefined) {
    if (policy.confidence.lowConfidenceThreshold < 0 || policy.confidence.lowConfidenceThreshold > 1) {
      errors.push(`Invalid low_confidence_threshold: ${policy.confidence.lowConfidenceThreshold}. Must be between 0 and 1`);
    }
  }

  if (policy.llm?.minConfidence !== undefined) {
    if (policy.llm.minConfidence < 0 || policy.llm.minConfidence > 1) {
      errors.push(`Invalid LLM min_confidence: ${policy.llm.minConfidence}. Must be between 0 and 1`);
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
  let parsedPolicy: Partial<CtgPolicy>;
  let source: string;

  const absolutePath = path.resolve(cwd, policyPath);

  if (!existsSync(absolutePath)) {
    errors.push(`Policy file not found: ${policyPath}`);
    return {
      policy: createDefaultPolicy(),
      source: policyPath,
      errors,
    };
  }

  source = absolutePath;
  const content = readFileSync(absolutePath, "utf8");
  parsedPolicy = parseYamlPolicy(content);

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
  const hasRootDoubleWildcard = segments.length <= 3 && segments.some(s => s === "**");

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