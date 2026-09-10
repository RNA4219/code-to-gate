import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import type { FindingsArtifact, Finding } from "../types/artifacts.js";
import {
  evaluatePolicy,
  type PolicyEvaluationResult,
} from "../config/policy-evaluator.js";
import {
  mergeWithDefaults,
  parseYamlPolicy,
} from "../config/policy-yaml-parser.js";
import { validatePolicy } from "../config/policy-loader.js";
import type { CtgPolicy } from "../config/policy-types.js";
import { resolveSeverities } from "../config/severity-resolver.js";
import {
  generateRawFindingsArtifact,
  type RawFindingsArtifact,
} from "../reporters/raw-findings-reporter.js";

const SUPPORTED_KEYS = new Set([
  "version", "policy_id", "blocking", "confidence", "partial", "dsl",
  "severity_overrides", "severityOverrides",
]);

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function unsupportedDslContext(root: Record<string, unknown>): string[] {
  const dsl = record(root.dsl);
  const rules = Array.isArray(dsl?.rules) ? dsl.rules : [];
  const errors: string[] = [];
  rules.forEach((rawRule, index) => {
    const when = record(record(rawRule)?.when);
    for (const key of ["baseline", "manual_evidence", "manualEvidence"]) {
      if (when && Object.prototype.hasOwnProperty.call(when, key)) {
        errors.push(`dsl.rules[${index}].when.${key} is unsupported by diff`);
      }
    }
  });
  return errors;
}

function validateObject(
  value: unknown,
  label: string,
  allowed: Set<string>,
  errors: string[],
): Record<string, unknown> | undefined {
  const object = record(value);
  if (!object) { errors.push(`${label} must be an object`); return undefined; }
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) errors.push(`${label}.${key} is unsupported by diff`);
  }
  return object;
}

function validateDiffPolicyShape(root: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const key of ["version", "policy_id"]) {
    if (root[key] !== undefined && typeof root[key] !== "string") errors.push(`${key} must be a string`);
  }
  const blocking = root.blocking === undefined ? undefined : validateObject(root.blocking, "blocking", new Set(["severity", "category", "rules", "count_threshold"]), errors);
  if (blocking) {
    for (const [section, keys, kind] of [
      ["severity", new Set(["critical", "high", "medium", "low"]), "boolean"],
      ["category", new Set(["auth", "payment", "validation", "data", "config", "maintainability", "testing", "compatibility", "release-risk", "releaseRisk", "security"]), "boolean"],
      ["count_threshold", new Set(["critical_max", "high_max", "medium_max", "low_max"]), "number"],
    ] as const) {
      if (blocking[section] === undefined) continue;
      const sectionValue = validateObject(blocking[section], `blocking.${section}`, keys, errors);
      if (!sectionValue) continue;
      for (const [key, value] of Object.entries(sectionValue)) {
        if (kind === "boolean" && typeof value !== "boolean") errors.push(`blocking.${section}.${key} must be boolean`);
      if (kind === "number" && (typeof value !== "number" || !Number.isInteger(value) || value < 0)) errors.push(`blocking.${section}.${key} must be a non-negative integer`);
      }
    }
    const rules = record(blocking.rules);
    if (blocking.rules !== undefined && !rules) errors.push("blocking.rules must be an object");
    if (rules) for (const [key, value] of Object.entries(rules)) if (typeof value !== "boolean") errors.push(`blocking.rules.${key} must be boolean`);
  }
  const confidence = root.confidence === undefined ? undefined : validateObject(root.confidence, "confidence", new Set(["min_confidence", "low_confidence_threshold", "filter_low"]), errors);
  if (confidence) {
    for (const key of ["min_confidence", "low_confidence_threshold"]) if (confidence[key] !== undefined && (typeof confidence[key] !== "number" || !Number.isFinite(confidence[key] as number))) errors.push(`confidence.${key} must be a number`);
    if (confidence.filter_low !== undefined && typeof confidence.filter_low !== "boolean") errors.push("confidence.filter_low must be boolean");
  }
  const partial = root.partial === undefined ? undefined : validateObject(root.partial, "partial", new Set(["allow_partial", "partial_warning_threshold"]), errors);
  if (partial) {
    if (partial.allow_partial !== undefined && typeof partial.allow_partial !== "boolean") errors.push("partial.allow_partial must be boolean");
    if (partial.partial_warning_threshold !== undefined && (typeof partial.partial_warning_threshold !== "number" || !Number.isFinite(partial.partial_warning_threshold as number))) errors.push("partial.partial_warning_threshold must be a number");
  }
  const dsl = root.dsl === undefined ? undefined : validateObject(root.dsl, "dsl", new Set(["rules"]), errors);
  if (dsl && !Array.isArray(dsl.rules)) errors.push("dsl.rules must be an array");
  if (dsl && Array.isArray(dsl.rules)) dsl.rules.forEach((rawRule, index) => {
    const rule = validateObject(rawRule, `dsl.rules[${index}]`, new Set(["id", "description", "when", "action", "reason"]), errors);
    if (!rule) return;
    if (typeof rule.id !== "string" || !rule.id.trim()) errors.push(`dsl.rules[${index}].id must be a non-empty string`);
    if (!["block", "hold", "allow"].includes(String(rule.action))) errors.push(`dsl.rules[${index}].action is invalid`);
    const when = validateObject(rule.when, `dsl.rules[${index}].when`, new Set(["severity", "category", "rule_id", "ruleId", "baseline", "manual_evidence", "manualEvidence"]), errors);
    if (when) for (const key of ["baseline", "manual_evidence", "manualEvidence"]) if (when[key] !== undefined) errors.push(`dsl.rules[${index}].when.${key} is unsupported by diff`);
  });
  return errors;
}

