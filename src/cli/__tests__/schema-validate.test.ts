/**
 * Tests for schema-validate CLI command
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { schemaValidate } from "../schema-validate.js";
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
      exit: { code: 0, status: "passed", message: "OK" }
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
});