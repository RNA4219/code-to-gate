/**
 * Policy YAML Parser
 * Parses YAML policy and suppression files
 */

import type { Severity } from "../types/artifacts.js";
import {
  POLICY_VERSION,
  DEFAULT_BLOCKING_SEVERITY,
  DEFAULT_BLOCKING_CATEGORY,
  DEFAULT_CONFIDENCE,
  createDefaultPolicy,
  type CtgPolicy,
  type SuppressionFile,
  type SuppressionEntry,
  type BlockingCategoryConfig,
} from "./policy-types.js";

/**
 * Parse YAML policy file
 */
export function parseYamlPolicy(content: string): Partial<CtgPolicy> {
  const result: Partial<CtgPolicy> = {};
  const lines = content.split("\n");

  let currentSection: string | null = null;
  let currentSubSection: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const indent = line.length - line.trimStart().length;

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
    } else if (indent > 0 && trimmed.includes(":")) {
      const [key, value] = trimmed.split(":").map(s => s.trim());

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
      } else if (currentSection === "blocking" && currentSubSection === "severity" && result.blocking?.severity) {
        if (["critical", "high", "medium", "low"].includes(key)) {
          result.blocking.severity[key as Severity] = value === "true";
        }
      } else if (currentSection === "blocking" && currentSubSection === "category" && result.blocking?.category) {
        const categoryKey = key.replace("-", "");
        if (categoryKey in DEFAULT_BLOCKING_CATEGORY) {
          result.blocking.category[categoryKey as keyof BlockingCategoryConfig] = value === "true";
        }
      } else if (currentSection === "blocking" && currentSubSection === "rules" && result.blocking?.rules) {
        result.blocking.rules[key] = value === "true";
      } else if (currentSection === "blocking" && currentSubSection === "count_threshold") {
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
      } else if (currentSection === "confidence" && result.confidence) {
        if (key === "min_confidence") {
          result.confidence.minConfidence = parseFloat(value);
        } else if (key === "low_confidence_threshold") {
          result.confidence.lowConfidenceThreshold = parseFloat(value);
        } else if (key === "filter_low") {
          result.confidence.filterLow = value === "true";
        }
      } else if (currentSection === "suppression" && result.suppression) {
        if (key === "file") {
          result.suppression.file = value;
        } else if (key === "expiry_warning_days") {
          result.suppression.expiryWarningDays = parseInt(value, 10);
        } else if (key === "max_suppressions_per_rule") {
          result.suppression.maxSuppressionsPerRule = parseInt(value, 10);
        }
      } else if (currentSection === "llm" && result.llm) {
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
      } else if (currentSection === "partial" && result.partial) {
        if (key === "allow_partial") {
          result.partial.allowPartial = value === "true";
        } else if (key === "partial_warning_threshold") {
          result.partial.partialWarningThreshold = parseFloat(value);
        }
      } else if (currentSection === "baseline" && result.baseline) {
        if (key === "enabled") {
          result.baseline.enabled = value === "true";
        } else if (key === "file") {
          result.baseline.file = value;
        } else if (key === "new_findings_block") {
          result.baseline.newFindingsBlock = value === "true";
        }
      } else if (currentSection === "exit" && result.exit) {
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
export function mergeWithDefaults(parsed: Partial<CtgPolicy>): CtgPolicy {
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
 * Parse suppression file content
 */
export function parseSuppressionFile(content: string): SuppressionFile {
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