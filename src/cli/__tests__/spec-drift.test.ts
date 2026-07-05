import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { specDriftCommand } from "../spec-drift.js";

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

function writeFixtureFile(repoRoot: string, relativePath: string, content: string): void {
  const filePath = path.join(repoRoot, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

function writeSpecSurface(
  repoRoot: string,
  options: {
    cliTargets?: string[];
    docsTargets?: string[];
    schemaFiles?: string[];
    coverageFiles?: string[];
  } = {}
): void {
  const supportedTargets = ["gatefield", "evidence-dag"];
  const cliTargets = options.cliTargets ?? supportedTargets;
  const docsTargets = options.docsTargets ?? supportedTargets;
  const schemaFiles = options.schemaFiles ?? [
    "findings.schema.json",
    "evidence-dag.schema.json",
    "spec-drift.schema.json",
  ];
  const coverageFiles = options.coverageFiles ?? schemaFiles;

  writeFixtureFile(
    repoRoot,
    "src/cli/export-types.ts",
    `export const SUPPORTED_TARGETS = ${JSON.stringify(supportedTargets)};\n`
  );
  writeFixtureFile(repoRoot, "src/cli.ts", `Targets: ${cliTargets.join(", ")}\n`);
  writeFixtureFile(
    repoRoot,
    "src/cli/schema-validate.ts",
    `const schemaFiles = ${JSON.stringify(schemaFiles)};\n`
  );
  writeFixtureFile(
    repoRoot,
    "tests/integration/schema-coverage.test.ts",
    coverageFiles.map((file) => `validates ${file}`).join("\n")
  );
  writeFixtureFile(repoRoot, "RUNBOOK.md", "# Runbook\n");
  writeFixtureFile(repoRoot, "docs/quality-evidence-os-requirements.md", "# Requirements\n");
  writeFixtureFile(repoRoot, "docs/quality-evidence-os-spec.md", "# Spec\n");
  writeFixtureFile(
    repoRoot,
    "docs/cli-reference.md",
    [
      `Export targets: ${docsTargets.join(", ")}`,
      "| Artifact |",
      "|---|",
      "| `findings.json` |",
      "| `evidence-dag.json` |",
      "| `spec-drift.json` |",
    ].join("\n")
  );
  writeFixtureFile(
    repoRoot,
    "README.md",
    ["| Artifact |", "|---|", "| `findings.json` |", "| `evidence-dag.json` |", "| `spec-drift.json` |"].join("\n")
  );
  writeFixtureFile(
    repoRoot,
    "README_JA.md",
    ["| ファイル |", "|---|", "| `findings.json` |", "| `evidence-dag.json` |", "| `spec-drift.json` |"].join("\n")
  );

  for (const schemaFile of schemaFiles) {
    writeFixtureFile(repoRoot, path.join("schemas", schemaFile), "{}\n");
  }
}

describe("spec-drift CLI", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-spec-drift-"));
  });

  afterEach(() => {
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("writes a passing spec-drift artifact when docs, schema, implementation, and tests align", async () => {
    const repoRoot = path.join(tempRoot, "repo");
    const outDir = path.join(tempRoot, "out");
    writeSpecSurface(repoRoot);

    const exitCode = await specDriftCommand([repoRoot, "--out", outDir, "--quiet"], { VERSION, EXIT, getOption });
    const artifactPath = path.join(outDir, "spec-drift.json");
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

    expect(exitCode).toBe(EXIT.OK);
    expect(artifact.artifact).toBe("spec-drift");
    expect(artifact.schema).toBe("spec-drift@v1");
    expect(artifact.status).toBe("passed");
    expect(artifact.summary.failed).toBe(0);
    expect(artifact.findings).toEqual([]);
  });

  it("returns READINESS_NOT_CLEAR and release-risk findings when CLI help drifts from supported targets", async () => {
    const repoRoot = path.join(tempRoot, "repo");
    const outDir = path.join(tempRoot, "out");
    writeSpecSurface(repoRoot, { cliTargets: ["gatefield"] });

    const exitCode = await specDriftCommand([repoRoot, "--out", outDir, "--quiet"], { VERSION, EXIT, getOption });
    const artifact = JSON.parse(readFileSync(path.join(outDir, "spec-drift.json"), "utf8"));

    expect(exitCode).toBe(EXIT.READINESS_NOT_CLEAR);
    expect(artifact.status).toBe("failed");
    expect(artifact.summary.failed).toBeGreaterThan(0);
    expect(artifact.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "release-risk",
          sourceCheckId: "command.export-targets.cli-help",
        }),
      ])
    );
  });
});
