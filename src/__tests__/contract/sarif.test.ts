/**
 * Contract tests for SARIF export adapter
 *
 * Validates that generated SARIF payloads conform to
 * the SARIF v2.1.0 specification.
 */

import { describe, it, expect, beforeAll } from "vitest";
import AjvImport from "ajv";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const Ajv = AjvImport.default || AjvImport;
import addFormatsImport from "ajv-formats";
const addFormats = addFormatsImport.default || addFormatsImport;

import {
  generateSarif,
} from "../../cli/export.js";
import { Severity } from "../../types/artifacts.js";
import { createMockFindingsArtifact } from "../../test-utils/index.js";

const SCHEMA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../schemas"
);

// SARIF schema URL (we'll validate structure inline since official schema may not be available)
const SARIF_SCHEMA_URL = "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json";

let ajv: InstanceType<typeof Ajv>;

const createMockFindings = createMockFindingsArtifact;

describe("SARIF Export Adapter Contract Tests", () => {
  beforeAll(async () => {
    ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
    addFormats(ajv);
  });

  describe("Required fields validation", () => {
    it("should have required SARIF top-level fields", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "file.ts", startLine: 10, kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateSarif(findings);

      expect(result.$schema).toBeDefined();
      expect(result.version).toBeDefined();
      expect(result.runs).toBeDefined();
      expect(Array.isArray(result.runs)).toBe(true);
    });

    it("should have correct $schema URI", () => {
      const findings = createMockFindings();
      const result = generateSarif(findings);

      expect(result.$schema).toBe(SARIF_SCHEMA_URL);
    });

    it("should have version 2.1.0", () => {
      const findings = createMockFindings();
      const result = generateSarif(findings);

      expect(result.version).toBe("2.1.0");
    });

    it("should have at least one run", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateSarif(findings);

      expect(result.runs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Run structure validation", () => {
    it("should have tool.driver in each run", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateSarif(findings);

      for (const run of result.runs) {
        expect(run.tool).toBeDefined();
        expect(run.tool.driver).toBeDefined();
        expect(run.tool.driver.name).toBeDefined();
        expect(run.tool.driver.version).toBeDefined();
      }
    });

    it("should have tool.driver.name as code-to-gate", () => {
      const findings = createMockFindings();
      const result = generateSarif(findings);

      expect(result.runs[0].tool.driver.name).toBe("code-to-gate");
    });

    it("should have tool.driver.version", () => {
      const findings = createMockFindings();
      const result = generateSarif(findings);

      expect(typeof result.runs[0].tool.driver.version).toBe("string");
      expect(result.runs[0].tool.driver.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("should have rules array in tool.driver", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "RULE_001", category: "security", severity: "high", confidence: 0.8, title: "Rule Title", summary: "S1", evidence: [] },
        ],
      });
      const result = generateSarif(findings);

      expect(Array.isArray(result.runs[0].tool.driver.rules)).toBe(true);

      for (const rule of result.runs[0].tool.driver.rules) {
        expect(rule.id).toBeDefined();
        expect(rule.shortDescription).toBeDefined();
        expect(rule.shortDescription.text).toBeDefined();
      }
    });

    it("should have results array in each run", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateSarif(findings);

      for (const run of result.runs) {
        expect(Array.isArray(run.results)).toBe(true);
      }
    });
  });

  describe("Result structure validation", () => {
    it("should have required fields in each result", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "RULE_001", category: "security", severity: "high", confidence: 0.8, title: "T1", summary: "Result summary", evidence: [{ id: "e1", path: "src/file.ts", startLine: 25, kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateSarif(findings);

      for (const sarifResult of result.runs[0].results) {
        expect(sarifResult.ruleId).toBeDefined();
        expect(sarifResult.level).toBeDefined();
        expect(sarifResult.message).toBeDefined();
        expect(sarifResult.message.text).toBeDefined();
        expect(Array.isArray(sarifResult.locations)).toBe(true);
      }
    });

    it("should have valid level enum values", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
          { id: "f2", ruleId: "R2", category: "security", severity: "high", confidence: 0.8, title: "T2", summary: "S2", evidence: [] },
          { id: "f3", ruleId: "R3", category: "security", severity: "medium", confidence: 0.7, title: "T3", summary: "S3", evidence: [] },
          { id: "f4", ruleId: "R4", category: "security", severity: "low", confidence: 0.6, title: "T4", summary: "S4", evidence: [] },
        ],
      });
      const result = generateSarif(findings);

      for (const sarifResult of result.runs[0].results) {
        expect(["error", "warning", "note"]).toContain(sarifResult.level);
      }
    });

    it("should have locations with physicalLocation", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "src/file.ts", startLine: 10, kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateSarif(findings);

      for (const sarifResult of result.runs[0].results) {
        for (const location of sarifResult.locations) {
          expect(location.physicalLocation).toBeDefined();
          expect(location.physicalLocation.artifactLocation).toBeDefined();
          expect(location.physicalLocation.artifactLocation.uri).toBeDefined();
          expect(location.physicalLocation.region).toBeDefined();
          expect(location.physicalLocation.region.startLine).toBeDefined();
        }
      }
    });
  });

  describe("Severity to SARIF level mapping", () => {
    it("should map critical severity to error level", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateSarif(findings);

      expect(result.runs[0].results[0].level).toBe("error");
    });

    it("should map high severity to error level", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateSarif(findings);

      expect(result.runs[0].results[0].level).toBe("error");
    });

    it("should map medium severity to warning level", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "medium", confidence: 0.7, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateSarif(findings);

      expect(result.runs[0].results[0].level).toBe("warning");
    });

    it("should map low severity to note level", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "low", confidence: 0.6, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateSarif(findings);

      expect(result.runs[0].results[0].level).toBe("note");
    });
  });

  describe("Rules collection", () => {
    it("should collect unique rules from findings", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "RULE_A", category: "security", severity: "high", confidence: 0.8, title: "Rule A Title", summary: "S1", evidence: [] },
          { id: "f2", ruleId: "RULE_A", category: "security", severity: "medium", confidence: 0.7, title: "Rule A Again", summary: "S2", evidence: [] },
          { id: "f3", ruleId: "RULE_B", category: "security", severity: "low", confidence: 0.6, title: "Rule B Title", summary: "S3", evidence: [] },
        ],
      });
      const result = generateSarif(findings);

      const ruleIds = result.runs[0].tool.driver.rules.map(r => r.id);
      expect(ruleIds).toContain("RULE_A");
      expect(ruleIds).toContain("RULE_B");
      expect(ruleIds.length).toBe(2); // Should be unique
    });

    it("should have shortDescription from finding title", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "RULE_XYZ", category: "security", severity: "high", confidence: 0.8, title: "Security vulnerability detected", summary: "S1", evidence: [] },
        ],
      });
      const result = generateSarif(findings);

      const rule = result.runs[0].tool.driver.rules.find(r => r.id === "RULE_XYZ");
      expect(rule?.shortDescription.text).toBe("Security vulnerability detected");
    });

    it("should have defaultConfiguration with level", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateSarif(findings);

      for (const rule of result.runs[0].tool.driver.rules) {
        expect(rule.defaultConfiguration).toBeDefined();
        expect(rule.defaultConfiguration?.level).toBeDefined();
      }
    });
  });

  describe("Location mapping", () => {
    it("should map evidence path to artifactLocation.uri", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "src/auth/guard.ts", startLine: 15, kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateSarif(findings);

      expect(result.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe("src/auth/guard.ts");
    });

    it("should map evidence startLine to region.startLine", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "file.ts", startLine: 42, kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateSarif(findings);

      expect(result.runs[0].results[0].locations[0].physicalLocation.region.startLine).toBe(42);
    });

    it("should include all evidence locations", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "R1",
            category: "security",
            severity: "high",
            confidence: 0.8,
            title: "T1",
            summary: "S1",
            evidence: [
              { id: "e1", path: "src/file1.ts", startLine: 10, kind: "text", excerptHash: "h" },
              { id: "e2", path: "src/file2.ts", startLine: 20, kind: "text", excerptHash: "h" },
            ],
          },
        ],
      });
      const result = generateSarif(findings);

      expect(result.runs[0].results[0].locations.length).toBe(2);
    });

    it("should default startLine to 1 if not specified", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "file.ts", kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateSarif(findings);

      expect(result.runs[0].results[0].locations[0].physicalLocation.region.startLine).toBe(1);
    });
  });

  describe("Version string format validation", () => {
    it("should have SARIF version 2.1.0", () => {
      const findings = createMockFindings();
      const result = generateSarif(findings);

      expect(result.version).toBe("2.1.0");
    });

    it("should have consistent SARIF version across calls", () => {
      const findings1 = createMockFindings();
      const findings2 = createMockFindings({ run_id: "different" });

      const result1 = generateSarif(findings1);
      const result2 = generateSarif(findings2);

      expect(result1.version).toBe(result2.version);
      expect(result1.$schema).toBe(result2.$schema);
    });
  });

  describe("Message structure", () => {
    it("should use finding summary as result message", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "high", confidence: 0.8, title: "T1", summary: "Authentication weakness allows unauthorized access", evidence: [] },
        ],
      });
      const result = generateSarif(findings);

      expect(result.runs[0].results[0].message.text).toBe("Authentication weakness allows unauthorized access");
    });
  });

  describe("Empty findings handling", () => {
    it("should generate valid SARIF with no findings", () => {
      const findings = createMockFindings();
      const result = generateSarif(findings);

      expect(result.$schema).toBeDefined();
      expect(result.version).toBe("2.1.0");
      expect(Array.isArray(result.runs)).toBe(true);
      expect(result.runs.length).toBe(1);
      expect(Array.isArray(result.runs[0].results)).toBe(true);
      expect(result.runs[0].results.length).toBe(0);
    });

    it("should have empty rules array when no findings", () => {
      const findings = createMockFindings();
      const result = generateSarif(findings);

      expect(Array.isArray(result.runs[0].tool.driver.rules)).toBe(true);
      expect(result.runs[0].tool.driver.rules.length).toBe(0);
    });
  });

  describe("Multiple findings handling", () => {
    it("should generate correct number of results for multiple findings", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [] },
          { id: "f2", ruleId: "R2", category: "auth", severity: "medium", confidence: 0.7, title: "T2", summary: "S2", evidence: [] },
          { id: "f3", ruleId: "R3", category: "validation", severity: "low", confidence: 0.6, title: "T3", summary: "S3", evidence: [] },
        ],
      });
      const result = generateSarif(findings);

      expect(result.runs[0].results.length).toBe(3);
    });

    it("should preserve finding ruleId in results", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "CLIENT_TRUSTED_PRICE", category: "payment", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
          { id: "f2", ruleId: "WEAK_AUTH_GUARD", category: "auth", severity: "high", confidence: 0.8, title: "T2", summary: "S2", evidence: [] },
        ],
      });
      const result = generateSarif(findings);

      const ruleIdsInResults = result.runs[0].results.map(r => r.ruleId);
      expect(ruleIdsInResults).toContain("CLIENT_TRUSTED_PRICE");
      expect(ruleIdsInResults).toContain("WEAK_AUTH_GUARD");
    });
  });
});