/**
 * Policy YAML Parser
 * Parses YAML policy and suppression files
 */

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
  type SuppressionClass,
  type PolicyDslConfig,
  type PolicyDslRule,
  type PolicyDslAction,
  type PolicyDslBaseline,
  type PolicyDslManualEvidence,
  type SeverityOverride,
} from "./policy-types.js";
import type { RuleOptionsConfig } from "../types/rule-options.js";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function legacyRootSuppressionDocument(content: string): string | undefined {
  const lines = content.split(/\r?\n/);
  const listIndex = lines.findIndex((line) => /^-\s*/.test(line));
  if (listIndex < 0 || !lines.slice(0, listIndex).some((line) => /^\s*version\s*:/.test(line))) {
    return undefined;
  }

  return [
    ...lines.slice(0, listIndex),
    "suppressions:",
    ...lines.slice(listIndex).map((line) => line.trim() ? `  ${line}` : line),
  ].join("\n");
}

function loadSuppressionYaml(content: string): unknown {
  try {
    return yaml.load(content, { schema: yaml.JSON_SCHEMA });
  } catch (error) {
    const legacyContent = legacyRootSuppressionDocument(content);
    if (legacyContent === undefined) {
      throw error;
    }
    try {
      return yaml.load(legacyContent, { schema: yaml.JSON_SCHEMA });
    } catch {
      throw error;
    }
  }
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

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number`);
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function fraction(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number`);
  }
  if (value < 0 || value > 1) {
    throw new Error(`${label} must be between 0 and 1`);
  }
  return value;
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

function parsePartialSection(root: Record<string, unknown> | undefined): CtgPolicy["partial"] | undefined {
  if (!root || !Object.prototype.hasOwnProperty.call(root, "partial")) return undefined;
  const raw = asRecord(root.partial);
  if (!raw) throw new Error("partial must be an object");

  const partial: NonNullable<CtgPolicy["partial"]> = {};
  if (Object.prototype.hasOwnProperty.call(raw, "allow_partial")) {
    if (typeof raw.allow_partial !== "boolean") throw new Error("partial.allow_partial must be a boolean");
    partial.allowPartial = raw.allow_partial;
  }
  if (Object.prototype.hasOwnProperty.call(raw, "partial_warning_threshold")) {
    if (typeof raw.partial_warning_threshold !== "number" || !Number.isFinite(raw.partial_warning_threshold)) {
      throw new Error("partial_warning_threshold must be a number");
    }
    partial.partialWarningThreshold = fraction(raw.partial_warning_threshold, "partial.partial_warning_threshold");
  }
  return partial;
}

/**
 * Parse YAML policy file
 */
