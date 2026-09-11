import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import { createMockFindingsArtifact } from "../../test-utils/index.js";
import { loadBaselineFindingsArtifact } from "../ratchet-gate.js";

describe("ratchet baseline artifact loading", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ctg-ratchet-gate-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeFindings(filePath: string, runId: string): void {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(
      filePath,
      JSON.stringify(createMockFindingsArtifact({ run_id: runId, findings: [] }), null, 2),
      "utf8"
    );
  }

  function writeReadiness(filePath: string, findingsRef?: string): void {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(
      filePath,
      JSON.stringify({
        artifact: "release-readiness",
        artifactRefs: findingsRef === undefined ? {} : { findings: findingsRef },
      }),
      "utf8"
    );
  }

  it("honors an explicit readiness findings reference before a sibling findings file", () => {
    const reportDir = path.join(tempDir, "report");
    const readinessPath = path.join(reportDir, "release-readiness.json");
    const siblingPath = path.join(reportDir, "findings.json");
    const intendedPath = path.join(tempDir, "intended", "findings.json");

    writeFindings(siblingPath, "unrelated-sibling");
    writeFindings(intendedPath, "intended");
    writeReadiness(readinessPath, "../intended/findings.json");

    const loaded = loadBaselineFindingsArtifact(readinessPath, tempDir);

    expect(loaded.source).toBe(path.resolve(intendedPath));
    expect(loaded.artifact.run_id).toBe("intended");
  });

  it("does not substitute a sibling when an explicit readiness findings reference is missing", () => {
    const reportDir = path.join(tempDir, "report");
    const readinessPath = path.join(reportDir, "release-readiness.json");

    writeFindings(path.join(reportDir, "findings.json"), "unrelated-sibling");
    writeReadiness(readinessPath, "../missing/findings.json");

    expect(() => loadBaselineFindingsArtifact(readinessPath, tempDir)).toThrow(
      /explicit artifactRefs\.findings/
    );
  });

  it("keeps sibling fallback when readiness has no explicit findings reference", () => {
    const reportDir = path.join(tempDir, "report");
    const readinessPath = path.join(reportDir, "release-readiness.json");
    const siblingPath = path.join(reportDir, "findings.json");

    writeFindings(siblingPath, "sibling-without-explicit-ref");
    writeReadiness(readinessPath);

    const loaded = loadBaselineFindingsArtifact(readinessPath, tempDir);

    expect(loaded.source).toBe(path.resolve(siblingPath));
    expect(loaded.artifact.run_id).toBe("sibling-without-explicit-ref");
  });
});
