import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import {
  loadCodeToGateEvidence,
  validateQEGInputs,
  extractMetrics,
  type QEGCodeToGateEvidence,
  type QEGInputs,
} from "../qeg-input-adapter.js";

const TEMP_DIR = path.join(import.meta.dirname, ".temp-adapter-test");

describe("QEG Input Adapter", () => {
  beforeEach(() => {
    if (existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEMP_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  });

  describe("loadCodeToGateEvidence", () => {
    it("returns null when qeg-code-to-gate.json does not exist", () => {
      const result = loadCodeToGateEvidence(TEMP_DIR);
      expect(result).toBeNull();
    });

    it("returns null when version is incorrect", () => {
      const invalidEvidence = {
        version: "invalid-version",
        producer: "code-to-gate",
        run_id: "ctg-12345-local",
        artifact_dir: TEMP_DIR,
        findings_summary: { total: 0, by_severity: {}, by_category: {}, by_rule: {} },
        readiness_status: "passed",
        schema_compliance: [],
        quality_checks_actual: [],
        artifact_hashes: [],
      };

      writeFileSync(
        path.join(TEMP_DIR, "qeg-code-to-gate.json"),
        JSON.stringify(invalidEvidence)
      );

      const result = loadCodeToGateEvidence(TEMP_DIR);
      expect(result).toBeNull();
    });

    it("returns null when producer is incorrect", () => {
      const invalidEvidence = {
        version: "ctg.qeg-input/v1",
        producer: "unknown-producer",
        run_id: "ctg-12345-local",
        artifact_dir: TEMP_DIR,
        findings_summary: { total: 0, by_severity: {}, by_category: {}, by_rule: {} },
        readiness_status: "passed",
        schema_compliance: [],
        quality_checks_actual: [],
        artifact_hashes: [],
      };

      writeFileSync(
        path.join(TEMP_DIR, "qeg-code-to-gate.json"),
        JSON.stringify(invalidEvidence)
      );

      const result = loadCodeToGateEvidence(TEMP_DIR);
      expect(result).toBeNull();
    });

    it("returns null when JSON is malformed", () => {
      writeFileSync(path.join(TEMP_DIR, "qeg-code-to-gate.json"), "not valid json");
      const result = loadCodeToGateEvidence(TEMP_DIR);
      expect(result).toBeNull();
    });

    it("loads valid evidence successfully", () => {
      const validEvidence: QEGCodeToGateEvidence = {
        version: "ctg.qeg-input/v1",
        producer: "code-to-gate",
        run_id: "ctg-1780978535487-a1b2c3d",
        commit_sha: "a1b2c3d4e5f6789012345678901234567890abcd",
        artifact_dir: TEMP_DIR,
        findings_summary: {
          total: 5,
          by_severity: { critical: 1, high: 2, medium: 2 },
          by_category: { security: 3, validation: 2 },
          by_rule: { VALIDATION_REMOVED: 2, GUARD_WEAKENED: 3 },
        },
        readiness_status: "needs_review",
        schema_compliance: [
          { artifact: "findings.json", status: "ok" },
          { artifact: "release-readiness.json", status: "ok" },
        ],
        quality_checks_actual: [
          { name: "lint", status: "pass", details: "No lint errors" },
          { name: "test:smoke", status: "pass", details: "53 tests passed" },
        ],
        artifact_hashes: [
          {
            artifact: "findings.json",
            path: path.join(TEMP_DIR, "findings.json"),
            hash: "sha256:abc123def456789012345678901234567890123456789012345678901234567890abcd",
          },
        ],
      };

      writeFileSync(
        path.join(TEMP_DIR, "qeg-code-to-gate.json"),
        JSON.stringify(validEvidence)
      );

      const result = loadCodeToGateEvidence(TEMP_DIR);

      expect(result).not.toBeNull();
      expect(result?.version).toBe("ctg.qeg-input/v1");
      expect(result?.producer).toBe("code-to-gate");
      expect(result?.run_id).toBe("ctg-1780978535487-a1b2c3d");
      expect(result?.findings_summary.total).toBe(5);
      expect(result?.readiness_status).toBe("needs_review");
      expect(result?.quality_checks_actual).toHaveLength(2);
    });

    it("does not include decision field in evidence", () => {
      const evidenceWithoutDecision: QEGCodeToGateEvidence = {
        version: "ctg.qeg-input/v1",
        producer: "code-to-gate",
        run_id: "ctg-12345-local",
        artifact_dir: TEMP_DIR,
        findings_summary: { total: 0, by_severity: {}, by_category: {}, by_rule: {} },
        readiness_status: "passed",
        schema_compliance: [],
        quality_checks_actual: [],
        artifact_hashes: [],
      };

      writeFileSync(
        path.join(TEMP_DIR, "qeg-code-to-gate.json"),
        JSON.stringify(evidenceWithoutDecision)
      );

      const result = loadCodeToGateEvidence(TEMP_DIR);

      // Verify that decision field does not exist
      expect(result).not.toBeNull();
      expect("decision" in (result as object)).toBe(false);
    });
  });

  describe("validateQEGInputs", () => {
    it("returns invalid when code-to-gate input is missing", () => {
      const inputs: QEGInputs = {
        code_to_gate: undefined,
        rand: undefined,
        manual_bb: undefined,
      };

      const result = validateQEGInputs(inputs);

      expect(result.valid).toBe(false);
      expect(result.missing).toContain("code-to-gate");
    });

    it("returns valid with code-to-gate only (basic gate)", () => {
      const inputs: QEGInputs = {
        code_to_gate: {
          version: "ctg.qeg-input/v1",
          producer: "code-to-gate",
          run_id: "ctg-12345-local",
          artifact_dir: TEMP_DIR,
          findings_summary: { total: 0, by_severity: {}, by_category: {}, by_rule: {} },
          readiness_status: "passed",
          schema_compliance: [],
          quality_checks_actual: [],
          artifact_hashes: [],
        },
        rand: undefined,
        manual_bb: undefined,
      };

      const result = validateQEGInputs(inputs);

      expect(result.valid).toBe(true);
      expect(result.ready_for_decision).toBe(false);
      expect(result.missing).toContain("RanD");
      expect(result.missing).toContain("manual-bb-test-harness");
    });

    it("returns ready_for_decision when all inputs are present", () => {
      const inputs: QEGInputs = {
        code_to_gate: {
          version: "ctg.qeg-input/v1",
          producer: "code-to-gate",
          run_id: "ctg-12345-local",
          artifact_dir: TEMP_DIR,
          findings_summary: { total: 0, by_severity: {}, by_category: {}, by_rule: {} },
          readiness_status: "passed",
          schema_compliance: [],
          quality_checks_actual: [],
          artifact_hashes: [],
        },
        rand: {
          version: "rand/v1",
          producer: "RanD",
        },
        manual_bb: {
          version: "manual-bb/v1",
          producer: "manual-bb-test-harness",
        },
      };

      const result = validateQEGInputs(inputs);

      expect(result.valid).toBe(true);
      expect(result.ready_for_decision).toBe(true);
      expect(result.missing).toHaveLength(0);
    });
  });

  describe("extractMetrics", () => {
    it("extracts key metrics from evidence", () => {
      const evidence: QEGCodeToGateEvidence = {
        version: "ctg.qeg-input/v1",
        producer: "code-to-gate",
        run_id: "ctg-12345-local",
        artifact_dir: TEMP_DIR,
        findings_summary: {
          total: 10,
          by_severity: { critical: 2, high: 3, medium: 5 },
          by_category: { security: 8, testing: 2 },
          by_rule: { GUARD_WEAKENED: 5, MISSING_SERVER_VALIDATION: 5 },
        },
        readiness_status: "blocked_input",
        schema_compliance: [
          { artifact: "findings.json", status: "ok" },
          { artifact: "repo-graph.json", status: "error", errors: ["Missing required field"] },
        ],
        quality_checks_actual: [
          { name: "lint", status: "pass", details: "OK" },
          { name: "typecheck", status: "fail", details: "3 errors found" },
          { name: "test:smoke", status: "skipped", details: "Skipped" },
        ],
        artifact_hashes: [],
      };

      const metrics = extractMetrics(evidence);

      expect(metrics.total_findings).toBe(10);
      expect(metrics.critical_count).toBe(2);
      expect(metrics.high_count).toBe(3);
      expect(metrics.readiness_status).toBe("blocked_input");
      expect(metrics.schema_valid).toBe(false);
      expect(metrics.quality_checks_failed).toBe(1);
    });

    it("returns schema_valid true when all artifacts pass", () => {
      const evidence: QEGCodeToGateEvidence = {
        version: "ctg.qeg-input/v1",
        producer: "code-to-gate",
        run_id: "ctg-12345-local",
        artifact_dir: TEMP_DIR,
        findings_summary: { total: 0, by_severity: {}, by_category: {}, by_rule: {} },
        readiness_status: "passed",
        schema_compliance: [
          { artifact: "findings.json", status: "ok" },
          { artifact: "release-readiness.json", status: "ok" },
        ],
        quality_checks_actual: [],
        artifact_hashes: [],
      };

      const metrics = extractMetrics(evidence);

      expect(metrics.schema_valid).toBe(true);
    });

    it("returns zero counts for missing severity keys", () => {
      const evidence: QEGCodeToGateEvidence = {
        version: "ctg.qeg-input/v1",
        producer: "code-to-gate",
        run_id: "ctg-12345-local",
        artifact_dir: TEMP_DIR,
        findings_summary: { total: 0, by_severity: {}, by_category: {}, by_rule: {} },
        readiness_status: "passed",
        schema_compliance: [],
        quality_checks_actual: [],
        artifact_hashes: [],
      };

      const metrics = extractMetrics(evidence);

      expect(metrics.critical_count).toBe(0);
      expect(metrics.high_count).toBe(0);
    });
  });
});