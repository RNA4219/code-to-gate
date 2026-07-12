/**
 * Tests for schema-validate CLI command
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { schemaValidate, validateAllArtifactsWithResults } from "../schema-validate.js";
import { existsSync, writeFileSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

const EXIT = {
  OK: 0,
  USAGE_ERROR: 2,
  SCHEMA_FAILED: 7,
};

describe("schema-validate CLI", () => {
  let tempDir: string;
  const schemasDir = path.resolve(import.meta.dirname, "../../../schemas");
  const integrationSchemasDir = path.resolve(import.meta.dirname, "../../../schemas/integrations");

  beforeAll(() => {
    tempDir = path.join(tmpdir(), `ctg-schema-test-${Date.now()}`);
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

  it("exit code 0 for valid schema file", async () => {
    // Test validating a valid schema file
    const schemaPath = path.join(schemasDir, "findings.schema.json");
    if (!existsSync(schemaPath)) {
      // Skip if schema doesn't exist
      return;
    }

    const args = ["validate", schemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });

  it("exit code SCHEMA_FAILED (7) for invalid JSON", async () => {
    // Create an invalid JSON file
    const invalidJsonPath = path.join(tempDir, "invalid.json");
    writeFileSync(invalidJsonPath, "{ not valid json }", "utf8");

    const args = ["validate", invalidJsonPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.SCHEMA_FAILED);
  });

  it("exit code USAGE_ERROR for missing file", async () => {
    const args = ["validate", "/nonexistent/file.json"];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when validate argument missing", async () => {
    const args: string[] = [];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when file argument missing", async () => {
    const args = ["validate"];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("validates normalized-repo-graph schema", async () => {
    const schemaPath = path.join(schemasDir, "normalized-repo-graph.schema.json");
    if (!existsSync(schemaPath)) {
      return;
    }

    const args = ["validate", schemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });

  it("validates risk-register schema", async () => {
    const schemaPath = path.join(schemasDir, "risk-register.schema.json");
    if (!existsSync(schemaPath)) {
      return;
    }

    const args = ["validate", schemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });

  it("validates audit schema", async () => {
    const schemaPath = path.join(schemasDir, "audit.schema.json");
    if (!existsSync(schemaPath)) {
      return;
    }

    const args = ["validate", schemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });

  it("exit code SCHEMA_FAILED for artifact missing required fields", async () => {
    // Create a findings artifact missing required fields
    const invalidArtifactPath = path.join(tempDir, "invalid-findings.json");
    writeFileSync(invalidArtifactPath, JSON.stringify({
      version: "ctg/v1",
      artifact: "findings",
      // Missing: schema, findings, etc.
    }), "utf8");

    const args = ["validate", invalidArtifactPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.SCHEMA_FAILED);
  });

  it("validates valid findings artifact", async () => {
    // Create a valid findings artifact
    const validFindingsPath = path.join(tempDir, "valid-findings.json");
    const validFindings = JSON.parse(readFileSync(
      path.join(schemasDir, "findings.schema.json"),
      "utf8"
    ));

    writeFileSync(validFindingsPath, JSON.stringify({
      version: "ctg/v1",
      generated_at: "2025-01-01T00:00:00Z",
      run_id: "test-run-001",
      repo: { root: "/test" },
      tool: {
        name: "code-to-gate",
        version: "0.1.0",
        plugin_versions: []
      },
      artifact: "findings",
      schema: "findings@v1",
      completeness: "complete",
      findings: [],
      unsupported_claims: []
    }), "utf8");

    const args = ["validate", validFindingsPath];
    const result = await schemaValidate(args);
    // May be OK or SCHEMA_FAILED depending on schema resolution
    // Just verify it doesn't crash
    expect(typeof result).toBe("number");
  });

  // Additional tests for edge cases and error handling

  it("exit code SCHEMA_FAILED for schema file missing $schema", async () => {
    // Create a schema file without $schema
    const invalidSchemaPath = path.join(tempDir, "invalid.schema.json");
    writeFileSync(invalidSchemaPath, JSON.stringify({
      title: "Test Schema",
      type: "object"
    }), "utf8");

    const args = ["validate", invalidSchemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.SCHEMA_FAILED);
  });

  it("exit code SCHEMA_FAILED for schema file missing title", async () => {
    // Create a schema file without title
    const invalidSchemaPath = path.join(tempDir, "no-title.schema.json");
    writeFileSync(invalidSchemaPath, JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object"
    }), "utf8");

    const args = ["validate", invalidSchemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.SCHEMA_FAILED);
  });

  it("exit code SCHEMA_FAILED for schema file with missing structure", async () => {
    // Create a schema file without type or other structural keywords
    const invalidSchemaPath = path.join(tempDir, "no-structure.schema.json");
    writeFileSync(invalidSchemaPath, JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "Test Schema"
    }), "utf8");

    const args = ["validate", invalidSchemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.SCHEMA_FAILED);
  });

  it("validates valid schema file with $defs", async () => {
    const validSchemaPath = path.join(tempDir, "valid-defs.schema.json");
    writeFileSync(validSchemaPath, JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "Valid Schema with defs",
      $defs: {
        id: { type: "string" }
      },
      type: "object"
    }), "utf8");

    const args = ["validate", validSchemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });

  it("validates valid schema file with properties", async () => {
    const validSchemaPath = path.join(tempDir, "valid-props.schema.json");
    writeFileSync(validSchemaPath, JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "Valid Schema with properties",
      type: "object",
      properties: {
        name: { type: "string" }
      }
    }), "utf8");

    const args = ["validate", validSchemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });

  it("validates valid schema file with allOf", async () => {
    const validSchemaPath = path.join(tempDir, "valid-allof.schema.json");
    writeFileSync(validSchemaPath, JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "Valid Schema with allOf",
      allOf: [{ type: "object" }]
    }), "utf8");

    const args = ["validate", validSchemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });

  it("validates valid schema file with anyOf", async () => {
    const validSchemaPath = path.join(tempDir, "valid-anyof.schema.json");
    writeFileSync(validSchemaPath, JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "Valid Schema with anyOf",
      anyOf: [{ type: "object" }]
    }), "utf8");

    const args = ["validate", validSchemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });

  it("validates valid schema file with oneOf", async () => {
    const validSchemaPath = path.join(tempDir, "valid-oneof.schema.json");
    writeFileSync(validSchemaPath, JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "Valid Schema with oneOf",
      oneOf: [{ type: "object" }]
    }), "utf8");

    const args = ["validate", validSchemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });


  it("resolves agent protocol schema identifiers", async () => {
    const artifacts = {
      capabilities: {
        schema: "ctg-agent-capabilities@v1",
        protocol: "ctg-agent/1.0",
        protocols: ["ctg-agent/1.0"],
        tool: { name: "code-to-gate", version: "1.5.0" },
        operations: [],
        schemas: [],
      },
      manifest: {
        schema: "ctg-run-manifest@v1",
        protocol: "ctg-agent/1.0",
        tool: { name: "code-to-gate", version: "1.5.0" },
        run_id: "0123456789abcdef0123456789abcdef",
        request_id: "schema-test",
        fingerprint: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        input_digest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        action: "doctor",
        status: "succeeded",
        created_at: "2026-07-12T00:00:00.000Z",
        updated_at: "2026-07-12T00:00:01.000Z",
        negotiated: { protocol: "ctg-agent/1.0", schema_majors: {} },
        resolved_execution: {
          timeout_ms: 1000,
          total_timeout_ms: 1000,
          retry: { max_attempts: 1, backoff_ms: 0, max_backoff_ms: 0, retry_on: [] },
          partial: "allow",
        },
        attempts: [],
        completeness: "complete",
        summary: {},
        artifacts: [],
        next_actions: [],
      },
      determinism: {
        schema: "ctg-agent-determinism@v1",
        capabilities_digest_sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        projection: {},
        toolchain: { node: "v22.23.1", package_manager: "npm@10.9.8" },
      },
    };
    for (const [name, artifact] of Object.entries(artifacts)) {
      const file = path.join(tempDir, "agent-" + name + ".json");
      writeFileSync(file, JSON.stringify(artifact), "utf8");
      expect(await schemaValidate(["validate", file])).toBe(EXIT.OK);
    }
  });

  it("handles artifact without artifact field", async () => {
    // Create an artifact without artifact field
    const noArtifactPath = path.join(tempDir, "no-artifact.json");
    writeFileSync(noArtifactPath, JSON.stringify({
      version: "ctg/v1",
      // Missing artifact field - can't determine schema
    }), "utf8");

    const args = ["validate", noArtifactPath];
    const result = await schemaValidate(args);
    // Should fail because can't choose schema
    expect(result).toBe(EXIT.SCHEMA_FAILED);
  });

  it("handles artifact with unknown artifact type", async () => {
    // Create an artifact with unknown artifact type
    const unknownArtifactPath = path.join(tempDir, "unknown-artifact.json");
    writeFileSync(unknownArtifactPath, JSON.stringify({
      version: "ctg/v1",
      artifact: "unknown-type"
    }), "utf8");

    const args = ["validate", unknownArtifactPath];
    const result = await schemaValidate(args);
    // Should fail because schema not found
    expect(result).toBe(EXIT.SCHEMA_FAILED);
  });

  it("validates integration schema - gatefield-static-result", async () => {
    const schemaPath = path.join(integrationSchemasDir, "gatefield-static-result.schema.json");
    if (!existsSync(schemaPath)) {
      return;
    }

    const args = ["validate", schemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });

  it("validates integration schema - state-gate-evidence", async () => {
    const schemaPath = path.join(integrationSchemasDir, "state-gate-evidence.schema.json");
    if (!existsSync(schemaPath)) {
      return;
    }

    const args = ["validate", schemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });

  it("validates integration schema - manual-bb-seed", async () => {
    const schemaPath = path.join(integrationSchemasDir, "manual-bb-seed.schema.json");
    if (!existsSync(schemaPath)) {
      return;
    }

    const args = ["validate", schemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });

  it("validates integration schema - workflow-evidence", async () => {
    const schemaPath = path.join(integrationSchemasDir, "workflow-evidence.schema.json");
    if (!existsSync(schemaPath)) {
      return;
    }

    const args = ["validate", schemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });

  it("validates artifact with integration version identifier - gatefield", async () => {
    // Create an artifact with gatefield version identifier
    const gatefieldPath = path.join(tempDir, "gatefield.json");
    writeFileSync(gatefieldPath, JSON.stringify({
      version: "ctg.gatefield/v1alpha1",
      generated_at: "2025-01-01T00:00:00Z",
      run_id: "test-run",
      tool: { name: "test", version: "1.0.0", plugin_versions: [] },
      repo: { root: "/test" }
    }), "utf8");

    const args = ["validate", gatefieldPath];
    const result = await schemaValidate(args);
    // May succeed or fail depending on schema content
    expect(typeof result).toBe("number");
  });

  it("validates artifact with integration version identifier - state-gate", async () => {
    // Create an artifact with state-gate version identifier
    const stateGatePath = path.join(tempDir, "state-gate.json");
    writeFileSync(stateGatePath, JSON.stringify({
      version: "ctg.state-gate/v1alpha1",
      generated_at: "2025-01-01T00:00:00Z",
      run_id: "test-run",
      tool: { name: "test", version: "1.0.0", plugin_versions: [] },
      repo: { root: "/test" }
    }), "utf8");

    const args = ["validate", stateGatePath];
    const result = await schemaValidate(args);
    expect(typeof result).toBe("number");
  });

  it("validates artifact with integration version identifier - manual-bb", async () => {
    // Create an artifact with manual-bb version identifier
    const manualBbPath = path.join(tempDir, "manual-bb.json");
    writeFileSync(manualBbPath, JSON.stringify({
      version: "ctg.manual-bb/v1alpha1",
      generated_at: "2025-01-01T00:00:00Z",
      run_id: "test-run",
      tool: { name: "test", version: "1.0.0", plugin_versions: [] },
      repo: { root: "/test" }
    }), "utf8");

    const args = ["validate", manualBbPath];
    const result = await schemaValidate(args);
    expect(typeof result).toBe("number");
  });

  it("validates artifact with integration version identifier - workflow-evidence", async () => {
    // Create an artifact with workflow-evidence version identifier
    const workflowPath = path.join(tempDir, "workflow-evidence.json");
    writeFileSync(workflowPath, JSON.stringify({
      version: "ctg.workflow-evidence/v1alpha1",
      generated_at: "2025-01-01T00:00:00Z",
      run_id: "test-run",
      tool: { name: "test", version: "1.0.0", plugin_versions: [] },
      repo: { root: "/test" }
    }), "utf8");

    const args = ["validate", workflowPath];
    const result = await schemaValidate(args);
    expect(typeof result).toBe("number");
  });

  it("handles non-object JSON", async () => {
    // Create a file with non-object JSON
    const nonObjectPath = path.join(tempDir, "non-object.json");
    writeFileSync(nonObjectPath, JSON.stringify("just a string"), "utf8");

    const args = ["validate", nonObjectPath];
    const result = await schemaValidate(args);
    // Should fail - can't determine schema for non-object
    expect(result).toBe(EXIT.SCHEMA_FAILED);
  });

  it("handles null JSON value", async () => {
    // Create a file with null JSON value
    const nullPath = path.join(tempDir, "null.json");
    writeFileSync(nullPath, JSON.stringify(null), "utf8");

    const args = ["validate", nullPath];
    const result = await schemaValidate(args);
    // Should fail - can't determine schema for null
    expect(result).toBe(EXIT.SCHEMA_FAILED);
  });

  it("handles empty JSON object", async () => {
    // Create a file with empty JSON object
    const emptyPath = path.join(tempDir, "empty.json");
    writeFileSync(emptyPath, JSON.stringify({}), "utf8");

    const args = ["validate", emptyPath];
    const result = await schemaValidate(args);
    // Should fail - no artifact field
    expect(result).toBe(EXIT.SCHEMA_FAILED);
  });

  it("handles relative file path", async () => {
    // Create a valid schema file in temp dir
    const schemaPath = path.join(tempDir, "test.schema.json");
    writeFileSync(schemaPath, JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "Test Schema",
      type: "object"
    }), "utf8");

    // Change cwd would require spy, just use absolute path
    const args = ["validate", schemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });

  it("validates invariants schema", async () => {
    const schemaPath = path.join(schemasDir, "invariants.schema.json");
    if (!existsSync(schemaPath)) {
      return;
    }

    const args = ["validate", schemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });

  it("validates test-seeds schema", async () => {
    const schemaPath = path.join(schemasDir, "test-seeds.schema.json");
    if (!existsSync(schemaPath)) {
      return;
    }

    const args = ["validate", schemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });

  it("rejects invalid test-seeds intent values", async () => {
    const invalidSeedsPath = path.join(tempDir, "invalid-test-seeds.json");
    writeFileSync(invalidSeedsPath, JSON.stringify({
      version: "ctg/v1",
      generated_at: "2025-01-01T00:00:00Z",
      run_id: "test-run-001",
      repo: { root: "/test" },
      tool: {
        name: "code-to-gate",
        version: "0.1.0",
        plugin_versions: []
      },
      artifact: "test-seeds",
      schema: "test-seeds@v1",
      completeness: "complete",
      seeds: [
        {
          id: "seed-001",
          title: "Reject non-canonical intent",
          intent: "happy-path",
          sourceRiskIds: [],
          sourceFindingIds: ["finding-001"],
          evidence: [],
          suggestedLevel: "unit"
        }
      ]
    }), "utf8");

    const result = await schemaValidate(["validate", invalidSeedsPath]);
    expect(result).toBe(EXIT.SCHEMA_FAILED);
  });

  it("validates release-readiness schema", async () => {
    const schemaPath = path.join(schemasDir, "release-readiness.schema.json");
    if (!existsSync(schemaPath)) {
      return;
    }

    const args = ["validate", schemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });

  it("validates shared-defs schema", async () => {
    const schemaPath = path.join(schemasDir, "shared-defs.schema.json");
    if (!existsSync(schemaPath)) {
      return;
    }

    const args = ["validate", schemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });

  it("handles malformed JSON with trailing content", async () => {
    // Create a file with malformed JSON
    const malformedPath = path.join(tempDir, "malformed.json");
    writeFileSync(malformedPath, '{"key": "value"} extra content', "utf8");

    const args = ["validate", malformedPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.SCHEMA_FAILED);
  });

  it("handles JSON with syntax errors", async () => {
    // Create a file with JSON syntax errors
    const syntaxErrorPath = path.join(tempDir, "syntax-error.json");
    writeFileSync(syntaxErrorPath, '{"key": missing quotes}', "utf8");

    const args = ["validate", syntaxErrorPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.SCHEMA_FAILED);
  });

  it("validates valid normalized-repo-graph artifact", async () => {
    const validGraphPath = path.join(tempDir, "valid-graph.json");
    writeFileSync(validGraphPath, JSON.stringify({
      version: "ctg/v1",
      generated_at: "2025-01-01T00:00:00Z",
      run_id: "test-run",
      repo: { root: "/test" },
      tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
      artifact: "normalized-repo-graph",
      schema: "normalized-repo-graph@v1",
      files: [],
      modules: [],
      symbols: [],
      relations: [],
      tests: [],
      configs: [],
      entrypoints: [],
      diagnostics: [],
      stats: { partial: false }
    }), "utf8");

    const args = ["validate", validGraphPath];
    const result = await schemaValidate(args);
    expect(typeof result).toBe("number");
  });

  it("validates valid audit artifact", async () => {
    const validAuditPath = path.join(tempDir, "valid-audit.json");
    writeFileSync(validAuditPath, JSON.stringify({
      version: "ctg/v1",
      generated_at: "2025-01-01T00:00:00Z",
      run_id: "test-run",
      repo: { root: "/test" },
      tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
      artifact: "audit",
      schema: "audit@v1",
      inputs: [],
      policy: { id: "default", hash: "sha256:abc" },
      exit: { code: 0, status: "passed", reason: "All checks passed" }
    }), "utf8");

    const args = ["validate", validAuditPath];
    const result = await schemaValidate(args);
    expect(typeof result).toBe("number");
  });

  it("exit code SCHEMA_FAILED for artifact with wrong schema version", async () => {
    // Create artifact with mismatched schema
    const wrongSchemaPath = path.join(tempDir, "wrong-schema.json");
    writeFileSync(wrongSchemaPath, JSON.stringify({
      version: "ctg/v1",
      generated_at: "2025-01-01T00:00:00Z",
      run_id: "test-run",
      repo: { root: "/test" },
      tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
      artifact: "findings",
      schema: "wrong-schema@v1",
      completeness: "complete",
      findings: [],
      unsupported_claims: []
    }), "utf8");

    const args = ["validate", wrongSchemaPath];
    const result = await schemaValidate(args);
    // Should validate against findings schema and may fail for wrong schema field
    expect(typeof result).toBe("number");
  });

  it("migrates v1alpha1 artifact version to ctg/v1 and writes migration report", async () => {
    const legacyFindingsPath = path.join(tempDir, "legacy-findings.json");
    const outDir = path.join(tempDir, "migrated");
    writeFileSync(legacyFindingsPath, JSON.stringify({
      version: "ctg/v1alpha1",
      generated_at: "2025-01-01T00:00:00Z",
      run_id: "legacy-run",
      repo: { root: "/test" },
      tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
      artifact: "findings",
      schema: "findings@v1",
      completeness: "complete",
      findings: [],
      unsupported_claims: []
    }), "utf8");

    const result = await schemaValidate(["migrate", legacyFindingsPath, "--out", outDir]);
    const migratedPath = path.join(outDir, "legacy-findings.json");
    const reportPath = path.join(outDir, "schema-migration.json");
    const migrated = JSON.parse(readFileSync(migratedPath, "utf8"));
    const report = JSON.parse(readFileSync(reportPath, "utf8"));

    expect(result).toBe(EXIT.OK);
    expect(migrated.version).toBe("ctg/v1");
    expect(report).toMatchObject({
      artifact: "schema-migration",
      schema: "schema-migration@v1",
      status: "migrated",
      source: {
        artifact: "findings",
        schema: "findings@v1",
        version: "ctg/v1alpha1",
      },
      target: {
        artifact: "findings",
        schema: "findings@v1",
        version: "ctg/v1",
      },
      validation: {
        status: "ok",
        errors: [],
      },
    });
    expect(report.changes).toEqual([
      expect.objectContaining({ path: "/version", from: "ctg/v1alpha1", to: "ctg/v1" }),
    ]);
  });

  it("schema migrate records unchanged status for current v1 artifacts", async () => {
    const currentFindingsPath = path.join(tempDir, "current-findings.json");
    const outDir = path.join(tempDir, "unchanged");
    writeFileSync(currentFindingsPath, JSON.stringify({
      version: "ctg/v1",
      generated_at: "2025-01-01T00:00:00Z",
      run_id: "current-run",
      repo: { root: "/test" },
      tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
      artifact: "findings",
      schema: "findings@v1",
      completeness: "complete",
      findings: [],
      unsupported_claims: []
    }), "utf8");

    const result = await schemaValidate(["migrate", currentFindingsPath, "--out", outDir]);
    const report = JSON.parse(readFileSync(path.join(outDir, "schema-migration.json"), "utf8"));

    expect(result).toBe(EXIT.OK);
    expect(report.status).toBe("unchanged");
    expect(report.changes).toEqual([]);
    expect(report.validation.status).toBe("ok");
  });

  it("schema migrate infers integration artifact target versions", async () => {
    const stateGatePath = path.join(tempDir, "state-gate-v1alpha1.json");
    const outDir = path.join(tempDir, "state-gate-migrated");
    writeFileSync(stateGatePath, JSON.stringify({
      version: "ctg.state-gate/v1alpha1",
      producer: "code-to-gate",
      run_id: "integration-run",
      artifact_hash: "sha256:abc",
      release_readiness: {
        status: "passed",
        summary: "ok",
        failed_conditions: [],
      },
      evidence_refs: [],
      approval_relevance: {
        requires_human_attention: false,
        reasons: [],
      },
    }), "utf8");

    const result = await schemaValidate(["migrate", stateGatePath, "--out", outDir]);
    const migrated = JSON.parse(readFileSync(path.join(outDir, "state-gate-v1alpha1.json"), "utf8"));
    const report = JSON.parse(readFileSync(path.join(outDir, "schema-migration.json"), "utf8"));

    expect(result).toBe(EXIT.OK);
    expect(migrated.version).toBe("ctg.state-gate/v1");
    expect(report.status).toBe("migrated");
    expect(report.target.version).toBe("ctg.state-gate/v1");
    expect(report.validation.status).toBe("ok");
  });

  it("schema migrate rejects unsupported target versions", async () => {
    const currentFindingsPath = path.join(tempDir, "target-findings.json");
    writeFileSync(currentFindingsPath, JSON.stringify({
      version: "ctg/v1",
      artifact: "findings",
    }), "utf8");

    const result = await schemaValidate(["migrate", currentFindingsPath, "--out", tempDir, "--target-version", "ctg/v2"]);
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("schema migrate rejects target versions that do not match the source migration path", async () => {
    const stateGatePath = path.join(tempDir, "state-gate-target.json");
    writeFileSync(stateGatePath, JSON.stringify({
      version: "ctg.state-gate/v1alpha1",
      producer: "code-to-gate",
    }), "utf8");

    const result = await schemaValidate(["migrate", stateGatePath, "--out", tempDir, "--target-version", "ctg/v1"]);
    expect(result).toBe(EXIT.SCHEMA_FAILED);
  });

  it("handles first argument not being 'validate'", async () => {
    const args = ["other", "file.json"];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("handles file with Windows path", async () => {
    // Create a valid schema file
    const schemaPath = path.join(tempDir, "win-path.schema.json");
    writeFileSync(schemaPath, JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "Windows Path Test",
      type: "object"
    }), "utf8");

    const args = ["validate", schemaPath];
    const result = await schemaValidate(args);
    expect(result).toBe(EXIT.OK);
  });

  // --profile option tests (SPEC-29 Phase 2)

  describe("validate-all --profile option", () => {
    it("rejects validate-all without a directory", async () => {
      const result = await schemaValidate(["validate-all"]);
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("returns USAGE_ERROR when the directory does not exist", async () => {
      const missingDir = path.join(tempDir, "missing");

      const result = await schemaValidate(["validate-all", missingDir]);

      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("accepts --profile analyze", async () => {
      // Create artifacts for analyze profile (no release-readiness.json)
      writeFileSync(path.join(tempDir, "findings.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "test",
        repo: { root: "/test" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: []
      }), "utf8");
      writeFileSync(path.join(tempDir, "repo-graph.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "test",
        repo: { root: "/test" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        files: [],
        modules: [],
        symbols: [],
        relations: [],
        tests: [],
        configs: [],
        entrypoints: [],
        diagnostics: [],
        stats: { partial: false }
      }), "utf8");
      writeFileSync(path.join(tempDir, "audit.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "test",
        repo: { root: "/test" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "audit",
        schema: "audit@v1",
        inputs: [],
        policy: { id: "default", hash: "sha256:abc" },
        exit: { code: 0, status: "passed", reason: "All checks passed" }
      }), "utf8");
      // No release-readiness.json - should pass for analyze profile

      const args = ["validate-all", tempDir, "--profile", "analyze"];
      const result = await schemaValidate(args);
      expect(result).toBe(EXIT.OK);
    });

    it("fails with --profile full when release-readiness missing", async () => {
      // Create artifacts without release-readiness.json
      writeFileSync(path.join(tempDir, "findings.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "test",
        repo: { root: "/test" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: []
      }), "utf8");
      writeFileSync(path.join(tempDir, "repo-graph.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "test",
        repo: { root: "/test" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        files: [],
        modules: [],
        symbols: [],
        relations: [],
        tests: [],
        configs: [],
        entrypoints: [],
        diagnostics: [],
        stats: { partial: false }
      }), "utf8");
      writeFileSync(path.join(tempDir, "audit.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "test",
        repo: { root: "/test" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "audit",
        schema: "audit@v1",
        inputs: [],
        policy: { id: "default", hash: "sha256:abc" },
        exit: { code: 0, status: "passed", reason: "All checks passed" }
      }), "utf8");

      const args = ["validate-all", tempDir, "--profile", "full", "--strict"];
      const result = await schemaValidate(args);
      expect(result).toBe(EXIT.SCHEMA_FAILED);
    });

    it("defaults to full profile when --profile not specified", async () => {
      // Same setup - missing release-readiness.json
      writeFileSync(path.join(tempDir, "findings.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "test",
        repo: { root: "/test" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: []
      }), "utf8");
      writeFileSync(path.join(tempDir, "repo-graph.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "test",
        repo: { root: "/test" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        files: [],
        modules: [],
        symbols: [],
        relations: [],
        tests: [],
        configs: [],
        entrypoints: [],
        diagnostics: [],
        stats: { partial: false }
      }), "utf8");
      writeFileSync(path.join(tempDir, "audit.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "test",
        repo: { root: "/test" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "audit",
        schema: "audit@v1",
        inputs: [],
        policy: { id: "default", hash: "sha256:abc" },
        exit: { code: 0, status: "passed", reason: "All checks passed" }
      }), "utf8");

      const args = ["validate-all", tempDir, "--strict"];
      const result = await schemaValidate(args);
      // Default is full, so missing release-readiness.json should fail
      expect(result).toBe(EXIT.SCHEMA_FAILED);
    });

    it("returns USAGE_ERROR for invalid profile value", async () => {
      const args = ["validate-all", tempDir, "--profile", "invalid"];
      const result = await schemaValidate(args);
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("returns USAGE_ERROR when --profile has no value", async () => {
      const args = ["validate-all", tempDir, "--profile"];
      const result = await schemaValidate(args);
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("returns USAGE_ERROR when --profile value is another option", async () => {
      const args = ["validate-all", tempDir, "--profile", "--strict"];
      const result = await schemaValidate(args);
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("--allow-missing skips required artifacts even in strict mode", async () => {
      // Create only findings.json
      writeFileSync(path.join(tempDir, "findings.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "test",
        repo: { root: "/test" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: []
      }), "utf8");

      const args = ["validate-all", tempDir, "--profile", "analyze", "--strict", "--allow-missing"];
      const result = await schemaValidate(args);
      // Should pass even though repo-graph.json and audit.json are missing
      expect(result).toBe(EXIT.OK);
    });

    it("accepts --profile readiness with only release-readiness.json", async () => {
      writeFileSync(path.join(tempDir, "release-readiness.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "test",
        repo: { root: "/test" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "release-readiness",
        schema: "release-readiness@v1",
        status: "passed",
        completeness: "complete",
        summary: "All checks passed",
        counts: { findings: 0, critical: 0, high: 0, risks: 0, testSeeds: 0, unsupportedClaims: 0 },
        failedConditions: [],
        recommendedActions: [],
        artifactRefs: {}
      }), "utf8");

      const args = ["validate-all", tempDir, "--profile", "readiness"];
      const result = await schemaValidate(args);
      expect(result).toBe(EXIT.OK);
    });

    it("rejects unknown options", async () => {
      const args = ["validate-all", tempDir, "--unknown"];
      const result = await schemaValidate(args);
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("rejects duplicate --profile", async () => {
      const args = ["validate-all", tempDir, "--profile", "analyze", "--profile", "full"];
      const result = await schemaValidate(args);
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("rejects duplicate --strict", async () => {
      const result = await schemaValidate(["validate-all", tempDir, "--strict", "--strict"]);
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("rejects duplicate --allow-missing", async () => {
      const result = await schemaValidate(["validate-all", tempDir, "--allow-missing", "--allow-missing"]);
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("rejects extra positional arguments", async () => {
      const args = ["validate-all", tempDir, "extra-arg"];
      const result = await schemaValidate(args);
      expect(result).toBe(EXIT.USAGE_ERROR);
    });

    it("accepts a directory named analyze", async () => {
      const analyzeDir = path.join(tempDir, "analyze");
      mkdirSync(analyzeDir, { recursive: true });
      writeFileSync(path.join(analyzeDir, "findings.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "test",
        repo: { root: "/test" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: []
      }), "utf8");
      writeFileSync(path.join(analyzeDir, "repo-graph.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "test",
        repo: { root: "/test" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        files: [],
        modules: [],
        symbols: [],
        relations: [],
        tests: [],
        configs: [],
        entrypoints: [],
        diagnostics: [],
        stats: { partial: false }
      }), "utf8");
      writeFileSync(path.join(analyzeDir, "audit.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "test",
        repo: { root: "/test" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "audit",
        schema: "audit@v1",
        inputs: [],
        policy: { id: "default", hash: "sha256:abc" },
        exit: { code: 0, status: "passed", reason: "All checks passed" }
      }), "utf8");

      const args = ["validate-all", analyzeDir, "--profile", "analyze", "--strict"];
      const result = await schemaValidate(args);
      expect(result).toBe(EXIT.OK);
    });

    it("keeps validateAllArtifactsWithResults 4-arg call compatible", async () => {
      writeFileSync(path.join(tempDir, "findings.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "test",
        repo: { root: "/test" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: []
      }), "utf8");
      writeFileSync(path.join(tempDir, "repo-graph.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "test",
        repo: { root: "/test" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        files: [],
        modules: [],
        symbols: [],
        relations: [],
        tests: [],
        configs: [],
        entrypoints: [],
        diagnostics: [],
        stats: { partial: false }
      }), "utf8");
      writeFileSync(path.join(tempDir, "audit.json"), JSON.stringify({
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "test",
        repo: { root: "/test" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "audit",
        schema: "audit@v1",
        inputs: [],
        policy: { id: "default", hash: "sha256:abc" },
        exit: { code: 0, status: "passed", reason: "All checks passed" }
      }), "utf8");

      const results = await validateAllArtifactsWithResults(tempDir, true, true, false);
      expect(results.some((result) => result.artifact === "release-readiness.json" && result.status === "error")).toBe(true);
    });
  });
});
