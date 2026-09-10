/**
 * Policy YAML Parser
 * Parses YAML policy and suppression files
 */

import type { Severity } from "../types/artifacts.js";
import yaml from "js-yaml";
import { makeRe } from "minimatch";
import {
  POLICY_VERSION,
  DEFAULT_BLOCKING_SEVERITY,
  DEFAULT_BLOCKING_CATEGORY,
  DEFAULT_CONFIDENCE,
  createDefaultPolicy,
  DEFAULT_SUPPRESSION_CLASS,
  type CtgPolicy,
  type SuppressionFile,
  type SuppressionEntry,
  type SuppressionClass,
  type BlockingCategoryConfig,
  type PolicyDslConfig,
  type PolicyDslRule,
  type PolicyDslAction,
  type PolicyDslBaseline,
  type PolicyDslManualEvidence,
  type SeverityOverride,
} from "./policy-types.js";
import type { RuleOptionsConfig } from "../types/rule-options.js";

function splitYamlKeyValue(line: string): [string, string] | undefined {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex < 0) {
    return undefined;
  }

  return [
    line.slice(0, separatorIndex).trim(),
    line.slice(separatorIndex + 1).trim(),
  ];
}

function unquoteYamlScalar(value: string | undefined): string {
  return (value ?? "").replace(/^["']|["']$/g, "");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function scalarString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numericValue(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "number" ? value : Number.NaN;
}

function parseStrictNumber(value: string): number {
  const trimmed = value.trim().replace(/\s+#.*$/, "").trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    return Number.NaN;
  }
  return Number(trimmed);
}

function parseRuleOptions(content: string): RuleOptionsConfig | undefined {
  let parsed: unknown;
  try {
    parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
  } catch {
    return undefined;
  }

  const root = asRecord(parsed);
  const ruleOptions = asRecord(root?.rule_options ?? root?.ruleOptions);
  const largeModule = asRecord(ruleOptions?.LARGE_MODULE);
  if (!largeModule) {
    return undefined;
  }

  return {
    LARGE_MODULE: {
      maxLines: numericValue(largeModule.max_lines ?? largeModule.maxLines),
      maxFunctions: numericValue(largeModule.max_functions ?? largeModule.maxFunctions),
      maxSizeKB: numericValue(largeModule.max_size_kb ?? largeModule.maxSizeKB),
    },
  };
}

function parsePolicyDsl(content: string): PolicyDslConfig | undefined {
  let parsed: unknown;
  try {
    parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
  } catch {
    return undefined;
  }

  const root = asRecord(parsed);
  const dsl = asRecord(root?.dsl);
  const rules = dsl?.rules;
  if (!Array.isArray(rules)) {
    return undefined;
  }

  const parsedRules: PolicyDslRule[] = [];
  for (const rawRule of rules) {
    const rule = asRecord(rawRule);
    const when = asRecord(rule?.when);
    const id = scalarString(rule?.id);
    const action = scalarString(rule?.action) as PolicyDslAction | undefined;
    if (!rule || !when || !id || !action) {
      continue;
    }

    parsedRules.push({
      id,
      description: scalarString(rule.description),
      action,
      reason: scalarString(rule.reason),
      when: {
        severity: scalarString(when.severity) as PolicyDslRule["when"]["severity"],
        category: scalarString(when.category) as PolicyDslRule["when"]["category"],
        ruleId: scalarString(when.rule_id ?? when.ruleId),
        baseline: scalarString(when.baseline) as PolicyDslBaseline | undefined,
        manualEvidence: scalarString(when.manual_evidence ?? when.manualEvidence) as PolicyDslManualEvidence | undefined,
      },
    });
  }

  return { rules: parsedRules };
}

function parseSeverityOverrides(content: string): SeverityOverride[] | undefined {
  let parsed: unknown;
  try { parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA }); }
  catch (error) {
    // Keep legacy malformed policies permissive, but never ignore a malformed
    // document that advertises an override key (including quoted/flow keys).
    if (/(^|[,{\n])\s*["']?(severity_overrides|severityOverrides)["']?\s*:/m.test(content)) {
      throw new Error(`Invalid policy YAML: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    return undefined;
  }
  const root = asRecord(parsed);
  const hasSnake = root ? Object.prototype.hasOwnProperty.call(root, "severity_overrides") : false;
  const hasCamel = root ? Object.prototype.hasOwnProperty.call(root, "severityOverrides") : false;
  if (hasSnake && hasCamel) throw new Error("severity_overrides and severityOverrides cannot both be specified");
  if (!hasSnake && !hasCamel) return undefined;
  const raw = hasSnake ? root?.severity_overrides : root?.severityOverrides;
  if (!Array.isArray(raw)) throw new Error("severity_overrides must be an array");
  const validSeverities = ["critical", "high", "medium", "low"];
  const validCategories = ["auth", "payment", "validation", "data", "config", "maintainability", "testing", "compatibility", "release-risk", "security"];
  return raw.map((entry, index) => {
    const item = asRecord(entry);
    if (!item) throw new Error(`severity_overrides[${index}] must be an object`);
    const allowedKeys = new Set(["rule_id", "ruleId", "path", "category", "severity", "reason"]);
    for (const key of Object.keys(item)) if (!allowedKeys.has(key)) throw new Error(`severity_overrides[${index}] has unknown field: ${key}`);
    if (Object.prototype.hasOwnProperty.call(item, "rule_id") && Object.prototype.hasOwnProperty.call(item, "ruleId")) {
      throw new Error(`severity_overrides[${index}] cannot specify both rule_id and ruleId`);
    }
    const readRequiredString = (key: string, value: unknown): string | undefined => {
      if (value === undefined) return undefined;
      if (typeof value !== "string" || !value.trim()) throw new Error(`severity_overrides[${index}].${key} must be a non-empty string`);
      return value.trim();
    };
    const ruleId = readRequiredString("rule_id", Object.prototype.hasOwnProperty.call(item, "rule_id") ? item.rule_id : item.ruleId);
    const pathValue = readRequiredString("path", item.path);
    if (pathValue !== undefined && item.path !== pathValue) throw new Error(`severity_overrides[${index}].path must not have leading or trailing whitespace`);
    if (pathValue?.startsWith("!")) throw new Error(`severity_overrides[${index}].path must not be a negated glob`);
    if (pathValue && !makeRe(pathValue.replace(/\\/g, "/"))) throw new Error(`severity_overrides[${index}].path is invalid`);
    const path = pathValue?.replace(/\\/g, "/");
    const category = readRequiredString("category", item.category);
    const severity = readRequiredString("severity", item.severity);
    const reason = readRequiredString("reason", item.reason);
    if (!ruleId && !path && !category) throw new Error(`severity_overrides[${index}] requires at least one selector (rule_id, path, or category)`);
    if (!severity || !validSeverities.includes(severity)) throw new Error(`severity_overrides[${index}].severity is invalid`);
    if (!reason?.trim()) throw new Error(`severity_overrides[${index}].reason is required`);
    if (category && !validCategories.includes(category)) throw new Error(`severity_overrides[${index}].category is invalid`);
    return { ruleId, path, category: category as SeverityOverride["category"], severity: severity as SeverityOverride["severity"], reason };
  });
}

/**
 * Parse YAML policy file
 */
export function parseYamlPolicy(content: string): Partial<CtgPolicy> {
  const result: Partial<CtgPolicy> = {};
  const documentRoot = asRecord(yaml.load(content, { schema: yaml.JSON_SCHEMA }));
  const severityOverrides = parseSeverityOverrides(content);
  if (severityOverrides) result.severityOverrides = severityOverrides;
  const dsl = parsePolicyDsl(content);
  if (dsl) {
    result.dsl = dsl;
  }
  const ruleOptions = parseRuleOptions(content);
  if (ruleOptions) {
    result.ruleOptions = ruleOptions;
  }
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
      const pair = splitYamlKeyValue(trimmed);
      if (!pair) continue;
      const [key, rawValue] = pair;
      const value = unquoteYamlScalar(rawValue);
      currentSection = key;
      currentSubSection = null;

      if (key === "version") {
        const rootValue = documentRoot?.version;
        if (Object.prototype.hasOwnProperty.call(documentRoot ?? {}, key) && typeof rootValue !== "string") {
          throw new Error("version must be a string");
        }
        result.version = typeof rootValue === "string" ? rootValue : (value || POLICY_VERSION);
      } else if (key === "policy_id") {
        const rootValue = documentRoot?.policy_id;
        if (Object.prototype.hasOwnProperty.call(documentRoot ?? {}, key) && typeof rootValue !== "string") {
          throw new Error("policy_id must be a string");
        }
        result.policyId = typeof rootValue === "string" ? rootValue : (value || "");
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
        const categoryKey = key === "release-risk" ? "releaseRisk" : key;
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
          result.blocking.countThreshold.criticalMax = parseStrictNumber(value);
        } else if (key === "high_max") {
          result.blocking.countThreshold.highMax = parseStrictNumber(value);
        } else if (key === "medium_max") {
          result.blocking.countThreshold.mediumMax = parseStrictNumber(value);
        } else if (key === "low_max") {
          result.blocking.countThreshold.lowMax = parseStrictNumber(value);
        }
      } else if (currentSection === "confidence" && result.confidence) {
        if (key === "min_confidence") {
          result.confidence.minConfidence = parseStrictNumber(value);
        } else if (key === "low_confidence_threshold") {
          result.confidence.lowConfidenceThreshold = parseStrictNumber(value);
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
          result.llm.minConfidence = parseStrictNumber(value);
        } else if (key === "require_llm") {
          result.llm.requireLlm = value === "true";
        } else if (key === "unsupported_claims_max") {
          result.llm.unsupportedClaimsMax = parseInt(value, 10);
        }
      } else if (currentSection === "partial" && result.partial) {
        if (key === "allow_partial") {
          result.partial.allowPartial = value === "true";
        } else if (key === "partial_warning_threshold") {
          result.partial.partialWarningThreshold = parseStrictNumber(value);
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
      countThreshold: parsed.blocking?.countThreshold
        ? { ...parsed.blocking.countThreshold }
        : undefined,
    },
    confidence: { ...defaults.confidence, ...parsed.confidence },
    suppression: { ...defaults.suppression, ...parsed.suppression },
    llm: { ...defaults.llm, ...parsed.llm },
    partial: { ...defaults.partial, ...parsed.partial },
    baseline: { ...defaults.baseline, ...parsed.baseline },
    exit: { ...defaults.exit, ...parsed.exit },
    dsl: {
      rules: parsed.dsl?.rules ?? defaults.dsl?.rules ?? [],
    },
    ruleOptions: {
      LARGE_MODULE: {
        ...defaults.ruleOptions?.LARGE_MODULE,
        ...parsed.ruleOptions?.LARGE_MODULE,
      },
    },
    severityOverrides: parsed.severityOverrides,
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
          class: currentSuppression.class || DEFAULT_SUPPRESSION_CLASS,
        });
      }
      currentSuppression = {};

      // Handle case where first field is on same line as dash
      // e.g., "- rule_id: CLIENT_TRUSTED_PRICE"
      const afterDash = trimmed.substring(1).trim();
      const inlineField = splitYamlKeyValue(afterDash);
      if (inlineField) {
        const [key, value] = inlineField;
        if (key === "rule_id") {
          currentSuppression.ruleId = unquoteYamlScalar(value);
        } else if (key === "path") {
          currentSuppression.path = unquoteYamlScalar(value);
        }
      }
      continue;
    }

    if (trimmed.includes(":") && currentSuppression) {
      const field = splitYamlKeyValue(trimmed);
      if (!field) {
        continue;
      }
      const [key, value] = field;

      if (key === "rule_id") {
        currentSuppression.ruleId = unquoteYamlScalar(value);
      } else if (key === "path") {
        currentSuppression.path = unquoteYamlScalar(value);
      } else if (key === "reason") {
        currentSuppression.reason = unquoteYamlScalar(value);
      } else if (key === "expiry") {
        currentSuppression.expiry = unquoteYamlScalar(value);
      } else if (key === "author") {
        currentSuppression.author = unquoteYamlScalar(value);
      } else if (key === "class") {
        // Parse class field, validate against allowed values
        const classValue = unquoteYamlScalar(value) as SuppressionClass;
        const validClasses: SuppressionClass[] = [
          "self-reference",
          "fixture-intentional",
          "generated-artifact",
          "accepted-design",
          "temporary-debt",
        ];
        if (validClasses.includes(classValue)) {
          currentSuppression.class = classValue;
        } else {
          // Invalid class defaults to temporary-debt
          currentSuppression.class = DEFAULT_SUPPRESSION_CLASS;
        }
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
      class: currentSuppression.class || DEFAULT_SUPPRESSION_CLASS,
    });
  }

  return result;
}
