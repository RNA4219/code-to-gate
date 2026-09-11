import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { readinessCommand } from "../readiness.js";
import { EXIT, getOption, VERSION } from "../exit-codes.js";
import { validateArtifactObject } from "../schema-validate.js";

const fixturesDir = path.resolve(import.meta.dirname, "../../../fixtures/demo-ci-imports");

type Readiness = {
  artifact?: string;
  status?: string;
  counts?: { findings?: number };
  failedConditions?: Array<{ id?: string; reason?: string }>;
  recommendedActions?: string[];
  selfAnalysis?: {
    suppressedLow?: number;
    acceptedExceptionsByClass?: Record<string, number>;
  };
  baseline?: {
    mode?: string;
    baselineFindings?: number;
    currentFindings?: number;
    newFindings?: number;
    worsenedFindings?: number;
    unchangedFindings?: number;
    gatedFindingIds?: string[];
  };
  artifactRefs?: { baseline?: string };
};

function createFinding(): Record<string, unknown> {
  return {
    id: "debt-marker-finding",
    ruleId: "DEBT_MARKER",
    category: "maintainability",
    severity: "low",
    confidence: 0.8,
    title: "Explicit debt marker found (TODO)",
    summary: "A source comment contains a technical debt marker.",
    evidence: [{ id: "debt-marker-evidence", path: "src/debt.ts", startLine: 1, kind: "text", excerptHash: "debt-marker" }],
  };
}

function createFindingsArtifact(runId: string): Record<string, unknown> {
  return {
    version: "ctg/v1",
    generated_at: new Date().toISOString(),
    run_id: runId,
    repo: { root: "/test/repo" },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings: [createFinding()],
    unsupported_claims: [],
  };
}

function writeFindings(dir: string, runId: string): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "findings.json"), JSON.stringify(createFindingsArtifact(runId)), "utf8");
  return dir;
}

function writePolicy(filePath: string, sections: string): string {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, ["version: ctg/v1", "policy_id: policy-yaml-sections-test", sections, ""].join("\n"), "utf8");
  return filePath;
}

