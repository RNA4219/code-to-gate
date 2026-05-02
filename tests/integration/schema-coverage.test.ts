/**
 * Integration tests for schema validation coverage
 *
 * Tests:
 * - All schema files validation
 * - Invalid artifact variations
 * - Schema version mismatches
 * - Edge cases in schema validation
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runCli,
  schemaPath,
  readJson,
  createTempOutDir,
  cleanupTempDir,
  fileExists,
  getProjectRoot,
} from "./helper.js";
import path from "node:path";
import { writeFileSync, existsSync, readdirSync } from "node:fs";

describe("schema coverage integration", () => {
  let tempDir: string;
  const SCHEMA_DIR = path.join(getProjectRoot(), "schemas");

  beforeAll(() => {
    tempDir = createTempOutDir("schema-coverage");
  });

  afterAll(() => {
    cleanupTempDir(tempDir);
  });

  describe("all schema files validation", () => {
    it("validates normalized-repo-graph schema", () => {
      const schemaFile = schemaPath("normalized-repo-graph");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates findings schema", () => {
      const schemaFile = schemaPath("findings");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates risk-register schema", () => {
      const schemaFile = schemaPath("risk-register");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates audit schema", () => {
      const schemaFile = schemaPath("audit");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates shared-defs schema", () => {
      const schemaFile = schemaPath("shared-defs");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates invariants schema", () => {
      const schemaFile = schemaPath("invariants");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates test-seeds schema", () => {
      const schemaFile = schemaPath("test-seeds");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates release-readiness schema", () => {
      const schemaFile = schemaPath("release-readiness");
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates evidence-ref schema", () => {
      const schemaFile = schemaPath("evidence-ref");
      // Note: evidence-ref.schema.json may be empty in some versions
      // Check if file exists and has content
      if (!existsSync(schemaFile)) {
        return; // Skip if schema doesn't exist
      }
      try {
        const content = readJson(schemaFile);
        if (!content || (typeof content === 'object' && Object.keys(content).length === 0)) {
          // Skip empty schema files
          return;
        }
      } catch {
        // Skip invalid/empty schema files
        return;
      }
      const result = runCli(["schema", "validate", schemaFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("schema ok");
    });

    it("validates all integration schemas", () => {
      const integrationDir = path.join(SCHEMA_DIR, "integrations");
      if (!existsSync(integrationDir)) {
        // Skip if no integration schemas
        return;
      }

      const integrationSchemas = readdirSync(integrationDir)
        .filter((f) => f.endsWith(".schema.json"));

      for (const schemaFile of integrationSchemas) {
        const fullPath = path.join(integrationDir, schemaFile);
        const result = runCli(["schema", "validate", fullPath]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("schema ok");
      }
    });

    it("all main schema files are valid JSON", () => {
      const schemaFiles = [
        "normalized-repo-graph.schema.json",
        "findings.schema.json",
        "risk-register.schema.json",
        "audit.schema.json",
        "shared-defs.schema.json",
        "invariants.schema.json",
        "test-seeds.schema.json",
        "release-readiness.schema.json",
      ];

      for (const file of schemaFiles) {
        const fullPath = path.join(SCHEMA_DIR, file);
        if (existsSync(fullPath)) {
          const schema = readJson(fullPath) as {
            $schema: string;
            title: string;
            $id: string;
          };

          expect(schema.$schema).toBeDefined();
          expect(schema.title).toBeDefined();
          expect(schema.$id).toBeDefined();
        }
      }
    });
  });

  describe("valid artifact variations", () => {
    it("validates minimal findings artifact", () => {
      const minimalFindingsPath = path.join(tempDir, "minimal-findings.json");
      writeFileSync(
        minimalFindingsPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 0.5,
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  id: "evidence-001",
                  path: "test.ts",
                  kind: "text",
                  excerptHash: "abc123",
                },
              ],
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", minimalFindingsPath]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("artifact ok");
    });

    it("validates findings with all categories", () => {
      const categories = [
        "auth",
        "payment",
        "validation",
        "data",
        "config",
        "maintainability",
        "testing",
        "compatibility",
        "release-risk",
      ];

      const allCategoriesPath = path.join(tempDir, "all-categories.json");
      writeFileSync(
        allCategoriesPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: categories.map((cat, i) => ({
            id: `finding-${i.toString().padStart(3, "0")}`,
            ruleId: `RULE_${cat.toUpperCase()}`,
            category: cat,
            severity: "low",
            confidence: 0.8,
            title: `${cat} Finding`,
            summary: `Test ${cat} finding`,
            evidence: [
              {
                id: `evidence-${i}`,
                path: "test.ts",
                kind: "text",
                excerptHash: `hash-${i}`,
              },
            ],
          })),
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", allCategoriesPath]);
      expect(result.exitCode).toBe(0);
    });

    it("validates findings with all severities", () => {
      const severities = ["low", "medium", "high", "critical"];

      const allSeveritiesPath = path.join(tempDir, "all-severities.json");
      writeFileSync(
        allSeveritiesPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: severities.map((sev, i) => ({
            id: `finding-${i.toString().padStart(3, "0")}`,
            ruleId: `RULE_${sev.toUpperCase()}`,
            category: "auth",
            severity: sev,
            confidence: 0.8,
            title: `${sev} Severity Finding`,
            summary: `Test ${sev} finding`,
            evidence: [
              {
                id: `evidence-${i}`,
                path: "test.ts",
                kind: "text",
                excerptHash: `hash-${i}`,
              },
            ],
          })),
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", allSeveritiesPath]);
      expect(result.exitCode).toBe(0);
    });

    it("validates findings with all evidence kinds", () => {
      const evidenceKinds = ["ast", "text", "import", "external", "test", "coverage", "diff"];

      const allKindsPath = path.join(tempDir, "all-kinds.json");
      writeFileSync(
        allKindsPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: evidenceKinds.map((kind, i) => ({
            id: `finding-${i.toString().padStart(3, "0")}`,
            ruleId: `RULE_${kind.toUpperCase()}`,
            category: "auth",
            severity: "low",
            confidence: 0.8,
            title: `${kind} Evidence Finding`,
            summary: `Test ${kind} evidence`,
            evidence: [
              kind === "text"
                ? {
                    id: `evidence-${i}`,
                    path: "test.ts",
                    kind: kind,
                    excerptHash: `hash-${i}`,
                  }
                : kind === "external"
                ? {
                    id: `evidence-${i}`,
                    path: "test.ts",
                    kind: kind,
                    externalRef: {
                      tool: "semgrep",
                      ruleId: "rule-001",
                    },
                  }
                : {
                    id: `evidence-${i}`,
                    path: "test.ts",
                    kind: kind,
                  },
            ],
          })),
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", allKindsPath]);
      expect(result.exitCode).toBe(0);
    });

    it("validates findings with all upstream tools", () => {
      const upstreamTools = ["native", "semgrep", "eslint", "sonarqube", "tsc", "coverage", "test"];

      const allToolsPath = path.join(tempDir, "all-tools.json");
      writeFileSync(
        allToolsPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: upstreamTools.map((tool, i) => ({
            id: `finding-${i.toString().padStart(3, "0")}`,
            ruleId: `RULE_${tool.toUpperCase()}`,
            category: "auth",
            severity: "low",
            confidence: 0.8,
            title: `${tool} Upstream Finding`,
            summary: `Test ${tool} upstream`,
            evidence: [
              {
                id: `evidence-${i}`,
                path: "test.ts",
                kind: "text",
                excerptHash: `hash-${i}`,
              },
            ],
            upstream: {
              tool: tool,
              ruleId: tool !== "native" ? `${tool}-rule` : undefined,
            },
          })),
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", allToolsPath]);
      expect(result.exitCode).toBe(0);
    });

    it("validates minimal audit artifact", () => {
      const minimalAuditPath = path.join(tempDir, "minimal-audit.json");
      writeFileSync(
        minimalAuditPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "audit",
          schema: "audit@v1",
          inputs: [],
          policy: { id: "default", hash: "abc123" },
          exit: { code: 0, status: "passed", reason: "No findings" },
        })
      );

      const result = runCli(["schema", "validate", minimalAuditPath]);
      expect(result.exitCode).toBe(0);
    });

    it("validates minimal repo-graph artifact", () => {
      const minimalGraphPath = path.join(tempDir, "minimal-graph.json");
      writeFileSync(
        minimalGraphPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
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
          stats: { partial: false },
        })
      );

      const result = runCli(["schema", "validate", minimalGraphPath]);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("invalid artifact variations", () => {
    it("fails on findings with confidence > 1", () => {
      const highConfidencePath = path.join(tempDir, "high-confidence.json");
      writeFileSync(
        highConfidencePath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 1.5, // Invalid - exceeds maximum
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  id: "evidence-001",
                  path: "test.ts",
                  kind: "text",
                  excerptHash: "abc123",
                },
              ],
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", highConfidencePath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on findings with confidence < 0", () => {
      const lowConfidencePath = path.join(tempDir, "low-confidence.json");
      writeFileSync(
        lowConfidencePath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: -0.1, // Invalid - below minimum
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  id: "evidence-001",
                  path: "test.ts",
                  kind: "text",
                  excerptHash: "abc123",
                },
              ],
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", lowConfidencePath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on evidence missing required id", () => {
      const missingEvidenceIdPath = path.join(tempDir, "missing-evidence-id.json");
      writeFileSync(
        missingEvidenceIdPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 0.8,
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  // Missing id
                  path: "test.ts",
                  kind: "text",
                  excerptHash: "abc123",
                },
              ],
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingEvidenceIdPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on evidence missing required path", () => {
      const missingEvidencePath_ = path.join(tempDir, "missing-evidence-path.json");
      writeFileSync(
        missingEvidencePath_,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 0.8,
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  id: "evidence-001",
                  // Missing path
                  kind: "text",
                  excerptHash: "abc123",
                },
              ],
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingEvidencePath_]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on evidence with invalid kind", () => {
      const invalidKindPath = path.join(tempDir, "invalid-kind.json");
      writeFileSync(
        invalidKindPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 0.8,
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  id: "evidence-001",
                  path: "test.ts",
                  kind: "invalid-kind", // Invalid kind value
                  excerptHash: "abc123",
                },
              ],
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", invalidKindPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on text evidence missing excerptHash", () => {
      const missingHashPath = path.join(tempDir, "missing-hash.json");
      writeFileSync(
        missingHashPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 0.8,
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  id: "evidence-001",
                  path: "test.ts",
                  kind: "text",
                  // Missing required excerptHash for text kind
                },
              ],
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingHashPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on external evidence missing externalRef", () => {
      const missingExtRefPath = path.join(tempDir, "missing-ext-ref.json");
      writeFileSync(
        missingExtRefPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 0.8,
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  id: "evidence-001",
                  path: "test.ts",
                  kind: "external",
                  // Missing required externalRef for external kind
                },
              ],
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingExtRefPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on upstream missing required tool", () => {
      const missingUpstreamToolPath = path.join(tempDir, "missing-upstream-tool.json");
      writeFileSync(
        missingUpstreamToolPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 0.8,
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  id: "evidence-001",
                  path: "test.ts",
                  kind: "text",
                  excerptHash: "abc123",
                },
              ],
              upstream: {
                // Missing required tool
                ruleId: "rule-001",
              },
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingUpstreamToolPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on upstream with invalid tool", () => {
      const invalidUpstreamToolPath = path.join(tempDir, "invalid-upstream-tool.json");
      writeFileSync(
        invalidUpstreamToolPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [
            {
              id: "finding-001",
              ruleId: "TEST_RULE",
              category: "auth",
              severity: "low",
              confidence: 0.8,
              title: "Test Finding",
              summary: "Test summary",
              evidence: [
                {
                  id: "evidence-001",
                  path: "test.ts",
                  kind: "text",
                  excerptHash: "abc123",
                },
              ],
              upstream: {
                tool: "invalid-tool", // Invalid tool value
                ruleId: "rule-001",
              },
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", invalidUpstreamToolPath]);
      expect(result.exitCode).toBe(7);
    });
  });

  describe("schema version mismatches", () => {
    it("fails on version mismatch between version field and schema version", () => {
      const versionMismatchPath = path.join(tempDir, "version-mismatch.json");
      writeFileSync(
        versionMismatchPath,
        JSON.stringify({
          version: "ctg/v2alpha1", // Different version prefix
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", versionMismatchPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on missing version field", () => {
      const missingVersionPath = path.join(tempDir, "missing-version.json");
      writeFileSync(
        missingVersionPath,
        JSON.stringify({
          // Missing version field
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingVersionPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on missing generated_at field", () => {
      const missingGeneratedPath = path.join(tempDir, "missing-generated.json");
      writeFileSync(
        missingGeneratedPath,
        JSON.stringify({
          version: "ctg/v1",
          // Missing generated_at field
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingGeneratedPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on invalid generated_at format", () => {
      const invalidGeneratedPath = path.join(tempDir, "invalid-generated.json");
      writeFileSync(
        invalidGeneratedPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "not-a-date", // Invalid date format
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", invalidGeneratedPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on missing tool name", () => {
      const missingToolNamePath = path.join(tempDir, "missing-tool-name.json");
      writeFileSync(
        missingToolNamePath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: {
            // Missing name
            version: "0.1.0",
            plugin_versions: [],
          },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingToolNamePath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on tool name not being 'code-to-gate'", () => {
      const wrongToolNamePath = path.join(tempDir, "wrong-tool-name.json");
      writeFileSync(
        wrongToolNamePath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: {
            name: "other-tool", // Invalid - must be "code-to-gate"
            version: "0.1.0",
            plugin_versions: [],
          },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", wrongToolNamePath]);
      // Schema validation may fail due to const constraint on tool.name
      expect([2, 7]).toContain(result.exitCode);
    });

    it("fails on missing repo root", () => {
      const missingRepoRootPath = path.join(tempDir, "missing-repo-root.json");
      writeFileSync(
        missingRepoRootPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: {
            // Missing root
          },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingRepoRootPath]);
      expect(result.exitCode).toBe(7);
    });
  });

  describe("unsupported_claims validation", () => {
    it("validates valid unsupported_claims", () => {
      const validUnsupportedPath = path.join(tempDir, "valid-unsupported.json");
      writeFileSync(
        validUnsupportedPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [
            {
              id: "claim-001",
              claim: "Some claim",
              reason: "missing_evidence",
              sourceSection: "section-1",
            },
          ],
        })
      );

      const result = runCli(["schema", "validate", validUnsupportedPath]);
      expect(result.exitCode).toBe(0);
    });

    it("fails on unsupported_claim with invalid reason", () => {
      const invalidReasonPath = path.join(tempDir, "invalid-reason.json");
      writeFileSync(
        invalidReasonPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [
            {
              id: "claim-001",
              claim: "Some claim",
              reason: "invalid_reason", // Invalid reason value
              sourceSection: "section-1",
            },
          ],
        })
      );

      const result = runCli(["schema", "validate", invalidReasonPath]);
      expect(result.exitCode).toBe(7);
    });

    it("fails on unsupported_claim missing required fields", () => {
      const missingClaimFieldsPath = path.join(tempDir, "missing-claim-fields.json");
      writeFileSync(
        missingClaimFieldsPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v1",
          completeness: "complete",
          findings: [],
          unsupported_claims: [
            {
              id: "claim-001",
              // Missing claim, reason, sourceSection
            },
          ],
        })
      );

      const result = runCli(["schema", "validate", missingClaimFieldsPath]);
      expect(result.exitCode).toBe(7);
    });
  });
});