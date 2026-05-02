/**
 * Policy file loader
 * Based on docs/product-spec-v1.md section 5
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { minimatch } from "minimatch";
import type { Severity, FindingCategory } from "../types/artifacts.js";

export const POLICY_VERSION = "ctg/v1alpha1";

/**
 * Blocking severity thresholds
 */
export interface BlockingSeverityConfig {
  critical?: boolean;
  high?: boolean;
  medium?: boolean;
  low?: boolean;
}

/**
 * Blocking category thresholds
 */
export interface BlockingCategoryConfig {
  auth?: boolean;
  payment?: boolean;
  validation?: boolean;
  data?: boolean;
  config?: boolean;
  maintainability?: boolean;
  testing?: boolean;
  compatibility?: boolean;
  releaseRisk?: boolean;
  security?: boolean;
}

/**
 * Blocking rule thresholds (rule-specific blocking)
 */
export interface BlockingRulesConfig {
  [ruleId: string]: boolean;
}

/**
 * Blocking count thresholds
 */
export interface BlockingCountThreshold {
  criticalMax?: number;
  highMax?: number;
  mediumMax?: number;
  lowMax?: number;
}

/**
 * Blocking configuration
 */
export interface BlockingConfig {
  severity: BlockingSeverityConfig;
  category: BlockingCategoryConfig;
  rules?: BlockingRulesConfig;
  countThreshold?: BlockingCountThreshold;
}

/**
 * Confidence thresholds
 */
export interface ConfidenceConfig {
  minConfidence: number;
  lowConfidenceThreshold?: number;
  filterLow?: boolean;
}

/**
 * Suppression configuration
 */
export interface SuppressionConfig {
  file?: string;
  expiryWarningDays?: number;
  maxSuppressionsPerRule?: number;
}

/**
 * Suppression entry
 */
export interface SuppressionEntry {
  ruleId: string;
  path: string;
  reason: string;
  expiry?: string;
  author?: string;
}

/**
 * Suppression file structure
 */
export interface SuppressionFile {
  version: string;
  suppressions: SuppressionEntry[];
}

/**
 * LLM policy configuration
 */
export interface LlmPolicyConfig {
  enabled?: boolean;
  mode?: "remote" | "local-only" | "none";
  minConfidence?: number;
  requireLlm?: boolean;
  unsupportedClaimsMax?: number;
}

/**
 * Partial handling configuration
 */
export interface PartialConfig {
  allowPartial?: boolean;
  partialWarningThreshold?: number;
}

/**
 * Baseline configuration (Phase 2+)
 */
export interface BaselineConfig {
  enabled?: boolean;
  file?: string;
  newFindingsBlock?: boolean;
}

/**
 * Exit code policy
 */
export interface ExitConfig {
  failOnCritical?: boolean;
  failOnHigh?: boolean;
  warnOnly?: boolean;
}

/**
 * Full policy schema
 */
export interface CtgPolicy {
  version: string;
  policyId: string;
  blocking: BlockingConfig;
  confidence: ConfidenceConfig;
  suppression?: SuppressionConfig;
  llm?: LlmPolicyConfig;
  partial?: PartialConfig;
  baseline?: BaselineConfig;
  exit?: ExitConfig;
}

/**
 * Default blocking severity config
 */
export const DEFAULT_BLOCKING_SEVERITY: BlockingSeverityConfig = {
  critical: true,
  high: true,
  medium: false,
  low: false,
};

/**
 * Default blocking category config
 */
export const DEFAULT_BLOCKING_CATEGORY: BlockingCategoryConfig = {
  auth: true,
  payment: true,
  validation: true,
  data: false,
  config: false,
  maintainability: false,
  testing: false,
  compatibility: false,
  releaseRisk: false,
  security: true,
};

/**
 * Default confidence config
 */
export const DEFAULT_CONFIDENCE: ConfidenceConfig = {
  minConfidence: 0.6,
  lowConfidenceThreshold: 0.4,
  filterLow: true,
};

/**
 * Create default policy
 */
export function createDefaultPolicy(): CtgPolicy {
  return {
    version: POLICY_VERSION,
    policyId: "default-policy",
    blocking: {
      severity: DEFAULT_BLOCKING_SEVERITY,
      category: DEFAULT_BLOCKING_CATEGORY,
      countThreshold: {
        criticalMax: 0,
        highMax: 5,
        mediumMax: 20,
      },
    },
    confidence: DEFAULT_CONFIDENCE,
    suppression: {
      file: ".ctg/suppressions.yaml",
      expiryWarningDays: 30,
      maxSuppressionsPerRule: 10,
    },
    llm: {
      enabled: true,
      mode: "remote",
      minConfidence: 0.6,
      requireLlm: false,
      unsupportedClaimsMax: 10,
    },
    partial: {
      allowPartial: false,
      partialWarningThreshold: 0.2,
    },
    baseline: {
      enabled: false,
      file: ".qh/baseline-readiness.json",
      newFindingsBlock: true,
    },
    exit: {
      failOnCritical: true,
      failOnHigh: true,
      warnOnly: false,
    },
  };
}

