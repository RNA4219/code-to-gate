/**
 * Markdown Reporter - generates analysis-report.md
 */

import {
  FindingsArtifact,
  RiskRegisterArtifact,
  Finding,
  RiskSeed,
  Severity,
} from "../types/artifacts.js";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { escapeMarkdownCell, inferFindingDomain } from "./domain-context.js";

/**
 * Get severity badge emoji
 */
function severityBadge(severity: Severity): string {
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
      return severity;
  }
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

function firstEvidencePath(finding: Finding): string {
  return finding.evidence[0]?.path ?? "n/a";
}

function findingDomain(finding: Finding): string {
  return inferFindingDomain(finding).label;
}

function findingReviewFlags(finding: Finding): string {
  const tags = finding.tags ?? [];
  const fpTags = tags.filter((tag) => tag.startsWith("fp-review:"));
  if (fpTags.length === 0) {
    return "evidence-linked";
  }
  return fpTags.map((tag) => tag.replace("fp-review:", "")).join(", ");
}

function summarizeDomains(findings: Finding[]): Array<{ domain: string; count: number; high: number; paths: string[] }> {
  const domains = new Map<string, { domain: string; count: number; high: number; paths: Set<string> }>();
  for (const finding of findings) {
    const signal = inferFindingDomain(finding);
    const entry = domains.get(signal.label) ?? {
      domain: signal.label,
      count: 0,
      high: 0,
      paths: new Set<string>(),
    };
    entry.count += 1;
    if (finding.severity === "critical" || finding.severity === "high") {
      entry.high += 1;
    }
    const evidencePath = firstEvidencePath(finding);
    if (evidencePath !== "n/a") {
      entry.paths.add(evidencePath);
    }
    domains.set(signal.label, entry);
  }

  return [...domains.values()]
    .map((entry) => ({
      domain: entry.domain,
      count: entry.count,
      high: entry.high,
      paths: [...entry.paths].slice(0, 3),
    }))
    .sort((a, b) => b.high - a.high || b.count - a.count);
}

/**
 * Generate analysis report markdown
 */
