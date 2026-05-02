/**
 * Policy Type Definitions
 * Types and interfaces for policy configuration
 */

import type { Severity, FindingCategory } from "../types/artifacts.js";

export const POLICY_VERSION = "ctg/v1";

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
 * Blocking rule thresholds
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
 * Baseline configuration
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