export function parseYamlPolicy(content: string): Partial<CtgPolicy> {
  const parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
  if (parsed === null || (parsed !== undefined && !asRecord(parsed))) {
    throw new Error("policy root must be an object");
  }
  const documentRoot = asRecord(parsed) ?? {};
  const result: Partial<CtgPolicy> = {};

  const has = (object: Record<string, unknown>, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(object, key);
  const section = (object: Record<string, unknown>, key: string): Record<string, unknown> | undefined => {
    if (!has(object, key)) return undefined;
    const value = asRecord(object[key]);
    if (!value) throw new Error(`${key} must be an object`);
    return value;
  };
  const stringValue = (object: Record<string, unknown>, key: string, label: string): string | undefined => {
    if (!has(object, key)) return undefined;
    if (typeof object[key] !== "string") throw new Error(`${label} must be a string`);
    if (!(object[key] as string).trim()) throw new Error(`${label} must not be empty`);
    return object[key] as string;
  };
  const booleanValue = (object: Record<string, unknown>, key: string, label: string): boolean | undefined => {
    if (!has(object, key)) return undefined;
    if (typeof object[key] !== "boolean") throw new Error(`${label} must be a boolean`);
    return object[key] as boolean;
  };
  const fractionValue = (object: Record<string, unknown>, key: string, label: string): number | undefined => {
    if (!has(object, key)) return undefined;
    return fraction(object[key], label);
  };
  const nonNegativeIntegerValue = (object: Record<string, unknown>, key: string, label: string): number | undefined => {
    if (!has(object, key)) return undefined;
    return nonNegativeInteger(object[key], label);
  };

  result.version = stringValue(documentRoot, "version", "version");
  result.policyId = stringValue(documentRoot, "policy_id", "policy_id");

  const blocking = section(documentRoot, "blocking");
  if (blocking) {
    const parsedBlocking: CtgPolicy["blocking"] = {
      severity: { ...DEFAULT_BLOCKING_SEVERITY },
      category: { ...DEFAULT_BLOCKING_CATEGORY },
      rules: {},
    };
    const severity = section(blocking, "severity");
    if (severity) for (const key of ["critical", "high", "medium", "low"] as const) {
      const value = booleanValue(severity, key, `blocking.severity.${key}`);
      if (value !== undefined) parsedBlocking.severity[key] = value;
    }
    const category = section(blocking, "category");
    if (category) for (const [yamlKey, property] of [
      ["auth", "auth"], ["payment", "payment"], ["validation", "validation"], ["data", "data"],
      ["config", "config"], ["maintainability", "maintainability"], ["testing", "testing"],
      ["compatibility", "compatibility"], ["release-risk", "releaseRisk"], ["releaseRisk", "releaseRisk"], ["security", "security"],
    ] as const) {
      const value = booleanValue(category, yamlKey, `blocking.category.${yamlKey}`);
      if (value !== undefined) parsedBlocking.category[property] = value;
    }
    if (has(blocking, "rules")) {
      const rules = section(blocking, "rules");
      if (rules) for (const [key, raw] of Object.entries(rules)) {
        if (typeof raw !== "boolean") throw new Error(`blocking.rules.${key} must be a boolean`);
        if (parsedBlocking.rules) parsedBlocking.rules[key] = raw;
      }
    }
    const countThreshold = section(blocking, "count_threshold");
    if (countThreshold) {
      parsedBlocking.countThreshold = {};
      for (const [yamlKey, property] of [
        ["critical_max", "criticalMax"], ["high_max", "highMax"], ["medium_max", "mediumMax"], ["low_max", "lowMax"],
      ] as const) {
        const value = nonNegativeIntegerValue(countThreshold, yamlKey, `blocking count threshold ${yamlKey}`);
        if (value !== undefined) parsedBlocking.countThreshold[property] = value;
      }
    }
    result.blocking = parsedBlocking;
  }

  const confidence = section(documentRoot, "confidence");
  if (confidence) {
    result.confidence = { ...DEFAULT_CONFIDENCE };
    const min = fractionValue(confidence, "min_confidence", "confidence.min_confidence");
    const low = fractionValue(confidence, "low_confidence_threshold", "confidence.low_confidence_threshold");
    const filter = booleanValue(confidence, "filter_low", "confidence.filter_low");
    if (min !== undefined) result.confidence.minConfidence = min;
    if (low !== undefined) result.confidence.lowConfidenceThreshold = low;
    if (filter !== undefined) result.confidence.filterLow = filter;
  }

  const suppression = section(documentRoot, "suppression");
  if (suppression) {
    result.suppression = {};
    const file = stringValue(suppression, "file", "suppression.file");
    const expiry = nonNegativeIntegerValue(suppression, "expiry_warning_days", "suppression.expiry_warning_days");
    const max = nonNegativeIntegerValue(suppression, "max_suppressions_per_rule", "suppression.max_suppressions_per_rule");
    if (file !== undefined) result.suppression.file = file;
    if (expiry !== undefined) result.suppression.expiryWarningDays = expiry;
    if (max !== undefined) result.suppression.maxSuppressionsPerRule = max;
  }

  const llm = section(documentRoot, "llm");
  if (llm) {
    result.llm = {};
    const enabled = booleanValue(llm, "enabled", "llm.enabled");
    const mode = stringValue(llm, "mode", "llm.mode");
    const min = fractionValue(llm, "min_confidence", "llm.min_confidence");
    const requireLlm = booleanValue(llm, "require_llm", "llm.require_llm");
    const unsupported = nonNegativeIntegerValue(llm, "unsupported_claims_max", "llm.unsupported_claims_max");
    if (enabled !== undefined) result.llm.enabled = enabled;
    if (mode !== undefined) {
      if (!["remote", "local-only", "none"].includes(mode)) throw new Error(`llm.mode is invalid: ${mode}`);
      result.llm.mode = mode as "remote" | "local-only" | "none";
    }
    if (min !== undefined) result.llm.minConfidence = min;
    if (requireLlm !== undefined) result.llm.requireLlm = requireLlm;
    if (unsupported !== undefined) result.llm.unsupportedClaimsMax = unsupported;
  }

  const partial = parsePartialSection(documentRoot);
  if (partial) result.partial = partial;
  const baseline = section(documentRoot, "baseline");
  if (baseline) {
    result.baseline = {};
    const enabled = booleanValue(baseline, "enabled", "baseline.enabled");
    const file = stringValue(baseline, "file", "baseline.file");
    const newBlock = booleanValue(baseline, "new_findings_block", "baseline.new_findings_block");
    if (enabled !== undefined) result.baseline.enabled = enabled;
    if (file !== undefined) result.baseline.file = file;
    if (newBlock !== undefined) result.baseline.newFindingsBlock = newBlock;
  }
  const exit = section(documentRoot, "exit");
  if (exit) {
    result.exit = {};
    const critical = booleanValue(exit, "fail_on_critical", "exit.fail_on_critical");
    const high = booleanValue(exit, "fail_on_high", "exit.fail_on_high");
    const warnOnly = booleanValue(exit, "warn_only", "exit.warn_only");
    if (critical !== undefined) result.exit.failOnCritical = critical;
    if (high !== undefined) result.exit.failOnHigh = high;
    if (warnOnly !== undefined) result.exit.warnOnly = warnOnly;
  }

  const severityOverrides = parseSeverityOverrides(content);
  if (severityOverrides) result.severityOverrides = severityOverrides;
  const dsl = parsePolicyDsl(content);
  if (dsl) result.dsl = dsl;
  const ruleOptions = parseRuleOptions(content);
  if (ruleOptions) result.ruleOptions = ruleOptions;
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

  let parsed: unknown;
  try {
    parsed = loadSuppressionYaml(content);
  } catch (error) {
    throw new Error(
      `Invalid suppression YAML: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  // A bare root list was accepted by the old line parser as an omitted
  // suppressions section. Keep that compatibility while valid files use an
  // object root with an array-valued suppressions field.
  if (Array.isArray(parsed)) {
    return result;
  }
  if (parsed === null || (parsed !== undefined && !asRecord(parsed))) {
    throw new Error("suppression root must be an object");
  }

  const root = asRecord(parsed) ?? {};
  const version = root.version;
  if (version !== undefined && typeof version !== "string") {
    throw new Error("suppression.version must be a string");
  }
  if (typeof version === "string" && version.trim()) {
    result.version = version;
  }

  const rawSuppressions = root.suppressions;
  if (rawSuppressions === undefined || rawSuppressions === null) {
    return result;
  }
  if (!Array.isArray(rawSuppressions)) {
    throw new Error("suppressions must be an array");
  }

  const validClasses: SuppressionClass[] = [
    "self-reference",
    "fixture-intentional",
    "generated-artifact",
    "accepted-design",
    "temporary-debt",
  ];
  const readOptionalString = (entry: Record<string, unknown>, key: string, index: number): string | undefined => {
    const value = entry[key];
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value !== "string") {
      throw new Error(`suppressions[${index}].${key} must be a string`);
    }
    return value;
  };

  for (const [index, rawEntry] of rawSuppressions.entries()) {
    // Keep the legacy behavior that incomplete/null list items are ignored.
    const entry = asRecord(rawEntry);
    if (!entry) {
      continue;
    }

    const ruleId = readOptionalString(entry, "rule_id", index);
    const pathValue = readOptionalString(entry, "path", index);
    if (!ruleId || !pathValue) {
      continue;
    }

    const reason = readOptionalString(entry, "reason", index) ?? "";
    const expiry = readOptionalString(entry, "expiry", index);
    const author = readOptionalString(entry, "author", index);
    const classValue = readOptionalString(entry, "class", index) as SuppressionClass | undefined;

    result.suppressions.push({
      ruleId,
      path: pathValue,
      reason,
      expiry,
      author,
      class: classValue && validClasses.includes(classValue)
        ? classValue
        : DEFAULT_SUPPRESSION_CLASS,
    });
  }

  return result;
}
