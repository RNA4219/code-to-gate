import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { packCommand } from "../pack.js";

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

describe("pack CLI", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-pack-"));
  });

  afterEach(() => {
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("lists bundled quality packs", async () => {
    const exitCode = await packCommand(["list", "--quiet"], { VERSION, EXIT, getOption });

    expect(exitCode).toBe(EXIT.OK);
  });

  it("writes a quality-pack artifact", async () => {
    const outDir = path.join(tempRoot, "artifacts");
    const exitCode = await packCommand(["show", "security-basic", "--out", outDir, "--quiet"], {
      VERSION,
      EXIT,
      getOption,
    });
    const artifact = JSON.parse(readFileSync(path.join(outDir, "quality-pack.json"), "utf8"));

    expect(exitCode).toBe(EXIT.OK);
    expect(artifact).toMatchObject({
      artifact: "quality-pack",
      schema: "quality-pack@v1",
      completeness: "complete",
      pack: {
        id: "security-basic",
        maturity: "stable",
        distribution: {
          sampleRepo: "fixtures/quality-packs/security-basic",
        },
      },
    });
    expect(artifact.pack.rules.block).toContain("HARDCODED_SECRET");
    expect(artifact.pack.distribution.expectedArtifacts).toContain("findings.json");
  });

  it("exports a policy YAML for readiness", async () => {
    const outFile = path.join(tempRoot, ".ctg", "policy.yaml");
    const exitCode = await packCommand(["export-policy", "security-basic", "--out", outFile, "--quiet"], {
      VERSION,
      EXIT,
      getOption,
    });
    const policy = readFileSync(outFile, "utf8");

    expect(exitCode).toBe(EXIT.OK);
    expect(policy).toContain("version: ctg/v1");
    expect(policy).toContain("policy_id: pack-security-basic");
    expect(policy).toContain("HARDCODED_SECRET: true");
    expect(policy).toContain("new_findings_block: true");
  });

  it("rejects unknown packs", async () => {
    const exitCode = await packCommand(["show", "does-not-exist", "--quiet"], { VERSION, EXIT, getOption });

    expect(exitCode).toBe(EXIT.USAGE_ERROR);
  });
});