export function generateAnalysisReport(
  findings: FindingsArtifact,
  riskRegister: RiskRegisterArtifact,
  repoRoot: string
): string {
  const counts = countBySeverity(findings.findings);
  const totalFindings = findings.findings.length;
  const totalRisks = riskRegister.risks.length;
  const highRisks = riskRegister.risks.filter(
    (r) => r.severity === "high" || r.severity === "critical"
  );
  const domainSummary = summarizeDomains(findings.findings);

  let md = `# code-to-gate Analysis Report

**Generated**: ${findings.generated_at}
**Run ID**: ${findings.run_id}
Repository: ${repoRoot}
**Tool**: code-to-gate v${findings.tool.version}

---

## Summary

| Metric | Count |
|--------|-------|
| Total Findings | ${totalFindings} |
| Critical | ${counts.critical} |
| High | ${counts.high} |
| Medium | ${counts.medium} |
| Low | ${counts.low} |
| Total Risks | ${totalRisks} |
| Unsupported Claims | ${findings.unsupported_claims.length} |

`;

  if (domainSummary.length > 0) {
    md += `## Domain Context

| Domain | Findings | High/Critical | Evidence Paths |
|--------|----------|---------------|----------------|
`;
    for (const domain of domainSummary) {
      md += `| ${escapeMarkdownCell(domain.domain)} | ${domain.count} | ${domain.high} | ${escapeMarkdownCell(domain.paths.join(", ") || "n/a")} |\n`;
    }
    md += "\n";
  }

  // Add high risks section if any
  if (highRisks.length > 0) {
    md += `## High-Priority Risks

| Risk ID | Title | Severity | Likelihood | Source Findings |
|---------|-------|----------|------------|-----------------|
`;
    for (const risk of highRisks) {
      const sourceFindings = risk.sourceFindingIds.join(", ");
      md += `| ${risk.id} | ${risk.title} | ${severityBadge(risk.severity)} | ${risk.likelihood} | ${sourceFindings} |\n`;
    }
    md += "\n";
  }

  // Add all findings table
  if (findings.findings.length > 0) {
    md += `## All Findings

| ID | Rule | Category | Domain | Severity | Title | Evidence | Review Flags | LLM |
|----|------|----------|--------|----------|-------|----------|--------------|-----|
`;
    for (const finding of findings.findings) {
      const llmStatus = finding.tags?.includes("llm-reviewed") ? "reflected" : "not-used";
      md += `| ${finding.id} | ${finding.ruleId} | ${finding.category} | ${escapeMarkdownCell(findingDomain(finding))} | ${severityBadge(finding.severity)} | ${escapeMarkdownCell(finding.title)} | ${escapeMarkdownCell(firstEvidencePath(finding))} | ${escapeMarkdownCell(findingReviewFlags(finding))} | ${llmStatus} |\n`;
    }
    md += "\n";
  }

  if (findings.findings.length > 0) {
    md += `## False-Positive Review

| Finding | Checkpoint |
|---------|------------|
`;
    for (const finding of findings.findings) {
      const signal = inferFindingDomain(finding);
      const checkpoint = [
        `domain=${signal.label}`,
        `evidence=${firstEvidencePath(finding)}`,
        `confidence=${finding.confidence.toFixed(2)}`,
        `flags=${findingReviewFlags(finding)}`,
      ].join("; ");
      md += `| ${finding.id} | ${escapeMarkdownCell(checkpoint)} |\n`;
    }
    md += "\n";
  }

  if (findings.unsupported_claims.length > 0) {
    md += `## Unsupported Claims

| ID | Source | Reason | Claim |
|----|--------|--------|-------|
`;
    for (const claim of findings.unsupported_claims) {
      md += `| ${claim.id} | ${escapeMarkdownCell(claim.sourceSection)} | ${claim.reason} | ${escapeMarkdownCell(claim.claim)} |\n`;
    }
    md += "\n";
  }

  // Add risk narratives
  if (riskRegister.risks.length > 0) {
    md += `## Risk Narratives

`;
    for (const risk of riskRegister.risks) {
      md += `### ${risk.id}: ${risk.title}

**Severity**: ${severityBadge(risk.severity)}
**Likelihood**: ${risk.likelihood}
**Confidence**: ${risk.confidence.toFixed(2)}

`;
      if (risk.narrative) {
        md += `${risk.narrative}\n\n`;
      }

      md += `**Impact**:
`;
      for (const impactItem of risk.impact) {
        md += `- ${impactItem}\n`;
      }
      md += "\n";

      md += `**Recommended Actions**:
`;
      for (const action of risk.recommendedActions) {
        md += `- ${action}\n`;
      }
      md += "\n---\n\n";
    }
  }

  // Add recommended actions summary
  md += `## Recommended Actions Summary

`;
  const allActions = riskRegister.risks.flatMap((r) => r.recommendedActions);
  const uniqueActions = [...new Set(allActions)];

  if (uniqueActions.length > 0) {
    md += `### Priority Order

`;
    // Sort by severity of source risk
    const sortedRisks = [...riskRegister.risks].sort((a, b) => {
      const severityOrder: Record<Severity, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    let priority = 1;
    for (const risk of sortedRisks) {
      for (const action of risk.recommendedActions) {
        md += `${priority}. **[${risk.severity.toUpperCase()}]** ${action}\n`;
        priority++;
      }
    }
    md += "\n";
  }

  // Add footer
  md += `---

*This report was generated by code-to-gate. Findings are based on static analysis of the repository.*

`;

  return md;
}

/**
 * Write analysis-report.md to output directory
 */
export function writeAnalysisReportMd(
  outDir: string,
  findings: FindingsArtifact,
  riskRegister: RiskRegisterArtifact,
  repoRoot: string
): string {
  const filePath = path.join(outDir, "analysis-report.md");
  const content = generateAnalysisReport(findings, riskRegister, repoRoot);
  writeFileSync(filePath, content, "utf8");
  return filePath;
}
