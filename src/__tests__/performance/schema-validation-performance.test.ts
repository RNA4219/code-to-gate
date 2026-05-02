/**
 * Performance tests for schema validation CLI command
 *
 * Phase 1 Performance Acceptance (docs/product-acceptance-v1.md):
 * - Schema validation (generated artifacts) <= 5s
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { schemaValidate } from "../../cli/schema-validate.js";
import { existsSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

const EXIT = {
  OK: 0,
  USAGE_ERROR: 2,
  SCHEMA_FAILED: 7,
};

describe("Schema Validation Performance Tests", () => {
  let tempDir: string;

  // Schema and artifact paths
  const schemasDir = path.resolve(import.meta.dirname, "../../../schemas");
  const integrationSchemasDir = path.join(schemasDir, "integrations");
  const fixturesDir = path.resolve(import.meta.dirname, "../../../fixtures");

  beforeAll(() => {
    tempDir = path.join(tmpdir(), `ctg-schema-perf-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean temp directory before each test
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    mkdirSync(tempDir, { recursive: true });
  });

  describe("Phase 1: Schema validation <= 5s", () => {
    const TARGET_MS = 5000; // 5 seconds

    it("single artifact validation completes within 5s", async () => {
      // Create a valid findings artifact
      const artifactPath = path.join(tempDir, "findings.json");
      writeFileSync(artifactPath, JSON.stringify({
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "perf-test-001",
        repo: { root: "/test" },
        tool: { name: "code-to-gate", version: "0.2.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: []
      }), "utf8");

      const start = Date.now();
      const args = ["validate", artifactPath];
      const result = await schemaValidate(args);
      const elapsed = Date.now() - start;

      console.log(`Single validation duration: ${elapsed}ms (target: ${TARGET_MS}ms)`);
      expect(typeof result).toBe("number");
      expect(elapsed).toBeLessThan(TARGET_MS);
    });

    it("core schema validation completes within 5s", async () => {
      // Validate core schemas
      const coreSchemas = [
        "normalized-repo-graph.schema.json",
        "findings.schema.json",
        "risk-register.schema.json",
        "test-seeds.schema.json",
        "release-readiness.schema.json",
        "audit.schema.json"
      ];

      const start = Date.now();
      for (const schemaName of coreSchemas) {
        const schemaPath = path.join(schemasDir, schemaName);
        if (existsSync(schemaPath)) {
          const result = await schemaValidate(["validate", schemaPath]);
          console.log(`${schemaName}: result=${result}`);
        }
      }
      const elapsed = Date.now() - start;

      console.log(`Core schema validation total: ${elapsed}ms (target: ${TARGET_MS}ms)`);
      expect(elapsed).toBeLessThan(TARGET_MS);
    });

    it("integration schema validation completes within 5s", async () => {
      // Validate integration schemas
      const integrationSchemas = [
        "gatefield-static-result.schema.json",
        "state-gate-evidence.schema.json",
        "manual-bb-seed.schema.json",
        "workflow-evidence.schema.json"
      ];

      const start = Date.now();
      for (const schemaName of integrationSchemas) {
        const schemaPath = path.join(integrationSchemasDir, schemaName);
        if (existsSync(schemaPath)) {
          const result = await schemaValidate(["validate", schemaPath]);
          console.log(`${schemaName}: result=${result}`);
        }
      }
      const elapsed = Date.now() - start;

      console.log(`Integration schema validation total: ${elapsed}ms (target: ${TARGET_MS}ms)`);
      expect(elapsed).toBeLessThan(TARGET_MS);
    });

    it("all 11 artifacts validation completes within 5s", async () => {
      // Create all 11 artifacts mentioned in product-acceptance-v1.md
      // Core: repo-graph.json, findings.json, risk-register.yaml, test-seeds.json,
      //       release-readiness.json, audit.json
      // Adapter: gatefield-static-result.json, state-gate-evidence.json,
      //          manual-bb-seed.json, workflow-evidence.json
      // SARIF: results.sarif

      // Create mock artifacts
      const artifacts = [
        { name: "repo-graph.json", content: {
          version: "ctg/v1", generated_at: "2025-01-01T00:00:00Z", run_id: "perf-001",
          repo: { root: "/test" }, tool: { name: "code-to-gate", version: "0.2.0", plugin_versions: [] },
          artifact: "normalized-repo-graph", schema: "normalized-repo-graph@v1",
          files: [], modules: [], symbols: [], relations: [], tests: [], configs: [],
          entrypoints: [], diagnostics: [], stats: { partial: false }
        }},
        { name: "findings.json", content: {
          version: "ctg/v1", generated_at: "2025-01-01T00:00:00Z", run_id: "perf-001",
          repo: { root: "/test" }, tool: { name: "code-to-gate", version: "0.2.0", plugin_versions: [] },
          artifact: "findings", schema: "findings@v1", completeness: "complete",
          findings: [], unsupported_claims: []
        }},
        { name: "audit.json", content: {
          version: "ctg/v1", generated_at: "2025-01-01T00:00:00Z", run_id: "perf-001",
          repo: { root: "/test" }, tool: { name: "code-to-gate", version: "0.2.0", plugin_versions: [] },
          artifact: "audit", schema: "audit@v1", inputs: [], exit: { code: 0, status: "passed" }
        }},
        { name: "gatefield-static-result.json", content: {
          version: "ctg.gatefield/v1alpha1", generated_at: "2025-01-01T00:00:00Z", run_id: "perf-001",
          repo: { root: "/test" }, tool: { name: "code-to-gate", version: "0.2.0", plugin_versions: [] }
        }},
        { name: "state-gate-evidence.json", content: {
          version: "ctg.state-gate/v1alpha1", generated_at: "2025-01-01T00:00:00Z", run_id: "perf-001",
          repo: { root: "/test" }, tool: { name: "code-to-gate", version: "0.2.0", plugin_versions: [] }
        }},
        { name: "manual-bb-seed.json", content: {
          version: "ctg.manual-bb/v1alpha1", generated_at: "2025-01-01T00:00:00Z", run_id: "perf-001",
          repo: { root: "/test" }, tool: { name: "code-to-gate", version: "0.2.0", plugin_versions: [] }
        }},
        { name: "workflow-evidence.json", content: {
          version: "ctg.workflow-evidence/v1alpha1", generated_at: "2025-01-01T00:00:00Z", run_id: "perf-001",
          repo: { root: "/test" }, tool: { name: "code-to-gate", version: "0.2.0", plugin_versions: [] }
        }},
        { name: "results.sarif", content: {
          $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
          version: "2.1.0", runs: []
        }}
      ];

      // Create YAML artifacts
      writeFileSync(path.join(tempDir, "risk-register.yaml"),
        "version: ctg/v1\nartifact: risk-register\nrisks: []\n", "utf8");
      writeFileSync(path.join(tempDir, "test-seeds.json"),
        JSON.stringify({ version: "ctg/v1", artifact: "test-seeds", seeds: [] }), "utf8");
      writeFileSync(path.join(tempDir, "release-readiness.json"),
        JSON.stringify({ version: "ctg/v1", artifact: "release-readiness", status: "passed" }), "utf8");

      // Create JSON artifacts
      for (const artifact of artifacts) {
        writeFileSync(path.join(tempDir, artifact.name), JSON.stringify(artifact.content), "utf8");
      }

      // Measure validation time for all artifacts
      const start = Date.now();
      const artifactFiles = readdirSync(tempDir);
      for (const file of artifactFiles) {
        const filePath = path.join(tempDir, file);
        const result = await schemaValidate(["validate", filePath]);
        console.log(`${file}: result=${result}`);
      }
      const elapsed = Date.now() - start;

      console.log(`All artifacts validation total: ${elapsed}ms (target: ${TARGET_MS}ms)`);
      console.log(`Artifacts validated: ${artifactFiles.length}`);
      expect(elapsed).toBeLessThan(TARGET_MS);
    });
  });

  describe("Performance consistency", () => {
    const TARGET_MS = 5000;

    it("validation performance is consistent across multiple runs", async () => {
      // Create a valid artifact
      const artifactPath = path.join(tempDir, "test.json");
      writeFileSync(artifactPath, JSON.stringify({
        version: "ctg/v1", artifact: "findings", schema: "findings@v1",
        generated_at: "2025-01-01T00:00:00Z", run_id: "perf-001",
        repo: { root: "/test" }, tool: { name: "code-to-gate", version: "0.2.0", plugin_versions: [] },
        completeness: "complete", findings: [], unsupported_claims: []
      }), "utf8");

      const runTimes: number[] = [];
      const runs = 5;

      for (let i = 0; i < runs; i++) {
        const start = Date.now();
        await schemaValidate(["validate", artifactPath]);
        const elapsed = Date.now() - start;
        runTimes.push(elapsed);
      }

      console.log(`Validation times across ${runs} runs: ${runTimes.join(", ")}ms`);

      // All runs should be within target
      for (const time of runTimes) {
        expect(time).toBeLessThan(TARGET_MS);
      }

      // Check variance - validation should be very consistent
      const minTime = Math.min(...runTimes);
      const maxTime = Math.max(...runTimes);
      console.log(`Min: ${minTime}ms, Max: ${maxTime}ms`);
      expect(maxTime - minTime).toBeLessThan(1000); // Within 1s variance
    });

    it("validation scales linearly with artifact size", async () => {
      // Create small artifact
      const smallPath = path.join(tempDir, "small.json");
      writeFileSync(smallPath, JSON.stringify({
        version: "ctg/v1", artifact: "findings", schema: "findings@v1",
        generated_at: "2025-01-01T00:00:00Z", run_id: "perf-001",
        repo: { root: "/test" }, tool: { name: "code-to-gate", version: "0.2.0", plugin_versions: [] },
        completeness: "complete", findings: [], unsupported_claims: []
      }), "utf8");

      // Create large artifact (many findings)
      const largePath = path.join(tempDir, "large.json");
      const manyFindings = Array.from({ length: 1000 }, (_, i) => ({
        id: `F${i}`, category: "test", rule: "TEST_RULE", severity: "low",
        description: "Test finding", evidence: { file: "test.ts", line: 1 }
      }));
      writeFileSync(largePath, JSON.stringify({
        version: "ctg/v1", artifact: "findings", schema: "findings@v1",
        generated_at: "2025-01-01T00:00:00Z", run_id: "perf-001",
        repo: { root: "/test" }, tool: { name: "code-to-gate", version: "0.2.0", plugin_versions: [] },
        completeness: "complete", findings: manyFindings, unsupported_claims: []
      }), "utf8");

      // Measure small
      const startSmall = Date.now();
      await schemaValidate(["validate", smallPath]);
      const timeSmall = Date.now() - startSmall;

      // Measure large
      const startLarge = Date.now();
      await schemaValidate(["validate", largePath]);
      const timeLarge = Date.now() - startLarge;

      console.log(`Small artifact: ${timeSmall}ms`);
      console.log(`Large artifact (1000 findings): ${timeLarge}ms`);
      console.log(`Ratio: ${(timeLarge / timeSmall).toFixed(2)}x`);

      // Both should be within target
      expect(timeSmall).toBeLessThan(TARGET_MS);
      expect(timeLarge).toBeLessThan(TARGET_MS);

      // Large should not be more than 10x slower (reasonable scaling)
      expect(timeLarge).toBeLessThan(timeSmall * 10);
    });
  });

  describe("Schema file validation performance", () => {
    const TARGET_MS = 5000;

    it("validating all schema files in schemas/ completes within 5s", async () => {
      const schemaFiles = readdirSync(schemasDir).filter(f => f.endsWith(".schema.json"));

      const start = Date.now();
      for (const schemaFile of schemaFiles) {
        const schemaPath = path.join(schemasDir, schemaFile);
        const result = await schemaValidate(["validate", schemaPath]);
        console.log(`${schemaFile}: result=${result}`);
      }
      const elapsed = Date.now() - start;

      console.log(`All schemas validation: ${elapsed}ms (${schemaFiles.length} schemas)`);
      expect(elapsed).toBeLessThan(TARGET_MS);
    });

    it("schema validation with $defs is efficient", async () => {
      // Create schema with many $defs
      const complexSchemaPath = path.join(tempDir, "complex.schema.json");
      const defs = {};
      for (let i = 0; i < 100; i++) {
        defs[`def${i}`] = {
          type: "object",
          properties: {
            field1: { type: "string" },
            field2: { type: "number" }
          }
        };
      }
      writeFileSync(complexSchemaPath, JSON.stringify({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        title: "Complex Schema",
        $defs: defs,
        type: "object"
      }), "utf8");

      const start = Date.now();
      const result = await schemaValidate(["validate", complexSchemaPath]);
      const elapsed = Date.now() - start;

      console.log(`Complex schema (100 $defs): ${elapsed}ms, result=${result}`);
      expect(elapsed).toBeLessThan(TARGET_MS);
    });
  });
});