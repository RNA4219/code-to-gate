import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type {
  EvidenceProvenanceEntry,
  EvidenceProvenanceIndexArtifact,
  EvidenceProvenanceSurface,
  FindingsArtifact,
  PrReviewArtifact,
  ReleasePackArtifact,
} from "../types/artifacts.js";

interface ProvenanceInput {
  artifactDir: string;
  cwd: string;
  version: string;
  findings: FindingsArtifact;
  now?: Date;
}

interface SarifResult {
  ruleId?: string;
  locations?: Array<{
    physicalLocation?: {
      artifactLocation?: { uri?: string };
      region?: { startLine?: number };
    };
  }>;
  partialFingerprints?: Record<string, string>;
}

function readOptionalJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as T
      : null;
  } catch {
    return null;
  }
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function relativeToCwd(cwd: string, filePath: string): string {
  return path.relative(cwd, filePath).replace(/\\/g, "/") || ".";
}

function artifactHash(cwd: string, artifactDir: string, fileName: string): { path: string; hash: string } | null {
  const filePath = path.join(artifactDir, fileName);
  if (!existsSync(filePath)) return null;
  return { path: relativeToCwd(cwd, filePath), hash: sha256File(filePath) };
}

function anchorFor(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "entry";
}

function entry(input: {
  surface: EvidenceProvenanceSurface;
  locator: string;
  source: { path: string; hash: string };
  sourceId: string;
  line?: number;
  anchor?: string;
}): EvidenceProvenanceEntry {
  const suffix = createHash("sha256")
    .update(`${input.surface}|${input.locator}|${input.source.path}|${input.sourceId}|${input.line ?? ""}|${input.anchor ?? ""}`)
    .digest("hex")
    .slice(0, 12);
  return {
    id: `prov-${suffix}`,
    surface: input.surface,
    locator: input.locator,
    artifactPath: input.source.path,
    artifactHash: `sha256:${input.source.hash}`,
    sourceId: input.sourceId,
    ...(input.line ? { line: input.line } : {}),
    ...(input.anchor ? { anchor: input.anchor } : {}),
  };
}

function prCommentEntries(cwd: string, artifactDir: string): EvidenceProvenanceEntry[] {
  const review = readOptionalJson<PrReviewArtifact>(path.join(artifactDir, "pr-review.json"));
  const source = artifactHash(cwd, artifactDir, "pr-review.json");
  if (!review || !source) return [];

  const items = [
    ...review.sections.blockReasons,
    ...review.sections.acceptableReasons,
    ...review.sections.additionalTests,
    ...review.sections.specDiffs,
    ...(review.sections.baselineSummary ? [review.sections.baselineSummary] : []),
    ...(review.sections.gateExplainabilitySummary ? [review.sections.gateExplainabilitySummary] : []),
    ...(review.sections.driftBudgetSummary ? [review.sections.driftBudgetSummary] : []),
  ];

  return items.map((itemValue) => entry({
    surface: "pr-comment",
    locator: `pr-review.md#${anchorFor(itemValue.id)}`,
    source,
    sourceId: itemValue.sourceIds[0] ?? itemValue.id,
    anchor: anchorFor(itemValue.title),
  }));
}

function viewerEntries(cwd: string, artifactDir: string, findings: FindingsArtifact): EvidenceProvenanceEntry[] {
  const source = artifactHash(cwd, artifactDir, "findings.json");
  const reportPath = ["viewer-report.html", "report.html", "index.html"]
    .map((fileName) => path.join(artifactDir, fileName))
    .find((filePath) => existsSync(filePath));
  if (!source || !reportPath) return [];

  const reportRelative = relativeToCwd(cwd, reportPath);
  return findings.findings.map((finding) => entry({
    surface: "viewer",
    locator: `${reportRelative}#finding-${anchorFor(finding.id)}`,
    source,
    sourceId: finding.id,
    line: finding.evidence[0]?.startLine,
    anchor: `finding-${anchorFor(finding.id)}`,
  }));
}

