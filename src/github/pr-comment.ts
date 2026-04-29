/**
 * PR Comment Generator for code-to-gate
 *
 * Generates markdown summary for GitHub PR comments.
 */

import type {
  FindingsArtifact,
  RiskRegisterArtifact,
  TestSeedsArtifact,
  ReleaseReadinessArtifact,
  Finding,
  Severity,
} from "../types/artifacts.js";

/**
 * PR comment generation options
 */
export interface PrCommentOptions {
  /** Findings artifact */
  findings: FindingsArtifact;
  /** Risk register artifact */
  riskRegister?: RiskRegisterArtifact;
  /** Test seeds artifact */
  testSeeds?: TestSeedsArtifact;
  /** Release readiness artifact */
  readiness?: ReleaseReadinessArtifact;
  /** Artifact URL for full report */
  artifactUrl?: string;
  /** Maximum findings to show in key findings section */
  maxFindingsShown?: number;
  /** Maximum recommendations to show */
  maxRecommendationsShown?: number;
}

/**
 * PR comment template data
 */
export interface PrCommentTemplateData {
  status: string;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  riskCount: number;
  seedCount: number;
  findings: FindingSummary[];
  recommendations: string[];
  artifactUrl?: string;
}

/**
 * Finding summary for PR comment
 */
export interface FindingSummary {
  ruleId: string;
  severity: Severity;
  summary: string;
  path: string;
  line: number | undefined;
}

/**
 * Count findings by severity
 */
function countBySeverity(findings: Finding[]): Record<Severity, number> {
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
 * Get status emoji based on readiness
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case "passed":
      return "PASSED";
    case "passed_with_risk":
      return "PASSED_WITH_RISK";
    case "needs_review":
      return "NEEDS_REVIEW";
    case "blocked":
      return "BLOCKED";
    default:
      return status.toUpperCase();
  }
}

/**
 * Get severity indicator
 */
function severityIndicator(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "**CRITICAL**";
    case "high":
      return "**HIGH**";
    case "medium":
      return "*MEDIUM*";
    case "low":
      return "LOW";
    default:
      return String(severity).toUpperCase();
  }
}

/**
 * Get line from finding evidence
 */
function getFindingLine(finding: Finding): number | undefined {
  if (finding.evidence.length > 0) {
    return finding.evidence[0].startLine;
  }
  return undefined;
}

/**
 * Generate PR comment markdown
 */
export function generatePrComment(options: PrCommentOptions): string {
  const {
    findings,
    riskRegister,
    testSeeds,
    readiness,
    artifactUrl,
    maxFindingsShown = 10,
    maxRecommendationsShown = 5,
  } = options;

  const counts = countBySeverity(findings.findings);
  const status = readiness?.status || "needs_review";
  const riskCount = riskRegister?.risks.length || 0;
  const seedCount = testSeeds?.seeds?.length || 0;

  // Sort findings by severity (critical > high > medium > low)
  const severityOrder: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const sortedFindings = [...findings.findings]
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, maxFindingsShown);

  // Gather recommendations from risk register
  const allRecommendations =
    riskRegister?.risks.flatMap((r) => r.recommendedActions) || [];
  const uniqueRecommendations = [...new Set(allRecommendations)].slice(
    0,
    maxRecommendationsShown
  );

  // Build markdown
  let md = `## code-to-gate Analysis

**Status**: ${getStatusEmoji(status)}

### Summary
| Metric | Count |
|--------|-------|
| Critical | ${counts.critical} |
| High | ${counts.high} |
| Medium | ${counts.medium} |
| Low | ${counts.low} |
| Risks | ${riskCount} |
| Test Seeds | ${seedCount} |

`;

  // Key findings section
  if (sortedFindings.length > 0) {
    md += `### Key Findings

`;
    for (const finding of sortedFindings) {
      const line = getFindingLine(finding);
      const lineStr = line !== undefined ? `:${line}` : "";
      const path = finding.evidence[0]?.path || "unknown";
      const sev = severityIndicator(finding.severity);

      md += `- **${finding.ruleId}** (${sev}): ${finding.summary} at ${path}${lineStr}\n`;
    }
    md += "\n";
  }

  // Additional findings notice
  const totalShown = sortedFindings.length;
  const totalFindings = findings.findings.length;
  if (totalFindings > totalShown) {
    md += `> Showing ${totalShown} of ${totalFindings} findings. See full report for all details.\n\n`;
  }

  // Recommended actions section
  if (uniqueRecommendations.length > 0) {
    md += `### Recommended Actions

`;
    for (const action of uniqueRecommendations) {
      md += `- ${action}\n`;
    }
    md += "\n";
  }

  // Unsupported claims notice
  if (findings.unsupported_claims.length > 0) {
    md += `### Unsupported Claims

> ${findings.unsupported_claims.length} claims could not be validated due to missing evidence or policy conflicts.

`;
  }

  // Artifact link
  if (artifactUrl) {
    md += `[View full report](${artifactUrl})\n\n`;
  }

  // Footer
  md += `---
*Generated by code-to-gate v${findings.tool.version}*`;

  return md;
}

