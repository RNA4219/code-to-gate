/**
 * Suppression Matcher - matches findings to suppressions
 * Based on docs/product-spec-v1.md Section 12.2-12.4
 */

import { minimatch } from "minimatch";
import { toPosix } from "../core/path-utils.js";
import { Suppression, SuppressionFile } from "./suppression-loader.js";
import { Finding } from "../types/artifacts.js";

/**
 * Suppression status types
 */
export type SuppressionStatus =
  | "active"      // Suppression applies, not expired
  | "expired"     // Suppression exists but expiry date passed
  | "expiring"    // Suppression exists, expiry approaching (within warning window)
  | "not_matched" // No matching suppression found;

/**
 * Result of suppression matching
 */
export interface SuppressionMatchResult {
  status: SuppressionStatus;
  suppression?: Suppression;
  matchedPath?: string; // The actual file path that matched
  expiryWarningDays?: number; // Days until expiry (if expiring)
}

/**
 * Default expiry warning window in days
 * Based on spec Section 5.2: expiry_warning_days: 30
 */
export const DEFAULT_EXPIRY_WARNING_DAYS = 30;

/**
 * Check if a date string has expired
 * @param expiryDate - ISO date string (YYYY-MM-DD)
 * @param currentDate - Current date (defaults to now)
 * @returns True if expired
 */
export function isExpired(
  expiryDate: string | undefined,
  currentDate: Date = new Date()
): boolean {
  if (!expiryDate) return false;

  const expiry = new Date(expiryDate);
  return currentDate > expiry;
}

/**
 * Check if a date is approaching expiry
 * @param expiryDate - ISO date string (YYYY-MM-DD)
 * @param warningDays - Number of days before expiry to start warning
 * @param currentDate - Current date (defaults to now)
 * @returns Object with expiring status and days remaining
 */
export function isApproachingExpiry(
  expiryDate: string | undefined,
  warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS,
  currentDate: Date = new Date()
): { expiring: boolean; daysRemaining?: number } {
  if (!expiryDate) return { expiring: false };

  const expiry = new Date(expiryDate);
  const warningThreshold = new Date(currentDate);
  warningThreshold.setDate(warningThreshold.getDate() + warningDays);

  if (expiry <= warningThreshold && expiry > currentDate) {
    const daysRemaining = Math.ceil(
      (expiry.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    return { expiring: true, daysRemaining };
  }

  return { expiring: false };
}

/**
 * Match a finding against suppressions
 * Based on spec Section 12.2: rule_id matches AND path matches (glob pattern)
 * @param finding - The finding to check
 * @param suppressions - List of suppressions to match against
 * @param warningDays - Expiry warning window in days
 * @returns Suppression match result
 */
export function matchSuppression(
  finding: Finding,
  suppressions: Suppression[],
  warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS
): SuppressionMatchResult {
  // Get the primary evidence path (first evidence with a path)
  const findingPath = finding.evidence[0]?.path;

  if (!findingPath) {
    return { status: "not_matched" };
  }

  // Normalize path for matching
  const normalizedFindingPath = toPosix(findingPath);
  const currentDate = new Date();

  for (const suppression of suppressions) {
    // Check rule_id match
    if (suppression.rule_id !== finding.ruleId) {
      continue;
    }

    // Check path match (glob pattern)
    const normalizedSuppressionPath = toPosix(suppression.path);
    const matches = minimatch(normalizedFindingPath, normalizedSuppressionPath);

    if (!matches) {
      continue;
    }

    // Found matching suppression - check expiry
    if (isExpired(suppression.expiry, currentDate)) {
      return {
        status: "expired",
        suppression,
        matchedPath: findingPath,
      };
    }

    const expiryCheck = isApproachingExpiry(suppression.expiry, warningDays, currentDate);
    if (expiryCheck.expiring) {
      return {
        status: "expiring",
        suppression,
        matchedPath: findingPath,
        expiryWarningDays: expiryCheck.daysRemaining,
      };
    }

    return {
      status: "active",
      suppression,
      matchedPath: findingPath,
    };
  }

  return { status: "not_matched" };
}

/**
 * Check if a finding is suppressed (active suppression only)
 * @param finding - The finding to check
 * @param suppressions - List of suppressions
 * @returns True if finding has an active suppression
 */
export function isSuppressed(
  finding: Finding,
  suppressions: Suppression[]
): boolean {
  const result = matchSuppression(finding, suppressions);
  return result.status === "active";
}

/**
 * Filter findings by suppression status
 * @param findings - List of findings to filter
 * @param suppressionFile - Suppression file object
 * @param warningDays - Expiry warning window
 * @returns Filtered findings (excluding actively suppressed)
 */
export function filterSuppressedFindings(
  findings: Finding[],
  suppressionFile: SuppressionFile | undefined,
  warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS
): {
  activeFindings: Finding[];
  suppressedFindings: Finding[];
  expiredSuppressions: SuppressionMatchResult[];
  expiringWarnings: SuppressionMatchResult[];
} {
  if (!suppressionFile || suppressionFile.suppressions.length === 0) {
    return {
      activeFindings: findings,
      suppressedFindings: [],
      expiredSuppressions: [],
      expiringWarnings: [],
    };
  }

  const suppressions = suppressionFile.suppressions;
  const activeFindings: Finding[] = [];
  const suppressedFindings: Finding[] = [];
  const expiredSuppressions: SuppressionMatchResult[] = [];
  const expiringWarnings: SuppressionMatchResult[] = [];

  for (const finding of findings) {
    const result = matchSuppression(finding, suppressions, warningDays);

    switch (result.status) {
      case "active":
        suppressedFindings.push(finding);
        break;
      case "expired":
        // Expired suppressions still show the finding
        activeFindings.push(finding);
        expiredSuppressions.push(result);
        break;
      case "expiring":
        // Expiring suppressions still suppress but record warning
        suppressedFindings.push(finding);
        expiringWarnings.push(result);
        break;
      case "not_matched":
        activeFindings.push(finding);
        break;
    }
  }

  return {
    activeFindings,
    suppressedFindings,
    expiredSuppressions,
    expiringWarnings,
  };
}

/**
 * Build audit suppression records
 * @param suppressedFindings - List of suppressed findings
 * @param suppressions - List of suppressions
 * @returns Audit suppression records
 */
export function buildSuppressionAuditRecords(
  suppressedFindings: Finding[],
  suppressions: Suppression[]
): Array<{
  finding_id: string;
  rule_id: string;
  path: string;
  suppression_reason: string;
  suppression_expiry?: string;
  suppression_author?: string;
}> {
  const records: Array<{
    finding_id: string;
    rule_id: string;
    path: string;
    suppression_reason: string;
    suppression_expiry?: string;
    suppression_author?: string;
  }> = [];

  for (const finding of suppressedFindings) {
    const result = matchSuppression(finding, suppressions);
    if (result.suppression) {
      records.push({
        finding_id: finding.id,
        rule_id: finding.ruleId,
        path: result.matchedPath ?? finding.evidence[0]?.path ?? "",
        suppression_reason: result.suppression.reason,
        suppression_expiry: result.suppression.expiry,
        suppression_author: result.suppression.author,
      });
    }
  }

  return records;
}