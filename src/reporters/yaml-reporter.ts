/**
 * YAML Reporter - generates risk-register.yaml
 */

import {
  RiskSeed,
  RiskRegisterArtifact,
  FindingsArtifact,
  Severity,
  Likelihood,
  PackageRiskSummary,
} from "../types/artifacts.js";
import { writeFileSync } from "node:fs";
import path from "node:path";

function yamlString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Map finding severity to risk likelihood
 */
function mapSeverityToLikelihood(severity: Severity): Likelihood {
  switch (severity) {
    case "critical":
      return "high";
    case "high":
      return "medium";
    case "medium":
      return "low";
    default:
      return "unknown";
  }
}

/**
 * Generate risk ID from finding IDs
 */
function generateRiskId(sourceFindings: string[]): string {
  if (sourceFindings.length === 0) {
    return `risk-unknown-${Date.now().toString(36)}`;
  }
  const baseId = sourceFindings[0].replace("finding-", "risk-");
  return baseId.split("-").slice(0, 3).join("-");
}

function packagePathForEvidencePath(evidencePath: string | undefined): string {
  if (!evidencePath) {
    return ".";
  }
  const normalized = evidencePath.replace(/\\/g, "/");
  const match = normalized.match(/(?:^|\/)(packages\/[^/]+)/);
  return match?.[1] ?? ".";
}

function buildPackageSummary(findings: FindingsArtifact, risks: RiskSeed[]): PackageRiskSummary[] {
  const riskIdsByFinding = new Map<string, string[]>();
  for (const risk of risks) {
    for (const findingId of risk.sourceFindingIds) {
      riskIdsByFinding.set(findingId, [...(riskIdsByFinding.get(findingId) ?? []), risk.id]);
    }
  }

  const summary = new Map<string, PackageRiskSummary>();
  for (const finding of findings.findings) {
    const packagePath = packagePathForEvidencePath(finding.evidence[0]?.path);
    const item = summary.get(packagePath) ?? {
      packagePath,
      findingCount: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      riskIds: [],
    };

    item.findingCount += 1;
    item[finding.severity] += 1;
    item.riskIds = Array.from(new Set([...item.riskIds, ...(riskIdsByFinding.get(finding.id) ?? [])])).sort();
    summary.set(packagePath, item);
  }

  return Array.from(summary.values()).sort((a, b) => a.packagePath.localeCompare(b.packagePath));
}

/**
 * Build risks from findings
 */
export function buildRiskRegisterFromFindings(
  findings: FindingsArtifact,
  _policyId?: string
): RiskRegisterArtifact {
  const risks: RiskSeed[] = [];

  // Group findings by category for risk aggregation
  const paymentFindings = findings.findings.filter((f) => f.category === "payment");
  const testingFindings = findings.findings.filter((f) => f.category === "testing");

  // Create aggregated payment risk if there are multiple payment findings
  if (paymentFindings.length >= 2) {
    const highSeverityFindings = paymentFindings.filter(
      (f) => f.severity === "high" || f.severity === "critical"
    );
    const maxSeverity: Severity =
      highSeverityFindings.length > 0
        ? highSeverityFindings.reduce((max, f) =>
            f.severity === "critical" || max === "critical" ? "critical" : "high"
          , "high" as Severity)
        : "medium";

    const sourceIds = paymentFindings.map((f) => f.id);
    const evidence = paymentFindings.flatMap((f) => f.evidence);

    risks.push({
      id: generateRiskId(sourceIds),
      title: "Price manipulation vulnerability chain",
      severity: maxSeverity,
      likelihood: mapSeverityToLikelihood(maxSeverity),
      impact: [
        "Financial loss due to price manipulation",
        "Customer trust degradation",
        "Potential fraud incidents",
        "Regulatory compliance violation",
      ],
      confidence: 0.85,
      sourceFindingIds: sourceIds,
      evidence: evidence.slice(0, 5), // Limit evidence for readability
      narrative:
        "Multiple findings indicate a chain of vulnerabilities in price handling: client-trusted price calculation combined with order persistence that accepts totals without validation. The server validation module exists but is not integrated. This creates a complete attack path for price manipulation.",
      recommendedActions: [
        "Integrate server-side pricing validation into order creation flow",
        "Reject orders where client total does not match server-calculated total",
        "Add audit logging for price discrepancies",
        "Implement rate limiting on checkout endpoints",
      ],
    });
  }

  // Create testing risk
  if (testingFindings.length > 0) {
    const sourceIds = testingFindings.map((f) => f.id);
    const evidence = testingFindings.flatMap((f) => f.evidence);

    risks.push({
      id: generateRiskId(sourceIds),
      title: "Inadequate test coverage for critical checkout path",
      severity: "medium",
      likelihood: "medium",
      impact: [
        "Undetected bugs in production checkout flow",
        "Delayed incident response",
        "Reduced confidence in release readiness",
      ],
      confidence: 0.80,
      sourceFindingIds: sourceIds,
      evidence: evidence.slice(0, 3),
      narrative:
        "The checkout/order creation path lacks integration tests, negative tests, and abuse case tests. Only basic cart functionality is tested. This creates risk of undetected issues in the critical business flow.",
      recommendedActions: [
        "Add integration tests for checkout/order flow",
        "Add negative tests for price manipulation attempts",
        "Add abuse case tests for total tampering",
        "Consider mutation testing to validate test effectiveness",
      ],
    });
  }

  // Create individual risks for high-severity findings not already grouped
  for (const finding of findings.findings) {
    if (finding.severity === "high" || finding.severity === "critical") {
      const alreadyIncluded = risks.some((r) =>
        r.sourceFindingIds.includes(finding.id)
      );
      if (!alreadyIncluded) {
        risks.push({
          id: generateRiskId([finding.id]),
          title: finding.title,
          severity: finding.severity,
          likelihood: mapSeverityToLikelihood(finding.severity),
          impact: [finding.summary],
          confidence: finding.confidence,
          sourceFindingIds: [finding.id],
          evidence: finding.evidence,
          recommendedActions: [`Address finding ${finding.id}: ${finding.ruleId}`],
        });
      }
    }
  }

  return {
    ...findings,
    artifact: "risk-register",
    schema: "risk-register@v1",
    completeness: findings.completeness === "partial" || risks.length === 0 ? "partial" : "complete",
    risks,
    packageSummary: buildPackageSummary(findings, risks),
  };
}

