import type { Finding } from "../types/artifacts.js";
import {
  DEFAULT_SUPPRESSION_CLASS,
  isSuppressed,
  type SuppressionClass,
  type SuppressionEntry,
} from "../config/policy-loader.js";

export interface ClassifiedSuppressedFinding {
  finding: Finding;
  path: string;
  suppression: SuppressionEntry;
  class: SuppressionClass;
}

export function classifySuppressedFindings(
  suppressions: SuppressionEntry[],
  findings: Finding[]
): ClassifiedSuppressedFinding[] {
  const classified: ClassifiedSuppressedFinding[] = [];

  for (const finding of findings) {
    const path = finding.evidence[0]?.path ?? "";
    const match = suppressions.find((suppression) => {
      if (suppression.ruleId !== finding.ruleId) {
        return false;
      }

      return isSuppressed(finding.ruleId, path, [suppression]).suppressed;
    });

    if (!match) {
      continue;
    }

    classified.push({
      finding,
      path,
      suppression: match,
      class: match.class ?? DEFAULT_SUPPRESSION_CLASS,
    });
  }

  return classified;
}

export function countSuppressedByClass(
  suppressions: SuppressionEntry[],
  findings: Finding[]
): Record<SuppressionClass, number> {
  const counts: Record<SuppressionClass, number> = {
    "self-reference": 0,
    "fixture-intentional": 0,
    "generated-artifact": 0,
    "accepted-design": 0,
    "temporary-debt": 0,
  };

  for (const item of classifySuppressedFindings(suppressions, findings)) {
    counts[item.class]++;
  }

  return counts;
}
