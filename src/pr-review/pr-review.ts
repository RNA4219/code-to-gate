import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  FindingsArtifact,
  GateExplainabilityArtifact,
  DriftBudgetArtifact,
  OwnershipRiskArtifact,
  PrReviewArtifact,
  PrReviewArtifactLink,
  PrReviewItem,
  PrReviewItemSeverity,
  PrReviewStatus,
  ReleasePackArtifact,
  ReleaseReadinessArtifact,
  Severity,
  SpecDriftArtifact,
  TestPlanArtifact,
} from "../types/artifacts.js";
import type { RedactionProfile } from "../types/artifacts.js";
import { createRedactionProfile, createRedactionSummary } from "../redaction/redaction-profile.js";

interface ArtifactSpec {
  id: string;
  label: string;
  artifact: string;
  file: string;
  role: PrReviewArtifactLink["role"];
}

export interface PrReviewOptions {
  version: string;
  fromDir?: string;
  out?: string;
  commentFile?: string;
  artifactUrl?: string;
  redactionProfile?: RedactionProfile;
  now?: Date;
}

export interface PrReviewResult {
  artifact: PrReviewArtifact;
  artifactPath: string;
  markdownPath: string;
  markdown: string;
}

const ARTIFACT_SPECS: ArtifactSpec[] = [
  { id: "readiness", label: "Release readiness", artifact: "release-readiness", file: "release-readiness.json", role: "readiness" },
  { id: "gate-explainability", label: "Gate explainability", artifact: "gate-explainability", file: "gate-explainability.json", role: "readiness" },
  { id: "findings", label: "Findings", artifact: "findings", file: "findings.json", role: "findings" },
  { id: "test-plan", label: "Auto test plan", artifact: "test-plan", file: "test-plan.json", role: "tests" },
  { id: "spec-drift", label: "Spec drift", artifact: "spec-drift", file: "spec-drift.json", role: "spec" },
  { id: "drift-budget", label: "Drift budget", artifact: "drift-budget", file: "drift-budget.json", role: "spec" },
  { id: "ownership-risk", label: "Ownership risk", artifact: "ownership-risk", file: "ownership-risk.json", role: "ownership" },
  { id: "release-pack", label: "Release evidence pack", artifact: "release-pack", file: "release-pack.json", role: "release" },
  { id: "evidence-dag", label: "Evidence DAG", artifact: "evidence-dag", file: "evidence-dag.json", role: "qeg" },
  { id: "qeg", label: "QEG evidence input", artifact: "qeg-code-to-gate", file: "qeg-code-to-gate.json", role: "qeg" },
  { id: "hosted-static-report", label: "Hosted static report", artifact: "hosted-static-report", file: "hosted-static-report.json", role: "report" },
];

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function artifactPath(fromDir: string, fileName: string): string {
  return path.resolve(process.cwd(), fromDir, fileName);
}