/** Load only the policy surface that diff can evaluate, fail-closed. */
export function loadDiffPolicy(policyPath: string, cwd: string): {
  policy?: CtgPolicy;
  source: string;
  errors: string[];
} {
  const source = path.resolve(cwd, policyPath);
  if (!existsSync(source)) return { source, errors: [`Policy file not found: ${policyPath}`] };

  try {
    const content = readFileSync(source, "utf8");
    const root = record(yaml.load(content, { schema: yaml.JSON_SCHEMA }));
    if (!root) return { source, errors: ["Policy document must be an object"] };
    const errors = Object.keys(root)
      .filter((key) => !SUPPORTED_KEYS.has(key))
      .map((key) => `Policy field '${key}' is unsupported by diff`)
      .concat(unsupportedDslContext(root), validateDiffPolicyShape(root));
    if (errors.length > 0) return { source, errors };
    const canonicalContent = yaml.dump(root, { noRefs: true, lineWidth: -1 });
    const parsed = parseYamlPolicy(canonicalContent);
    if (typeof root.version === "string") parsed.version = root.version;
    if (typeof root.policy_id === "string") parsed.policyId = root.policy_id;
    const blocking = record(root.blocking);
    if (blocking) {
      const category = record(blocking.category);
      if (category) parsed.blocking = {
        ...(parsed.blocking ?? { severity: {}, category: {} }),
        category: {
          ...(parsed.blocking?.category ?? {}),
          ...Object.fromEntries(Object.entries(category).map(([key, value]) => [key === "release-risk" ? "releaseRisk" : key, value as boolean])),
        },
      };
      const rules = record(blocking.rules);
      const count = record(blocking.count_threshold);
      const boolRules = rules
        ? Object.fromEntries(Object.entries(rules).map(([key, value]) => [key, value as boolean]))
        : undefined;
      const numberValue = (value: unknown): number | undefined => typeof value === "number" ? value : undefined;
      if (boolRules) parsed.blocking = { ...(parsed.blocking ?? { severity: {}, category: {} }), rules: boolRules };
      if (count) parsed.blocking = {
        ...(parsed.blocking ?? { severity: {}, category: {} }),
        countThreshold: {
          ...(parsed.blocking?.countThreshold ?? {}),
          ...(numberValue(count.critical_max) !== undefined ? { criticalMax: numberValue(count.critical_max) } : {}),
          ...(numberValue(count.high_max) !== undefined ? { highMax: numberValue(count.high_max) } : {}),
          ...(numberValue(count.medium_max) !== undefined ? { mediumMax: numberValue(count.medium_max) } : {}),
          ...(numberValue(count.low_max) !== undefined ? { lowMax: numberValue(count.low_max) } : {}),
        },
      };
    }
    const policy = mergeWithDefaults(parsed);
    errors.push(...validatePolicy(policy).errors);
    return errors.length > 0 ? { source, policy, errors } : { source, policy, errors: [] };
  } catch (error) {
    return { source, errors: [`Invalid policy: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

export interface DiffPolicyEvaluation {
  rawFindings: RawFindingsArtifact;
  effectiveFindings: FindingsArtifact;
  evaluation: PolicyEvaluationResult;
}

export function evaluateDiffFindings(
  findings: FindingsArtifact,
  policy: CtgPolicy,
  repoRoot: string,
  runId: string,
  toolVersion: string
): DiffPolicyEvaluation {
  const rawSnapshot: FindingsArtifact = { ...findings, findings: [...findings.findings] };
  const rawFindings = generateRawFindingsArtifact(rawSnapshot, repoRoot, runId, toolVersion, policy.policyId);
  rawFindings.completeness = rawSnapshot.completeness;
  const effectiveFindings: FindingsArtifact = {
    ...rawSnapshot,
    findings: resolveSeverities(rawSnapshot.findings, policy),
  };
  const evaluation = evaluatePolicy(effectiveFindings.findings, policy, [], {
    completeness: effectiveFindings.completeness,
  });
  return { rawFindings, effectiveFindings, evaluation };
}

export function countSeverities(findings: Finding[]): Record<"critical" | "high" | "medium" | "low", number> {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) counts[finding.severity]++;
  return counts;
}
