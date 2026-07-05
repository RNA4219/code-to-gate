import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { Finding, FindingsArtifact, ReleaseReadinessArtifact, Severity } from "../types/artifacts.js";

export interface LoadedBaselineFindings {
  artifact: FindingsArtifact;
  source: string;
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
  const candidates = [path.join(dir, "findings.json")];
  const ref = readiness.artifactRefs?.findings;

  if (ref) {
    candidates.push(path.isAbsolute(ref) ? ref : path.resolve(cwd, ref));
    candidates.push(path.resolve(dir, ref));
    candidates.push(path.join(dir, path.basename(ref)));
  }

  return [...new Set(candidates)];
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
      return loaded;
    }
  }

  return undefined;
}

export function loadBaselineFindingsArtifact(inputPath: string, cwd: string): LoadedBaselineFindings {
  const absolutePath = path.resolve(cwd, inputPath);
  if (!existsSync(absolutePath)) {
    throw new Error(`baseline not found: ${inputPath}`);
  }

  if (statSync(absolutePath).isDirectory()) {
    const candidates = [
      path.join(absolutePath, "findings.json"),
      path.join(absolutePath, "baseline-findings.json"),
      path.join(absolutePath, "release-readiness.json"),
      path.join(absolutePath, "baseline-release-readiness.json"),
    ];

    for (const candidate of candidates) {
      const loaded = candidate.endsWith("readiness.json")
        ? loadReadinessLinkedFindings(candidate, cwd)
        : loadFindingsFile(candidate);
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
    },
  };
}
