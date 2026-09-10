import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { collectPrecisionCode, PRECISION_SOURCE_LIMITS } from "../precision-review-source.js";
import { createPrecisionWorkbenchFixture } from "./precision-review-fixture.js";

const childProcessMock = vi.hoisted(() => ({
  spawnSync: vi.fn(),
  realSpawnSync: undefined as unknown as typeof import("node:child_process").spawnSync,
}));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  childProcessMock.realSpawnSync = actual.spawnSync;
  return { ...actual, spawnSync: childProcessMock.spawnSync };
});

beforeEach(() => {
  childProcessMock.spawnSync.mockImplementation((...args: any[]) => childProcessMock.realSpawnSync(...(args as Parameters<typeof childProcessMock.realSpawnSync>)));
});
afterEach(() => {
  childProcessMock.spawnSync.mockReset();
});

describe("precision-review source", () => {
  it("retrieves requested ranges from an older bound commit and caps snippets", () => {
    const fixture = createPrecisionWorkbenchFixture();
    try {
      const snippets = collectPrecisionCode(fixture.findings, fixture.review, fixture.repoPath);
      const first = snippets.get("fixture-1")?.[0]; const distant = snippets.get("fixture-3")?.[0];
      expect(first?.status).toBe("available"); expect(first?.startLine).toBe(1); expect(first?.content).toContain("2:");
      expect(distant?.status).toBe("available"); expect(distant?.content).toContain("1000:");
      expect((distant?.content?.split("\n").length ?? 0)).toBeLessThanOrEqual(PRECISION_SOURCE_LIMITS.maxLines);
      const longEvidence = { ...fixture.findings, findings: fixture.findings.findings.map((finding, index) => index === 2 ? { ...finding, evidence: [{ ...finding.evidence[0], startLine: 1000, endLine: 1250 }] } : finding) };
      const limited = collectPrecisionCode(longEvidence, fixture.review, fixture.repoPath).get("fixture-3")?.[0];
      expect(limited?.truncated).toBe(true); expect(limited?.reason).toContain("上限"); expect(limited?.content).toContain("省略");
      const eofEvidence = { ...fixture.findings, findings: fixture.findings.findings.map((finding, index) => index === 0 ? { ...finding, evidence: [{ ...finding.evidence[0], startLine: 1398, endLine: 1400 }] } : finding) };
      const eof = collectPrecisionCode(eofEvidence, fixture.review, fixture.repoPath).get("fixture-1")?.[0];
      expect(eof?.truncated).toBe(false); expect(eof?.content).not.toContain("省略");
    } finally { fixture.cleanup(); }
  });

  it("does not require HEAD to remain at the bound commit", () => {
    const fixture = createPrecisionWorkbenchFixture();
    try {
      appendFileSync(`${fixture.repoPath}/sample.js`, "// later\n");
      execFileSync("git", ["-c", `safe.directory=${fixture.repoPath}`, "-C", fixture.repoPath, "add", "sample.js"]);
      execFileSync("git", ["-c", `safe.directory=${fixture.repoPath}`, "-C", fixture.repoPath, "commit", "-qm", "later"]);
      const head = execFileSync("git", ["-c", `safe.directory=${fixture.repoPath}`, "-C", fixture.repoPath, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      expect(head).not.toBe(fixture.review.repo.full_sha);
      const snippets = collectPrecisionCode(fixture.findings, fixture.review, fixture.repoPath);
      expect(snippets.get("fixture-1")?.[0].status).toBe("available");
    } finally { fixture.cleanup(); }
  });

  it("treats import artifacts with repo.root '.' as bound to the explicit repo", () => {
    const fixture = createPrecisionWorkbenchFixture();
    try {
      const imported = { ...fixture.findings, repo: { ...fixture.findings.repo, root: "." } };
      expect(collectPrecisionCode(imported, fixture.review, fixture.repoPath).get("fixture-1")?.[0].status).toBe("available");
    } finally { fixture.cleanup(); }
  });

  it("reports dirty, mismatched, unknown, malformed, and out-of-range inputs", () => {
    const fixture = createPrecisionWorkbenchFixture();
    try {
      const dirty = { ...fixture.findings, repo: { ...fixture.findings.repo, dirty: true } };
      expect(collectPrecisionCode(dirty, fixture.review, fixture.repoPath).get("fixture-1")?.[0].reason).toContain("dirty");
      expect(collectPrecisionCode(fixture.findings, fixture.review, `${fixture.root}/other`).get("fixture-1")?.[0].reason).toContain("repo.root");
      const unknown = { ...fixture.review, repo: { ...fixture.review.repo, full_sha: "unknown" } };
      expect(collectPrecisionCode(fixture.findings, unknown, fixture.repoPath).get("fixture-1")?.[0].reason).toContain("full SHA");
      const malformed = { ...fixture.review, repo: { ...fixture.review.repo, full_sha: "z".repeat(40) } };
      expect(collectPrecisionCode(fixture.findings, malformed, fixture.repoPath).get("fixture-1")?.[0].reason).toContain("40桁");
      const unsafe = { ...fixture.findings, findings: fixture.findings.findings.map((finding, index) => index === 0 ? { ...finding, evidence: [{ ...finding.evidence[0], path: "C:sample.js", startLine: 0 }] } : finding) };
      expect(collectPrecisionCode(unsafe, fixture.review, fixture.repoPath).get("fixture-1")?.[0].reason).toContain("安全");
      const outOfRange = { ...fixture.findings, findings: fixture.findings.findings.map((finding, index) => index === 0 ? { ...finding, evidence: [{ ...finding.evidence[0], startLine: 9999, endLine: 9998 }] } : finding) };
      expect(collectPrecisionCode(outOfRange, fixture.review, fixture.repoPath).get("fixture-1")?.[0].reason).toContain("range");
    } finally { fixture.cleanup(); }
  });

  it("enforces per-file and total UTF-8 byte budgets", () => {
    const fixture = createPrecisionWorkbenchFixture({ includeLargeFiles: true });
    try {
      const evidence = ["budget1.js", "budget2.js", "budget3.js", "budget4.js", "budget5.js"].map((path, index) => ({ id: `budget-${index}`, kind: "text" as const, path, startLine: 1, endLine: 1 }));
      const budgetFindings = { ...fixture.findings, findings: [{ ...fixture.findings.findings[0], evidence }] };
      const snippets = collectPrecisionCode(budgetFindings, fixture.review, fixture.repoPath).get("fixture-1") ?? [];
      expect(snippets.slice(0, 4).every((snippet) => snippet.status === "available")).toBe(true);
      expect(snippets[4]?.reason).toContain("総bytes");
      const oversize = { ...fixture.findings, findings: [{ ...fixture.findings.findings[0], evidence: [{ id: "oversize", kind: "text" as const, path: "oversize.js", startLine: 1, endLine: 1 }] }] };
      expect(collectPrecisionCode(oversize, fixture.review, fixture.repoPath).get("fixture-1")?.[0].status).toBe("unavailable");
    } finally { fixture.cleanup(); }
  });

  it("checks UTF-8 bytes even when a successful git show result exceeds the limit", () => {
    const fixture = createPrecisionWorkbenchFixture();
    try {
      const exact = "日".repeat(Math.floor(PRECISION_SOURCE_LIMITS.maxFileBytes / 3)) + "x".repeat(PRECISION_SOURCE_LIMITS.maxFileBytes % 3);
      expect(Buffer.byteLength(exact, "utf8")).toBe(PRECISION_SOURCE_LIMITS.maxFileBytes);
      let output = exact;
      childProcessMock.spawnSync.mockImplementation((command: string, args: readonly string[], options: object) => {
        if (Array.isArray(args) && args.includes("show")) return { status: 0, stdout: output, stderr: "" };
        return childProcessMock.realSpawnSync(command, args, options as never);
      });
      const oneLineFindings = { ...fixture.findings, findings: fixture.findings.findings.map((finding, index) => index === 0 ? { ...finding, evidence: [{ ...finding.evidence[0], startLine: 1, endLine: 1 }] } : finding) };
      const exactResult = collectPrecisionCode(oneLineFindings, fixture.review, fixture.repoPath).get("fixture-1")?.[0];
      expect(exactResult?.status).toBe("available");
      output = `${exact}a`;
      const oversized = collectPrecisionCode(oneLineFindings, fixture.review, fixture.repoPath).get("fixture-1")?.[0];
      expect(oversized?.status).toBe("unavailable"); expect(oversized?.content).toBeUndefined(); expect(oversized?.reason).toContain("bytes");
    } finally { vi.restoreAllMocks(); fixture.cleanup(); }
  });
});
