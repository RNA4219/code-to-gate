import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  Finding,
  FindingsArtifact,
  GateExplainabilityArtifact,
  GateExplainabilityBlockingFinding,
  GateExplainabilityCandidate,
  ReleaseReadinessArtifact,
  Severity,
} from "../types/artifacts.js";
import type { EXIT, getOption } from "./exit-codes.js";
import { emitCliError, emitCliSummary } from "./output.js";

export interface ExplainGateCliOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

const VALUE_OPTIONS = new Set(["--from", "--out"]);
const FLAG_OPTIONS = new Set(["--quiet"]);
const SEVERITY_PRIORITY: Record<Severity, GateExplainabilityCandidate["priority"]> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

function printExplainGateHelp(): void {
  console.log(`code-to-gate explain-gate --from <artifact-dir> [--out <file-or-dir>] [--quiet]

Generates gate-explainability.json from release-readiness.json and findings.json.`);
}

function validateArgs(args: string[]): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (VALUE_OPTIONS.has(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) return `${arg} requires a value`;
      index += 1;
      continue;
    }
    if (FLAG_OPTIONS.has(arg) || arg === "--help" || arg === "-h") continue;
    return arg.startsWith("--") ? `unknown explain-gate option: ${arg}` : `unexpected explain-gate argument: ${arg}`;
  }
  return null;
}

