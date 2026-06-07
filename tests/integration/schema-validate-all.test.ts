/**
 * Schema validate-all integration tests
 *
 * Tests the schema validate-all CLI command:
 * - Validates all artifacts in a directory after analyze
 * - Handles missing artifacts gracefully
 * - Fails on schema violations
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runCli,
  fixturePath,
  createTempOutDir,
  cleanupTempDir,
  writeFile,
  fileExists,
} from "./helper.js";
import path from "node:path";

const EXIT_OK = 0;
const EXIT_USAGE_ERROR = 2;
const EXIT_SCHEMA_FAILED = 7;

describe("schema validate-all integration", () => {
  const fixture = "demo-shop-ts";
  const fixtureRoot = fixturePath(fixture);
  let tempDir: string;

  beforeAll(() => {
    tempDir = createTempOutDir("schema-validate-all");
  });

  afterAll(() => {
    cleanupTempDir(tempDir);
  });

  describe("validate-all after analyze", () => {
    it("should validate all artifacts after full analyze", { timeout: 60000 }, () => {
      // Run analyze to generate all artifacts
      const analyzeResult = runCli([
        "analyze",
        fixtureRoot,
        "--emit",
        "all",
        "--out",
        tempDir,
        "--llm-provider",
        "deterministic",
      ]);

      expect(analyzeResult.exitCode).toBe(0);

      // Run schema validate-all
      const validateResult = runCli(["schema", "validate-all", tempDir]);

      expect(validateResult.exitCode).toBe(EXIT_OK);
      expect(validateResult.stdout).toContain("ok:");
      expect(validateResult.stdout).toContain("All artifacts validated successfully");
    });

    it("should skip missing artifacts gracefully", { timeout: 30000 }, () => {
      // Create a minimal artifacts directory with only findings.json
      const minimalDir = createTempOutDir("schema-validate-minimal");

      // Generate a minimal findings.json matching schema requirements
      // Note: Schema uses additionalProperties: false, so only include schema-defined fields
      const minimalFindings = {
        version: "ctg/v1",
        generated_at: new Date().toISOString(),
        run_id: "test-run-001",
        repo: { root: "test" },
        tool: { name: "code-to-gate", version: "1.0.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      writeFile(path.join(minimalDir, "findings.json"), JSON.stringify(minimalFindings, null, 2));

      const validateResult = runCli(["schema", "validate-all", minimalDir]);

      expect(validateResult.exitCode).toBe(EXIT_OK);
      expect(validateResult.stdout).toContain("skipped (not found):");

      cleanupTempDir(minimalDir);
    });
  });

  describe("error handling", () => {
    it("should fail on missing directory", { timeout: 30000 }, () => {
      const validateResult = runCli(["schema", "validate-all", "/nonexistent/directory"]);

      expect(validateResult.exitCode).toBe(EXIT_USAGE_ERROR);
      expect(validateResult.stderr).toContain("directory not found");
    });

    it("should fail on malformed artifact", { timeout: 30000 }, () => {
      // Create a directory with malformed findings.json
      const malformedDir = createTempOutDir("schema-validate-malformed");

      // Malformed JSON (missing required fields)
      const malformedFindings = {
        artifact: "findings",
        // Missing required fields: version, generated_at, run_id, etc.
      };

      writeFile(path.join(malformedDir, "findings.json"), JSON.stringify(malformedFindings, null, 2));

      const validateResult = runCli(["schema", "validate-all", malformedDir]);

      expect(validateResult.exitCode).toBe(EXIT_SCHEMA_FAILED);
      expect(validateResult.stderr).toContain("Schema validation failed for:");
      expect(validateResult.stderr).toContain("findings.json");

      cleanupTempDir(malformedDir);
    });

    it("should fail on schema violation in YAML artifact", { timeout: 30000 }, () => {
      const yamlDir = createTempOutDir("schema-validate-yaml");

      // Valid findings.json (needed to generate risk-register)
      // Note: Schema uses additionalProperties: false, so only include schema-defined fields
      const validFindings = {
        version: "ctg/v1",
        generated_at: new Date().toISOString(),
        run_id: "test-yaml-001",
        repo: { root: "test" },
        tool: { name: "code-to-gate", version: "1.0.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      writeFile(path.join(yamlDir, "findings.json"), JSON.stringify(validFindings, null, 2));

      // Malformed risk-register.yaml (missing required fields)
      const malformedYaml = `# malformed risk-register
version: ctg/v1
artifact: risk-register
# Missing: generated_at, run_id, repo, tool, schema, completeness, risks
`;

      writeFile(path.join(yamlDir, "risk-register.yaml"), malformedYaml);

      const validateResult = runCli(["schema", "validate-all", yamlDir]);

      expect(validateResult.exitCode).toBe(EXIT_SCHEMA_FAILED);
      expect(validateResult.stderr).toContain("risk-register.yaml");

      cleanupTempDir(yamlDir);
    });
  });

  describe("usage validation", () => {
    it("should require directory argument", { timeout: 10000 }, () => {
      const validateResult = runCli(["schema", "validate-all"]);

      expect(validateResult.exitCode).toBe(EXIT_USAGE_ERROR);
      expect(validateResult.stderr).toContain("usage:");
      expect(validateResult.stderr).toContain("validate-all");
    });

    it("should report progress for each artifact", { timeout: 60000 }, () => {
      // Run analyze to generate artifacts
      const analyzeResult = runCli([
        "analyze",
        fixtureRoot,
        "--emit",
        "all",
        "--out",
        tempDir,
        "--llm-provider",
        "deterministic",
      ]);

      expect(analyzeResult.exitCode).toBe(0);

      const validateResult = runCli(["schema", "validate-all", tempDir]);

      // Should report status for each artifact found
      expect(validateResult.stdout).toMatch(/ok: findings\.json/);
      expect(validateResult.stdout).toMatch(/ok: repo-graph\.json/);
      expect(validateResult.stdout).toMatch(/ok: risk-register\.yaml/);
    });
  });

  describe("risk-register YAML validation", () => {
    it("should validate risk-register with camelCase keys", { timeout: 60000 }, () => {
      // Run analyze to generate artifacts
      const analyzeResult = runCli([
        "analyze",
        fixtureRoot,
        "--emit",
        "all",
        "--out",
        tempDir,
        "--llm-provider",
        "deterministic",
      ]);

      expect(analyzeResult.exitCode).toBe(0);
      expect(fileExists(path.join(tempDir, "risk-register.yaml"))).toBe(true);

      // Schema validate-all should pass for risk-register.yaml
      const validateResult = runCli(["schema", "validate-all", tempDir]);

      expect(validateResult.exitCode).toBe(EXIT_OK);
      // risk-register.yaml should be validated without errors
      expect(validateResult.stderr).not.toContain("risk-register.yaml");
    });
  });
});
