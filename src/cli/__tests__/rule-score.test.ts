import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  ASSURANCE_FAILED: 11,
};

const VERSION = "0.1.0";

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

describe("rule score CLI", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-rule-score-"));
  });

  afterEach(() => {
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("scores a fixture-backed rule scaffold", async () => {
    const rulesRoot = path.join(tempRoot, "rules");
    const outDir = path.join(tempRoot, "out");
    const scaffoldExit = await ruleCommand([
      "new",
      "unsafe-redirect",
      "--out",
      rulesRoot,
      "--force",
    ], { VERSION, EXIT, getOption });
    const ruleDir = path.join(rulesRoot, "unsafe-redirect");

    const scoreExit = await ruleCommand([
      "score",
      ruleDir,
      "--out",
      outDir,
      "--quiet",
    ], { VERSION, EXIT, getOption });
    const artifact = JSON.parse(readFileSync(path.join(outDir, "rule-quality-score.json"), "utf8"));

    expect(scaffoldExit).toBe(EXIT.OK);
    expect(scoreExit).toBe(EXIT.OK);
    expect(artifact).toMatchObject({
      artifact: "rule-quality-score",
      schema: "rule-quality-score@v1",
      subject: {
        type: "rule",
        id: "UNSAFE_REDIRECT",
      },
      scores: {
        fixtureCoverage: { score: 100 },
        falsePositiveReview: { score: 100 },
        schemaCompatibility: { score: 100 },
      },
      formula: { version: "ctg-rule-quality-score-v1" },
      generated_by: "ctg-rule-quality-score-v1",
    });
    expect(artifact.summary.totalScore).toBeGreaterThanOrEqual(90);
    expect(artifact.inputEvidence.map((entry: { id: string }) => entry.id)).toEqual(
      expect.arrayContaining(["rule.manifest.json", "rule.test.ts", "fixtures/positive.ts", "fixtures/negative.ts"])
    );
  });

  it("rejects missing rule directories", async () => {
    const exitCode = await ruleCommand(["score", path.join(tempRoot, "missing"), "--quiet"], { VERSION, EXIT, getOption });

    expect(exitCode).toBe(EXIT.USAGE_ERROR);
  });
});