/**
 * Write risk-register.yaml to output directory
 */
export function writeRiskRegisterYaml(outDir: string, artifact: RiskRegisterArtifact): string {
  const filePath = path.join(outDir, "risk-register.yaml");

  // Build YAML manually for proper formatting
  let yaml = `# code-to-gate risk-register
# Generated: ${artifact.generated_at}
# Run ID: ${artifact.run_id}

version: ${artifact.version}
generated_at: ${artifact.generated_at}
run_id: ${artifact.run_id}
artifact: risk-register
schema: risk-register@v1
completeness: ${artifact.completeness}

repo:
  root: ${yamlString(artifact.repo.root)}

tool:
  name: ${yamlString(artifact.tool.name)}
  version: ${yamlString(artifact.tool.version)}
  plugin_versions: []

risks:
`;

  // Handle empty risks array - must output [] to satisfy schema
  if (artifact.risks.length === 0) {
    yaml += "  []\n";
  } else {
    for (const risk of artifact.risks) {
      yaml += `
  - id: ${yamlString(risk.id)}
    title: ${yamlString(risk.title)}
    severity: ${risk.severity}
    likelihood: ${risk.likelihood}
    confidence: ${risk.confidence}
    impact:
`;
    for (const impactItem of risk.impact) {
      yaml += `      - ${yamlString(impactItem)}\n`;
    }
    yaml += `    sourceFindingIds:
`;
    for (const findingId of risk.sourceFindingIds) {
      yaml += `      - ${yamlString(findingId)}\n`;
    }
    yaml += `    evidence:
`;
    for (const ev of risk.evidence || []) {
      yaml += `      - id: ${yamlString(ev.id)}\n        path: ${yamlString(ev.path)}\n        kind: ${ev.kind}\n`;
      if (ev.startLine) yaml += `        startLine: ${ev.startLine}\n`;
      if (ev.excerptHash) yaml += `        excerptHash: "${ev.excerptHash}"\n`;
    }
    yaml += `    recommendedActions:\n`;
    for (const action of risk.recommendedActions) {
      yaml += `      - ${yamlString(action)}\n`;
    }
    if (risk.narrative) {
      yaml += `    narrative: |
      ${risk.narrative.split("\n").join("\n      ")}
`;
    }
    }
  }

  yaml += "\npackageSummary:\n";
  if (!artifact.packageSummary || artifact.packageSummary.length === 0) {
    yaml += "  []\n";
  } else {
    for (const item of artifact.packageSummary) {
      yaml += `  - packagePath: ${yamlString(item.packagePath)}
    findingCount: ${item.findingCount}
    critical: ${item.critical}
    high: ${item.high}
    medium: ${item.medium}
    low: ${item.low}
    riskIds:
`;
      if (item.riskIds.length === 0) {
        yaml += "      []\n";
      } else {
        for (const riskId of item.riskIds) {
          yaml += `      - ${yamlString(riskId)}\n`;
        }
      }
    }
  }

  writeFileSync(filePath, yaml, "utf8");
  return filePath;
}