function releasePackEntries(cwd: string, artifactDir: string): EvidenceProvenanceEntry[] {
  const releasePack = readOptionalJson<ReleasePackArtifact>(path.join(artifactDir, "release-pack.json"));
  const source = artifactHash(cwd, artifactDir, "release-pack.json");
  if (!releasePack || !source) return [];

  return releasePack.entries.map((packEntry) => entry({
    surface: "release-pack",
    locator: `${releasePack.outputs.html}#${anchorFor(packEntry.id)}`,
    source,
    sourceId: packEntry.id,
    anchor: anchorFor(packEntry.id),
  }));
}

function sarifEntries(cwd: string, artifactDir: string): EvidenceProvenanceEntry[] {
  const sarifPath = path.join(artifactDir, "results.sarif");
  const sarif = readOptionalJson<{ runs?: Array<{ results?: SarifResult[] }> }>(sarifPath);
  const source = artifactHash(cwd, artifactDir, "results.sarif");
  if (!sarif || !source) return [];

  return (sarif.runs ?? []).flatMap((run, runIndex) =>
    (run.results ?? []).map((result, resultIndex) => {
      const location = result.locations?.[0]?.physicalLocation;
      const uri = location?.artifactLocation?.uri ?? "unknown";
      const line = location?.region?.startLine;
      return entry({
        surface: "sarif",
        locator: `results.sarif#/runs/${runIndex}/results/${resultIndex}`,
        source,
        sourceId: result.partialFingerprints?.findingId ?? `${result.ruleId ?? "sarif"}:${uri}:${line ?? "?"}`,
        line,
        anchor: uri,
      });
    })
  );
}

function sourceArtifact(cwd: string, artifactDir: string, fileName: string): EvidenceProvenanceIndexArtifact["sourceArtifacts"][number] | null {
  const filePath = path.join(artifactDir, fileName);
  if (!existsSync(filePath)) return null;
  const parsed = readOptionalJson<Record<string, unknown>>(filePath);
  const schema = typeof parsed?.schema === "string" ? parsed.schema : undefined;
  return {
    path: relativeToCwd(cwd, filePath),
    hashSha256: sha256File(filePath),
    ...(schema ? { schema } : {}),
  };
}

export function generateEvidenceProvenanceIndex(input: ProvenanceInput): EvidenceProvenanceIndexArtifact {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const entries = [
    ...prCommentEntries(input.cwd, input.artifactDir),
    ...viewerEntries(input.cwd, input.artifactDir, input.findings),
    ...releasePackEntries(input.cwd, input.artifactDir),
    ...sarifEntries(input.cwd, input.artifactDir),
  ].sort((left, right) => left.id.localeCompare(right.id));
  const sourceArtifacts = [
    "findings.json",
    "pr-review.json",
    "viewer-report.html",
    "report.html",
    "index.html",
    "release-pack.json",
    "results.sarif",
  ].map((fileName) => sourceArtifact(input.cwd, input.artifactDir, fileName))
    .filter((artifact): artifact is EvidenceProvenanceIndexArtifact["sourceArtifacts"][number] => artifact !== null);

  return {
    version: "ctg/v1",
    generated_at: generatedAt,
    run_id: `evidence-provenance-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    repo: input.findings.repo,
    tool: { name: "code-to-gate", version: input.version, plugin_versions: [] },
    artifact: "evidence-provenance-index",
    schema: "evidence-provenance-index@v1",
    completeness: entries.length > 0 ? "complete" : "partial",
    entries,
    sourceArtifacts,
    summary: {
      entries: entries.length,
      prComment: entries.filter((item) => item.surface === "pr-comment").length,
      viewer: entries.filter((item) => item.surface === "viewer").length,
      releasePack: entries.filter((item) => item.surface === "release-pack").length,
      sarif: entries.filter((item) => item.surface === "sarif").length,
      sourceArtifacts: sourceArtifacts.length,
    },
    generated_by: "ctg-evidence-provenance-index-v1",
  };
}
