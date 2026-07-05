import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseZipFile } from "../../evidence/zip-utils.js";
import { releasePackCommand } from "../release-pack.js";

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

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function writeReleaseEvidence(dir: string): void {
  const header = {
    version: "ctg/v1",
    generated_at: "2026-07-05T00:00:00Z",
    run_id: "release-pack-run",
    repo: { root: "." },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
  };

  writeJson(path.join(dir, "qeg-code-to-gate.json"), {
    version: "ctg.qeg-input/v1",
    producer: "code-to-gate",
    run_id: "release-pack-run",
    artifact_dir: dir,
    findings_summary: {
      total: 2,
      by_severity: { high: 1, medium: 1 },
      by_category: { security: 2 },
      by_rule: { HARDCODED_SECRET: 1, RAW_SQL: 1 },
    },
    readiness_status: "needs_review",
    schema_compliance: [{ artifact: "findings.json", status: "ok" }],
    quality_checks_actual: [{ name: "schema", status: "pass", details: "schemas valid" }],
    artifact_hashes: [
      {
        artifact: "findings",
        path: path.join(dir, "findings.json"),
        hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    ],
  });

  writeJson(path.join(dir, "audit.json"), {
    ...header,
    artifact: "audit",
    schema: "audit@v1",
    inputs: [],
    policy: { id: "strict", hash: "abc123" },
    exit: { code: 1, status: "needs_review", reason: "review required" },
  });

  writeJson(path.join(dir, "diff-analysis.json"), {
    ...header,
    repo: { root: ".", base_ref: "main", head_ref: "HEAD" },
    artifact: "diff-analysis",
    schema: "diff-analysis@v1",
    changed_files: [
      { path: "src/order.ts", status: "modified", additions: 2, deletions: 1 },
      { path: "src/payment.ts", status: "modified", additions: 1, deletions: 0 },
    ],
    blast_radius: {
      affectedFiles: ["src/order.ts", "src/payment.ts"],
      affectedSymbols: [],
      affectedTests: ["src/order.test.ts"],
      affectedEntrypoints: [],
    },
    diff_findings: {
      new_findings: [],
      potentially_affected_findings: [],
      resolved_findings: [],
    },
  });

  writeJson(path.join(dir, "release-readiness.json"), {
    ...header,
    artifact: "release-readiness",
    schema: "release-readiness@v1",
    status: "needs_review",
    completeness: "complete",
    summary: "Review required",
    counts: {
      findings: 2,
      critical: 0,
      high: 1,
      risks: 1,
      testSeeds: 0,
      unsupportedClaims: 0,
    },
    failedConditions: [{ id: "high", reason: "high finding present" }],
    recommendedActions: ["Review high finding."],
    artifactRefs: { findings: path.join(dir, "findings.json") },
  });

  writeJson(path.join(dir, "manual-bb.json"), {
    version: "ctg.manual-bb/v1",
    producer: "code-to-gate",
    run_id: "release-pack-run",
    scope: {
      repo: ".",
      changed_files: ["src/order.ts"],
      affected_entrypoints: [],
    },
    risk_seeds: [{ id: "risk-1", title: "Review auth", severity: "high", evidence: ["src/order.ts:1"], suggested_test_intents: [] }],
    invariant_seeds: [],
    test_seed_refs: [],
    known_gaps: [],
    oracle_gaps: ["Manual verification needed"],
  });

  writeJson(path.join(dir, "findings.json"), {
    ...header,
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings: [],
    unsupported_claims: [],
  });

  writeJson(path.join(dir, "pr-review.json"), {
    ...header,
    artifact: "pr-review",
    schema: "pr-review@v1",
    completeness: "complete",
    status: "needs_review",
    markdown: { path: "pr-review.md", generated: true },
    sections: {
      blockReasons: [],
      acceptableReasons: [],
      additionalTests: [],
      specDiffs: [],
      artifactLinks: [],
    },
    summary: {
      blockReasons: 0,
      acceptableReasons: 0,
      additionalTests: 0,
      specDiffs: 0,
      artifactLinks: 0,
      findings: 2,
      critical: 0,
      high: 1,
      reviewerCandidates: 0,
    },
  });
  writeFileSync(path.join(dir, "pr-review.md"), "## code-to-gate PR Review\n", "utf8");
  writeJson(path.join(dir, "gate-explainability.json"), {
    ...header,
    artifact: "gate-explainability",
    schema: "gate-explainability@v1",
    completeness: "complete",
    status: "needs_action",
    failedConditions: [{ id: "high", reason: "high finding present", matchedFindingIds: ["finding-001"] }],
    blockingFindings: [],
    manualEvidenceCandidates: [{
      id: "manual-evidence-finding-001",
      type: "manual_evidence",
      title: "Attach manual evidence for finding-001",
      detail: "Provide manual evidence.",
      priority: "high",
      sourceIds: ["finding-001"],
      evidence: [{ path: "findings.json", detail: "finding evidence" }],
    }],
    baselineUpdateCandidates: [],
    severityReEvaluationCandidates: [],
    summary: {
      failedConditions: 1,
      blockingFindings: 0,
      manualEvidenceCandidates: 1,
      baselineUpdateCandidates: 0,
      severityReEvaluationCandidates: 0,
      requiredActions: 1,
    },
    sourceArtifacts: [{ file: "release-readiness.json", schema: "release-readiness@v1", hashSha256: "a".repeat(64) }],
    generated_by: "ctg-gate-explainability-v1",
  });
  writeJson(path.join(dir, "hosted-static-report.json"), {
    ...header,
    artifact: "hosted-static-report",
    schema: "hosted-static-report@v1",
    completeness: "complete",
    target: "github-pages",
    publicUrl: "https://example.github.io/repo/",
    html: {
      path: "public/index.html",
      hashSha256: "b".repeat(64),
      sizeBytes: 128,
      singleFile: true,
      externalAssets: [],
    },
    sourceArtifacts: [],
    security: {
      selfContained: true,
      externalNetworkRequired: false,
      inlineAssets: true,
    },
    compatibleHosts: ["github-pages", "artifact-preview", "generic-static"],
    generated_by: "ctg-viewer-hosted-v1",
  });
}

describe("release-pack CLI", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-release-pack-"));
  });

  afterEach(() => {
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("generates manifest, HTML, and ZIP when required evidence is present", async () => {
    const artifactDir = path.join(tempRoot, "artifacts");
    const outDir = path.join(tempRoot, "release-pack");
    writeReleaseEvidence(artifactDir);

    const exitCode = await releasePackCommand([
      "--from",
      artifactDir,
      "--out",
      outDir,
      "--ci-url",
      "https://github.com/example/repo/actions/runs/123",
      "--include-optional",
      "--quiet",
    ], { VERSION, EXIT, getOption });
    const manifest = JSON.parse(readFileSync(path.join(outDir, "release-pack.json"), "utf8"));
    const html = readFileSync(path.join(outDir, "release-pack.html"), "utf8");
    const zipEntries = parseZipFile(readFileSync(path.join(outDir, "release-pack.zip")));

    expect(exitCode).toBe(EXIT.OK);
    expect(manifest).toMatchObject({
      artifact: "release-pack",
      schema: "release-pack@v1",
      status: "ready",
      completeness: "complete",
      summary: {
        missingRequiredEvidence: 0,
        findings: 2,
        readinessStatus: "needs_review",
        manualTestCandidates: 2,
        changedFiles: 2,
        gateExplainabilityActions: 1,
      },
    });
    expect(manifest.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "qeg", present: true, hashSha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
        expect.objectContaining({ id: "ci-url", present: true }),
        expect.objectContaining({ id: "findings", present: true }),
        expect.objectContaining({ id: "pr-review-comment", present: true }),
        expect.objectContaining({ id: "gate-explainability", present: true }),
        expect.objectContaining({ id: "hosted-static-report", present: true }),
      ])
    );
    expect(html).toContain("https://github.com/example/repo/actions/runs/123");
    expect(html).toContain("https://example.github.io/repo/");
    expect(html).toContain("Release Summary");
    expect(html).toContain("Gate Actions");
    expect(zipEntries.has("release-pack.json")).toBe(true);
    expect(zipEntries.has("release-pack.html")).toBe(true);
    expect(zipEntries.has("artifacts/qeg-code-to-gate.json")).toBe(true);
    expect(zipEntries.has("artifacts/pr-review.md")).toBe(true);
    expect(zipEntries.has("artifacts/gate-explainability.json")).toBe(true);
    expect(zipEntries.has("artifacts/hosted-static-report.json")).toBe(true);
  });

  it("returns READINESS_NOT_CLEAR and records missing required evidence", async () => {
    const artifactDir = path.join(tempRoot, "artifacts");
    const outDir = path.join(tempRoot, "release-pack");
    mkdirSync(artifactDir, { recursive: true });
    writeReleaseEvidence(artifactDir);
    rmSync(path.join(artifactDir, "manual-bb.json"));

    const exitCode = await releasePackCommand([
      "--from",
      artifactDir,
      "--out",
      outDir,
      "--ci-url",
      "https://github.com/example/repo/actions/runs/123",
      "--quiet",
    ], { VERSION, EXIT, getOption });
    const manifest = JSON.parse(readFileSync(path.join(outDir, "release-pack.json"), "utf8"));

    expect(exitCode).toBe(EXIT.READINESS_NOT_CLEAR);
    expect(manifest.status).toBe("partial");
    expect(manifest.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "manual-bb", present: false, kind: "required" }),
      ])
    );
  });
});
