import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

import type { FindingsArtifact, Finding } from "../types/artifacts.js";
import type { PrecisionReviewArtifact } from "./precision-review.js";

export const PRECISION_SOURCE_LIMITS = {
  maxFiles: 200,
  maxBytes: 512 * 1024,
  maxFileBytes: 128 * 1024,
  maxLines: 160,
  timeoutMs: 2000,
} as const;

export interface PrecisionCodeSnippet {
  status: "available" | "unavailable";
  path: string;
  content?: string;
  startLine?: number;
  endLine?: number;
  reason?: string;
  truncated?: boolean;
}

function safeEvidencePath(value: string): string | undefined {
  const normalized = value.replace(/\\/g, "/");
  if (!normalized || normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return undefined;
  const parts = normalized.split("/");
  if (parts.some((part) => part === "..")) return undefined;
  return parts.filter(Boolean).join("/");
}

function unavailableFor(findings: FindingsArtifact, reason: string): Map<string, PrecisionCodeSnippet[]> {
  const result = new Map<string, PrecisionCodeSnippet[]>();
  for (const finding of findings.findings) result.set(finding.id, [{ status: "unavailable", path: "", reason }]);
  return result;
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => value.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
  return normalize(left) === normalize(right);
}

function safeRepoBinding(findings: FindingsArtifact, repoPath: string): boolean {
  if (!findings.repo.root) return false;
  const actual = existsSync(repoPath) ? realpathSync(repoPath) : path.resolve(repoPath);
  if (findings.repo.root === ".") return true;
  const bound = existsSync(findings.repo.root) ? realpathSync(findings.repo.root) : path.resolve(findings.repo.root);
  return samePath(actual, bound);
}

interface LoadedCodeFile { status: "available" | "unavailable"; path: string; content?: string; reason?: string; bytes: number }

function readAtCommit(repoPath: string, fullSha: string, relativePath: string): LoadedCodeFile {
  const result = spawnSync("git", ["-c", `safe.directory=${repoPath}`, "-C", repoPath, "show", `${fullSha}:${relativePath}`], {
    shell: false,
    encoding: "utf8",
    timeout: PRECISION_SOURCE_LIMITS.timeoutMs,
    maxBuffer: PRECISION_SOURCE_LIMITS.maxFileBytes,
  });
  if (result.status !== 0) return { status: "unavailable", path: relativePath, reason: result.error ? "コード取得がtimeoutまたは上限超過です" : "対象commitからコードを取得できません", bytes: 0 };
  const bytes = Buffer.byteLength(result.stdout, "utf8");
  if (bytes > PRECISION_SOURCE_LIMITS.maxFileBytes) return { status: "unavailable", path: relativePath, reason: "ファイルbytes上限を超えるためコードを表示しません", bytes };
  return { status: "available", path: relativePath, content: result.stdout, bytes };
}

function snippetFor(file: LoadedCodeFile, evidence: { startLine?: number; endLine?: number }): PrecisionCodeSnippet {
  if (file.status !== "available" || !file.content) return file;
  const lines = file.content.split(/\r?\n/);
  const startLine = evidence.startLine;
  const endLine = evidence.endLine ?? evidence.startLine;
  if ((startLine !== undefined && (!Number.isInteger(startLine) || startLine < 1)) || (endLine !== undefined && (!Number.isInteger(endLine) || endLine < 1)) || (startLine !== undefined && endLine !== undefined && endLine < startLine) || (startLine !== undefined && startLine > lines.length) || (endLine !== undefined && endLine > lines.length)) {
    return { status: "unavailable", path: file.path, reason: "evidence line rangeが不正です" };
  }
  const start = Math.max(1, (evidence.startLine ?? 1) - 3);
  const requestedEnd = (evidence.endLine ?? evidence.startLine ?? Math.min(lines.length, 40)) + 3;
  const end = Math.min(PRECISION_SOURCE_LIMITS.maxLines + start - 1, lines.length, requestedEnd);
  const truncated = Math.min(lines.length, requestedEnd) > end;
  const content = lines.slice(start - 1, end).map((line, index) => `${start + index}: ${line}`).join("\n");
  return { status: "available", path: file.path, startLine: start, endLine: end, content: truncated ? `${content}\n…（表示上限により省略）` : content, truncated, reason: truncated ? `表示は${PRECISION_SOURCE_LIMITS.maxLines}行上限で省略されています` : undefined };
}

export function collectPrecisionCode(
  findings: FindingsArtifact,
  review: PrecisionReviewArtifact,
  repoPath?: string,
): Map<string, PrecisionCodeSnippet[]> {
  const result = new Map<string, PrecisionCodeSnippet[]>();
  if (!repoPath) return result;
  if (!safeRepoBinding(findings, repoPath)) {
    for (const finding of findings.findings) result.set(finding.id, [{ status: "unavailable", path: "", reason: "指定repoがfindingsのrepo.rootと一致しません" }]);
    return result;
  }
  if (findings.repo.dirty === true) {
    for (const finding of findings.findings) result.set(finding.id, [{ status: "unavailable", path: "", reason: "repoがdirtyのためcommit時点のコードを表示しません" }]);
    return result;
  }
  if (review.repo.full_sha === "unknown") {
    for (const finding of findings.findings) result.set(finding.id, [{ status: "unavailable", path: "", reason: "bound full SHAが不明のためコードを取得できません" }]);
    return result;
  }
  if (!/^[0-9a-f]{40}$/i.test(review.repo.full_sha)) return unavailableFor(findings, "bound full SHAが40桁hexではありません");
  const commit = spawnSync("git", ["-c", `safe.directory=${repoPath}`, "-C", repoPath, "rev-parse", "--verify", `${review.repo.full_sha}^{commit}`], { shell: false, encoding: "utf8", timeout: PRECISION_SOURCE_LIMITS.timeoutMs });
  if (commit.status !== 0 || commit.stdout.trim().toLowerCase() !== review.repo.full_sha.toLowerCase()) return unavailableFor(findings, "bound commitがrepoに存在しません");
  const cache = new Map<string, LoadedCodeFile>();
  let files = 0;
  let bytes = 0;
  for (const finding of findings.findings) {
    const snippets: PrecisionCodeSnippet[] = [];
    for (const evidence of finding.evidence) {
      const relativePath = safeEvidencePath(evidence.path);
      if (!relativePath) { snippets.push({ status: "unavailable", path: evidence.path, reason: "evidence pathがrepo相対pathとして安全ではありません" }); continue; }
      const cached = cache.get(relativePath);
      if (cached) { snippets.push(snippetFor(cached, evidence)); continue; }
      if (files >= PRECISION_SOURCE_LIMITS.maxFiles || bytes >= PRECISION_SOURCE_LIMITS.maxBytes) {
        snippets.push({ status: "unavailable", path: relativePath, reason: "コード取得の件数またはbytes上限に達しました" });
        continue;
      }
      const file = readAtCommit(repoPath, review.repo.full_sha, relativePath);
      cache.set(relativePath, file);
      files += 1;
      if (file.status === "available" && bytes + file.bytes > PRECISION_SOURCE_LIMITS.maxBytes) {
        const limited: LoadedCodeFile = { status: "unavailable", path: relativePath, reason: "総bytes上限を超えるためコードを取得しません", bytes: file.bytes };
        cache.set(relativePath, limited);
        bytes = PRECISION_SOURCE_LIMITS.maxBytes;
        snippets.push(snippetFor(limited, evidence));
      } else {
        bytes += file.bytes;
        snippets.push(snippetFor(file, evidence));
      }
    }
    result.set(finding.id, snippets);
  }
  return result;
}

export function findingForWorkbench(finding: Finding, reviewFinding: PrecisionReviewArtifact["findings"][number], snippets: PrecisionCodeSnippet[]): Record<string, unknown> {
  return {
    finding_id: reviewFinding.finding_id,
    rule_id: reviewFinding.rule_id,
    fingerprint: reviewFinding.fingerprint,
    evidence_ref_hashes: reviewFinding.evidence_ref_hashes,
    classification: reviewFinding.classification,
    comment: reviewFinding.comment ?? "",
    title: finding.title,
    summary: finding.summary,
    category: finding.category,
    severity: finding.severity,
    evidence: finding.evidence,
    snippets,
  };
}
