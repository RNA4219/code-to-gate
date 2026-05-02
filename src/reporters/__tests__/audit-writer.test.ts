/**
 * Tests for Audit Writer
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  buildAuditArtifact,
  writeAuditJson,
} from "../audit-writer.js";
import { existsSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import type { NormalizedRepoGraph, FindingsArtifact } from "../../types/artifacts.js";
import type { CtgPolicy } from "../../config/policy-loader.js";

describe("audit-writer", () => {
  let tempOutDir: string;

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-audit-writer-test-${Date.now()}`);
    mkdirSync(tempOutDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
  });

  describe("buildAuditArtifact", () => {
    it("creates audit artifact with correct version", () => {
      const graph: NormalizedRepoGraph = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
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
      };

      const findings: FindingsArtifact = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      const audit = buildAuditArtifact(graph, findings, undefined, 0, "success", "Analysis complete");

      expect(audit.version).toBe("ctg/v1");
      expect(audit.artifact).toBe("audit");
      expect(audit.schema).toBe("audit@v1");
    });

    it("creates audit artifact with correct run_id", () => {
      const graph: NormalizedRepoGraph = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-002",
        repo: { root: "/test/repo" },
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
      };

      const findings: FindingsArtifact = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-002",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      const audit = buildAuditArtifact(graph, findings, undefined, 0, "success", "Analysis complete");

      expect(audit.run_id).toBe("run-002");
    });

    it("creates audit artifact with correct repo info", () => {
      const graph: NormalizedRepoGraph = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/my/project", branch: "main", revision: "abc123" },
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
      };

      const findings: FindingsArtifact = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/my/project" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      const audit = buildAuditArtifact(graph, findings, undefined, 0, "success", "Analysis complete");

      expect(audit.repo.root).toBe("/my/project");
    });

    it("includes files from graph as inputs", () => {
      const graph: NormalizedRepoGraph = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        files: [
          {
            id: "file:src/index.ts",
            path: "src/index.ts",
            language: "ts",
            role: "source",
            hash: "hash123",
            sizeBytes: 500,
            lineCount: 20,
            parser: { status: "parsed", adapter: "ts-morph" },
          },
          {
            id: "file:config.json",
            path: "config.json",
            language: "unknown",
            role: "config",
            hash: "hash456",
            sizeBytes: 100,
            lineCount: 5,
            parser: { status: "skipped" },
          },
          {
            id: "file:tests/test.ts",
            path: "tests/test.ts",
            language: "ts",
            role: "test",
            hash: "hash789",
            sizeBytes: 200,
            lineCount: 10,
            parser: { status: "parsed", adapter: "ts-morph" },
          },
        ],
        modules: [],
        symbols: [],
        relations: [],
        tests: [],
        configs: [],
        entrypoints: [],
        diagnostics: [],
        stats: { partial: false },
      };

      const findings: FindingsArtifact = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      const audit = buildAuditArtifact(graph, findings, undefined, 0, "success", "Analysis complete");

      expect(audit.inputs.length).toBe(3);
      expect(audit.inputs[0].path).toBe("src/index.ts");
      expect(audit.inputs[0].hash).toBe("hash123");
      expect(audit.inputs[0].kind).toBe("source");
      expect(audit.inputs[1].kind).toBe("config");
    });

    it("creates policy section with policy info", () => {
      const graph: NormalizedRepoGraph = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
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
      };

      const findings: FindingsArtifact = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      const policy: CtgPolicy = {
        version: "ctg/v1",
        policyId: "my-policy",
        blocking: {
          severity: { critical: true, high: true },
          category: { auth: true, payment: true },
        },
        confidence: { minConfidence: 0.6 },
      };

      const audit = buildAuditArtifact(graph, findings, policy, 0, "success", "Analysis complete");

      expect(audit.policy.id).toBe("my-policy");
      expect(audit.policy.hash).toBeDefined();
      expect(audit.policy.hash.length).toBe(64); // SHA-256 hex digest
    });

    it("uses default policy id when no policy provided", () => {
      const graph: NormalizedRepoGraph = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
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
      };

      const findings: FindingsArtifact = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      const audit = buildAuditArtifact(graph, findings, undefined, 0, "success", "Analysis complete");

      expect(audit.policy.id).toBe("default");
      expect(audit.policy.hash).toBe("none");
    });

    it("creates exit section with correct values", () => {
      const graph: NormalizedRepoGraph = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
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
      };

      const findings: FindingsArtifact = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      const audit = buildAuditArtifact(graph, findings, undefined, 5, "policy_failed", "Critical findings blocked");

      expect(audit.exit.code).toBe(5);
      expect(audit.exit.status).toBe("policy_failed");
      expect(audit.exit.reason).toBe("Critical findings blocked");
    });

    it("sets tool info correctly", () => {
      const graph: NormalizedRepoGraph = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
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
      };

      const findings: FindingsArtifact = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      const policy: CtgPolicy = {
        version: "ctg/v1",
        policyId: "release-policy",
        blocking: {
          severity: { critical: true },
          category: { auth: true },
        },
        confidence: { minConfidence: 0.6 },
      };

      const audit = buildAuditArtifact(graph, findings, policy, 0, "success", "OK");

      expect(audit.tool.name).toBe("code-to-gate");
      expect(audit.tool.version).toBe("0.1.0");
      expect(audit.tool.policy_id).toBe("release-policy");
      expect(Array.isArray(audit.tool.plugin_versions)).toBe(true);
    });

    it("generated_at is valid ISO 8601", () => {
      const graph: NormalizedRepoGraph = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
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
      };

      const findings: FindingsArtifact = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      const audit = buildAuditArtifact(graph, findings, undefined, 0, "success", "OK");

      // Check that generated_at is a valid ISO date string
      const date = new Date(audit.generated_at);
      expect(date.toISOString()).toBe(audit.generated_at);
    });
  });

  describe("writeAuditJson", () => {
    it("writes audit.json to output directory", () => {
      const graph: NormalizedRepoGraph = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
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
      };

      const findings: FindingsArtifact = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      const audit = buildAuditArtifact(graph, findings, undefined, 0, "success", "OK");
      const filePath = writeAuditJson(tempOutDir, audit);

      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toBe(path.join(tempOutDir, "audit.json"));
    });

    it("written JSON is valid and parseable", () => {
      const graph: NormalizedRepoGraph = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
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
      };

      const findings: FindingsArtifact = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      const audit = buildAuditArtifact(graph, findings, undefined, 0, "success", "OK");
      writeAuditJson(tempOutDir, audit);

      const content = readFileSync(path.join(tempOutDir, "audit.json"), "utf8");
      const parsed = JSON.parse(content);

      expect(parsed.artifact).toBe("audit");
      expect(parsed.schema).toBe("audit@v1");
    });

    it("written audit.json has all required fields", () => {
      const graph: NormalizedRepoGraph = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
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
      };

      const findings: FindingsArtifact = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      const audit = buildAuditArtifact(graph, findings, undefined, 0, "success", "OK");
      writeAuditJson(tempOutDir, audit);

      const content = readFileSync(path.join(tempOutDir, "audit.json"), "utf8");
      const parsed = JSON.parse(content);

      // Verify all required fields exist
      expect(parsed.version).toBeDefined();
      expect(parsed.generated_at).toBeDefined();
      expect(parsed.run_id).toBeDefined();
      expect(parsed.repo).toBeDefined();
      expect(parsed.tool).toBeDefined();
      expect(parsed.artifact).toBeDefined();
      expect(parsed.schema).toBeDefined();
      expect(parsed.inputs).toBeDefined();
      expect(parsed.policy).toBeDefined();
      expect(parsed.exit).toBeDefined();

      // Verify nested structures
      expect(parsed.policy.id).toBeDefined();
      expect(parsed.policy.hash).toBeDefined();
      expect(parsed.exit.code).toBeDefined();
      expect(parsed.exit.status).toBeDefined();
      expect(parsed.exit.reason).toBeDefined();
    });

    it("handles audit with files correctly", () => {
      const graph: NormalizedRepoGraph = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        files: [
          {
            id: "file:src/main.ts",
            path: "src/main.ts",
            language: "ts",
            role: "source",
            hash: "abc123",
            sizeBytes: 1000,
            lineCount: 50,
            parser: { status: "parsed", adapter: "ts-morph" },
          },
        ],
        modules: [],
        symbols: [],
        relations: [],
        tests: [],
        configs: [],
        entrypoints: [],
        diagnostics: [],
        stats: { partial: false },
      };

      const findings: FindingsArtifact = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      const audit = buildAuditArtifact(graph, findings, undefined, 0, "success", "OK");
      writeAuditJson(tempOutDir, audit);

      const content = readFileSync(path.join(tempOutDir, "audit.json"), "utf8");
      const parsed = JSON.parse(content);

      expect(parsed.inputs.length).toBe(1);
      expect(parsed.inputs[0].path).toBe("src/main.ts");
      expect(parsed.inputs[0].hash).toBe("abc123");
      expect(parsed.inputs[0].kind).toBe("source");
    });
  });

  describe("audit.json format validation", () => {
    it("validates audit artifact structure", () => {
      const graph: NormalizedRepoGraph = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
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
      };

      const findings: FindingsArtifact = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      const audit = buildAuditArtifact(graph, findings, undefined, 0, "success", "OK");

      // Validate artifact type
      expect(audit.artifact).toBe("audit");
      expect(audit.schema).toBe("audit@v1");
      expect(audit.version).toBe("ctg/v1");
    });

    it("validates input structure", () => {
      const graph: NormalizedRepoGraph = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        files: [
          {
            id: "file:src/app.ts",
            path: "src/app.ts",
            language: "ts",
            role: "source",
            hash: "hash1",
            sizeBytes: 500,
            lineCount: 25,
            parser: { status: "parsed" },
          },
        ],
        modules: [],
        symbols: [],
        relations: [],
        tests: [],
        configs: [],
        entrypoints: [],
        diagnostics: [],
        stats: { partial: false },
      };

      const findings: FindingsArtifact = {
        version: "ctg/v1",
        generated_at: "2025-01-01T00:00:00Z",
        run_id: "run-001",
        repo: { root: "/test/repo" },
        tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      const audit = buildAuditArtifact(graph, findings, undefined, 0, "success", "OK");

      for (const input of audit.inputs) {
        expect(input.path).toBeDefined();
        expect(input.hash).toBeDefined();
        expect(["source", "config", "policy", "external-result"]).toContain(input.kind);
      }
    });
  });
});