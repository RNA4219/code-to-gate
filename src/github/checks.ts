/**
 * GitHub Checks Creator for code-to-gate
 *
 * Creates Check runs with annotations for each finding.
 */

import type {
  FindingsArtifact,
  ReleaseReadinessArtifact,
  Finding,
  Severity,
} from "../types/artifacts.js";
import type { GitHubApiClient, CheckAnnotation, CheckOutput } from "./api-client.js";

/**
 * Checks creation options
 */
export interface ChecksOptions {
  /** GitHub API client */
  client: GitHubApiClient;
  /** SHA of the commit to associate checks with */
  headSha: string;
  /** Findings artifact */
  findings: FindingsArtifact;
  /** Release readiness artifact */
  readiness?: ReleaseReadinessArtifact;
  /** Check run name (default: "code-to-gate Analysis") */
  name?: string;
  /** Maximum annotations per check run (GitHub limit is 50) */
  maxAnnotations?: number;
}

/**
 * Checks result
 */
export interface ChecksResult {
  checkRunId: number;
  conclusion: string;
  annotationCount: number;
}

/**
 * Map severity to annotation level
 */
function severityToAnnotationLevel(severity: Severity): CheckAnnotation["annotation_level"] {
  switch (severity) {
    case "critical":
    case "high":
      return "failure";
    case "medium":
      return "warning";
    case "low":
      return "notice";
    default:
      return "notice";
  }
}

/**
 * Map readiness status to conclusion
 */
function statusToConclusion(status: string): CheckConclusion {
  switch (status) {
    case "passed":
      return "success";
    case "passed_with_risk":
      return "success"; // Still pass, but with warnings in output
    case "needs_review":
      return "neutral";
    case "blocked":
      return "failure";
    default:
      return "neutral";
  }
}

/**
 * Check conclusion type
 */
type CheckConclusion = "success" | "failure" | "neutral" | "cancelled" | "timed_out" | "action_required";

/**
 * Create annotation from finding
 */
function createAnnotationFromFinding(finding: Finding): CheckAnnotation | null {
  // Need at least one evidence with path and line
  const evidence = finding.evidence[0];
  if (!evidence || !evidence.path) {
    return null;
  }

  return {
    path: evidence.path,
    start_line: evidence.startLine || 1,
    end_line: evidence.endLine || evidence.startLine || 1,
    annotation_level: severityToAnnotationLevel(finding.severity),
    message: finding.summary,
    title: finding.ruleId,
  };
}

/**
 * Generate check run output summary
 */
function generateCheckOutputSummary(findings: FindingsArtifact): string {
  const total = findings.findings.length;

  const critical = findings.findings.filter((f) => f.severity === "critical").length;
  const high = findings.findings.filter((f) => f.severity === "high").length;
  const medium = findings.findings.filter((f) => f.severity === "medium").length;
  const low = findings.findings.filter((f) => f.severity === "low").length;

  return `Found ${total} findings:
- Critical: ${critical}
- High: ${high}
- Medium: ${medium}
- Low: ${low}`;
}

/**
 * Generate check run output text
 */
function generateCheckOutputText(findings: FindingsArtifact): string {
  let text = "## Findings Details\n\n";

  // Group by severity
  const severityOrder: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const sortedFindings = [...findings.findings].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  for (const finding of sortedFindings) {
    const evidence = finding.evidence[0];
    const location = evidence
      ? `${evidence.path}${evidence.startLine ? `:${evidence.startLine}` : ""}`
      : "unknown location";

    text += `### ${finding.ruleId}\n`;
    text += `- **Severity**: ${finding.severity}\n`;
    text += `- **Category**: ${finding.category}\n`;
    text += `- **Confidence**: ${finding.confidence.toFixed(2)}\n`;
    text += `- **Location**: ${location}\n`;
    text += `- **Summary**: ${finding.summary}\n\n`;
  }

  return text;
}

/**
 * Create a check run and add annotations
 */
export async function createCheckRun(options: ChecksOptions): Promise<ChecksResult> {
  const {
    client,
    headSha,
    findings,
    readiness,
    name = "code-to-gate Analysis",
    maxAnnotations = 50,
  } = options;

  // Determine conclusion
  const status = readiness?.status || "needs_review";
  const conclusion = statusToConclusion(status);

  // Create annotations from findings
  const annotations: CheckAnnotation[] = [];
  const severityOrder: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  // Sort findings by severity and take top annotations
  const sortedFindings = [...findings.findings]
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, maxAnnotations);

  for (const finding of sortedFindings) {
    const annotation = createAnnotationFromFinding(finding);
    if (annotation) {
      annotations.push(annotation);
    }
  }

  // Generate output
  const output: CheckOutput = {
    title: status.toUpperCase(),
    summary: generateCheckOutputSummary(findings),
    text: generateCheckOutputText(findings),
    annotations,
  };

  // Create check run
  const checkRunId = await client.createCheckRun(name, "completed", {
    headSha,
    conclusion,
    output,
    completedAt: new Date().toISOString(),
  });

  return {
    checkRunId,
    conclusion,
    annotationCount: annotations.length,
  };
}

/**
 * Create an in-progress check run (for long-running analysis)
 */
export async function createInProgressCheckRun(
  client: GitHubApiClient,
  headSha: string,
  name: string = "code-to-gate Analysis"
): Promise<number> {
  return client.createCheckRun(name, "in_progress", {
    headSha,
    startedAt: new Date().toISOString(),
    output: {
      title: "Running",
      summary: "Analysis in progress...",
    },
  });
}

/**
 * Update a check run with results
 */
export async function updateCheckRunWithResults(
  client: GitHubApiClient,
  checkRunId: number,
  findings: FindingsArtifact,
  readiness?: ReleaseReadinessArtifact,
  maxAnnotations: number = 50
): Promise<void> {
  const status = readiness?.status || "needs_review";
  const conclusion = statusToConclusion(status);

  // Create annotations
  const annotations: CheckAnnotation[] = [];
  const severityOrder: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const sortedFindings = [...findings.findings]
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, maxAnnotations);

  for (const finding of sortedFindings) {
    const annotation = createAnnotationFromFinding(finding);
    if (annotation) {
      annotations.push(annotation);
    }
  }

  // Update check run
  await client.updateCheckRun(checkRunId, {
    status: "completed",
    conclusion,
    completedAt: new Date().toISOString(),
    output: {
      title: status.toUpperCase(),
      summary: generateCheckOutputSummary(findings),
      text: generateCheckOutputText(findings),
      annotations,
    },
  });
}

/**
 * Create a failed check run (for errors)
 */
export async function createFailedCheckRun(
  client: GitHubApiClient,
  headSha: string,
  errorMessage: string,
  name: string = "code-to-gate Analysis"
): Promise<number> {
  return client.createCheckRun(name, "completed", {
    headSha,
    conclusion: "failure",
    completedAt: new Date().toISOString(),
    output: {
      title: "FAILED",
      summary: "Analysis failed",
      text: `Error: ${errorMessage}`,
    },
  });
}

/**
 * Create a neutral check run (for info/warnings)
 */
export async function createNeutralCheckRun(
  client: GitHubApiClient,
  headSha: string,
  message: string,
  name: string = "code-to-gate Analysis"
): Promise<number> {
  return client.createCheckRun(name, "completed", {
    headSha,
    conclusion: "neutral",
    completedAt: new Date().toISOString(),
    output: {
      title: "INFO",
      summary: message,
    },
  });
}