import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { readinessCommand } from "../readiness.js";
import { EXIT } from "../exit-codes.js";

const VERSION = "0.1.0";
const fixturesDir = path.resolve(import.meta.dirname, "../../../fixtures/demo-ci-imports");

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function createPartialFindingsArtifact(): Record<string, unknown> {
  return {
    version: "ctg/v1",
    generated_at: new Date().toISOString(),
    run_id: "partial-policy-test-run",
    repo: { root: "/test/repo" },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
    artifact: "findings",
    schema: "findings@v1",
    completeness: "partial",
    findings: [],
    unsupported_claims: [{
      id: "scan-partial",
      claim: "Repository scan covered all eligible files within the configured limits.",
      reason: "missing_evidence",
      sourceSection: "repo-graph:scan",
    }],
  };
}

function writeFindingsArtifact(dir: string): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "findings.json"),
    JSON.stringify(createPartialFindingsArtifact()),
    "utf8",
  );
  return dir;
}

function writePolicy(policyPath: string, partialSection = ""): string {
  const content = [
    "version: ctg/v1",
    "policy_id: partial-policy-test",
    partialSection,
    "",
  ].join("\n");
  writeFileSync(policyPath, content, "utf8");
  return policyPath;
}

type Readiness = {
  completeness?: string;
  failedConditions?: Array<{ id?: string; reason?: string }>;
  recommendedActions?: string[];
  status?: string;
  summary?: string;
};

async function runReadiness(
  findingsDir: string,
  policyPath: string,
  outDir: string,
): Promise<{ exitCode: number; outputPath: string; readiness?: Readiness }> {
  const exitCode = await readinessCommand(
    [
      fixturesDir,
      "--policy",
      policyPath,
      "--from",
      findingsDir,
      "--out",
      outDir,
    ],
    { VERSION, EXIT, getOption },
  );
  const outputPath = path.join(outDir, "release-readiness.json");
  const readiness = existsSync(outputPath)
    ? JSON.parse(readFileSync(outputPath, "utf8")) as Readiness
    : undefined;
  return { exitCode, outputPath, readiness };
}