function relativeToCwd(filePath: string): string {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/") || ".";
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function readOptionalJson<T>(fromDir: string, fileName: string): T | null {
  const filePath = artifactPath(fromDir, fileName);
  if (!existsSync(filePath)) {
    return null;
  }
  return readJson<T>(filePath);
}

function outputPaths(fromDir: string, out: string | undefined, commentFile: string | undefined): { artifactPath: string; markdownPath: string } {
  const defaultDir = path.resolve(process.cwd(), fromDir);
  if (!out) {
    return {
      artifactPath: path.join(defaultDir, "pr-review.json"),
      markdownPath: commentFile ? path.resolve(process.cwd(), commentFile) : path.join(defaultDir, "pr-review.md"),
    };
  }

  const absolute = path.resolve(process.cwd(), out);
  if (out.endsWith(".json")) {
    return {
      artifactPath: absolute,
      markdownPath: commentFile ? path.resolve(process.cwd(), commentFile) : absolute.replace(/\.json$/i, ".md"),
    };
  }
  if (out.endsWith(".md")) {
    return {
      artifactPath: absolute.replace(/\.md$/i, ".json"),
      markdownPath: commentFile ? path.resolve(process.cwd(), commentFile) : absolute,
    };
  }

  return {
    artifactPath: path.join(absolute, "pr-review.json"),
    markdownPath: commentFile ? path.resolve(process.cwd(), commentFile) : path.join(absolute, "pr-review.md"),
  };
}

function headerFromInputs(
  fromDir: string,
  readiness: ReleaseReadinessArtifact | null,
  findings: FindingsArtifact | null,
  specDrift: SpecDriftArtifact | null
): { runId: string; repoRoot: string } {
  for (const artifact of [readiness, findings, specDrift]) {
    if (artifact) {
      return {
        runId: artifact.run_id,
        repoRoot: artifact.repo.root,
      };
    }
  }

  const audit = readOptionalJson<Record<string, unknown>>(fromDir, "audit.json");
  const repo = audit?.repo as Record<string, unknown> | undefined;
  return {
    runId: typeof audit?.run_id === "string" ? audit.run_id : `pr-review-${Date.now()}`,
    repoRoot: typeof repo?.root === "string" ? repo.root : process.cwd(),
  };
}

function schemaOf(filePath: string): string | undefined {
  if (!filePath.endsWith(".json")) {
    return undefined;
  }
  try {
    const parsed = readJson<Record<string, unknown>>(filePath);
    const schema = parsed.schema ?? parsed.version;
    return typeof schema === "string" ? schema : undefined;
  } catch {
    return undefined;
  }
}

function hostedUrlFromManifest(fromDir: string): string | undefined {
  const manifest = readOptionalJson<Record<string, unknown>>(fromDir, "hosted-static-report.json");
  return typeof manifest?.publicUrl === "string" ? manifest.publicUrl : undefined;
}

function buildArtifactLinks(fromDir: string, artifactUrl: string | undefined): PrReviewArtifactLink[] {
  const links: PrReviewArtifactLink[] = ARTIFACT_SPECS.map((spec) => {
    const filePath = artifactPath(fromDir, spec.file);
    if (!existsSync(filePath)) {
      return {
        id: spec.id,
        label: spec.label,
        artifact: spec.artifact,
        path: spec.file,
        role: spec.role,
        present: false,
      };
    }

    const content = readFileSync(filePath);
    return {
      id: spec.id,
      label: spec.label,
      artifact: spec.artifact,
      path: relativeToCwd(filePath),
      role: spec.role,
      present: true,
      schema: schemaOf(filePath),
      hashSha256: sha256(content),
      url: spec.id === "hosted-static-report" ? hostedUrlFromManifest(fromDir) : undefined,
    };
  });

  if (artifactUrl) {
    links.push({
      id: "artifact-url",
      label: "Published quality report",
      artifact: "hosted-report",
      path: artifactUrl,
      role: "report",
      present: true,
      url: artifactUrl,
    });
  }

  return links;
}

function evidence(pathValue: string, detail: string): PrReviewItem["evidence"] {
  return [{ path: pathValue, detail }];
}

function item(input: {
  id: string;
  title: string;
  detail: string;
  severity: PrReviewItemSeverity;
  sourceArtifact: string;
  sourceIds?: string[];
  evidencePath: string;
  evidenceDetail: string;
}): PrReviewItem {
  return {
    id: input.id,
    title: input.title,
    detail: input.detail,
    severity: input.severity,
    sourceArtifact: input.sourceArtifact,
    sourceIds: input.sourceIds ?? [],
    evidence: evidence(input.evidencePath, input.evidenceDetail),
  };
}

function countSeverity(findings: FindingsArtifact | null, severity: Severity): number {
  return findings?.findings.filter((finding) => finding.severity === severity).length ?? 0;
}

function buildBlockReasons(
  fromDir: string,
  readiness: ReleaseReadinessArtifact | null,
  specDrift: SpecDriftArtifact | null,
  driftBudget: DriftBudgetArtifact | null,
  ownership: OwnershipRiskArtifact | null,
  releasePack: ReleasePackArtifact | null
): PrReviewItem[] {
  const reasons: PrReviewItem[] = [];
  const readinessPath = relativeToCwd(artifactPath(fromDir, "release-readiness.json"));

  if (!readiness) {
    reasons.push(item({
      id: "readiness-missing",
      title: "Release readiness artifact is missing",
      detail: "PR review cannot prove the gate verdict without release-readiness.json.",
      severity: "critical",
      sourceArtifact: "release-readiness.json",
      evidencePath: readinessPath,
      evidenceDetail: "release-readiness.json was not found in the artifact directory.",
    }));
  } else if (readiness.status === "blocked_input" || readiness.status === "failed") {
    if (readiness.failedConditions.length === 0) {
      reasons.push(item({
        id: `readiness-${readiness.status}`,
        title: `Readiness status is ${readiness.status}`,
        detail: readiness.summary,
        severity: "critical",
        sourceArtifact: "release-readiness.json",
        evidencePath: readinessPath,
        evidenceDetail: "readiness.status blocks merge.",
      }));
    }
    for (const condition of readiness.failedConditions) {
      reasons.push(item({
        id: `readiness-${condition.id}`,
        title: condition.id,
        detail: condition.reason,
        severity: "critical",
        sourceArtifact: "release-readiness.json",
        sourceIds: [
          ...(condition.matchedFindingIds ?? []),
          ...(condition.matchedRiskIds ?? []),
          ...(condition.matchedInputIds ?? []),
        ],
        evidencePath: readinessPath,
        evidenceDetail: "readiness.failedConditions",
      }));
    }
  }

  if (specDrift?.status === "failed") {
    for (const drift of specDrift.findings) {
      reasons.push(item({
        id: `spec-drift-${drift.id}`,
        title: drift.title,
        detail: drift.summary,
        severity: drift.severity,
        sourceArtifact: "spec-drift.json",
        sourceIds: [drift.sourceCheckId],
        evidencePath: drift.evidence[0]?.path ?? relativeToCwd(artifactPath(fromDir, "spec-drift.json")),
        evidenceDetail: drift.evidence[0]?.detail ?? "spec-drift finding",
      }));
    }
  }

  if (driftBudget?.status === "exceeded" && driftBudget.branchPolicy.blockOnExceeded) {
    for (const exceeded of driftBudget.exceeded) {
      reasons.push(item({
        id: `drift-budget-${exceeded.metric}`,
        title: `Drift budget exceeded: ${exceeded.metric}`,
        detail: `${exceeded.metric} is ${exceeded.actual}, budget is ${exceeded.budget}.`,
        severity: exceeded.severity,
        sourceArtifact: "drift-budget.json",
        sourceIds: exceeded.sourceIds,
        evidencePath: relativeToCwd(artifactPath(fromDir, "drift-budget.json")),
        evidenceDetail: "drift-budget.exceeded",
      }));
    }
  }

  const highRiskUnowned = ownership?.files.filter((file) => file.changed && file.risk === "high" && file.owners.length === 0) ?? [];
  for (const file of highRiskUnowned.slice(0, 5)) {
    reasons.push(item({
      id: `ownership-${file.path}`,
      title: "Changed high-risk file has no CODEOWNERS reviewer",
      detail: `${file.path}: ${file.reasons.join(" ")}`,
      severity: "high",
      sourceArtifact: "ownership-risk.json",
      sourceIds: [file.path],
      evidencePath: relativeToCwd(artifactPath(fromDir, "ownership-risk.json")),
      evidenceDetail: "ownership-risk.files changed high-risk unowned entry",
    }));
  }

  if (releasePack?.status === "partial" && releasePack.summary.missingRequiredEvidence > 0) {
    const missing = releasePack.entries.filter((entry) => entry.kind === "required" && !entry.present).map((entry) => entry.id);
    reasons.push(item({
      id: "release-pack-partial",
      title: "Release evidence pack is missing required evidence",
      detail: `Missing required evidence: ${missing.join(", ")}`,
      severity: "high",
      sourceArtifact: "release-pack.json",
      sourceIds: missing,
      evidencePath: relativeToCwd(artifactPath(fromDir, "release-pack.json")),
      evidenceDetail: "release-pack.summary.missingRequiredEvidence",
    }));
  }

  return reasons;
}

function buildAcceptableReasons(
  fromDir: string,
  readiness: ReleaseReadinessArtifact | null,
  findings: FindingsArtifact | null,
  specDrift: SpecDriftArtifact | null,
  ownership: OwnershipRiskArtifact | null,
  releasePack: ReleasePackArtifact | null
): PrReviewItem[] {
  const reasons: PrReviewItem[] = [];

  if (readiness && ["passed", "passed_with_risk", "needs_review"].includes(readiness.status)) {
    reasons.push(item({
      id: "readiness-verdict",
      title: `Readiness verdict is ${readiness.status}`,
      detail: readiness.summary,
      severity: readiness.status === "passed" ? "info" : "medium",
      sourceArtifact: "release-readiness.json",
      evidencePath: relativeToCwd(artifactPath(fromDir, "release-readiness.json")),
      evidenceDetail: "readiness.status and readiness.summary",
    }));
  }

  if (findings && findings.unsupported_claims.length === 0) {
    reasons.push(item({
      id: "unsupported-claims-empty",
      title: "No unsupported claims are present",
      detail: "LLM or imported claims that lack evidence are not present in findings.unsupported_claims.",
      severity: "info",
      sourceArtifact: "findings.json",
      evidencePath: relativeToCwd(artifactPath(fromDir, "findings.json")),
      evidenceDetail: "findings.unsupported_claims is empty",
    }));
  }

  if (specDrift?.status === "passed") {
    reasons.push(item({
      id: "spec-drift-passed",
      title: "Public docs, CLI, schema, and schema coverage are aligned",
      detail: `${specDrift.summary.checks} spec drift checks passed without failures.`,
      severity: "info",
      sourceArtifact: "spec-drift.json",
      evidencePath: relativeToCwd(artifactPath(fromDir, "spec-drift.json")),
      evidenceDetail: "spec-drift.status",
    }));
  }

  if (ownership && ownership.reviewerCandidates.length > 0) {
    reasons.push(item({
      id: "reviewers-candidate",
      title: "Reviewer candidates are available from CODEOWNERS",
      detail: `Suggested reviewers: ${ownership.reviewerCandidates.join(", ")}`,
      severity: ownership.status === "covered" ? "info" : "medium",
      sourceArtifact: "ownership-risk.json",
      sourceIds: ownership.reviewerCandidates,
      evidencePath: relativeToCwd(artifactPath(fromDir, "ownership-risk.json")),
      evidenceDetail: "ownership-risk.reviewerCandidates",
    }));
  }

  if (releasePack?.status === "ready") {
    reasons.push(item({
      id: "release-pack-ready",
      title: "Release evidence pack has required evidence",
      detail: `${releasePack.summary.presentRequiredEvidence}/${releasePack.summary.requiredEvidence} required evidence entries are present.`,
      severity: "info",
      sourceArtifact: "release-pack.json",
      evidencePath: relativeToCwd(artifactPath(fromDir, "release-pack.json")),
      evidenceDetail: "release-pack.status",
    }));
  }

  return reasons;
}

function buildAdditionalTests(fromDir: string, testPlan: TestPlanArtifact | null): PrReviewItem[] {
  if (!testPlan) {
    return [item({
      id: "test-plan-missing",
      title: "Generate auto test selection before final review",
      detail: "Run code-to-gate test-plan --from <artifact-dir> --out <artifact-dir> to add changed-file test recommendations.",
      severity: "info",
      sourceArtifact: "test-plan.json",
      evidencePath: relativeToCwd(artifactPath(fromDir, "test-plan.json")),
      evidenceDetail: "test-plan.json was not present in the artifact directory.",
    })];
  }

  const tests = testPlan.recommendedTests.slice(0, 10).map((test) => item({
    id: `test-${test.id}`,
    title: test.title,
    detail: test.command ? `${test.reason} Command: ${test.command}` : test.reason,
    severity: test.priority === "high" ? "high" : test.priority === "medium" ? "medium" : "low",
    sourceArtifact: "test-plan.json",
    sourceIds: [test.id, ...test.sourcePaths],
    evidencePath: test.evidence[0]?.path ?? relativeToCwd(artifactPath(fromDir, "test-plan.json")),
    evidenceDetail: test.evidence[0]?.detail ?? "test-plan.recommendedTests",
  }));

  const gaps = testPlan.oracleGaps.slice(0, 10).map((gap) => item({
    id: `oracle-${gap.id}`,
    title: gap.suggestedManualTest,
    detail: gap.reason,
    severity: "high",
    sourceArtifact: "test-plan.json",
    sourceIds: [gap.id, gap.sourcePath],
    evidencePath: gap.evidence[0]?.path ?? relativeToCwd(artifactPath(fromDir, "test-plan.json")),
    evidenceDetail: gap.evidence[0]?.detail ?? "test-plan.oracleGaps",
  }));

  return [...tests, ...gaps];
}

function buildSpecDiffs(fromDir: string, specDrift: SpecDriftArtifact | null): PrReviewItem[] {
  if (!specDrift) {
    return [];
  }

  const findingItems = specDrift.findings.map((finding) => item({
    id: `spec-${finding.id}`,
    title: finding.title,
    detail: finding.summary,
    severity: finding.severity,
    sourceArtifact: "spec-drift.json",
    sourceIds: [finding.sourceCheckId],
    evidencePath: finding.evidence[0]?.path ?? relativeToCwd(artifactPath(fromDir, "spec-drift.json")),
    evidenceDetail: finding.evidence[0]?.detail ?? "spec-drift.findings",
  }));
  if (findingItems.length > 0) {
    return findingItems;
  }

  return specDrift.checks
    .filter((check) => check.status !== "pass")
    .map((check) => item({
      id: `spec-check-${check.id}`,
      title: check.id,
      detail: check.summary,
      severity: check.status === "fail" ? "high" : "medium",
      sourceArtifact: "spec-drift.json",
      sourceIds: [check.id],
      evidencePath: check.evidence[0]?.path ?? relativeToCwd(artifactPath(fromDir, "spec-drift.json")),
      evidenceDetail: check.evidence[0]?.detail ?? "spec-drift.checks",
    }));
}

function buildBaselineSummary(fromDir: string, readiness: ReleaseReadinessArtifact | null): PrReviewItem | undefined {
  const baseline = readiness?.baseline;
  if (!baseline) {
    return undefined;
  }

  return item({
    id: "baseline-ratchet",
    title: "Baseline ratchet summary",
    detail: `${baseline.newFindings} new, ${baseline.worsenedFindings} worsened, ${baseline.unchangedFindings} unchanged, ${baseline.resolvedFindings} resolved.`,
    severity: baseline.gatedFindingIds.length > 0 ? "medium" : "info",
    sourceArtifact: "release-readiness.json",
    sourceIds: baseline.gatedFindingIds,
    evidencePath: relativeToCwd(artifactPath(fromDir, "release-readiness.json")),
    evidenceDetail: "release-readiness.baseline",
  });
}

function buildGateExplainabilitySummary(
  fromDir: string,
  gateExplainability: GateExplainabilityArtifact | null
): PrReviewItem | undefined {
  if (!gateExplainability) {
    return undefined;
  }

  const summary = gateExplainability.summary;
  return item({
    id: "gate-explainability-summary",
    title: "Gate explainability summary",
    detail: `${summary.requiredActions} required action(s): ${summary.manualEvidenceCandidates} manual evidence, ${summary.baselineUpdateCandidates} baseline update, ${summary.severityReEvaluationCandidates} severity review.`,
    severity: summary.requiredActions > 0 ? "high" : "info",
    sourceArtifact: "gate-explainability.json",
    sourceIds: [
      ...gateExplainability.failedConditions.map((condition) => condition.id),
      ...gateExplainability.blockingFindings.map((finding) => finding.id),
    ],
    evidencePath: relativeToCwd(artifactPath(fromDir, "gate-explainability.json")),
    evidenceDetail: "gate-explainability.summary",
  });
}

function buildDriftBudgetSummary(fromDir: string, driftBudget: DriftBudgetArtifact | null): PrReviewItem | undefined {
  if (!driftBudget) {
    return undefined;
  }

  const exceeded = driftBudget.exceeded
    .map((entry) => `${entry.metric} ${entry.actual}/${entry.budget}`)
    .join(", ");
  const detail = driftBudget.status === "exceeded"
    ? `Budget exceeded: ${exceeded}. Recurring checks: ${driftBudget.recurrence.recurringChecks.map((check) => check.id).join(", ") || "none"}.`
    : `Within budget: failed ${driftBudget.current.failed}/${driftBudget.budget.failed}, warnings ${driftBudget.current.warnings}/${driftBudget.budget.warnings}, recurring checks ${driftBudget.recurrence.count}/${driftBudget.budget.recurringChecks}.`;

  return item({
    id: "drift-budget-summary",
    title: `Drift budget is ${driftBudget.status}`,
    detail,
    severity: driftBudget.status === "exceeded"
      ? (driftBudget.branchPolicy.blockOnExceeded ? "critical" : "medium")
      : "info",
    sourceArtifact: "drift-budget.json",
    sourceIds: driftBudget.exceeded.flatMap((entry) => entry.sourceIds),
    evidencePath: relativeToCwd(artifactPath(fromDir, "drift-budget.json")),
    evidenceDetail: "drift-budget.summary",
  });
}

function reviewStatus(
  readiness: ReleaseReadinessArtifact | null,
  specDrift: SpecDriftArtifact | null,
  blockReasons: PrReviewItem[],
  findings: FindingsArtifact | null,
  testPlan: TestPlanArtifact | null
): PrReviewStatus {
  if (!readiness || blockReasons.length > 0 || readiness.status === "blocked_input" || readiness.status === "failed" || specDrift?.status === "failed") {
    return "block";
  }
  if (
    readiness.status === "needs_review" ||
    readiness.status === "passed_with_risk" ||
    (findings?.findings.some((finding) => finding.severity === "critical" || finding.severity === "high") ?? false) ||
    (testPlan?.oracleGaps.length ?? 0) > 0
  ) {
    return "needs_review";
  }
  return "pass";
}

function markdownEscape(value: string): string {
  return value.replace(/\r?\n/g, " ").trim();
}

function renderItems(items: PrReviewItem[], emptyText: string): string {
  if (items.length === 0) {
    return `- ${emptyText}\n`;
  }
  return items.map((entry) => {
    const ids = entry.sourceIds.length > 0 ? ` Source: ${entry.sourceIds.join(", ")}` : "";
    return `- [${entry.severity}] ${markdownEscape(entry.title)}: ${markdownEscape(entry.detail)}${ids}`;
  }).join("\n") + "\n";
}

function renderArtifactLinks(links: PrReviewArtifactLink[]): string {
  const present = links.filter((link) => link.present);
  if (present.length === 0) {
    return "- No evidence artifact link was available.\n";
  }
  return present.map((link) => {
    const destination = link.url ?? link.path;
    const schema = link.schema ? ` schema: ${link.schema}` : "";
    const hash = link.hashSha256 ? ` hash: ${link.hashSha256.slice(0, 16)}` : "";
    return `- ${link.label}: ${destination}${schema}${hash}`;
  }).join("\n") + "\n";
}

function generateMarkdown(artifact: PrReviewArtifact): string {
  const baseline = artifact.sections.baselineSummary
    ? renderItems([artifact.sections.baselineSummary], "No baseline summary is available.")
    : "- No baseline summary is available.\n";
  const gateExplainability = artifact.sections.gateExplainabilitySummary
    ? renderItems([artifact.sections.gateExplainabilitySummary], "No gate explainability summary is available.")
    : "- No gate explainability summary is available.\n";
  const driftBudget = artifact.sections.driftBudgetSummary
    ? renderItems([artifact.sections.driftBudgetSummary], "No drift budget summary is available.")
    : "- No drift budget summary is available.\n";

  return `## code-to-gate PR Review

### Gate Verdict
- Status: ${artifact.status}
- Readiness: ${artifact.summary.readinessStatus ?? "unknown"}
- Findings: ${artifact.summary.findings} total, ${artifact.summary.critical} critical, ${artifact.summary.high} high

### Blocking Reasons
${renderItems(artifact.sections.blockReasons, "No blocking reason was found.")}

### Acceptable Risks
${renderItems(artifact.sections.acceptableReasons, "No acceptable risk evidence was found.")}

### Suggested Tests
${renderItems(artifact.sections.additionalTests, "No additional test recommendation was found.")}

### Spec Drift
${renderItems(artifact.sections.specDiffs, "No spec drift was found or no spec-drift artifact was provided.")}

### Drift Budget
${driftBudget}

### Evidence Links
${renderArtifactLinks(artifact.sections.artifactLinks)}

### Suppression / Baseline Summary
${baseline}

### Gate Explainability
${gateExplainability}
---
Generated by code-to-gate v${artifact.tool.version}
`;
}

export function createPrReview(options: PrReviewOptions): PrReviewResult {
  const fromDir = options.fromDir ?? ".qh";
  const artifactDir = path.resolve(process.cwd(), fromDir);
  if (!existsSync(artifactDir) || !statSync(artifactDir).isDirectory()) {
    throw new Error(`artifact directory not found: ${fromDir}`);
  }

  const outputs = outputPaths(fromDir, options.out, options.commentFile);
  const readiness = readOptionalJson<ReleaseReadinessArtifact>(fromDir, "release-readiness.json");
  const findings = readOptionalJson<FindingsArtifact>(fromDir, "findings.json");
  const testPlan = readOptionalJson<TestPlanArtifact>(fromDir, "test-plan.json");
  const specDrift = readOptionalJson<SpecDriftArtifact>(fromDir, "spec-drift.json");
  const ownership = readOptionalJson<OwnershipRiskArtifact>(fromDir, "ownership-risk.json");
  const releasePack = readOptionalJson<ReleasePackArtifact>(fromDir, "release-pack.json");
  const gateExplainability = readOptionalJson<GateExplainabilityArtifact>(fromDir, "gate-explainability.json");
  const driftBudget = readOptionalJson<DriftBudgetArtifact>(fromDir, "drift-budget.json");
  const header = headerFromInputs(fromDir, readiness, findings, specDrift);

  const blockReasons = buildBlockReasons(fromDir, readiness, specDrift, driftBudget, ownership, releasePack);
  const acceptableReasons = buildAcceptableReasons(fromDir, readiness, findings, specDrift, ownership, releasePack);
  const additionalTests = buildAdditionalTests(fromDir, testPlan);
  const specDiffs = buildSpecDiffs(fromDir, specDrift);
  const artifactLinks = buildArtifactLinks(fromDir, options.artifactUrl);
  const baselineSummary = buildBaselineSummary(fromDir, readiness);
  const gateExplainabilitySummary = buildGateExplainabilitySummary(fromDir, gateExplainability);
  const driftBudgetSummary = buildDriftBudgetSummary(fromDir, driftBudget);
  const status = reviewStatus(readiness, specDrift, blockReasons, findings, testPlan);

  const generatedAt = (options.now ?? new Date()).toISOString();
  const redactionProfile = options.redactionProfile ?? createRedactionProfile("private");
  const redactionSummary = createRedactionSummary(redactionProfile);
  const artifact: PrReviewArtifact = {
    version: "ctg/v1",
    generated_at: generatedAt,
    run_id: header.runId,
    repo: { root: header.repoRoot },
    tool: { name: "code-to-gate", version: options.version, plugin_versions: [] },
    artifact: "pr-review",
    schema: "pr-review@v1",
    completeness: readiness ? "complete" : "partial",
    status,
    markdown: {
      path: relativeToCwd(outputs.markdownPath),
      generated: true,
    },
    redactionProfile,
    redactionSummary,
    sections: {
      blockReasons,
      acceptableReasons,
      additionalTests,
      specDiffs,
      artifactLinks,
      ...(baselineSummary ? { baselineSummary } : {}),
      ...(gateExplainabilitySummary ? { gateExplainabilitySummary } : {}),
      ...(driftBudgetSummary ? { driftBudgetSummary } : {}),
    },
    summary: {
      blockReasons: blockReasons.length,
      acceptableReasons: acceptableReasons.length,
      additionalTests: additionalTests.length,
      specDiffs: specDiffs.length,
      artifactLinks: artifactLinks.filter((link) => link.present).length,
      readinessStatus: readiness?.status,
      findings: findings?.findings.length ?? readiness?.counts.findings ?? 0,
      critical: countSeverity(findings, "critical") || readiness?.counts.critical || 0,
      high: countSeverity(findings, "high") || readiness?.counts.high || 0,
      reviewerCandidates: ownership?.reviewerCandidates.length ?? 0,
      gateExplainabilityActions: gateExplainability?.summary.requiredActions,
      driftBudgetExceeded: driftBudget?.summary.exceeded,
    },
  };

  return {
    artifact,
    artifactPath: outputs.artifactPath,
    markdownPath: outputs.markdownPath,
    markdown: generateMarkdown(artifact),
  };
}

export function writePrReview(result: PrReviewResult): void {
  mkdirSync(path.dirname(result.artifactPath), { recursive: true });
  mkdirSync(path.dirname(result.markdownPath), { recursive: true });
  writeFileSync(result.artifactPath, JSON.stringify(result.artifact, null, 2) + "\n", "utf8");
  writeFileSync(result.markdownPath, result.markdown, "utf8");
}
