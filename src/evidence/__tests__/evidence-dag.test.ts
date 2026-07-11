import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateEvidenceDagFromArtifacts } from "../evidence-dag.js";

const TEST_DIR = path.join(process.cwd(), ".test-temp", "evidence-dag");

function writeJson(name: string, value: unknown): void {
  writeFileSync(path.join(TEST_DIR, name), JSON.stringify(value), "utf8");
}

describe("generateEvidenceDagFromArtifacts", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("links findings, downstream artifacts, verdict, manual tests, CI, and PR citations", () => {
    writeJson("findings.json", {
      version: "ctg/v1",
      generated_at: "2026-01-02T00:00:00.000Z",
      run_id: "run-1",
      repo: { root: "/repo" },
      tool: { name: "code-to-gate", version: "1.5.0", plugin_versions: [] },
      artifact: "findings",
      schema: "findings@v1",
      findings: [{
        id: "F-1",
        ruleId: "RULE-1",
        category: "security",
        severity: "high",
        confidence: 0.9,
        title: "Finding one",
        summary: "summary",
        evidence: [],
      }],
      unsupported_claims: [],
    });
    writeJson("release-readiness.json", { status: "passed" });
    writeJson("audit.json", {});
    writeJson("qeg-code-to-gate.json", {});
    writeJson("manual-bb.json", {
      risk_seeds: [
        null,
        "invalid",
        {},
        { id: "risk-F-1" },
      ],
      test_cases: [
        null,
        "invalid",
        {},
        { id: "manual-case" },
      ],
    });
    writeFileSync(
      path.join(TEST_DIR, "pr-review.md"),
      "No citation here\nSee findings.json and qeg-code-to-gate.json\n",
      "utf8"
    );

    const dag = generateEvidenceDagFromArtifacts({
      artifactDir: TEST_DIR,
      cwd: process.cwd(),
      version: "1.5.0",
      ciEnv: {
        GITHUB_RUN_ID: "123",
        GITHUB_REPOSITORY: "owner/repo",
        GITHUB_SERVER_URL: "https://github.example",
        GITHUB_SHA: "abc",
        GITHUB_REF: "refs/heads/main",
      },
    });

    expect(dag.completeness).toBe("complete");
    expect(dag.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([
      "requirement:QEOS-001",
      "rule:RULE-1",
      "finding:F-1",
      "verdict:passed",
      "manual-test:risk-F-1",
      "manual-test:manual-case",
      "ci-run:123",
      "pr-comment-line:2",
    ]));
    expect(dag.edges.map((edge) => edge.type)).toEqual(expect.arrayContaining([
      "satisfies",
      "generated_by",
      "evidenced_by",
      "exports_to",
      "gated_by",
      "requires_manual_oracle",
      "cites_artifact",
    ]));
    expect(dag.summary.findings).toBe(1);
    expect(dag.summary.verdicts).toBe(1);
  });

  it("supports legacy manual evidence, missing readiness, and CI without repository", () => {
    writeJson("findings.json", {
      version: "ctg/v1",
      generated_at: "2026-01-02T00:00:00.000Z",
      run_id: "run-2",
      repo: { root: "/repo" },
      tool: { name: "code-to-gate", version: "1.5.0", plugin_versions: [] },
      artifact: "findings",
      schema: "findings@v1",
      findings: [],
      unsupported_claims: [],
    });
    writeJson("manual-bb-seed.json", {
      test_cases: [{ id: "legacy-case" }],
    });
    writeFileSync(path.join(TEST_DIR, "release-readiness.json"), "[]", "utf8");
    writeFileSync(path.join(TEST_DIR, "manual-bb.json"), "{invalid", "utf8");

    const dag = generateEvidenceDagFromArtifacts({
      artifactDir: TEST_DIR,
      cwd: TEST_DIR,
      version: "1.5.0",
      ciEnv: { GITHUB_RUN_ID: "456" },
    });
    expect(dag.completeness).toBe("complete");
    expect(dag.nodes.some((node) => node.id === "manual-test:legacy-case")).toBe(true);
    expect(dag.nodes.some((node) => node.id === "ci-run:456")).toBe(true);
    expect(dag.summary.verdicts).toBe(0);
  });

  it("omits optional graph branches when no optional artifacts exist", () => {
    writeJson("findings.json", {
      version: "ctg/v1",
      generated_at: "2026-01-02T00:00:00.000Z",
      run_id: "run-3",
      repo: { root: "/repo" },
      tool: { name: "code-to-gate", version: "1.5.0", plugin_versions: [] },
      artifact: "findings",
      schema: "findings@v1",
      findings: [],
      unsupported_claims: [],
    });
    const dag = generateEvidenceDagFromArtifacts({
      artifactDir: TEST_DIR,
      cwd: TEST_DIR,
      version: "1.5.0",
    });
    expect(dag.completeness).toBe("partial");
    expect(dag.summary.verdicts).toBe(0);
  });
});