describe("readiness partial policy YAML", () => {
  let tempRoot: string;

  beforeAll(() => {
    tempRoot = path.join(tmpdir(), `ctg-readiness-partial-policy-${Date.now()}`);
    mkdirSync(tempRoot, { recursive: true });
  });

  afterAll(() => {
    if (tempRoot && existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  function createCase(name: string, partialSection?: string): { findingsDir: string; outDir: string; policyPath: string } {
    const caseDir = path.join(tempRoot, name);
    const findingsDir = writeFindingsArtifact(path.join(caseDir, "findings"));
    const outDir = path.join(caseDir, "out");
    const policyPath = writePolicy(path.join(caseDir, "policy.yaml"), partialSection);
    return { findingsDir, outDir, policyPath };
  }

  it.each([
    ["inline", "partial: { allow_partial: true, partial_warning_threshold: 0.4 }"],
    ["block", "partial:\n  allow_partial: true\n  partial_warning_threshold: 0.4"],
  ])("loads %s partial policy and allows the same partial readiness result", async (name, partialSection) => {
    const { findingsDir, outDir, policyPath } = createCase(`allow-${name}`, partialSection);
    const { exitCode, readiness } = await runReadiness(findingsDir, policyPath, outDir);

    expect(exitCode).toBe(EXIT.OK);
    expect(readiness?.status).toBe("passed_with_risk");
    expect(readiness?.completeness).toBe("partial");
    expect(readiness?.failedConditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "INCOMPLETE_INPUT" })]),
    );
    expect(readiness?.summary).toContain("partial");
    expect(readiness?.summary).toContain("allowed by policy");
    expect(readiness?.recommendedActions).toHaveLength(2);
    expect(readiness?.recommendedActions).toEqual(expect.arrayContaining([
      expect.stringContaining("unsupported claims"),
      expect.stringContaining("analyze or diff"),
    ]));
    expect(readiness?.recommendedActions?.[0]).toContain("scan diagnostics");
  });

  it.each([
    ["inline", "partial: { allow_partial: false, partial_warning_threshold: 0.4 }"],
    ["block", "partial:\n  allow_partial: false\n  partial_warning_threshold: 0.4"],
  ])("loads %s partial policy and blocks the same partial readiness result", async (name, partialSection) => {
    const { findingsDir, outDir, policyPath } = createCase(`block-${name}`, partialSection);
    const { exitCode, readiness } = await runReadiness(findingsDir, policyPath, outDir);

    expect(exitCode).toBe(EXIT.READINESS_NOT_CLEAR);
    expect(readiness?.status).toBe("blocked_input");
    expect(readiness?.completeness).toBe("partial");
    expect(readiness?.failedConditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "INCOMPLETE_INPUT" })]),
    );
    expect(readiness?.summary).toContain("partial");
    expect(readiness?.recommendedActions).toHaveLength(2);
    expect(readiness?.recommendedActions).toEqual(expect.arrayContaining([
      expect.stringContaining("unsupported claims"),
      expect.stringContaining("analyze or diff"),
    ]));
    expect(readiness?.recommendedActions?.[0]).toContain("scan diagnostics");
  });

  it.each([0, 0.2, 1])("treats partial warning threshold %s as a reserved v1 value", async (threshold) => {
    for (const completeness of ["complete", "partial"] as const) {
      for (const allowPartial of [false, true]) {
        const { findingsDir, outDir, policyPath } = createCase(
          `reserved-${threshold}-${completeness}-${allowPartial}`,
          `partial: { allow_partial: ${allowPartial}, partial_warning_threshold: ${threshold} }`,
        );
        const inputPath = path.join(findingsDir, "findings.json");
        const input = JSON.parse(readFileSync(inputPath, "utf8"));
        input.completeness = completeness;
        writeFileSync(inputPath, JSON.stringify(input));
        const { exitCode, readiness } = await runReadiness(findingsDir, policyPath, outDir);
        expect(readiness?.status).toBe(completeness === "complete" ? "passed" : allowPartial ? "passed_with_risk" : "blocked_input");
        expect(exitCode).toBe(completeness === "partial" && !allowPartial ? EXIT.READINESS_NOT_CLEAR : EXIT.OK);
        expect(readiness?.failedConditions?.some(c => c.id === "INCOMPLETE_INPUT")).toBe(completeness === "partial");
      }
    }
  });

  it("keeps the omitted partial section strict", async () => {
    const { findingsDir, outDir, policyPath } = createCase("strict-omitted");
    const { exitCode, readiness } = await runReadiness(findingsDir, policyPath, outDir);

    expect(exitCode).toBe(EXIT.READINESS_NOT_CLEAR);
    expect(readiness?.status).toBe("blocked_input");
    expect(readiness?.completeness).toBe("partial");
    expect(readiness?.failedConditions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "INCOMPLETE_INPUT" })]),
    );
  });

  it.each([
    ["boolean string", "partial: { allow_partial: \"true\" }"],
    ["boolean numeric", "partial: { allow_partial: 1 }"],
    ["boolean null", "partial: { allow_partial: null }"],
    ["threshold string", "partial: { partial_warning_threshold: \"0.4\" }"],
    ["threshold below range", "partial: { partial_warning_threshold: -0.1 }"],
    ["threshold above range", "partial: { partial_warning_threshold: 1.1 }"],
    ["partial array", "partial: []"],
    ["partial scalar", "partial: true"],
  ])("rejects invalid %s policy without writing readiness", async (name, partialSection) => {
    const { findingsDir, outDir, policyPath } = createCase(`invalid-${name.replaceAll(" ", "-")}`, partialSection);
    const { exitCode, outputPath, readiness } = await runReadiness(findingsDir, policyPath, outDir);

    expect(exitCode).toBe(EXIT.POLICY_FAILED);
    expect(readiness).toBeUndefined();
    expect(existsSync(outputPath)).toBe(false);
  });
});
