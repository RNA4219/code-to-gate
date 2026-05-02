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
  type CtgPolicy,
  type SuppressionFile,
  type SuppressionEntry,
} from "./policy-types.js";
import { parseYamlPolicy, mergeWithDefaults, parseSuppressionFile } from "./policy-yaml-parser.js";

// Re-export types and constants
export {
  POLICY_VERSION,
  createDefaultPolicy,
  DEFAULT_BLOCKING_SEVERITY,
  DEFAULT_BLOCKING_CATEGORY,
  DEFAULT_CONFIDENCE,
  BlockingSeverityConfig,
  BlockingCategoryConfig,
  BlockingRulesConfig,
  BlockingCountThreshold,
  BlockingConfig,
  ConfidenceConfig,
  SuppressionConfig,
  SuppressionEntry,
  SuppressionFile,
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
  let parsedPolicy: Partial<CtgPolicy> = {};
  let source = "";

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
): { suppressed: boolean; reason?: string; expiry?: string } {
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