import { minimatch } from "minimatch";

import type { Finding, Severity } from "../types/artifacts.js";
import type { CtgPolicy, SeverityOverride } from "./policy-types.js";

export interface SeverityResolution {
  policyId: string;
  originalSeverity: Severity;
  severity: Severity;
  reason: string;
  matchedSelectors: { ruleId?: string; path?: string; category?: Finding["category"] };
}

function matches(finding: Finding, override: SeverityOverride): boolean {
  if (override.ruleId && finding.ruleId !== override.ruleId) return false;
  if (override.category && finding.category !== override.category) return false;
  if (override.path) {
    const pattern = override.path.replace(/\\/g, "/");
    const paths = finding.evidence.map((evidence) => evidence.path.replace(/\\/g, "/"));
    if (!paths.some((path) => minimatch(path, pattern))) return false;
  }
  return true;
}

/** Apply the first matching override, always deriving from the original severity. */
export function resolveSeverity(finding: Finding, policy: CtgPolicy): Finding {
  const originalSeverity = finding.originalSeverity ?? finding.severity;
  const override = (policy.severityOverrides ?? []).find((candidate) => matches(finding, candidate));
  if (!override) {
    if (finding.originalSeverity === undefined && finding.severityResolution === undefined) return finding;
    const copy = { ...finding, severity: originalSeverity, originalSeverity: undefined, severityResolution: undefined };
    delete copy.originalSeverity;
    delete copy.severityResolution;
    return copy;
  }
  const resolution: SeverityResolution = {
    policyId: policy.policyId,
    originalSeverity,
    severity: override.severity,
    reason: override.reason,
    matchedSelectors: {
      ...(override.ruleId ? { ruleId: override.ruleId } : {}),
      ...(override.path ? { path: override.path } : {}),
      ...(override.category ? { category: override.category } : {}),
    },
  };
  return { ...finding, originalSeverity, severity: override.severity, severityResolution: resolution };
}

export function resolveSeverities(findings: Finding[], policy: CtgPolicy): Finding[] {
  return findings.map((finding) => resolveSeverity(finding, policy));
}
