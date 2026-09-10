import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMockFindingsArtifact } from "../../test-utils/index.js";
import type { FindingsArtifact } from "../../types/artifacts.js";
import { createPrecisionReview, type PrecisionReviewArtifact } from "../precision-review.js";

export interface PrecisionWorkbenchFixture {
  root: string;
  repoPath: string;
  findingsPath: string;
  reviewPath: string;
  findings: FindingsArtifact;
  review: PrecisionReviewArtifact;
  findingsBytes: Buffer;
  cleanup: () => void;
}

function git(repoPath: string, args: string[]): string {
  return execFileSync("git", ["-c", `safe.directory=${repoPath}`, "-C", repoPath, ...args], { encoding: "utf8" }).trim();
}

export function createPrecisionWorkbenchFixture(options: { includeLargeFiles?: boolean } = {}): PrecisionWorkbenchFixture {
  const root = mkdtempSync(path.join(tmpdir(), "ctg-precision-workbench-"));
  const repoPath = path.join(root, "repo");
  mkdirSync(repoPath, { recursive: true });
  git(repoPath, ["init", "-q"]);
  git(repoPath, ["config", "user.email", "precision@example.invalid"]);
  git(repoPath, ["config", "user.name", "Precision Fixture"]);
  const source = ["// fixture source", "export function greeting(name) {", "  // TODO: document locales", "  return `Hello ${name}`;", "}"];
  for (let line = 6; line <= 1400; line += 1) source.push(`// source line ${line}`);
  writeFileSync(path.join(repoPath, "sample.js"), `${source.join("\n")}\n`, "utf8");
  if (options.includeLargeFiles) {
    for (let index = 1; index <= 5; index += 1) writeFileSync(path.join(repoPath, `budget${index}.js`), "日".repeat(40 * 1024), "utf8");
    writeFileSync(path.join(repoPath, "oversize.js"), "日".repeat(50 * 1024), "utf8");
  }
  git(repoPath, ["add", "."]); git(repoPath, ["commit", "-qm", "fixture"]);
  const fullSha = git(repoPath, ["rev-parse", "HEAD"]);
  const rootBinding = path.resolve(repoPath).replace(/\\/g, "/");
  const findings = createMockFindingsArtifact({
    generated_at: "2026-09-10T00:00:00.000Z",
    run_id: "precision-workbench-fixture",
    repo: { root: rootBinding, revision: fullSha, dirty: false },
    findings: [
      { id: "fixture-1", ruleId: "LARGE_MODULE", category: "maintainability", severity: "high", confidence: 0.9, title: "長い関数", summary: "コード根拠", evidence: [{ id: "e1", kind: "text", path: "sample.js", startLine: 2, endLine: 5 }] },
      { id: "fixture-2", ruleId: "DEBT_MARKER", category: "maintainability", severity: "low", confidence: 0.8, title: "TODO確認", summary: "検索根拠", evidence: [{ id: "e2", kind: "text", path: "sample.js", startLine: 3, endLine: 3 }] },
      { id: "fixture-3", ruleId: "TEST_FIXTURE", category: "testing", severity: "medium", confidence: 0.7, title: "表示記号 <b> & 日本語", summary: "遠い行番号", evidence: [{ id: "e3", kind: "text", path: "sample.js", startLine: 1000, endLine: 1000 }] },
    ],
  });
  const findingsBytes = Buffer.from(JSON.stringify(findings, null, 2), "utf8");
  const findingsPath = path.join(root, "findings.json"); writeFileSync(findingsPath, findingsBytes);
  const review = createPrecisionReview(findings, { reviewer: { kind: "ai", id: "fixture-ai" }, findingsBytes, findingsPath, repoPath, fullSha, generatedAt: "2026-09-10T00:01:00.000Z" });
  const reviewPath = path.join(root, "review.json"); writeFileSync(reviewPath, JSON.stringify(review, null, 2), "utf8");
  return { root, repoPath, findingsPath, reviewPath, findings, review, findingsBytes, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export function readFixtureReview(fixture: PrecisionWorkbenchFixture): PrecisionReviewArtifact {
  return JSON.parse(readFileSync(fixture.reviewPath, "utf8")) as PrecisionReviewArtifact;
}
