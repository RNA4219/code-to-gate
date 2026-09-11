import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { Finding, FindingsArtifact, ReleaseReadinessArtifact, Severity } from "../types/artifacts.js";

export interface LoadedBaselineFindings {
  artifact: FindingsArtifact;
  source: string;
  owner?: string;
  expiresAt?: string;
}

export interface BaselineRatchetSummary {
  mode: "ratchet";
  source: string;
  baselineRunId?: string;
  baselineFindings: number;
  currentFindings: number;
  newFindings: number;
  worsenedFindings: number;
  unchangedFindings: number;
  resolvedFindings: number;
  gatedFindingIds: string[];
  resolvedFindingIds: string[];
  owner?: string;
  expiresAt?: string;
  expired?: boolean;
}

export interface BaselineRatchetResult {
  gatedFindings: Finding[];
  summary: BaselineRatchetSummary;
}

const SEVERITY_RANK: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function isFindingsArtifact(value: unknown): value is FindingsArtifact {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { artifact?: unknown }).artifact === "findings" &&
    Array.isArray((value as { findings?: unknown }).findings)
  );
}

function isReleaseReadinessArtifact(value: unknown): value is ReleaseReadinessArtifact {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { artifact?: unknown }).artifact === "release-readiness"
  );
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
}

function loadFindingsFile(filePath: string): LoadedBaselineFindings | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }

  const parsed = readJsonFile(filePath);
  if (!isFindingsArtifact(parsed)) {
    return undefined;
  }

  return { artifact: parsed, source: filePath };
}

function candidateFindingsFromReadiness(
  readinessPath: string,
  readiness: ReleaseReadinessArtifact,
  cwd: string
): string[] {
  const dir = path.dirname(readinessPath);
  const ref = readiness.artifactRefs?.findings;

  // An explicit findings reference is authoritative. Keep the historical
  // cwd-relative and readiness-relative interpretations for compatibility,
  // but never fall back to a sibling file when the reference is present.
  if (ref !== undefined) {
    if (typeof ref !== "string" || !ref.trim()) {
      return [];
    }

    return [
      path.isAbsolute(ref) ? ref : path.resolve(cwd, ref),
      path.resolve(dir, ref),
    ].filter((candidate, index, candidates) => candidates.indexOf(candidate) === index);
  }

  return [path.join(dir, "findings.json")];
}

function loadReadinessLinkedFindings(filePath: string, cwd: string): LoadedBaselineFindings | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }

  const parsed = readJsonFile(filePath);
  if (!isReleaseReadinessArtifact(parsed)) {
    return undefined;
  }

  for (const candidate of candidateFindingsFromReadiness(filePath, parsed, cwd)) {
    const loaded = loadFindingsFile(candidate);
    if (loaded) {
      return {
        ...loaded,
        owner: parsed.baseline?.owner,
        expiresAt: parsed.baseline?.expiresAt,
      };
    }
  }

  if (parsed.artifactRefs?.findings !== undefined) {
    throw new Error(
      `explicit artifactRefs.findings not found: ${String(parsed.artifactRefs.findings)}`
    );
  }

  return undefined;
}

export function loadBaselineFindingsArtifact(inputPath: string, cwd: string): LoadedBaselineFindings {
  const absolutePath = path.resolve(cwd, inputPath);
  if (!existsSync(absolutePath)) {
    throw new Error(`baseline not found: ${inputPath}`);
  }

  if (statSync(absolutePath).isDirectory()) {
    // Readiness artifacts can point at the authoritative baseline findings.
    // Resolve those references before considering directory-level siblings so
    // an unrelated findings.json cannot silently replace an explicit ref.
    const readinessCandidates = [
      path.join(absolutePath, "release-readiness.json"),
      path.join(absolutePath, "baseline-release-readiness.json"),
    ];

    for (const candidate of readinessCandidates) {
      const loaded = loadReadinessLinkedFindings(candidate, cwd);
      if (loaded) {
        return loaded;
      }
    }

    const directCandidates = [
      path.join(absolutePath, "findings.json"),
      path.join(absolutePath, "baseline-findings.json"),
    ];
    for (const candidate of directCandidates) {
      const loaded = loadFindingsFile(candidate);
      if (loaded) {
        return loaded;
      }
    }

    throw new Error(`baseline findings not found in directory: ${inputPath}`);
  }

  const findings = loadFindingsFile(absolutePath);
  if (findings) {
    return findings;
  }

  const linkedFindings = loadReadinessLinkedFindings(absolutePath, cwd);
  if (linkedFindings) {
    return linkedFindings;
  }

  throw new Error(`baseline is not a findings or linked readiness artifact: ${inputPath}`);
}

function firstEvidencePath(finding: Finding): string {
  return finding.evidence[0]?.path ?? "";
}

export function findingIdentity(finding: Finding): string {
  if (finding.fingerprint) {
    return `fingerprint:${finding.fingerprint}`;
  }

  const symbols = finding.affectedSymbols?.join(",") ?? "";
  const fallback = symbols || finding.title;
  return [finding.ruleId, firstEvidencePath(finding), fallback].join("|");
}

export function evaluateBaselineRatchet(
  currentFindings: Finding[],
  baseline: LoadedBaselineFindings
): BaselineRatchetResult {
  const baselineByKey = new Map<string, Finding>();
  for (const finding of baseline.artifact.findings) {
    const key = findingIdentity(finding);
    if (!baselineByKey.has(key)) {
      baselineByKey.set(key, finding);
    }
  }

  const seenBaselineKeys = new Set<string>();
  const gatedFindings: Finding[] = [];
  let newFindings = 0;
  let worsenedFindings = 0;
  let unchangedFindings = 0;

  for (const finding of currentFindings) {
    const key = findingIdentity(finding);
    const baselineFinding = baselineByKey.get(key);

    if (!baselineFinding) {
      newFindings += 1;
      gatedFindings.push(finding);
      continue;
    }

    seenBaselineKeys.add(key);
    if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[baselineFinding.severity]) {
      worsenedFindings += 1;
      gatedFindings.push(finding);
    } else {
      unchangedFindings += 1;
    }
  }

  const resolvedFindingIds = baseline.artifact.findings
    .filter((finding) => !seenBaselineKeys.has(findingIdentity(finding)))
    .map((finding) => finding.id);
  const owner = process.env.CTG_BASELINE_OWNER ?? baseline.owner;
  const expiresAt = process.env.CTG_BASELINE_EXPIRES_AT ?? baseline.expiresAt;
  const expired = expiresAt ? Date.parse(expiresAt) < Date.now() : undefined;

  return {
    gatedFindings,
    summary: {
      mode: "ratchet",
      source: baseline.source,
      baselineRunId: baseline.artifact.run_id,
      baselineFindings: baseline.artifact.findings.length,
      currentFindings: currentFindings.length,
      newFindings,
      worsenedFindings,
      unchangedFindings,
      resolvedFindings: resolvedFindingIds.length,
      gatedFindingIds: gatedFindings.map((finding) => finding.id),
      resolvedFindingIds,
      owner,
      expiresAt,
      expired,
    },
  };
}
