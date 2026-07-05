import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createDoctorArtifact } from "../../doctor/doctor.js";
import { doctorCommand } from "../doctor.js";

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

describe("doctor CLI", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-doctor-"));
  });

  afterEach(() => {
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("writes a doctor artifact for local diagnostics", async () => {
    const outFile = path.join(tempRoot, "doctor.json");
    const exitCode = await doctorCommand(["--out", outFile, "--quiet"], { VERSION, EXIT, getOption });
    const artifact = JSON.parse(readFileSync(outFile, "utf8"));

    expect(exitCode).toBe(EXIT.OK);
    expect(artifact).toMatchObject({
      artifact: "doctor",
      schema: "doctor@v1",
      completeness: "complete",
    });
    expect(artifact.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "runtime.node", status: "pass" }),
        expect.objectContaining({ id: "schema.bundle", status: "pass" }),
      ])
    );
  });

  it("returns READINESS_NOT_CLEAR when a required artifact directory is missing", async () => {
    const outFile = path.join(tempRoot, "doctor.json");
    const missingDir = path.join(tempRoot, "missing-artifacts");
    const exitCode = await doctorCommand(["--out", outFile, "--from", missingDir, "--quiet"], {
      VERSION,
      EXIT,
      getOption,
    });
    const artifact = JSON.parse(readFileSync(outFile, "utf8"));

    expect(exitCode).toBe(EXIT.READINESS_NOT_CLEAR);
    expect(artifact.status).toBe("failed");
    expect(artifact.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "artifact.from", status: "fail" }),
      ])
    );
  });

  it("rejects unknown options", async () => {
    const exitCode = await doctorCommand(["--unknown"], { VERSION, EXIT, getOption });

    expect(exitCode).toBe(EXIT.USAGE_ERROR);
  });

  it("warns when PR workflow misses permissions or artifact upload path", () => {
    const repoRoot = path.join(tempRoot, "repo");
    const workflowPath = path.join(repoRoot, ".github", "workflows", "code-to-gate-pr.yml");
    mkdirSync(path.dirname(workflowPath), { recursive: true });
    writeFileSync(workflowPath, ["permissions:", "  contents: read", "steps:", "  - run: npm test"].join("\n"), "utf8");

    const result = createDoctorArtifact({ version: VERSION, repoRoot, out: path.join(tempRoot, "doctor.json") });

    expect(result.artifact.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ci.github-actions.permissions",
          status: "warn",
          observed: expect.stringContaining("actions/upload-artifact step"),
        }),
      ])
    );
  });
});
