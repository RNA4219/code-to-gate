/** Private precision-review@v1 binding and reporting contract. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import type { FindingsArtifact, Finding, EvidenceRef } from "../types/artifacts.js";

export type PrecisionReviewerKind = "human" | "ai";
export type PrecisionClassification = "TP" | "FP" | "Uncertain" | "AcceptedDesign";

export interface PrecisionReviewFinding {
  finding_id: string;
  rule_id: string;
  fingerprint: string;
  evidence_ref_hashes: string[];
  classification: PrecisionClassification;
  comment?: string;
}

export interface PrecisionReviewArtifact {
  artifact: "precision-review";
  schema: "precision-review@v1";
  generated_at: string;
  run_id: string;
  findings_source: { path: string; sha256: string };
  repo: { root: string; revision: string; full_sha: string; reportable: boolean };
  reviewer: { kind: PrecisionReviewerKind; id: string };
  findings: PrecisionReviewFinding[];
  humanReviewed: boolean;
  precision_reportable: boolean;
}

export interface PrecisionReviewSummary {
  schema: "precision-review-summary@v1";
  run_id: string;
  repo: PrecisionReviewArtifact["repo"];
  findings_source: PrecisionReviewArtifact["findings_source"];
  reviewer: PrecisionReviewArtifact["reviewer"];
  counts: { total: number; tp: number; fp: number; uncertain: number; acceptedDesign: number };
  fp_rate: number | null;
  uncertain_rate: number | null;
  humanReviewed: boolean;
  precision_reportable: boolean;
  by_rule: Record<string, {
    total: number; tp: number; fp: number; uncertain: number; acceptedDesign: number; fp_rate: number | null;
  }>;
}

export interface PrecisionReviewCreateOptions {
  reviewer: { kind: PrecisionReviewerKind; id: string };
  findingsBytes?: string | Uint8Array;
  findingsPath?: string;
  repoPath?: string;
  fullSha?: string;
  generatedAt?: string;
}

const CLASSIFICATIONS: readonly PrecisionClassification[] = ["TP", "FP", "Uncertain", "AcceptedDesign"];
const SHA256 = /^[0-9a-f]{64}$/i;
const FULL_SHA = /^[0-9a-f]{40}$/i;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function evidenceRefHash(evidence: EvidenceRef): string {
  return sha256Hex(canonical(evidence));
}

function findingFingerprint(finding: Finding): string {
  return finding.fingerprint ?? sha256Hex(canonical({ id: finding.id, ruleId: finding.ruleId, evidence: finding.evidence })).slice(0, 16);
}

function sourceBytes(options: PrecisionReviewCreateOptions): string | Uint8Array | undefined {
  if (options.findingsBytes !== undefined) return options.findingsBytes;
  if (options.findingsPath) return readFileSync(options.findingsPath);
  return undefined;
}

function discoverFullSha(repoPath: string | undefined): string {
  if (!repoPath) return "unknown";
  const result = spawnSync("git", ["-C", repoPath, "rev-parse", "HEAD"], { encoding: "utf8", shell: false });
  const value = result.status === 0 ? result.stdout.trim() : "";
  return FULL_SHA.test(value) ? value.toLowerCase() : "unknown";
}

function revisionMatches(revision: string, fullSha: string): boolean {
  return revision.length > 0 && revision !== "unknown" && fullSha !== "unknown" && fullSha.toLowerCase().startsWith(revision.toLowerCase());
}

export function createPrecisionReview(
  findingsArtifact: FindingsArtifact,
  options: PrecisionReviewCreateOptions,
): PrecisionReviewArtifact {
  if (options.reviewer.kind !== "human" && options.reviewer.kind !== "ai") throw new Error("reviewer.kind must be human or ai");
  if (!options.reviewer.id.trim()) throw new Error("reviewer.id is required; no synthetic reviewer is created");
  if (options.fullSha !== undefined && !FULL_SHA.test(options.fullSha)) throw new Error("fullSha must be a 40-character commit SHA");
  const bytes = sourceBytes(options);
  const sha256 = bytes === undefined ? "unknown" : sha256Hex(bytes);
  const fullSha = options.fullSha ? options.fullSha.toLowerCase() : discoverFullSha(options.repoPath);
  const revision = findingsArtifact.repo.revision ?? "unknown";
  const sourceIds = findingsArtifact.findings.map((finding) => finding.id);
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error("duplicate source finding_id");
  const reportable = sha256 !== "unknown"
    && revisionMatches(revision, fullSha)
    && findingsArtifact.completeness === "complete"
    && findingsArtifact.repo.dirty !== true;
  const result: PrecisionReviewArtifact = {
    artifact: "precision-review",
    schema: "precision-review@v1",
    generated_at: options.generatedAt ?? new Date().toISOString(),
    run_id: findingsArtifact.run_id,
    findings_source: { path: options.findingsPath ?? "findings.json", sha256 },
    repo: { root: findingsArtifact.repo.root, revision, full_sha: fullSha, reportable },
    reviewer: options.reviewer,
    findings: findingsArtifact.findings.map((finding) => ({
      finding_id: finding.id,
      rule_id: finding.ruleId,
      fingerprint: findingFingerprint(finding),
      evidence_ref_hashes: finding.evidence.map(evidenceRefHash),
      classification: "Uncertain",
    })),
    humanReviewed: false,
    precision_reportable: false,
  };
  return result;
}

function errorsForBinding(findingsArtifact: FindingsArtifact, review: PrecisionReviewArtifact, sourceHash?: string): string[] {
  const errors: string[] = [];
  if (!review || typeof review !== "object") return ["review must be an object"];
  if (!review.reviewer || (review.reviewer.kind !== "human" && review.reviewer.kind !== "ai") || typeof review.reviewer.id !== "string" || !review.reviewer.id.trim()) errors.push("reviewer.kind and reviewer.id are required");
  if (!Array.isArray(review.findings)) return [...errors, "review.findings must be an array"];
  if (!review.findings_source || typeof review.findings_source.sha256 !== "string") errors.push("findings_source.sha256 is required");
  if (!review.repo || typeof review.repo.root !== "string" || typeof review.repo.revision !== "string" || typeof review.repo.full_sha !== "string") errors.push("repo binding is required");
  if (errors.some((error) => error === "findings_source.sha256 is required" || error === "repo binding is required")) return errors;
  if (review.artifact !== "precision-review" || review.schema !== "precision-review@v1") errors.push("review schema mismatch");
  if (review.run_id !== findingsArtifact.run_id) errors.push("run_id mismatch");
  if (review.repo.root !== findingsArtifact.repo.root) errors.push("repo.root mismatch");
  if (sourceHash === undefined) errors.push("raw findings bytes are required for validation");
  else if (review.findings_source.sha256 !== sourceHash) errors.push("findings input hash mismatch");
  if (!SHA256.test(review.findings_source.sha256)) errors.push("findings_source.sha256 must be a SHA-256 hex digest");
  if (review.repo.revision !== (findingsArtifact.repo.revision ?? "unknown")) errors.push("repo revision mismatch");
  if (review.repo.full_sha !== "unknown" && !FULL_SHA.test(review.repo.full_sha)) errors.push("repo.full_sha is invalid");
  if (review.repo.full_sha !== "unknown" && !revisionMatches(review.repo.revision, review.repo.full_sha)) errors.push("repo full SHA does not match revision");
  if (!CLASSIFICATIONS.includes(review.findings[0]?.classification as PrecisionClassification) && review.findings.length > 0) errors.push("invalid classification");

  const sourceIds = findingsArtifact.findings.map((finding) => finding.id);
  if (new Set(sourceIds).size !== sourceIds.length) errors.push("duplicate source finding_id");
  const sourceById = new Map(findingsArtifact.findings.map((finding) => [finding.id, finding]));
  const seen = new Set<string>();
  for (const [index, item] of review.findings.entries()) {
    if (seen.has(item.finding_id)) errors.push(`duplicate finding_id: ${item.finding_id}`);
    seen.add(item.finding_id);
    const source = sourceById.get(item.finding_id);
    if (!source) { errors.push(`unknown finding_id: ${item.finding_id}`); continue; }
    if (item.rule_id !== source.ruleId) errors.push(`rule_id mismatch for ${item.finding_id}`);
    if (item.fingerprint !== findingFingerprint(source)) errors.push(`fingerprint mismatch for ${item.finding_id}`);
    const expectedEvidence = source.evidence.map(evidenceRefHash);
    if (canonical(item.evidence_ref_hashes) !== canonical(expectedEvidence)) errors.push(`evidence binding mismatch for ${item.finding_id}`);
    if (!CLASSIFICATIONS.includes(item.classification)) errors.push(`invalid classification at findings[${index}]`);
  }
  for (const finding of findingsArtifact.findings) if (!seen.has(finding.id)) errors.push(`missing finding_id: ${finding.id}`);
  return errors;
}

export function validatePrecisionReview(
  findingsArtifact: FindingsArtifact,
  review: PrecisionReviewArtifact,
  sourceBytes?: string | Uint8Array,
): { valid: boolean; errors: string[] } {
  const sourceHash = sourceBytes === undefined ? undefined : sha256Hex(sourceBytes);
  const errors = errorsForBinding(findingsArtifact, review, sourceHash);
  if (sourceBytes !== undefined) {
    try {
      const parsed = JSON.parse(Buffer.from(sourceBytes).toString("utf8"));
      if (canonical(parsed) !== canonical(findingsArtifact)) errors.push("findings artifact does not match raw findings bytes");
    } catch { errors.push("raw findings bytes are not valid JSON"); }
  }
  return { valid: errors.length === 0, errors };
}

function countClassification(items: PrecisionReviewFinding[], classification: PrecisionClassification): number {
  return items.filter((item) => item.classification === classification).length;
}

function rate(fp: number, tp: number): number | null {
  const denominator = fp + tp;
  return denominator === 0 ? null : Math.round((fp / denominator) * 10000) / 100;
}

export function summarizePrecisionReview(
  findingsArtifact: FindingsArtifact,
  review: PrecisionReviewArtifact,
  sourceBytes?: string | Uint8Array,
): PrecisionReviewSummary {
  const validation = validatePrecisionReview(findingsArtifact, review, sourceBytes);
  if (!validation.valid) throw new Error(`Invalid precision review: ${validation.errors.join("; ")}`);
  const items = review.findings;
  const tp = countClassification(items, "TP");
  const fp = countClassification(items, "FP");
  const uncertain = countClassification(items, "Uncertain");
  const acceptedDesign = countClassification(items, "AcceptedDesign");
  const humanReviewed = items.length > 0 && review.reviewer.kind === "human" && uncertain === 0;
  const sourceReportable = review.findings_source.sha256 !== "unknown"
    && review.repo.revision !== "unknown"
    && FULL_SHA.test(review.repo.full_sha)
    && revisionMatches(review.repo.revision, review.repo.full_sha)
    && findingsArtifact.completeness === "complete"
    && findingsArtifact.repo.dirty !== true;
  const precisionReportable = sourceReportable && humanReviewed && tp + fp > 0;
  const byRule: PrecisionReviewSummary["by_rule"] = {};
  for (const ruleId of new Set(items.map((item) => item.rule_id))) {
    const ruleItems = items.filter((item) => item.rule_id === ruleId);
    const ruleTp = countClassification(ruleItems, "TP");
    const ruleFp = countClassification(ruleItems, "FP");
    byRule[ruleId] = { total: ruleItems.length, tp: ruleTp, fp: ruleFp, uncertain: countClassification(ruleItems, "Uncertain"), acceptedDesign: countClassification(ruleItems, "AcceptedDesign"), fp_rate: rate(ruleFp, ruleTp) };
  }
  return {
    schema: "precision-review-summary@v1",
    run_id: review.run_id,
    repo: { ...review.repo, reportable: sourceReportable },
    findings_source: review.findings_source,
    reviewer: review.reviewer,
    counts: { total: items.length, tp, fp, uncertain, acceptedDesign },
    fp_rate: rate(fp, tp),
    uncertain_rate: items.length === 0 ? null : Math.round((uncertain / items.length) * 10000) / 100,
    humanReviewed,
    precision_reportable: precisionReportable,
    by_rule: byRule,
  };
}

export function updatePrecisionReview(
  findingsArtifact: FindingsArtifact,
  review: PrecisionReviewArtifact,
  updates: Array<{ finding_id: string; classification: PrecisionClassification; comment?: string }>,
  sourceBytes?: string | Uint8Array,
): PrecisionReviewArtifact {
  const current = structuredClone(review) as PrecisionReviewArtifact;
  const byId = new Map(current.findings.map((item) => [item.finding_id, item]));
  const updateIds = new Set<string>();
  for (const update of updates) {
    if (updateIds.has(update.finding_id)) throw new Error(`duplicate update finding_id: ${update.finding_id}`);
    updateIds.add(update.finding_id);
    if (!CLASSIFICATIONS.includes(update.classification)) throw new Error(`invalid classification: ${update.classification}`);
    const item = byId.get(update.finding_id);
    if (!item) throw new Error(`unknown finding_id: ${update.finding_id}`);
    item.classification = update.classification;
    if (update.comment !== undefined) item.comment = update.comment;
  }
  const summary = summarizePrecisionReview(findingsArtifact, { ...current, humanReviewed: false, precision_reportable: false }, sourceBytes);
  current.humanReviewed = summary.humanReviewed;
  current.precision_reportable = summary.precision_reportable;
  return current;
}

export function readFindingsArtifact(path: string): { artifact: FindingsArtifact; bytes: Buffer } {
  const bytes = readFileSync(path);
  let artifact: unknown;
  try { artifact = JSON.parse(bytes.toString("utf8")); } catch { throw new Error(`Invalid JSON: ${path}`); }
  if (!artifact || typeof artifact !== "object" || (artifact as Record<string, unknown>).artifact !== "findings") throw new Error("Input is not a findings artifact");
  return { artifact: artifact as FindingsArtifact, bytes };
}