/**
 * Parse YAML policy file
 */
function parseYamlPolicy(content: string): Partial<CtgPolicy> {
  const result: Partial<CtgPolicy> = {};
  const lines = content.split("\n");

  let currentSection: string | null = null;
  let currentSubSection: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const indent = line.length - line.trimStart().length;

    // Root level
    if (indent === 0 && trimmed.includes(":")) {
      const [key, value] = trimmed.split(":").map(s => s.trim());
      currentSection = key;
      currentSubSection = null;

      if (key === "version") {
        result.version = value || POLICY_VERSION;
      } else if (key === "policy_id") {
        result.policyId = value || "";
      } else if (key === "blocking") {
        result.blocking = {
          severity: { ...DEFAULT_BLOCKING_SEVERITY },
          category: { ...DEFAULT_BLOCKING_CATEGORY },
          rules: {},
        };
      } else if (key === "confidence") {
        result.confidence = { ...DEFAULT_CONFIDENCE };
      } else if (key === "suppression") {
        result.suppression = {};
      } else if (key === "llm") {
        result.llm = {};
      } else if (key === "partial") {
        result.partial = {};
      } else if (key === "baseline") {
        result.baseline = {};
      } else if (key === "exit") {
        result.exit = {};
      }
    }
    // Nested sections
    else if (indent > 0 && trimmed.includes(":")) {
      const [key, value] = trimmed.split(":").map(s => s.trim());

      // Sub-section markers first (indent=2 level keys like severity:, category:, rules:)
      if (currentSection === "blocking" && result.blocking && indent === 2) {
        if (key === "severity") {
          currentSubSection = "severity";
        } else if (key === "category") {
          currentSubSection = "category";
        } else if (key === "rules") {
          currentSubSection = "rules";
          result.blocking.rules = {};
        } else if (key === "count_threshold") {
          currentSubSection = "count_threshold";
        }
      }
      // Blocking severity values
      else if (currentSection === "blocking" && currentSubSection === "severity" && result.blocking?.severity) {
        if (["critical", "high", "medium", "low"].includes(key)) {
          result.blocking.severity[key as Severity] = value === "true";
        }
      }
      // Blocking category values
      else if (currentSection === "blocking" && currentSubSection === "category" && result.blocking?.category) {
        const categoryKey = key.replace("-", "");
        if (categoryKey in DEFAULT_BLOCKING_CATEGORY) {
          result.blocking.category[categoryKey as keyof BlockingCategoryConfig] = value === "true";
        }
      }
      // Blocking rules values
      else if (currentSection === "blocking" && currentSubSection === "rules" && result.blocking?.rules) {
        result.blocking.rules[key] = value === "true";
      }
      // Blocking count_threshold values
      else if (currentSection === "blocking" && currentSubSection === "count_threshold") {
        if (!result.blocking?.countThreshold) {
          result.blocking = result.blocking || { severity: DEFAULT_BLOCKING_SEVERITY, category: DEFAULT_BLOCKING_CATEGORY };
          result.blocking.countThreshold = {};
        }
        if (key === "critical_max") {
          result.blocking.countThreshold.criticalMax = parseInt(value, 10);
        } else if (key === "high_max") {
          result.blocking.countThreshold.highMax = parseInt(value, 10);
        } else if (key === "medium_max") {
          result.blocking.countThreshold.mediumMax = parseInt(value, 10);
        } else if (key === "low_max") {
          result.blocking.countThreshold.lowMax = parseInt(value, 10);
        }
      }
      // Confidence section
      else if (currentSection === "confidence" && result.confidence) {
        if (key === "min_confidence") {
          result.confidence.minConfidence = parseFloat(value);
        } else if (key === "low_confidence_threshold") {
          result.confidence.lowConfidenceThreshold = parseFloat(value);
        } else if (key === "filter_low") {
          result.confidence.filterLow = value === "true";
        }
      }
      // Suppression section
      else if (currentSection === "suppression" && result.suppression) {
        if (key === "file") {
          result.suppression.file = value;
        } else if (key === "expiry_warning_days") {
          result.suppression.expiryWarningDays = parseInt(value, 10);
        } else if (key === "max_suppressions_per_rule") {
          result.suppression.maxSuppressionsPerRule = parseInt(value, 10);
        }
      }
      // LLM section
      else if (currentSection === "llm" && result.llm) {
        if (key === "enabled") {
          result.llm.enabled = value === "true";
        } else if (key === "mode") {
          result.llm.mode = value as "remote" | "local-only" | "none";
        } else if (key === "min_confidence") {
          result.llm.minConfidence = parseFloat(value);
        } else if (key === "require_llm") {
          result.llm.requireLlm = value === "true";
        } else if (key === "unsupported_claims_max") {
          result.llm.unsupportedClaimsMax = parseInt(value, 10);
        }
      }
      // Partial section
      else if (currentSection === "partial" && result.partial) {
        if (key === "allow_partial") {
          result.partial.allowPartial = value === "true";
        } else if (key === "partial_warning_threshold") {
          result.partial.partialWarningThreshold = parseFloat(value);
        }
      }
      // Baseline section
      else if (currentSection === "baseline" && result.baseline) {
        if (key === "enabled") {
          result.baseline.enabled = value === "true";
        } else if (key === "file") {
          result.baseline.file = value;
        } else if (key === "new_findings_block") {
          result.baseline.newFindingsBlock = value === "true";
        }
      }
      // Exit section
      else if (currentSection === "exit" && result.exit) {
        if (key === "fail_on_critical") {
          result.exit.failOnCritical = value === "true";
        } else if (key === "fail_on_high") {
          result.exit.failOnHigh = value === "true";
        } else if (key === "warn_only") {
          result.exit.warnOnly = value === "true";
        }
      }
    }
  }

  return result;
}

