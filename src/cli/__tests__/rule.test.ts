import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ruleCommand } from "../rule.js";

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

describe("rule CLI", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-rule-cli-"));
  });

  afterEach(() => {
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("creates a fixture-based custom rule scaffold", async () => {
    const outRoot = path.join(tempRoot, "rules");
    const exitCode = await ruleCommand(
      [
        "new",
        "unsafe-redirect",
        "--out",
        outRoot,
        "--category",
        "security",
        "--severity",
        "high",
        "--description",
        "Detects unsafe redirects.",
        "--quiet",
      ],
      { VERSION, EXIT, getOption }
    );

    const targetDir = path.join(outRoot, "unsafe-redirect");
    expect(exitCode).toBe(EXIT.OK);
    for (const relativePath of [
      "rule.ts",
      "index.ts",
      "rule.test.ts",
      "fixtures/positive.ts",
      "fixtures/negative.ts",
      "rule.manifest.json",
      "schema/rule.manifest.schema.json",
      "README.md",
    ]) {
      expect(existsSync(path.join(targetDir, relativePath))).toBe(true);
    }

    const rule = readFileSync(path.join(targetDir, "rule.ts"), "utf8");
    expect(rule).toContain("@quality-harness/code-to-gate/rule-sdk");
    expect(rule).toContain("UNSAFE_REDIRECT_RULE");

    const manifest = JSON.parse(readFileSync(path.join(targetDir, "rule.manifest.json"), "utf8"));
    expect(manifest).toMatchObject({
      apiVersion: "ctg.rule/v1",
      kind: "rule",
      id: "unsafe-redirect",
      ruleId: "UNSAFE_REDIRECT",
      category: "security",
      defaultSeverity: "high",
    });
  });

  it("rejects an existing scaffold unless force is provided", async () => {
    const outRoot = path.join(tempRoot, "rules");
    const options = { VERSION, EXIT, getOption };

    expect(await ruleCommand(["new", "custom-check", "--out", outRoot, "--quiet"], options)).toBe(EXIT.OK);
    expect(await ruleCommand(["new", "custom-check", "--out", outRoot, "--quiet"], options)).toBe(EXIT.USAGE_ERROR);
    expect(await ruleCommand(["new", "custom-check", "--out", outRoot, "--force", "--quiet"], options)).toBe(EXIT.OK);
  });

  it("rejects invalid rule metadata", async () => {
    const outRoot = path.join(tempRoot, "rules");

    expect(
      await ruleCommand(["new", "InvalidRule", "--out", outRoot, "--quiet"], { VERSION, EXIT, getOption })
    ).toBe(EXIT.USAGE_ERROR);
    expect(
      await ruleCommand(["new", "custom-check", "--out", outRoot, "--category", "unknown", "--quiet"], {
        VERSION,
        EXIT,
        getOption,
      })
    ).toBe(EXIT.USAGE_ERROR);
  });
});
