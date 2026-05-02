/**
 * Finding Viewer Utility Functions
 * Helper functions for finding filtering, sorting, and counting
 */

import { Finding, Severity, FindingCategory } from "../types/artifacts.js";

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Get severity color for styling
 */
export function getSeverityColor(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "#dc3545";
    case "high":
      return "#fd7e14";
    case "medium":
      return "#ffc107";
    case "low":
      return "#17a2b8";
    default:
      return "#6c757d";
  }
}

/**
 * Get severity order for sorting
 */
export function getSeverityOrder(severity: Severity): number {
  switch (severity) {
    case "critical":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    case "low":
      return 3;
    default:
      return 4;
  }
}

/**
 * Sort findings by severity
 */
export function sortFindingsBySeverity(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => getSeverityOrder(a.severity) - getSeverityOrder(b.severity));
}

/**
 * Filter findings by severity
 */
export function filterFindingsBySeverity(
  findings: Finding[],
  severity: Severity | "all"
): Finding[] {
  if (severity === "all") return findings;
  return findings.filter((f) => f.severity === severity);
}

/**
 * Filter findings by category
 */
export function filterFindingsByCategory(
  findings: Finding[],
  category: FindingCategory | "all"
): Finding[] {
  if (category === "all") return findings;
  return findings.filter((f) => f.category === category);
}

/**
 * Search findings by text
 */
export function searchFindings(
  findings: Finding[],
  query: string
): Finding[] {
  if (!query.trim()) return findings;

  const lowerQuery = query.toLowerCase();
  return findings.filter(
    (f) =>
      f.title.toLowerCase().includes(lowerQuery) ||
      f.summary.toLowerCase().includes(lowerQuery) ||
      f.ruleId.toLowerCase().includes(lowerQuery) ||
      f.id.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get unique categories from findings
 */
export function getUniqueCategories(findings: Finding[]): FindingCategory[] {
  const categories = new Set<FindingCategory>();
  for (const finding of findings) {
    categories.add(finding.category);
  }
  return Array.from(categories);
}

/**
 * Count findings by severity
 */
export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const finding of findings) {
    counts[finding.severity]++;
  }
  return counts;
}

/**
 * Count findings by category
 */
export function countByCategory(
  findings: Finding[]
): Record<FindingCategory, number> {
  const counts: Record<string, number> = {};
  for (const finding of findings) {
    counts[finding.category] = (counts[finding.category] || 0) + 1;
  }
  return counts;
}