/**
 * Build template data for custom rendering
 */
export function buildTemplateData(options: PrCommentOptions): PrCommentTemplateData {
  const {
    findings,
    riskRegister,
    testSeeds,
    readiness,
    artifactUrl,
    maxFindingsShown = 10,
    maxRecommendationsShown = 5,
  } = options;

  const counts = countBySeverity(findings.findings);
  const status = readiness?.status || "needs_review";

  const severityOrder: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const sortedFindings = [...findings.findings]
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, maxFindingsShown);

  const findingSummaries: FindingSummary[] = sortedFindings.map((finding) => ({
    ruleId: finding.ruleId,
    severity: finding.severity,
    summary: finding.summary,
    path: finding.evidence[0]?.path || "unknown",
    line: getFindingLine(finding),
  }));

  const allRecommendations =
    riskRegister?.risks.flatMap((r) => r.recommendedActions) || [];
  const uniqueRecommendations = [...new Set(allRecommendations)].slice(
    0,
    maxRecommendationsShown
  );

  return {
    status: getStatusEmoji(status),
    criticalCount: counts.critical,
    highCount: counts.high,
    mediumCount: counts.medium,
    lowCount: counts.low,
    riskCount: riskRegister?.risks.length || 0,
    seedCount: testSeeds?.seeds?.length || 0,
    findings: findingSummaries,
    recommendations: uniqueRecommendations,
    artifactUrl,
  };
}

/**
 * Render PR comment with custom template
 */
export function renderPrCommentTemplate(template: string, data: PrCommentTemplateData): string {
  // Simple template replacement
  let result = template;

  // Replace status
  result = result.replace(/\{\{status\}\}/g, data.status);

  // Replace counts
  result = result.replace(/\{\{critical_count\}\}/g, String(data.criticalCount));
  result = result.replace(/\{\{high_count\}\}/g, String(data.highCount));
  result = result.replace(/\{\{medium_count\}\}/g, String(data.mediumCount));
  result = result.replace(/\{\{risk_count\}\}/g, String(data.riskCount));
  result = result.replace(/\{\{seed_count\}\}/g, String(data.seedCount));

  // Replace findings section (simplified)
  const findingsSection = data.findings
    .map(
      (f) =>
        `- **${f.ruleId}** (${f.severity}): ${f.summary} at ${f.path}${f.line !== undefined ? `:${f.line}` : ""}`
    )
    .join("\n");
  result = result.replace(/\{\{findings_section\}\}/g, findingsSection);

  // Replace recommendations section
  const recommendationsSection = data.recommendations
    .map((r) => `- ${r}`)
    .join("\n");
  result = result.replace(/\{\{recommendations_section\}\}/g, recommendationsSection);

  // Replace artifact URL
  if (data.artifactUrl) {
    result = result.replace(/\{\{artifact_url\}\}/g, data.artifactUrl);
  }

  return result;
}

/**
 * Default PR comment template (matching product spec)
 */
export const DEFAULT_PR_COMMENT_TEMPLATE = `## code-to-gate Analysis

**Status**: {{status}}

### Summary
- **Critical**: {{critical_count}}
- **High**: {{high_count}}
- **Medium**: {{medium_count}}
- **Risks**: {{risk_count}}
- **Test Seeds**: {{seed_count}}

### Key Findings
{{findings_section}}

### Recommended Actions
{{recommendations_section}}

[View full report]({{artifact_url}})
`;
