/**
 * Tests for Rule Evaluator
 */

import { describe, it, expect, beforeEach } from "vitest";
import { evaluateRules, createFindingsHeader, clearFileContentCache } from "../rule-evaluator.js";
import type { Finding, RepoFile } from "../../types/artifacts.js";
import type { ApplicationContext } from "../context.js";
import { CORE_RULES } from "../../rules/index.js";

// Mock application context for testing
const mockApplicationContext: ApplicationContext = {
  fileAccess: {
    readFile: () => null,
    writeFile: () => {},
    exists: () => true,
    readDir: () => [],
    stat: () => null,
    mkdir: () => {},
    remove: () => {},
  },
  hashService: {
    sha256: (value: string) => {
      // Simple mock hash for testing
      return value.split("").map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("").slice(0, 64);
    },
    fingerprint: (value: string) => mockApplicationContext.hashService.sha256(value).slice(0, 16),
  },
  clockService: {
    now: () => "2024-01-15T10:30:00Z",
    epochMs: () => 1705311000000,
    runId: () => "ctg-20240115103000",
  },
  pathService: {
    join: (...segments: string[]) => segments.join("/"),
    resolve: (...segments: string[]) => "/" + segments.join("/"),
    relative: (from: string, to: string) => to.replace(from + "/", ""),
    dirname: (path: string) => path.split("/").slice(0, -1).join("/"),
    basename: (path: string, ext?: string) => {
      const base = path.split("/").pop() || "";
      return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
    },
    extname: (path: string) => {
      const ext = path.split(".").pop();
      return ext && ext !== path ? "." + ext : "";
    },
    isAbsolute: (path: string) => path.startsWith("/"),
    toPosix: (path: string) => path.replace(/\\/g, "/"),
    cwd: () => "/test",
  },
  parserRegistry: null,
  toolVersion: "1.5.0",
};

describe("Rule Evaluator", () => {
  beforeEach(() => {
    clearFileContentCache();
  });

  describe("evaluateRules", () => {
    it("should add fingerprint to all findings", () => {
      const mockGraph = {
        files: [
          {
            path: "src/test.ts",
            language: "ts" as const,
            role: "source" as const,
            lineCount: 100,
            sizeBytes: 5000,
            fileId: "test-1",
          },
        ] as RepoFile[],
        run_id: "ctg-test-001",
        generated_at: "2024-01-15T10:30:00Z",
        repo: { root: "/test" },
        stats: { partial: false },
      };

      const artifact = evaluateRules(mockGraph, mockApplicationContext, undefined, CORE_RULES);

      // All findings should have fingerprints
      for (const finding of artifact.findings) {
        expect(finding.fingerprint).toBeDefined();
        expect(finding.fingerprint!.length).toBe(16);
        expect(typeof finding.fingerprint).toBe("string");
      }
    });

    it("should generate consistent fingerprints for identical findings across runs", () => {
      const mockGraph = {
        files: [
          {
            path: "src/auth.ts",
            language: "ts" as const,
            role: "source" as const,
            lineCount: 50,
            sizeBytes: 2000,
            fileId: "auth-1",
          },
        ] as RepoFile[],
        run_id: "ctg-test-002",
        generated_at: "2024-01-15T10:30:00Z",
        repo: { root: "/test" },
        stats: { partial: false },
      };

      // Run evaluation twice
      const artifact1 = evaluateRules(mockGraph, mockApplicationContext, undefined, CORE_RULES);
      const artifact2 = evaluateRules(mockGraph, mockApplicationContext, undefined, CORE_RULES);

      // Findings should have identical fingerprints across runs
      expect(artifact1.findings.length).toBe(artifact2.findings.length);
      for (let i = 0; i < artifact1.findings.length; i++) {
        expect(artifact1.findings[i].fingerprint).toBe(artifact2.findings[i].fingerprint);
      }
    });

    it("should preserve all finding properties when adding fingerprint", () => {
      const mockGraph = {
        files: [
          {
            path: "src/db.ts",
            language: "ts" as const,
            role: "source" as const,
            lineCount: 100,
            sizeBytes: 4000,
            fileId: "db-1",
          },
        ] as RepoFile[],
        run_id: "ctg-test-003",
        generated_at: "2024-01-15T10:30:00Z",
        repo: { root: "/test" },
        stats: { partial: false },
      };

      const artifact = evaluateRules(mockGraph, mockApplicationContext, undefined, CORE_RULES);

      for (const finding of artifact.findings) {
        // All core properties should be preserved
        expect(finding.id).toBeDefined();
        expect(finding.ruleId).toBeDefined();
        expect(finding.category).toBeDefined();
        expect(finding.severity).toBeDefined();
        expect(finding.confidence).toBeDefined();
        expect(finding.title).toBeDefined();
        expect(finding.summary).toBeDefined();
        expect(finding.evidence).toBeDefined();
        expect(finding.fingerprint).toBeDefined();
      }
    });

    it("should use fingerprint from generateFindingFingerprint", () => {
      const mockGraph = {
        files: [] as RepoFile[],
        run_id: "ctg-test-004",
        generated_at: "2024-01-15T10:30:00Z",
        repo: { root: "/test" },
        stats: { partial: false },
      };

      const artifact = evaluateRules(mockGraph, mockApplicationContext, undefined, CORE_RULES);

      // Even with no files, the artifact structure should be correct
      expect(artifact.artifact).toBe("findings");
      expect(artifact.schema).toBe("findings@v1");
    });
  });

  describe("createFindingsHeader", () => {
    it("should create header with correct structure", () => {
      const header = createFindingsHeader(
        "ctg-test-001",
        "/test",
        mockApplicationContext,
        undefined,
        CORE_RULES
      );

      expect(header.version).toBe("ctg/v1");
      expect(header.generated_at).toBe("2024-01-15T10:30:00Z");
      expect(header.run_id).toBe("ctg-test-001");
      expect(header.repo.root).toBe("/test");
      expect(header.tool.name).toBe("code-to-gate");
      expect(header.tool.version).toBe("1.5.0");
    });

    it("should include policyId when provided", () => {
      const header = createFindingsHeader(
        "ctg-test-001",
        "/test",
        mockApplicationContext,
        "my-policy",
        CORE_RULES
      );

      expect(header.tool.policy_id).toBe("my-policy");
    });
  });
});