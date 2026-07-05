/**
 * Tests for export CLI command - V1 Schema
 *
 * Updated for v1 schema as default
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { exportCommand } from "../export.js";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

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
};

const VERSION = "0.1.0";

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

// Helper: Create findings artifact
function createFindingsArtifact(findings: object[] = [], overrides = {}): object {
  return {
    version: "ctg/v1",
    generated_at: new Date().toISOString(),
    run_id: "export-test-run",
    repo: { root: "/test/repo" },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings,
    unsupported_claims: [],
    ...overrides,
  };
}

// Helper: Create finding
function createFinding(overrides = {}): object {
  return {
    id: "finding-001",
    ruleId: "TEST_RULE",
    category: "security",
    severity: "medium",
    confidence: 0.9,
    title: "Test finding",
    summary: "Test summary",
    evidence: [{ id: "ev-1", path: "src/test.ts", startLine: 10 }],
    ...overrides,
  };
}

// Helper: Write findings to directory
function writeFindings(dir: string, findings: object[]): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "findings.json"), JSON.stringify(createFindingsArtifact(findings)), "utf8");
}

function writeReadiness(dir: string, status = "passed"): void {
  writeFileSync(path.join(dir, "release-readiness.json"), JSON.stringify({
    version: "ctg/v1",
    generated_at: new Date().toISOString(),
    run_id: "export-test-run",
    repo: { root: "/test/repo" },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
    artifact: "release-readiness",
    schema: "release-readiness@v1",
    completeness: "complete",
    status,
    summary: "All policy conditions met, release ready",
    counts: { findings: 1, critical: 1, high: 0, risks: 0, testSeeds: 0, unsupportedClaims: 0 },
    failedConditions: [],
    recommendedActions: [],
    artifactRefs: {},
  }), "utf8");
}

// Helper: Run export and get result
async function runExport(target: string, fromDir: string, outFile?: string): Promise<{ exitCode: number; output: object }> {
  const args = outFile
    ? [target, "--from", fromDir, "--out", outFile]
    : [target, "--from", fromDir];
  const result = await exportCommand(args, { VERSION, EXIT, getOption });
  const outputPath = outFile || path.join(fromDir, getExpectedOutputFile(target));
  const output = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, "utf8")) : {};
  return { exitCode: result, output };
}

// Helper: Get expected output filename for each target (v1 schema is default)
function getExpectedOutputFile(target: string): string {
  const v1Files: Record<string, string> = {
    "gatefield": "gatefield.json",
    "state-gate": "state-gate.json",
    "manual-bb": "manual-bb.json",
    "workflow-evidence": "workflow.json",
    "sarif": "results.sarif",
    "hate-qeg-bundle": "hate-qeg-bundle.json",
    "evidence-dag": "evidence-dag.json",
    "provenance-index": "evidence-provenance-index.json",
  };
  return v1Files[target] || "";
}

describe("export CLI", () => {
  let tempOutDir: string;

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-export-test-${Date.now()}`);
    mkdirSync(tempOutDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempOutDir)) rmSync(tempOutDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
      mkdirSync(tempOutDir, { recursive: true });
    }
  });

  describe("all export targets", () => {
    const targets = ["gatefield", "state-gate", "manual-bb", "workflow-evidence", "sarif"];

    it("generates valid output with correct schema for all targets", async () => {
      for (const target of targets) {
        const targetDir = path.join(tempOutDir, target);
        writeFindings(targetDir, [createFinding()]);
        const { exitCode, output } = await runExport(target, targetDir);

        expect(exitCode).toBe(EXIT.OK);
        expect(existsSync(path.join(targetDir, getExpectedOutputFile(target)))).toBe(true);

        // Schema validation
        if (target === "sarif") {
          expect(output.$schema).toContain("sarif-schema-2.1.0");
          expect(output.version).toBe("2.1.0");
          expect(Array.isArray(output.runs)).toBe(true);
          expect(output.runs[0].tool.driver.name).toBe("code-to-gate");
        } else {
          expect(output.version).toContain("ctg");
          expect(output.producer).toBe("code-to-gate");
        }
      }
    });
  });

  describe("five-tool export targets", () => {
    it("generates QEOS-039/040 dedicated manual-bb seeds", async () => {
      writeFindings(tempOutDir, [createFinding({ severity: "critical" })]);

      const exitCode = await exportCommand(
        ["manual-bb", "--scope", "qeos-039-040", "--from", tempOutDir, "--out", path.join(tempOutDir, "manual-bb.json")],
        { VERSION, EXIT, getOption }
      );
      const output = JSON.parse(readFileSync(path.join(tempOutDir, "manual-bb.json"), "utf8"));

      expect(exitCode).toBe(EXIT.OK);
      expect(output.version).toBe("ctg.manual-bb/v1");
      expect(output.risk_seeds.map((risk: { id: string }) => risk.id)).toEqual(expect.arrayContaining([
        "risk-qeos-039-baseline-debt-surface",
        "risk-qeos-040-cross-run-search-gap",
        "risk-qeos-040-redaction-profile-drift",
      ]));
      expect(output.oracle_gaps.join("\n")).toContain("QEOS-040");
    });

    it("generates HATE QEG bundle evidence with raw finding debt visibility", async () => {
      writeFindings(tempOutDir, [createFinding({ severity: "critical" })]);
      writeReadiness(tempOutDir, "passed");

      const { exitCode, output } = await runExport("hate-qeg-bundle", tempOutDir);

      expect(exitCode).toBe(EXIT.OK);
      expect(output.metadata.qegVersion).toBe("0.1");
      expect(output.summary.producer).toBe("hate");
      expect(output.summary.raw_findings.critical).toBe(1);
      expect(output.completeness.partial).toBe(true);
    });

    it("generates QEG gate fixture with expected verdict", async () => {
      writeFindings(tempOutDir, [createFinding({ severity: "critical" })]);
      writeReadiness(tempOutDir, "passed");

      const outDir = path.join(tempOutDir, "qeg-gate");
      const exitCode = await exportCommand(["qeg-gate-input", "--from", tempOutDir, "--out", outDir], { VERSION, EXIT, getOption });
      const gateInput = JSON.parse(readFileSync(path.join(outDir, "gate-input.json"), "utf8"));
      const expectedVerdict = JSON.parse(readFileSync(path.join(outDir, "expected-gate-verdict.json"), "utf8"));

      expect(exitCode).toBe(EXIT.OK);
      expect(gateInput.metadata.producerChecks[0].readinessStatus).toBe("passed");
      expect(gateInput.graph.nodes.some((node: { id: string }) => node.id === "ctg:finding-debt-summary")).toBe(true);
      expect(expectedVerdict.expectedVerdict).toBe("go");
    });
  });

  describe("provenance-index export", () => {
    it("indexes human surfaces back to source artifacts", async () => {
      const finding = createFinding({ id: "finding-001", evidence: [{ id: "ev-1", path: "src/test.ts", startLine: 10 }] });
      writeFindings(tempOutDir, [finding]);
      writeFileSync(path.join(tempOutDir, "viewer-report.html"), "<!doctype html><div id=\"finding-finding-001\"></div>", "utf8");
      writeFileSync(path.join(tempOutDir, "pr-review.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2026-07-05T00:00:00Z",
        run_id: "pr-review-run",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
        artifact: "pr-review",
        schema: "pr-review@v1",
        completeness: "complete",
        status: "needs_review",
        markdown: { path: "pr-review.md", generated: true },
        sections: {
          blockReasons: [{
            id: "block-finding-001",
            title: "Finding blocks release",
            detail: "High finding requires review.",
            severity: "high",
            sourceArtifact: "findings.json",
            sourceIds: ["finding-001"],
            evidence: [{ path: "findings.json", detail: "findings[0]" }],
          }],
          acceptableReasons: [],
          additionalTests: [],
          specDiffs: [],
          artifactLinks: [],
        },
        summary: { blockReasons: 1, acceptableReasons: 0, additionalTests: 0, specDiffs: 0, artifactLinks: 0, findings: 1, critical: 0, high: 1, reviewerCandidates: 0 },
      }), "utf8");
      writeFileSync(path.join(tempOutDir, "release-pack.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2026-07-05T00:00:00Z",
        run_id: "release-pack-run",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
        artifact: "release-pack",
        schema: "release-pack@v1",
        completeness: "complete",
        status: "ready",
        ci: {},
        entries: [{
          id: "findings",
          role: "findings",
          label: "Findings",
          kind: "required",
          present: true,
          sourcePath: "findings.json",
          packPath: "artifacts/findings.json",
        }],
        outputs: { manifest: ".qh/release-pack.json", html: ".qh/release-pack/release-pack.html", zip: ".qh/release-pack.zip" },
        summary: { requiredEvidence: 1, presentRequiredEvidence: 1, missingRequiredEvidence: 0, includedArtifacts: 1, findings: 1, qegSchemaChecks: 0, manualTestCandidates: 0, changedFiles: 0 },
      }), "utf8");
      writeFileSync(path.join(tempOutDir, "results.sarif"), JSON.stringify({
        version: "2.1.0",
        runs: [{
          results: [{
            ruleId: "TEST_RULE",
            partialFingerprints: { findingId: "finding-001" },
            locations: [{ physicalLocation: { artifactLocation: { uri: "src/test.ts" }, region: { startLine: 10 } } }],
          }],
        }],
      }), "utf8");

      const { exitCode, output } = await runExport("provenance-index", tempOutDir);

      expect(exitCode).toBe(EXIT.OK);
      expect(output.artifact).toBe("evidence-provenance-index");
      expect(output.schema).toBe("evidence-provenance-index@v1");
      expect(output.summary.entries).toBeGreaterThanOrEqual(4);
      expect(output.entries.map((entry: { surface: string }) => entry.surface)).toEqual(
        expect.arrayContaining(["pr-comment", "viewer", "release-pack", "sarif"])
      );
      expect(output.entries.some((entry: { sourceId: string }) => entry.sourceId === "finding-001")).toBe(true);
    });
  });

  describe("gatefield export", () => {
    it("generates gatefield v1 with all required fields", async () => {
      writeFindings(tempOutDir, [createFinding()]);
      const { exitCode, output } = await runExport("gatefield", tempOutDir);

      expect(exitCode).toBe(EXIT.OK);
      expect(output.version).toBe("ctg.gatefield/v1");
      expect(output.producer).toBe("code-to-gate");

      // Status
      const validStatuses = ["passed", "warning", "blocked_input", "failed"];
      expect(validStatuses).toContain(output.status);

      // Signals array
      expect(Array.isArray(output.signals)).toBe(true);

      // Gate hint
      expect(["pass", "hold", "block"]).toContain(output.non_binding_gate_hint);

      // Metadata
      expect(output.run_id).toBeDefined();
      expect(output.repo).toBeDefined();
      expect(output.artifact_hash).toMatch(/^sha256:/);
    });

    it("status reflects findings severity", async () => {
      // Critical -> blocked_input or warning
      const criticalDir = path.join(tempOutDir, "critical");
      writeFindings(criticalDir, [createFinding({ severity: "critical" })]);
      const { output: blocked } = await runExport("gatefield", criticalDir);
      expect(["blocked_input", "warning", "failed"]).toContain(blocked.status);

      // Low -> passed
      const lowDir = path.join(tempOutDir, "low");
      writeFindings(lowDir, [createFinding({ severity: "low", category: "maintainability" })]);
      const { output: passed } = await runExport("gatefield", lowDir);
      expect(["passed", "warning"]).toContain(passed.status);
    });
  });

  describe("state-gate export", () => {
    it("generates state-gate v1 with all required fields", async () => {
      writeFindings(tempOutDir, [createFinding()]);
      const { exitCode, output } = await runExport("state-gate", tempOutDir);

      expect(exitCode).toBe(EXIT.OK);
      expect(output.version).toBe("ctg.state-gate/v1");
      expect(output.producer).toBe("code-to-gate");

      // Release readiness
      expect(output.release_readiness).toBeDefined();
      expect(output.release_readiness.status).toBeDefined();
      expect(["passed", "passed_with_risk", "needs_review", "blocked_input", "failed"]).toContain(output.release_readiness.status);

      // Evidence refs
      expect(Array.isArray(output.evidence_refs)).toBe(true);

      // Approval relevance
      expect(output.approval_relevance).toBeDefined();

      // Metadata
      expect(output.artifact_hash).toMatch(/^sha256:/);
    });

    it("confidence reflects findings severity", async () => {
      // Empty findings -> passed
      const emptyDir = path.join(tempOutDir, "empty");
      writeFindings(emptyDir, []);
      const { output: highConfidence } = await runExport("state-gate", emptyDir);
      expect(highConfidence.release_readiness.status).toBe("passed");

      // Critical findings -> blocked_input or needs_review
      const criticalDir = path.join(tempOutDir, "critical-state");
      writeFindings(criticalDir, [createFinding({ severity: "critical" })]);
      const { output: lowConfidence } = await runExport("state-gate", criticalDir);
      expect(["blocked_input", "needs_review", "failed"]).toContain(lowConfidence.release_readiness.status);
    });
  });

  describe("manual-bb export", () => {
    it("generates risk seeds from high/critical findings", async () => {
      writeFindings(tempOutDir, [
        createFinding({ severity: "critical" }),
        createFinding({ severity: "high" }),
      ]);
      const { exitCode, output } = await runExport("manual-bb", tempOutDir);

      expect(exitCode).toBe(EXIT.OK);
      expect(output.version).toBe("ctg.manual-bb/v1");
      expect(output.producer).toBe("code-to-gate");

      // Scope
      expect(output.scope).toBeDefined();
      expect(output.scope.repo).toBeDefined();

      // Risk seeds
      expect(Array.isArray(output.risk_seeds)).toBe(true);

      // Invariant seeds
      expect(Array.isArray(output.invariant_seeds)).toBe(true);

      // Known gaps
      expect(Array.isArray(output.known_gaps)).toBe(true);
    });

    it("includes known gaps and oracle gaps for manual test planning", async () => {
      writeFindings(tempOutDir, [
        createFinding({
          id: "finding-low-confidence",
          confidence: 0.55,
          category: "security",
          ruleId: "LOW_CONFIDENCE_RULE",
        }),
        createFinding({
          id: "finding-testing-oracle",
          category: "testing",
          ruleId: "MISSING_TEST_COVERAGE",
        }),
      ]);

      const { exitCode, output } = await runExport("manual-bb", tempOutDir);

      expect(exitCode).toBe(EXIT.OK);
      expect(Array.isArray(output.known_gaps)).toBe(true);
      expect(Array.isArray(output.oracle_gaps)).toBe(true);
      expect(output.known_gaps).toEqual(
        expect.arrayContaining([expect.stringContaining("LOW_CONFIDENCE_RULE")])
      );
      expect(output.oracle_gaps).toEqual(
        expect.arrayContaining([expect.stringContaining("MISSING_TEST_COVERAGE")])
      );
    });
  });

  describe("workflow-evidence export", () => {
    it("generates workflow v1 with artifacts and summary", async () => {
      writeFindings(tempOutDir, [createFinding()]);
      const { exitCode, output } = await runExport("workflow-evidence", tempOutDir);

      expect(exitCode).toBe(EXIT.OK);
      expect(output.version).toBe("ctg.workflow-evidence/v1");
      expect(output.producer).toBe("code-to-gate");

      // Evidence type
      expect(output.evidence_type).toBeDefined();
      expect(["release-readiness", "pr-risk-scan", "quality-scan"]).toContain(output.evidence_type);

      // Subject
      expect(output.subject).toBeDefined();

      // Artifacts array
      expect(Array.isArray(output.artifacts)).toBe(true);
      for (const artifact of output.artifacts) {
        expect(artifact.name).toBeDefined();
        expect(artifact.path).toBeDefined();
        expect(artifact.hash).toBeDefined();
      }

      // Summary
      expect(output.summary).toBeDefined();
      expect(output.summary.status).toBeDefined();
    });
  });

  describe("evidence-dag export", () => {
    it("generates a cross-artifact DAG from findings, readiness, and manual-bb evidence", async () => {
      writeFindings(tempOutDir, [
        createFinding({
          id: "finding-auth",
          ruleId: "WEAK_AUTH_GUARD",
          category: "auth",
          severity: "high",
          title: "Weak auth guard",
        }),
      ]);
      writeFileSync(
        path.join(tempOutDir, "release-readiness.json"),
        JSON.stringify({
          version: "ctg/v1",
          generated_at: new Date().toISOString(),
          run_id: "export-test-run",
          repo: { root: "/test/repo" },
          tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
          artifact: "release-readiness",
          schema: "release-readiness@v1",
          status: "blocked_input",
          completeness: "complete",
          summary: "Blocked by auth finding",
          counts: {
            findings: 1,
            critical: 0,
            high: 1,
            risks: 0,
            testSeeds: 0,
            unsupportedClaims: 0,
          },
          failedConditions: [],
          recommendedActions: [],
          artifactRefs: { findings: "findings.json" },
        }),
        "utf8"
      );
      writeFileSync(
        path.join(tempOutDir, "manual-bb.json"),
        JSON.stringify({
          version: "ctg.manual-bb/v1",
          producer: "code-to-gate",
          run_id: "export-test-run",
          scope: { repo: "/test/repo", changed_files: [], affected_entrypoints: [] },
          risk_seeds: [
            {
              id: "risk-finding-auth",
              title: "Manual auth verification",
              severity: "high",
              evidence: ["src/test.ts:10"],
              suggested_test_intents: ["negative", "abuse"],
            },
          ],
          invariant_seeds: [],
          test_seed_refs: [],
          known_gaps: [],
          oracle_gaps: ["Pen-test verification"],
        }),
        "utf8"
      );
      writeFileSync(
        path.join(tempOutDir, "pr-review.md"),
        ["## Evidence links", "- Findings: findings.json", "- Readiness: release-readiness.json"].join("\n"),
        "utf8"
      );

      const { exitCode, output } = await runExport("evidence-dag", tempOutDir);

      expect(exitCode).toBe(EXIT.OK);
      expect(output.artifact).toBe("evidence-dag");
      expect(output.schema).toBe("evidence-dag@v1");
      expect(output.summary.findings).toBe(1);

      const nodes = output.nodes as Array<{ id: string; type: string }>;
      const edges = output.edges as Array<{ source: string; target: string; type: string }>;
      expect(nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "requirement:QEOS-001", type: "requirement" }),
        expect.objectContaining({ id: "rule:WEAK_AUTH_GUARD", type: "rule" }),
        expect.objectContaining({ id: "finding:finding-auth", type: "finding" }),
        expect.objectContaining({ id: "artifact:findings", type: "artifact" }),
        expect.objectContaining({ id: "artifact:pr-review-comment", type: "artifact" }),
        expect.objectContaining({ id: "verdict:blocked_input", type: "verdict" }),
        expect.objectContaining({ id: "manual-test:risk-finding-auth", type: "manual-test" }),
        expect.objectContaining({ id: "pr-comment-line:2", type: "pr-comment-line" }),
      ]));
      expect(edges).toEqual(expect.arrayContaining([
        expect.objectContaining({ source: "requirement:QEOS-001", target: "rule:WEAK_AUTH_GUARD", type: "satisfies" }),
        expect.objectContaining({ source: "rule:WEAK_AUTH_GUARD", target: "finding:finding-auth", type: "generated_by" }),
        expect.objectContaining({ source: "finding:finding-auth", target: "artifact:findings", type: "evidenced_by" }),
        expect.objectContaining({ source: "artifact:release-readiness", target: "verdict:blocked_input", type: "gated_by" }),
        expect.objectContaining({ source: "finding:finding-auth", target: "manual-test:risk-finding-auth", type: "requires_manual_oracle" }),
        expect.objectContaining({ source: "pr-comment-line:2", target: "artifact:findings", type: "cites_artifact" }),
      ]));
    });
  });

  describe("sarif export", () => {
    it("generates SARIF with proper structure and severity mapping", async () => {
      writeFindings(tempOutDir, [
        createFinding({ severity: "critical" }),
        createFinding({ severity: "medium" }),
        createFinding({ severity: "low" }),
      ]);
      const { exitCode, output } = await runExport("sarif", tempOutDir);

      expect(exitCode).toBe(EXIT.OK);
      expect(output.$schema).toContain("sarif-schema-2.1.0");
      expect(Array.isArray(output.runs)).toBe(true);
      expect(Array.isArray(output.runs[0].results)).toBe(true);

      // Check SARIF result fields
      for (const sarifResult of output.runs[0].results) {
        expect(sarifResult.ruleId).toBeDefined();
        expect(["error", "warning", "note"]).toContain(sarifResult.level);
        expect(sarifResult.message.text).toBeDefined();
        expect(Array.isArray(sarifResult.locations)).toBe(true);
        expect(sarifResult.locations[0].physicalLocation).toBeDefined();
      }

      // Severity mapping
      const levels = output.runs[0].results.map((r: { level: string }) => r.level);
      expect(levels.includes("error")).toBe(true); // critical
      expect(levels.includes("warning")).toBe(true); // medium
      expect(levels.includes("note")).toBe(true); // low
    });
  });

  describe("error handling", () => {
    it("returns USAGE_ERROR for invalid arguments", async () => {
      // Missing target
      const result1 = await exportCommand(["--from", tempOutDir], { VERSION, EXIT, getOption });
      expect(result1).toBe(EXIT.USAGE_ERROR);

      // Missing --from
      const result2 = await exportCommand(["gatefield"], { VERSION, EXIT, getOption });
      expect(result2).toBe(EXIT.USAGE_ERROR);

      // Unsupported target
      writeFindings(tempOutDir, []);
      const result3 = await exportCommand(["unsupported", "--from", tempOutDir], { VERSION, EXIT, getOption });
      expect(result3).toBe(EXIT.USAGE_ERROR);

      // Nonexistent directory
      const result4 = await exportCommand(["gatefield", "--from", "/nonexistent"], { VERSION, EXIT, getOption });
      expect(result4).toBe(EXIT.USAGE_ERROR);

      // File instead of directory
      const filePath = path.join(tempOutDir, "file.txt");
      writeFileSync(filePath, "test", "utf8");
      const result5 = await exportCommand(["gatefield", "--from", filePath], { VERSION, EXIT, getOption });
      expect(result5).toBe(EXIT.USAGE_ERROR);

      // Missing findings.json
      const emptyDir = path.join(tempOutDir, "empty");
      mkdirSync(emptyDir, { recursive: true });
      const result6 = await exportCommand(["gatefield", "--from", emptyDir], { VERSION, EXIT, getOption });
      expect(result6).toBe(EXIT.USAGE_ERROR);
    });

    it("returns INTEGRATION_EXPORT_FAILED for malformed JSON", async () => {
      const malformedDir = path.join(tempOutDir, "malformed");
      mkdirSync(malformedDir, { recursive: true });
      writeFileSync(path.join(malformedDir, "findings.json"), "not json", "utf8");

      const result = await exportCommand(["gatefield", "--from", malformedDir], { VERSION, EXIT, getOption });
      expect(result).toBe(EXIT.INTEGRATION_EXPORT_FAILED);
    });
  });

  describe("output options", () => {
    it("uses custom --out path for gatefield and sarif", async () => {
      writeFindings(tempOutDir, [createFinding()]);

      // Gatefield custom output
      const customGatefield = path.join(tempOutDir, "custom-gatefield.json");
      const { exitCode: e1 } = await runExport("gatefield", tempOutDir, customGatefield);
      expect(e1).toBe(EXIT.OK);
      expect(existsSync(customGatefield)).toBe(true);

      // SARIF custom output
      const customSarif = path.join(tempOutDir, "custom.sarif");
      const { exitCode: e2 } = await runExport("sarif", tempOutDir, customSarif);
      expect(e2).toBe(EXIT.OK);
      expect(existsSync(customSarif)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles empty findings array", async () => {
      writeFindings(tempOutDir, []);

      // Gatefield
      const { output: gatefield } = await runExport("gatefield", tempOutDir);
      expect(gatefield.status).toBe("passed");
      expect(Array.isArray(gatefield.signals)).toBe(true);
      expect(gatefield.signals.length).toBe(0);

      // SARIF
      const { output: sarif } = await runExport("sarif", tempOutDir);
      expect(sarif.runs[0].results.length).toBe(0);
    });

    it("handles relative --from path", async () => {
      const result = await exportCommand(["gatefield", "--from", "../../../fixtures/demo-ci-imports"], { VERSION, EXIT, getOption });
      expect(typeof result).toBe("number");
    });
  });
});
