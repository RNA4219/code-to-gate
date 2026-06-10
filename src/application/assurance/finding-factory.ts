import type {
  EvidenceRef,
  Finding,
  UnsupportedClaim,
  UnsupportedReason,
} from "../../types/artifacts.js";
import type { HashService } from "../../types/contracts.js";
import {
  assuranceFindingTags,
  getDefaultCategory,
  getDefaultConfidence,
  getDefaultSeverity,
  ruleIdToTag,
  type AssuranceFindingRuleId,
  type UnsupportedClaimReason,
} from "../../types/assurance-findings.js";

export type AssuranceEvidenceInput = Omit<EvidenceRef, "id"> & { id?: string };

export interface CreateAssuranceFindingInput {
  ruleId: AssuranceFindingRuleId;
  title: string;
  summary: string;
  evidence: readonly AssuranceEvidenceInput[];
  affectedSymbols?: readonly string[];
  affectedEntrypoints?: readonly string[];
  tags?: readonly string[];
  confidence?: number;
  baseRef?: string;
  headRef?: string;
  identityHint?: string;
}

export interface CreateAssuranceUnsupportedClaimInput {
  ruleId: AssuranceFindingRuleId;
  claim: string;
  reason: UnsupportedClaimReason;
  sourceSection: string;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function sortedUnique(values: readonly string[] | undefined): string[] | undefined {
  if (!values) return undefined;
  return [...new Set(values)].sort();
}

function evidenceKey(evidence: AssuranceEvidenceInput, includeLines: boolean): string {
  return JSON.stringify({
    path: normalizePath(evidence.path),
    kind: evidence.kind,
    ...(includeLines ? { startLine: evidence.startLine, endLine: evidence.endLine } : {}),
    nodeId: evidence.nodeId,
    symbolId: evidence.symbolId,
    externalRef: evidence.externalRef,
  });
}

function reviewRequiredText(value: string): string {
  const trimmed = value.trim();
  return /^review required:/i.test(trimmed) ? trimmed : `Review required: ${trimmed}`;
}

export function normalizeAssuranceEvidence(
  evidence: readonly AssuranceEvidenceInput[],
  findingId: string,
  hashService: HashService
): EvidenceRef[] {
  const uniqueEvidence = new Map<string, AssuranceEvidenceInput>();
  for (const item of evidence) {
    if (item.path.trim().length === 0) {
      throw new Error("Assurance evidence requires a non-empty path");
    }
    if (item.kind === "external" && !item.externalRef) {
      throw new Error("External evidence requires an externalRef");
    }
    const normalized = { ...item, path: normalizePath(item.path) };
    if (normalized.kind === "text" && !normalized.excerptHash) {
      normalized.excerptHash = hashService.sha256(evidenceKey(normalized, true));
    }
    uniqueEvidence.set(evidenceKey(normalized, true), normalized);
  }

  return [...uniqueEvidence.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => ({
      ...item,
      id: `evidence-${findingId}-${hashService.fingerprint(key)}`,
    }));
}

export function createAssuranceFinding(
  input: CreateAssuranceFindingInput,
  hashService: HashService
): Finding {
  if (input.evidence.length === 0) {
    throw new Error("Assurance findings require at least one evidence reference");
  }
  if (
    input.confidence !== undefined &&
    (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)
  ) {
    throw new Error("Assurance finding confidence must be between 0 and 1");
  }

  const affectedSymbols = sortedUnique(input.affectedSymbols);
  const affectedEntrypoints = sortedUnique(input.affectedEntrypoints);
  const evidenceSymbolIds = sortedUnique(
    input.evidence.flatMap((evidence) => evidence.symbolId ? [evidence.symbolId] : [])
  );
  const evidenceNodeIds = sortedUnique(
    input.evidence.flatMap((evidence) => evidence.nodeId ? [evidence.nodeId] : [])
  );
  const primaryEvidencePath = [...input.evidence]
    .map((evidence) => normalizePath(evidence.path))
    .sort()[0];
  const identity = JSON.stringify({
    ruleId: input.ruleId,
    primaryEvidencePath,
    affectedSymbols,
    affectedEntrypoints,
    evidenceSymbolIds,
    evidenceNodeIds,
    baseRef: input.baseRef,
    headRef: input.headRef,
    identityHint: input.identityHint,
  });
  const fingerprint = hashService.fingerprint(identity);
  const findingId = `assurance-${ruleIdToTag(input.ruleId)}-${fingerprint}`;

  return {
    id: findingId,
    ruleId: input.ruleId,
    category: getDefaultCategory(input.ruleId),
    severity: getDefaultSeverity(input.ruleId),
    confidence: input.confidence ?? getDefaultConfidence(input.ruleId),
    title: reviewRequiredText(input.title),
    summary: reviewRequiredText(input.summary),
    evidence: normalizeAssuranceEvidence(input.evidence, findingId, hashService),
    affectedSymbols,
    affectedEntrypoints,
    tags: [...new Set([...assuranceFindingTags(input.ruleId), ...(input.tags ?? [])])].sort(),
  };
}

function schemaCompatibleUnsupportedReason(reason: UnsupportedClaimReason): UnsupportedReason {
  return reason === "partial_input" ? "missing_evidence" : reason;
}

export function createAssuranceUnsupportedClaim(
  input: CreateAssuranceUnsupportedClaimInput,
  hashService: HashService
): UnsupportedClaim {
  const identity = JSON.stringify({
    ruleId: input.ruleId,
    claim: input.claim.trim(),
    reason: input.reason,
    sourceSection: input.sourceSection,
  });

  return {
    id: `unsupported-${ruleIdToTag(input.ruleId)}-${hashService.fingerprint(identity)}`,
    claim: input.claim.trim(),
    reason: schemaCompatibleUnsupportedReason(input.reason),
    sourceSection: input.sourceSection,
  };
}
