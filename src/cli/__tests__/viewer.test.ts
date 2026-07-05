import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { viewerCommand } from "../viewer.js";

const EXIT = {
  OK: 0,
  READINESS_NOT_CLEAR: 1,
  USAGE_ERROR: 2,
  SCAN_FAILED: 3,
  LLM_FAILED: 4,
  POLICY_FAILED: 5,
  PLUGIN_FAILED: 6,
  SCHEMA_FAILED: 7,
  IMPORT_FAILED: 8,
  INTEGRATION_EXPORT_FAILED: 9,
  INTERNAL_ERROR: 10,
  ASSURANCE_FAILED: 11,
};

const VERSION = "0.1.0";

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function writeFindingsArtifact(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "findings.json"),
    JSON.stringify({
      version: "ctg/v1",
      generated_at: "2026-07-05T00:00:00Z",
      run_id: "hosted-viewer-run",
      repo: { root: "." },
      tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
      artifact: "findings",
      schema: "findings@v1",
      completeness: "complete",
      findings: [],
      unsupported_claims: [],
    }, null, 2) + "\n",
    "utf8"
  );
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function writePortalRun(dir: string, runId: string): void {
  const header = {
    version: "ctg/v1",
    generated_at: "2026-07-05T00:00:00Z",
    run_id: runId,
    repo: { root: "." },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
  };
  writeJson(path.join(dir, "release-readiness.json"), {
    ...header,
    artifact: "release-readiness",
    schema: "release-readiness@v1",
    completeness: "complete",
    status: "passed_with_risk",
    summary: "Ready with known debt.",
    counts: { findings: 1, critical: 0, high: 1, risks: 0, testSeeds: 0, unsupportedClaims: 0 },
    failedConditions: [],
    recommendedActions: [],
    artifactRefs: {},
  });
  writeJson(path.join(dir, "historical-comparison.json"), {
    ...header,
    artifact: "historical-comparison",
    schema: "historical-comparison@v1",
    completeness: "complete",
    currentRun: { runId, artifactDir: dir },
    previousRun: { runId: "previous", artifactDir: "previous" },
    findingsComparison: { new: [], resolved: [], unchanged: [], modified: [], regressions: [], summary: { totalCurrent: 1, totalPrevious: 1, newCount: 0, resolvedCount: 0, unchangedCount: 1, modifiedCount: 0, regressionCount: 0, bySeverity: {}, byCategory: {} } },
    riskTrends: { status: "stable", signals: [], summary: { totalSignals: 0, worsening: 0, improving: 0, stable: 0 } },
    qualitySlo: { status: "breached", indicators: [{ id: "slo-high", status: "fail", summary: "High findings increased." }] },
    recommendations: [],
    generated_by: "ctg-historical-v1",
  });
  writeJson(path.join(dir, "release-pack.json"), {
    ...header,
    artifact: "release-pack",
    schema: "release-pack@v1",
    completeness: "complete",
    status: "ready",
    ci: {},
    entries: [],
    outputs: { manifest: "release-pack.json", html: "release-pack.html", zip: "release-pack.zip" },
    summary: { requiredEvidence: 0, presentRequiredEvidence: 0, missingRequiredEvidence: 0, includedArtifacts: 0, findings: 1, qegSchemaChecks: 0, manualTestCandidates: 0, changedFiles: 0 },
  });
  writeJson(path.join(dir, "manual-bb.json"), {
    version: "ctg.manual-bb/v1",
    producer: "code-to-gate",
    run_id: runId,
    scope: { repo: ".", changed_files: [], affected_entrypoints: [] },
    risk_seeds: [],
    invariant_seeds: [],
    test_seed_refs: [],
    known_gaps: [],
    oracle_gaps: [],
  });
  writeJson(path.join(dir, "pr-review.json"), {
    ...header,
    artifact: "pr-review",
    schema: "pr-review@v1",
    completeness: "complete",
    status: "needs_review",
    markdown: { path: "pr-review.md", generated: true },
    sections: { blockReasons: [], acceptableReasons: [], additionalTests: [], specDiffs: [], artifactLinks: [] },
    summary: { blockReasons: 0, acceptableReasons: 0, additionalTests: 0, specDiffs: 0, artifactLinks: 0, findings: 1, critical: 0, high: 1, reviewerCandidates: 0 },
  });
  writeJson(path.join(dir, "baseline-debt-ledger.json"), {
    ...header,
    artifact: "baseline-debt-ledger",
    schema: "baseline-debt-ledger@v1",
    completeness: "complete",
    status: "expired",
    items: [{
      id: "baseline-debt-001",
      owner: "@quality",
      expiresAt: "2026-07-01",
      expired: true,
      approver: "@lead",
      approvalReason: "Accepted debt.",
      refreshReason: "Debt expired.",
      estimatedEffort: "1d",
      preventionNote: "Add regression tests.",
      sourceArtifact: "release-readiness.json",
      sourceIds: ["finding-001"],
    }],
    summary: { items: 1, active: 0, expired: 1, unowned: 0 },
    generated_by: "ctg-baseline-ledger-v1",
  });
}