function quoteYaml(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function pathForStyle(value: string, style: "native" | "forward-slash"): string {
  return style === "native" ? value : value.replaceAll("\\", "/");
}

async function runReadiness(findingsDir: string, policyPath: string, outDir: string): Promise<{ exitCode: number; outputPath: string; readiness?: Readiness }> {
  const exitCode = await readinessCommand([
    fixturesDir, "--policy", policyPath, "--from", findingsDir, "--out", outDir,
  ], { VERSION, EXIT, getOption });
  const outputPath = path.join(outDir, "release-readiness.json");
  const readiness = existsSync(outputPath)
    ? JSON.parse(readFileSync(outputPath, "utf8")) as Readiness
    : undefined;
  return { exitCode, outputPath, readiness };
}

describe("readiness policy YAML sections", () => {
  let tempRoot: string;

  beforeAll(() => {
    tempRoot = mkdtempSync(path.join(tmpdir(), "ctg-policy-yaml-sections-"));
  });

  afterAll(() => {
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
  });

  it.each([
    ["inline", "blocking: { severity: { critical: false, high: false, medium: false, low: true } }"],
    ["block", ["blocking:", "  severity:", "    critical: false", "    high: false", "    medium: false", "    low: true"].join("\n")],
    ["trailing comment", ["blocking:", "  severity:", "    critical: false # keep critical open", "    high: false # keep high open", "    medium: false # keep medium open", "    low: true # block DEBT_MARKER"].join("\n")],
  ])("returns the same blocking readiness for %s policy syntax", async (name, sections) => {
    const caseDir = path.join(tempRoot, `blocking-${name.replaceAll(" ", "-")}`);
    const findingsDir = writeFindings(path.join(caseDir, "findings"), `current-${name}`);
    const outDir = path.join(caseDir, "out");
    const policyPath = writePolicy(path.join(caseDir, "policy.yaml"), sections);
    const { exitCode, readiness } = await runReadiness(findingsDir, policyPath, outDir);

    expect(exitCode).toBe(EXIT.READINESS_NOT_CLEAR);
    expect(readiness?.status).toBe("blocked_input");
    expect(readiness?.counts?.findings).toBe(1);
    expect(readiness?.failedConditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "BLOCKING_SEVERITY_LOW" })]),
    );
  });

  it.each(["native", "forward-slash"] as const)("loads quoted %s absolute suppression and baseline paths with spaces", async (style) => {
    const caseDir = path.join(tempRoot, `paths-${style}`);
    const findingsDir = writeFindings(path.join(caseDir, "current findings"), "current-paths");
    const suppressionPath = path.join(caseDir, "review assets", "suppression rules.yaml");
    const baselinePath = path.join(caseDir, "review assets", "baseline findings.json");
    const outDir = path.join(caseDir, "readiness output");
    mkdirSync(path.dirname(suppressionPath), { recursive: true });
    writeFileSync(suppressionPath, [
      "version: ctg/v1",
      "suppressions:",
      "  - rule_id: DEBT_MARKER",
      "    path: src/debt.ts",
      "    reason: tracked debt",
      "    class: temporary-debt",
      "",
    ].join("\n"), "utf8");
    mkdirSync(path.dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, JSON.stringify(createFindingsArtifact("baseline-paths")), "utf8");

    const suppressionRef = pathForStyle(suppressionPath, style);
    const baselineRef = pathForStyle(baselinePath, style);
    const policyPath = writePolicy(path.join(caseDir, "policy with paths.yaml"), [
      "blocking:",
      "  severity:",
      "    critical: false",
      "    high: false",
      "    medium: false",
      "    low: true",
      "suppression:",
      `  file: ${quoteYaml(suppressionRef)}`,
      "baseline:",
      "  enabled: true",
      `  file: ${quoteYaml(baselineRef)}`,
      "  new_findings_block: false",
    ].join("\n"));
    const { exitCode, readiness } = await runReadiness(findingsDir, policyPath, outDir);

    expect(exitCode).toBe(EXIT.OK);
    expect(readiness?.status).toBe("passed");
    expect(readiness?.failedConditions).toEqual([]);
    expect(readiness?.selfAnalysis?.suppressedLow).toBe(1);
    expect(readiness?.selfAnalysis?.acceptedExceptionsByClass?.["temporary-debt"]).toBe(1);
    expect(readiness?.baseline).toEqual(expect.objectContaining({
      mode: "ratchet",
      baselineFindings: 1,
      currentFindings: 1,
      newFindings: 0,
      worsenedFindings: 0,
      unchangedFindings: 1,
      gatedFindingIds: [],
    }));
    expect(readiness?.recommendedActions).toEqual(
      expect.arrayContaining([expect.stringContaining("no new or worsened findings")]),
    );
    expect(readiness?.artifactRefs?.baseline).toBe(baselineRef);
    const validation = await validateArtifactObject(readiness, "release-readiness.json");
    expect(validation.status).toBe("ok");
  });

  it.each([
    ["boolean value supplied as string", ["blocking:", "  severity:", '    low: "true"'].join("\n")],
    ["string value supplied as boolean", ["suppression:", "  file: true"].join("\n")],
    ["baseline boolean supplied as string", ["baseline:", '  enabled: "true"'].join("\n")],
  ])("rejects %s policy before creating a readiness artifact", async (name, sections) => {
    const caseDir = path.join(tempRoot, `invalid-${name.replaceAll(" ", "-")}`);
    const findingsDir = writeFindings(path.join(caseDir, "findings"), `invalid-${name}`);
    const outDir = path.join(caseDir, "out");
    const policyPath = writePolicy(path.join(caseDir, "policy.yaml"), sections);
    const { exitCode, outputPath, readiness } = await runReadiness(findingsDir, policyPath, outDir);

    expect(exitCode).toBe(EXIT.POLICY_FAILED);
    expect(readiness).toBeUndefined();
    expect(existsSync(outputPath)).toBe(false);
  });
});
