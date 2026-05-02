/**
 * Integration tests for error handling scenarios
 *
 * Tests:
 * - Invalid repo path handling
 * - Malformed config files
 * - Permission denied scenarios (simulated)
 * - Empty output directory handling
 * - Empty repo handling
 * - Invalid JSON handling
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runCli,
  fixturePath,
  readJson,
  createTempOutDir,
  cleanupTempDir,
  fileExists,
  getProjectRoot,
} from "./helper.js";
import path from "node:path";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";

describe("error handling integration", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = createTempOutDir("error-handling");
  });

  afterAll(() => {
    cleanupTempDir(tempDir);
  });

  describe("invalid repo path handling", () => {
    it("scan command fails with non-existent path", () => {
      const nonExistentPath = path.join(tempDir, "non-existent-repo");
      const result = runCli(["scan", nonExistentPath, "--out", tempDir]);

      expect(result.exitCode).toBe(2); // USAGE_ERROR
      expect(result.stderr).toContain("repo does not exist");
    });

    it("analyze command fails with non-existent path", () => {
      const nonExistentPath = path.join(tempDir, "non-existent-repo");
      const result = runCli(["analyze", nonExistentPath, "--emit", "all", "--out", tempDir]);

      expect(result.exitCode).toBe(2); // USAGE_ERROR
      expect(result.stderr).toContain("repo does not exist");
    });

    it("scan command fails when path is a file (not directory)", () => {
      // Create a file instead of directory
      const filePath = path.join(tempDir, "test-file.txt");
      writeFileSync(filePath, "test content");

      const result = runCli(["scan", filePath, "--out", tempDir]);

      expect(result.exitCode).toBe(2); // USAGE_ERROR
      expect(result.stderr).toContain("repo is not a directory");
    });

    it("analyze command fails when path is a file (not directory)", () => {
      const filePath = path.join(tempDir, "test-file.txt");
      writeFileSync(filePath, "test content");

      const result = runCli(["analyze", filePath, "--emit", "all", "--out", tempDir]);

      expect(result.exitCode).toBe(2); // USAGE_ERROR
      expect(result.stderr).toContain("repo is not a directory");
    });

    it("scan command fails with empty repo argument", () => {
      // Empty string is treated as next argument (--out)
      const result = runCli(["scan", "", "--out", tempDir]);

      expect(result.exitCode).toBe(2); // USAGE_ERROR
      expect(result.stderr).toContain("repo does not exist");
    });

    it("analyze command fails with empty repo argument", () => {
      const result = runCli(["analyze", "", "--emit", "all", "--out", tempDir]);

      expect(result.exitCode).toBe(2); // USAGE_ERROR
      expect(result.stderr).toContain("repo does not exist");
    });
  });

  describe("malformed config files", () => {
    it("schema validate fails with invalid JSON file", () => {
      const invalidJsonPath = path.join(tempDir, "invalid.json");
      writeFileSync(invalidJsonPath, "{ invalid json content }");

      const result = runCli(["schema", "validate", invalidJsonPath]);

      expect(result.exitCode).toBe(7); // SCHEMA_FAILED
      expect(result.stderr).toContain("invalid JSON");
    });

    it("schema validate fails with empty JSON file", () => {
      const emptyJsonPath = path.join(tempDir, "empty.json");
      writeFileSync(emptyJsonPath, "");

      const result = runCli(["schema", "validate", emptyJsonPath]);

      expect(result.exitCode).toBe(7); // SCHEMA_FAILED
      expect(result.stderr).toContain("invalid JSON");
    });

    it("schema validate fails with truncated JSON file", () => {
      const truncatedPath = path.join(tempDir, "truncated.json");
      writeFileSync(truncatedPath, '{"artifact": "findings", "schema');

      const result = runCli(["schema", "validate", truncatedPath]);

      expect(result.exitCode).toBe(7); // SCHEMA_FAILED
      expect(result.stderr).toContain("invalid JSON");
    });

    it("analyze command handles malformed policy file gracefully", () => {
      const fixture = "demo-shop-ts";
      const fixtureRoot = fixturePath(fixture);

      // Create malformed policy file
      const malformedPolicyPath = path.join(tempDir, "malformed-policy.yaml");
      writeFileSync(malformedPolicyPath, "{ not valid yaml: [broken");

      const result = runCli([
        "analyze",
        fixtureRoot,
        "--emit",
        "all",
        "--out",
        tempDir,
        "--policy",
        malformedPolicyPath,
      ]);

      // Should still proceed but may report policy loading issues
      // The CLI merges malformed policy with defaults and proceeds
      // Exit codes: 0 (OK), 1 (READINESS_NOT_CLEAR), 2 (USAGE_ERROR), 5 (POLICY_FAILED)
      expect([0, 1, 2, 5]).toContain(result.exitCode);
    });

    it("schema validate fails on file not found", () => {
      const nonExistentFile = path.join(tempDir, "non-existent-artifact.json");
      const result = runCli(["schema", "validate", nonExistentFile]);

      expect(result.exitCode).toBe(2); // USAGE_ERROR
      expect(result.stderr).toContain("file not found");
    });
  });

  describe("empty output directory handling", () => {
    it("scan command creates output directory if it does not exist", () => {
      const fixture = "demo-shop-ts";
      const fixtureRoot = fixturePath(fixture);
      const newOutDir = path.join(tempDir, "new-output-dir");

      // Ensure directory doesn't exist
      if (existsSync(newOutDir)) {
        rmSync(newOutDir, { recursive: true, force: true });
      }

      const result = runCli(["scan", fixtureRoot, "--out", newOutDir]);

      expect(result.exitCode).toBe(0);
      expect(fileExists(path.join(newOutDir, "repo-graph.json"))).toBe(true);
    });

    it("analyze command creates output directory if it does not exist", () => {
      const fixture = "demo-shop-ts";
      const fixtureRoot = fixturePath(fixture);
      const newOutDir = path.join(tempDir, "new-analyze-dir");

      if (existsSync(newOutDir)) {
        rmSync(newOutDir, { recursive: true, force: true });
      }

      const result = runCli(["analyze", fixtureRoot, "--emit", "all", "--out", newOutDir]);

      expect([0, 5]).toContain(result.exitCode);
      expect(fileExists(path.join(newOutDir, "findings.json"))).toBe(true);
    });
  });

  describe("empty repo handling", () => {
    it("scan command handles empty repo directory", () => {
      const emptyRepoDir = path.join(tempDir, "empty-repo");
      mkdirSync(emptyRepoDir, { recursive: true });

      const result = runCli(["scan", emptyRepoDir, "--out", tempDir]);

      // Empty repo should either fail or produce empty graph
      expect([0, 3]).toContain(result.exitCode);

      if (result.exitCode === 0 && fileExists(path.join(tempDir, "repo-graph.json"))) {
        const graph = readJson(path.join(tempDir, "repo-graph.json")) as {
          files: Array<{ path: string }>;
        };
        expect(graph.files.length).toBe(0);
      }
    });

    it("analyze command handles empty repo directory", () => {
      const emptyRepoDir = path.join(tempDir, "empty-repo-2");
      mkdirSync(emptyRepoDir, { recursive: true });

      // Use unique output directory to avoid conflicts
      const emptyRepoOutDir = path.join(tempDir, "empty-repo-out");
      mkdirSync(emptyRepoOutDir, { recursive: true });

      const result = runCli(["analyze", emptyRepoDir, "--emit", "all", "--out", emptyRepoOutDir]);

      // Empty repo should produce empty findings or fail gracefully
      expect([0, 3, 5]).toContain(result.exitCode);

      if (fileExists(path.join(emptyRepoOutDir, "findings.json"))) {
        const findings = readJson(path.join(emptyRepoOutDir, "findings.json")) as {
          findings: Array<{ ruleId: string }>;
        };
        expect(findings.findings.length).toBe(0);
      }
    });

    it("scan command handles repo with only non-source files", () => {
      const nonSourceRepoDir = path.join(tempDir, "non-source-repo");
      mkdirSync(nonSourceRepoDir, { recursive: true });
      writeFileSync(path.join(nonSourceRepoDir, "README.md"), "# Empty Repo");
      writeFileSync(path.join(nonSourceRepoDir, "LICENSE"), "MIT License");

      const result = runCli(["scan", nonSourceRepoDir, "--out", tempDir]);

      expect(result.exitCode).toBe(0);

      if (fileExists(path.join(tempDir, "repo-graph.json"))) {
        const graph = readJson(path.join(tempDir, "repo-graph.json")) as {
          files: Array<{ path: string; role: string }>;
        };
        // README and LICENSE should be detected as docs
        const docFiles = graph.files.filter((f) => f.role === "docs");
        expect(docFiles.length).toBeGreaterThan(0);
      }
    });
  });

  describe("invalid artifact validation", () => {
    it("schema validate fails on artifact missing required fields", () => {
      const incompleteArtifactPath = path.join(tempDir, "incomplete-findings.json");
      writeFileSync(
        incompleteArtifactPath,
        JSON.stringify({
          artifact: "findings",
          schema: "findings@v1",
          // Missing required fields: version, generated_at, run_id, repo, tool, completeness, findings
        })
      );

      const result = runCli(["schema", "validate", incompleteArtifactPath]);

      expect(result.exitCode).toBe(7); // SCHEMA_FAILED
      expect(result.stderr).toContain("artifact invalid");
    });

    it("schema validate fails on artifact with wrong schema version", () => {
      const wrongVersionPath = path.join(tempDir, "wrong-version.json");
      writeFileSync(
        wrongVersionPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "findings",
          schema: "findings@v99", // Invalid version
          completeness: "complete",
          findings: [],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", wrongVersionPath]);

      expect(result.exitCode).toBe(7); // SCHEMA_FAILED
    });

    it("schema validate fails on artifact with unknown artifact type", () => {
      const unknownArtifactPath = path.join(tempDir, "unknown-artifact.json");
      writeFileSync(
        unknownArtifactPath,
        JSON.stringify({
          version: "ctg/v1",
          generated_at: "2024-01-01T00:00:00Z",
          run_id: "test-run",
          repo: { root: "." },
          tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
          artifact: "unknown-type",
          schema: "unknown-type@v1",
        })
      );

      const result = runCli(["schema", "validate", unknownArtifactPath]);

      expect(result.exitCode).toBe(7); // SCHEMA_FAILED
      expect(result.stderr).toContain("unable to choose schema");
    });

    it("schema validate fails on findings with invalid severity", () => {
      const invalidSeverityPath = path.join(tempDir, "invalid-severity.json");
      writeFileSync(
        invalidSeverityPath,
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
              severity: "invalid-severity", // Invalid severity
              confidence: 0.9,
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

      const result = runCli(["schema", "validate", invalidSeverityPath]);

      expect(result.exitCode).toBe(7); // SCHEMA_FAILED
      expect(result.stderr).toContain("artifact invalid");
    });

    it("schema validate fails on findings with invalid category", () => {
      const invalidCategoryPath = path.join(tempDir, "invalid-category.json");
      writeFileSync(
        invalidCategoryPath,
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
              category: "invalid-category", // Invalid category
              severity: "high",
              confidence: 0.9,
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

      const result = runCli(["schema", "validate", invalidCategoryPath]);

      expect(result.exitCode).toBe(7); // SCHEMA_FAILED
    });

    it("schema validate fails on findings with missing evidence", () => {
      const missingEvidencePath = path.join(tempDir, "missing-evidence.json");
      writeFileSync(
        missingEvidencePath,
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
              severity: "high",
              confidence: 0.9,
              title: "Test Finding",
              summary: "Test summary",
              evidence: [], // Empty evidence array - invalid because minItems: 1
            },
          ],
          unsupported_claims: [],
        })
      );

      const result = runCli(["schema", "validate", missingEvidencePath]);

      expect(result.exitCode).toBe(7); // SCHEMA_FAILED
    });
  });

  describe("command usage errors", () => {
    it("schema validate fails without validate subcommand", () => {
      const result = runCli(["schema"]);

      expect(result.exitCode).toBe(2); // USAGE_ERROR
      expect(result.stderr).toContain("usage:");
    });

    it("schema validate fails without file argument", () => {
      const result = runCli(["schema", "validate"]);

      expect(result.exitCode).toBe(2); // USAGE_ERROR
      expect(result.stderr).toContain("usage:");
    });

    it("unknown command returns usage error", () => {
      const result = runCli(["unknown-command"]);

      expect(result.exitCode).toBe(2); // USAGE_ERROR
      expect(result.stderr).toContain("unknown command");
    });

    it("scan with --out option creates output directory", () => {
      const fixture = "demo-shop-ts";
      const fixtureRoot = fixturePath(fixture);
      const customOutDir = path.join(tempDir, "scan-default-out");

      const result = runCli(["scan", fixtureRoot, "--out", customOutDir]);

      expect(result.exitCode).toBe(0);
      expect(fileExists(path.join(customOutDir, "repo-graph.json"))).toBe(true);
    });
  });
});