/**
 * Merge parsed policy with defaults
 */
function mergeWithDefaults(parsed: Partial<CtgPolicy>): CtgPolicy {
  const defaults = createDefaultPolicy();

  return {
    version: parsed.version || defaults.version,
    policyId: parsed.policyId || defaults.policyId,
    blocking: {
      severity: { ...defaults.blocking.severity, ...parsed.blocking?.severity },
      category: { ...defaults.blocking.category, ...parsed.blocking?.category },
      rules: { ...parsed.blocking?.rules },
      countThreshold: { ...defaults.blocking.countThreshold, ...parsed.blocking?.countThreshold },
    },
    confidence: { ...defaults.confidence, ...parsed.confidence },
    suppression: { ...defaults.suppression, ...parsed.suppression },
    llm: { ...defaults.llm, ...parsed.llm },
    partial: { ...defaults.partial, ...parsed.partial },
    baseline: { ...defaults.baseline, ...parsed.baseline },
    exit: { ...defaults.exit, ...parsed.exit },
  };
}

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
 * @param policyPath - Path to the policy file (required)
 * @param cwd - Current working directory for resolving relative paths
 * @returns Loaded and validated policy
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

  // Merge with defaults and validate
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
 * Parse suppression file content
 */
function parseSuppressionFile(content: string): SuppressionFile {
  const result: SuppressionFile = {
    version: POLICY_VERSION,
    suppressions: [],
  };

  const lines = content.split("\n");
  let currentSuppression: Partial<SuppressionEntry> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (trimmed.startsWith("-")) {
      // Save previous suppression if exists
      if (currentSuppression && currentSuppression.ruleId && currentSuppression.path) {
        result.suppressions.push({
          ruleId: currentSuppression.ruleId,
          path: currentSuppression.path,
          reason: currentSuppression.reason || "",
          expiry: currentSuppression.expiry,
          author: currentSuppression.author,
        });
      }
      currentSuppression = {};
      continue;
    }

    if (trimmed.includes(":") && currentSuppression) {
      const [key, value] = trimmed.split(":").map(s => s.trim());

      if (key === "rule_id") {
        currentSuppression.ruleId = value || "";
      } else if (key === "path") {
        // Remove quotes from path
        currentSuppression.path = value?.replace(/^["']|["']$/g, "") || "";
      } else if (key === "reason") {
        currentSuppression.reason = value || "";
      } else if (key === "expiry") {
        currentSuppression.expiry = value?.replace(/^["']|["']$/g, "");
      } else if (key === "author") {
        currentSuppression.author = value?.replace(/^["']|["']$/g, "");
      }
    }

    if (trimmed.startsWith("version:")) {
      result.version = trimmed.split(":")[1]?.trim() || POLICY_VERSION;
    }
  }

  // Save last suppression
  if (currentSuppression && currentSuppression.ruleId && currentSuppression.path) {
    result.suppressions.push({
      ruleId: currentSuppression.ruleId,
      path: currentSuppression.path,
      reason: currentSuppression.reason || "",
      expiry: currentSuppression.expiry,
      author: currentSuppression.author,
    });
  }

  return result;
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
    // Match rule ID
    if (suppression.ruleId !== ruleId) {
      continue;
    }

    // Match path (glob pattern using minimatch)
    if (!minimatch(findingPath, suppression.path)) {
      continue;
    }

    // Check expiry
    if (suppression.expiry) {
      const expiryDate = new Date(suppression.expiry);
      const now = new Date();
      if (now > expiryDate) {
        // Suppression expired - not suppressed
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