describe("viewer CLI", () => {
  let tempRoot: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-viewer-cli-"));
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("generates hosted static report manifest next to the HTML output", async () => {
    const artifactDir = path.join(tempRoot, "artifacts");
    const outDir = path.join(tempRoot, "public");
    const htmlPath = path.join(outDir, "index.html");
    const manifestPath = path.join(outDir, "hosted-static-report.json");
    writeFindingsArtifact(artifactDir);

    const exitCode = await viewerCommand([
      "--from",
      artifactDir,
      "--out",
      htmlPath,
      "--hosted",
      "--hosted-target",
      "github-pages",
      "--public-url",
      "https://example.github.io/repo/",
      "--redaction-profile",
      "regulated",
    ], { VERSION, EXIT, getOption });

    expect(exitCode).toBe(EXIT.OK);
    expect(existsSync(htmlPath)).toBe(true);
    expect(existsSync(manifestPath)).toBe(true);

    const html = readFileSync(htmlPath, "utf8");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    expect(manifest).toMatchObject({
      artifact: "hosted-static-report",
      schema: "hosted-static-report@v1",
      run_id: "hosted-viewer-run",
      target: "github-pages",
      publicUrl: "https://example.github.io/repo/",
      redactionProfile: { name: "regulated" },
      html: {
        path: path.relative(process.cwd(), htmlPath),
        hashSha256: sha256(html),
        singleFile: true,
        externalAssets: [],
      },
      security: {
        selfContained: true,
        externalNetworkRequired: false,
        inlineAssets: true,
      },
      generated_by: "ctg-viewer-hosted-v1",
    });
    expect(manifest.redactionSummary.warnings).toContain("regulated profile requires signer");
    expect(html).toContain("Redaction");
    expect(html).toContain("regulated profile requires signer");
    expect(manifest.html.sizeBytes).toBe(Buffer.byteLength(html, "utf8"));
    expect(manifest.sourceArtifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "findings",
          file: path.relative(process.cwd(), path.join(artifactDir, "findings.json")),
          schema: "findings@v1",
          hashSha256: sha256(readFileSync(path.join(artifactDir, "findings.json"))),
        }),
      ])
    );
  });

  it("rejects an unknown hosted target", async () => {
    const artifactDir = path.join(tempRoot, "artifacts");
    const htmlPath = path.join(tempRoot, "public", "index.html");
    writeFindingsArtifact(artifactDir);

    const exitCode = await viewerCommand([
      "--from",
      artifactDir,
      "--out",
      htmlPath,
      "--hosted",
      "--hosted-target",
      "ftp",
    ], { VERSION, EXIT, getOption });

    expect(exitCode).toBe(EXIT.USAGE_ERROR);
    expect(existsSync(htmlPath)).toBe(false);
  });

  it("generates hosted evidence portal manifest for multiple runs", async () => {
    const runsDir = path.join(tempRoot, "runs");
    const runOne = path.join(runsDir, "run-1");
    const runTwo = path.join(runsDir, "run-2");
    const outDir = path.join(tempRoot, "portal");
    const htmlPath = path.join(outDir, "index.html");
    const manifestPath = path.join(outDir, "hosted-evidence-portal.json");
    writePortalRun(runOne, "portal-run-1");
    writePortalRun(runTwo, "portal-run-2");

    const exitCode = await viewerCommand([
      "--portal",
      "--from",
      runsDir,
      "--out",
      htmlPath,
      "--public-url",
      "https://example.com/evidence/",
      "--redaction-profile",
      "public",
    ], { VERSION, EXIT, getOption });

    expect(exitCode).toBe(EXIT.OK);
    expect(existsSync(htmlPath)).toBe(true);
    expect(existsSync(manifestPath)).toBe(true);
    const html = readFileSync(htmlPath, "utf8");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    expect(manifest).toMatchObject({
      artifact: "hosted-evidence-portal",
      schema: "hosted-evidence-portal@v1",
      publicUrl: "https://example.com/evidence/",
      html: {
        path: path.relative(process.cwd(), htmlPath),
        hashSha256: sha256(html),
        singleFile: true,
        externalAssets: [],
      },
      security: {
        selfContained: true,
        externalNetworkRequired: false,
        inlineAssets: true,
      },
      summary: {
        runs: 2,
        manualBb: 2,
        releasePacks: 2,
        prReviews: 2,
        baselineDebtExpired: 2,
      },
      generated_by: "ctg-viewer-portal-v1",
    });
    expect(manifest.runs.map((run: { id: string }) => run.id)).toEqual(["portal-run-1", "portal-run-2"]);
    expect(manifest.searchIndex.some((entry: { type: string; title: string }) => entry.type === "pr-review" && entry.title === "pr-review.json")).toBe(true);
    expect(html).toContain("code-to-gate Evidence Portal");
    expect(html).toContain("portal-run-1");
    expect(html).toContain("Release Pack");
    expect(html).toContain("Manual BB");
    expect(html).toContain("baseline debt");
  });
});