function outputPath(fromDir: string, out: string | undefined): string {
  if (!out) return path.join(fromDir, "gate-explainability.json");
  const absolute = path.resolve(process.cwd(), out);
  return absolute.endsWith(".json") ? absolute : path.join(absolute, "gate-explainability.json");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function hashFile(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function sourceArtifact(fromDir: string, file: string): GateExplainabilityArtifact["sourceArtifacts"][number] {
  const filePath = path.join(fromDir, file);
  const parsed = readJson<Record<string, unknown>>(filePath);
  return {
    file,
    schema: typeof parsed.schema === "string" ? parsed.schema : undefined,
    hashSha256: hashFile(filePath),
  };
}

function matchedFindingIds(readiness: ReleaseReadinessArtifact): Set<string> {
  const ids = new Set<string>();
  for (const condition of readiness.failedConditions) {
    for (const id of condition.matchedFindingIds ?? []) ids.add(id);
  }
  return ids;
}

function sourceConditionIds(readiness: ReleaseReadinessArtifact, findingId: string): string[] {
  return readiness.failedConditions
    .filter((condition) => condition.matchedFindingIds?.includes(findingId))
    .map((condition) => condition.id);
}

function blockingFindings(readiness: ReleaseReadinessArtifact, findings: FindingsArtifact): GateExplainabilityBlockingFinding[] {
  const matchedIds = matchedFindingIds(readiness);
  return findings.findings
    .filter((finding) => matchedIds.has(finding.id))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((finding) => ({
      id: finding.id,
      ruleId: finding.ruleId,
      severity: finding.severity,
      confidence: finding.confidence,
      title: finding.title,
      summary: finding.summary,
      sourceConditionIds: sourceConditionIds(readiness, finding.id),
      evidence: finding.evidence,
    }));
}

function findingEvidence(finding: Finding | GateExplainabilityBlockingFinding): GateExplainabilityCandidate["evidence"] {
  const evidence = finding.evidence[0];
  return [{
    path: evidence?.path ?? "findings.json",
    detail: evidence ? `finding evidence ${evidence.id}` : `finding ${finding.id}`,
  }];
}

function manualEvidenceCandidates(findings: GateExplainabilityBlockingFinding[]): GateExplainabilityCandidate[] {
  return findings.map((finding) => ({
    id: `manual-evidence-${finding.id}`,
    type: "manual_evidence",
    title: `Attach manual evidence for ${finding.id}`,
    detail: `Provide a manual black-box observation, reproduction note, or owner-approved exception for "${finding.title}".`,
    priority: SEVERITY_PRIORITY[finding.severity],
    sourceIds: [finding.id, ...finding.sourceConditionIds],
    evidence: findingEvidence(finding),
  }));
}

function baselineUpdateCandidates(readiness: ReleaseReadinessArtifact): GateExplainabilityCandidate[] {
  const baseline = readiness.baseline;
  if (!baseline || (baseline.gatedFindingIds.length === 0 && !baseline.expired && baseline.owner)) {
    return [];
  }
  const details: string[] = [];
  if (baseline.gatedFindingIds.length > 0) {
    details.push(`${baseline.gatedFindingIds.length} new or worsened finding(s) are gated by baseline ratchet.`);
  }
  if (baseline.expired) details.push(`Baseline expired at ${baseline.expiresAt ?? "unknown time"}.`);
  if (!baseline.owner) details.push("Baseline has no owner.");

  return [{
    id: "baseline-update-ratchet",
    type: "baseline_update",
    title: "Refresh or retire baseline debt",
    detail: details.join(" "),
    priority: baseline.expired || baseline.gatedFindingIds.length > 0 ? "high" : "medium",
    sourceIds: baseline.gatedFindingIds,
    evidence: [{ path: "release-readiness.json", detail: "release-readiness.baseline" }],
  }];
}

function severityReviewCandidates(findings: GateExplainabilityBlockingFinding[]): GateExplainabilityCandidate[] {
  return findings
    .filter((finding) => finding.confidence < 0.8 || finding.severity === "critical" || finding.severity === "high")
    .map((finding) => ({
      id: `severity-review-${finding.id}`,
      type: "severity_re_evaluation",
      title: `Re-evaluate severity for ${finding.id}`,
      detail: `Confirm severity=${finding.severity} and confidence=${finding.confidence.toFixed(2)} before changing the gate outcome.`,
      priority: SEVERITY_PRIORITY[finding.severity],
      sourceIds: [finding.id, ...finding.sourceConditionIds],
      evidence: findingEvidence(finding),
    }));
}

export function createGateExplainability(fromDir: string, version: string, now = new Date()): GateExplainabilityArtifact {
  const readinessPath = path.join(fromDir, "release-readiness.json");
  const findingsPath = path.join(fromDir, "findings.json");
  if (!existsSync(readinessPath)) throw new Error(`release-readiness.json not found in artifact directory: ${fromDir}`);
  if (!existsSync(findingsPath)) throw new Error(`findings.json not found in artifact directory: ${fromDir}`);

  const readiness = readJson<ReleaseReadinessArtifact>(readinessPath);
  const findings = readJson<FindingsArtifact>(findingsPath);
  const blockers = blockingFindings(readiness, findings);
  const manualCandidates = manualEvidenceCandidates(blockers);
  const baselineCandidates = baselineUpdateCandidates(readiness);
  const severityCandidates = severityReviewCandidates(blockers);
  const requiredActions = manualCandidates.length + baselineCandidates.length + severityCandidates.length;

  return {
    version: "ctg/v1",
    generated_at: now.toISOString(),
    run_id: readiness.run_id,
    repo: readiness.repo,
    tool: { name: "code-to-gate", version, plugin_versions: [] },
    artifact: "gate-explainability",
    schema: "gate-explainability@v1",
    completeness: "complete",
    status: requiredActions > 0 || readiness.failedConditions.length > 0 ? "needs_action" : "passed",
    failedConditions: readiness.failedConditions,
    blockingFindings: blockers,
    manualEvidenceCandidates: manualCandidates,
    baselineUpdateCandidates: baselineCandidates,
    severityReEvaluationCandidates: severityCandidates,
    summary: {
      failedConditions: readiness.failedConditions.length,
      blockingFindings: blockers.length,
      manualEvidenceCandidates: manualCandidates.length,
      baselineUpdateCandidates: baselineCandidates.length,
      severityReEvaluationCandidates: severityCandidates.length,
      requiredActions,
    },
    sourceArtifacts: [
      sourceArtifact(fromDir, "release-readiness.json"),
      sourceArtifact(fromDir, "findings.json"),
    ],
    generated_by: "ctg-gate-explainability-v1",
  };
}

export async function explainGateCommand(args: string[], options: ExplainGateCliOptions): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printExplainGateHelp();
    return options.EXIT.OK;
  }
  const argError = validateArgs(args);
  if (argError) {
    emitCliError(argError, { code: "USAGE_ERROR", command: "explain-gate", exitCode: options.EXIT.USAGE_ERROR });
    return options.EXIT.USAGE_ERROR;
  }

  try {
    const fromDir = path.resolve(process.cwd(), options.getOption(args, "--from") ?? ".qh");
    if (!existsSync(fromDir) || !statSync(fromDir).isDirectory()) {
      throw new Error(`artifact directory not found: ${fromDir}`);
    }
    const artifact = createGateExplainability(fromDir, options.VERSION);
    const targetPath = outputPath(fromDir, options.getOption(args, "--out"));
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    emitCliSummary(args, {
      schema: "ctg.cli.summary@v1",
      tool: { name: "code-to-gate", version: options.VERSION },
      command: "explain-gate",
      status: "ok",
      exit_code: options.EXIT.OK,
      output: targetPath,
      summary: artifact.summary,
    });
    return options.EXIT.OK;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitCliError(message, { code: "EXPLAIN_GATE_FAILED", command: "explain-gate", exitCode: options.EXIT.USAGE_ERROR });
    return options.EXIT.USAGE_ERROR;
  }
}
