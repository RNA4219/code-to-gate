import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateEvidenceProvenanceIndex } from "../provenance-index.js";
import type { FindingsArtifact } from "../../types/artifacts.js";

const TEST_DIR = path.join(process.cwd(), ".test-temp", "provenance-index");

function writeJson(name: string, value: unknown): void {
  writeFileSync(path.join(TEST_DIR, name), JSON.stringify(value), "utf8");
}

function findings(): FindingsArtifact {
  return {
    version: "ctg/v1",
    generated_at: "2026-01-01T00:00:00.000Z",
    run_id: "run-1",
    repo: { root: "/repo" },
    tool: { name: "code-to-gate", version: "1.5.0", plugin_versions: [] },
    artifact: "findings",
    schema: "findings@v1",
    findings: [{
      id: "Finding @ 1",
      ruleId: "RULE",
      category: "security",
      severity: "high",
      confidence: 0.8,
      title: "title",
      summary: "summary",
      evidence: [],
    }],
    unsupported_claims: [],
  };
}

describe("generateEvidenceProvenanceIndex", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("returns a partial empty index when human surfaces are missing", () => {
    const result = generateEvidenceProvenanceIndex({
      artifactDir: TEST_DIR,
      cwd: TEST_DIR,
      version: "1.5.0",
      findings: findings(),
      now: new Date("2026-01-02T03:04:05.000Z"),
    });
    expect(result.completeness).toBe("partial");
    expect(result.entries).toEqual([]);
    expect(result.sourceArtifacts).toEqual([]);
    expect(result.run_id).toContain("20260102030405");
  });

  it("indexes optional summaries, viewer fallback, release pack, and sparse SARIF", () => {
    writeJson("findings.json", { schema: "findings@v1" });
    writeFileSync(path.join(TEST_DIR, "report.html"), "<html></html>", "utf8");
    writeJson("pr-review.json", {
      schema: "pr-review@v1",
      sections: {
        blockReasons: [],
        acceptableReasons: [],
        additionalTests: [],
        specDiffs: [],
        baselineSummary: {
          id: "Baseline !",
          title: "Baseline summary",
          sourceIds: [],
        },
        gateExplainabilitySummary: {
          id: "Gate",
          title: "Gate summary",
          sourceIds: ["gate-source"],
        },
        driftBudgetSummary: {
          id: "---",
          title: "---",
          sourceIds: [],
        },
      },
    });
    writeJson("release-pack.json", {
      schema: "release-pack@v1",
      entries: [{ id: "Pack Entry" }],
      outputs: { html: "release.html" },
    });
    writeJson("results.sarif", {
      schema: "sarif",
      runs: [
        {},
        {
          results: [
            {},
            {
              ruleId: "RULE",
              locations: [{ physicalLocation: {
                artifactLocation: { uri: "src/file.ts" },
                region: { startLine: 9 },
              } }],
            },
          ],
        },
      ],
    });
    writeFileSync(path.join(TEST_DIR, "index.html"), "fallback", "utf8");
    writeFileSync(path.join(TEST_DIR, "viewer-report.html"), "preferred", "utf8");

    const result = generateEvidenceProvenanceIndex({
      artifactDir: TEST_DIR,
      cwd: process.cwd(),
      version: "1.5.0",
      findings: findings(),
    });
    expect(result.completeness).toBe("complete");
    expect(result.summary.prComment).toBe(3);
    expect(result.summary.viewer).toBe(1);
    expect(result.summary.releasePack).toBe(1);
    expect(result.summary.sarif).toBe(2);
    expect(result.entries.some((item) => item.sourceId === "gate-source")).toBe(true);
    expect(result.entries.some((item) => item.sourceId.includes("sarif:unknown:?")))
      .toBe(true);
    expect(result.sourceArtifacts.some((item) => item.schema === "findings@v1"))
      .toBe(true);
  });

  it("ignores malformed optional JSON artifacts", () => {
    writeFileSync(path.join(TEST_DIR, "findings.json"), "{invalid", "utf8");
    writeFileSync(path.join(TEST_DIR, "pr-review.json"), "{invalid", "utf8");
    writeFileSync(path.join(TEST_DIR, "release-pack.json"), "[]", "utf8");
    writeFileSync(path.join(TEST_DIR, "results.sarif"), "{invalid", "utf8");

    const result = generateEvidenceProvenanceIndex({
      artifactDir: TEST_DIR,
      cwd: TEST_DIR,
      version: "1.5.0",
      findings: findings(),
    });
    expect(result.entries).toEqual([]);
    expect(result.sourceArtifacts.length).toBeGreaterThan(0);
    expect(result.sourceArtifacts.every((item) => item.schema === undefined)).toBe(true);
  });
});
