import { describe, expect, it } from "vitest";

import type { FindingsArtifact, ReleaseReadinessArtifact } from "../../types/artifacts.js";
import type { QEGArtifactServices } from "../qeg-artifact-io.js";
import {
  generateArtifactHashes,
  loadQEGCodeToGateEvidence,
  loadQEGCodeToGateEvidenceResult,
  writeQEGCodeToGateEvidence,
} from "../qeg-artifact-io.js";
import {
  generateQEGCodeToGateEvidence,
  summarizeAssuranceFindings,
} from "../qeg-connector.js";

function createServices(): QEGArtifactServices & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    fileAccess: {
      readFile: (path) => files.get(path) ?? null,
      writeFile: (path, content) => { files.set(path, content); },
      exists: (path) => files.has(path),
      readDir: () => [],
      stat: () => null,
      mkdir: () => undefined,
      remove: () => undefined,
    },
    hashService: {
      sha256: (value) => value === "{}" ? "a".repeat(64) : "b".repeat(64),
      fingerprint: () => "a".repeat(16),
    },
    pathService: {
      join: (...segments) => segments.join("/"),
      resolve: (...segments) => segments.join("/"),
      relative: (_from, to) => to,
      dirname: () => "",
      basename: (path) => path,
      extname: () => "",
      isAbsolute: () => false,
      toPosix: (path) => path,
      cwd: () => "/",
    },
  };
}

describe("QEG evidence separation", () => {
  it("constructs evidence without I/O or a decision field", () => {
    const evidence = generateQEGCodeToGateEvidence(
      { findings: [] } as unknown as FindingsArtifact,
      { status: "review" } as unknown as ReleaseReadinessArtifact,
      [],
      ".qh",
      "run-1"
    );

    expect(evidence.artifact_hashes).toEqual([]);
    expect(evidence).not.toHaveProperty("decision");
  });

  it("uses injected services for hashing, writing, and loading", () => {
    const services = createServices();
    services.files.set(".qh/findings.json", "{}");
    services.files.set(".qh/assurance-findings.json", "{}");

    const hashes = generateArtifactHashes(".qh", services);
    expect(hashes).toEqual([
      {
        artifact: "findings.json",
        path: ".qh/findings.json",
        hash: `sha256:${"a".repeat(64)}`,
      },
      {
        artifact: "assurance-findings.json",
        path: ".qh/assurance-findings.json",
        hash: `sha256:${"a".repeat(64)}`,
      },
    ]);

    const evidence = generateQEGCodeToGateEvidence(
      { findings: [] } as unknown as FindingsArtifact,
      { status: "review" } as unknown as ReleaseReadinessArtifact,
      [],
      ".qh",
      "run-1",
      undefined,
      hashes
    );
    expect(writeQEGCodeToGateEvidence(".qh", evidence, services)).toBe(".qh/qeg-code-to-gate.json");
    expect(loadQEGCodeToGateEvidence(".qh", services)).toEqual(evidence);
    expect(loadQEGCodeToGateEvidenceResult(".qh", services)).toEqual({
      status: "success",
      value: evidence,
    });
  });

  it("returns structured load failures while preserving legacy null wrapper", () => {
    const services = createServices();

    expect(loadQEGCodeToGateEvidenceResult(".qh", services)).toEqual({ status: "missing" });
    expect(loadQEGCodeToGateEvidence(".qh", services)).toBeNull();

    services.files.set(".qh/qeg-code-to-gate.json", "{not json");
    const result = loadQEGCodeToGateEvidenceResult(".qh", services);
    expect(result.status).toBe("invalid_json");
    expect(loadQEGCodeToGateEvidence(".qh", services)).toBeNull();
  });

  it("adds optional assurance evidence without making a decision", () => {
    const assurance = {
      findings: [
        { ruleId: "GUARD_WEAKENED" },
        { ruleId: "GUARD_WEAKENED" },
        { ruleId: "RISK_WITHOUT_TEST" },
      ],
      unsupported_claims: [{ id: "unsupported-1" }],
    } as unknown as FindingsArtifact;
    const summary = summarizeAssuranceFindings(assurance);

    const evidence = generateQEGCodeToGateEvidence(
      { findings: [] } as unknown as FindingsArtifact,
      { status: "review" } as unknown as ReleaseReadinessArtifact,
      [],
      ".qh",
      "run-1",
      undefined,
      [],
      summary
    );

    expect(evidence.assurance_findings_summary).toEqual({
      total: 3,
      unsupported_claims: 1,
      by_rule: { GUARD_WEAKENED: 2, RISK_WITHOUT_TEST: 1 },
    });
    expect(evidence.quality_checks_actual).toEqual([{
      name: "assurance_inspection",
      status: "pass",
      evidence_path: "assurance-findings.json",
      details: "3 review-required candidates recorded",
    }]);
    expect(evidence).not.toHaveProperty("decision");
  });
});
