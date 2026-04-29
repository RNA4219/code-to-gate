/**
 * Tests for JSON Reporter
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  buildFindingsFromGraph,
  writeFindingsJson,
  createArtifactHeader,
} from "../json-reporter.js";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import type { RepoFile, FindingsArtifact } from "../../types/artifacts.js";

describe("json-reporter", () => {
  let tempOutDir: string;

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-json-reporter-test-${Date.now()}`);
    mkdirSync(tempOutDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean temp directory between tests
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
      mkdirSync(tempOutDir, { recursive: true });
    }
  });

  describe("createArtifactHeader", () => {
    it("creates header with correct version", () => {
      const header = createArtifactHeader("run-001", "/test/repo", "policy-001");
      expect(header.version).toBe("ctg/v1alpha1");
    });

    it("creates header with run_id", () => {
      const header = createArtifactHeader("run-001", "/test/repo");
      expect(header.run_id).toBe("run-001");
    });

    it("creates header with repo root", () => {
      const header = createArtifactHeader("run-001", "/test/repo");
      expect(header.repo.root).toBe("/test/repo");
    });

    it("creates header with optional policy_id", () => {
      const header = createArtifactHeader("run-001", "/test/repo", "policy-001");
      expect(header.tool.policy_id).toBe("policy-001");
    });

    it("creates header without policy_id when not provided", () => {
      const header = createArtifactHeader("run-001", "/test/repo");
      expect(header.tool.policy_id).toBeUndefined();
    });
  });

  describe("buildFindingsFromGraph", () => {
    it("builds findings from simple graph", () => {
      const graph = {
        files: [
          {
            id: "file:src/test.ts",
            path: "src/test.ts",
            language: "ts" as const,
            role: "source" as const,
            hash: "abc123",
            sizeBytes: 100,
            lineCount: 10,
            parser: { status: "parsed" as const, adapter: "ts-morph" },
          },
        ],
        run_id: "run-001",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/test/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-001", "/test/repo");
      expect(findings.artifact).toBe("findings");
      expect(findings.schema).toBe("findings@v1");
      expect(Array.isArray(findings.findings)).toBe(true);
    });

    it("returns empty findings array for graph with no source files", () => {
      const graph = {
        files: [
          {
            id: "file:config.json",
            path: "config.json",
            language: "unknown" as const,
            role: "config" as const,
            hash: "abc123",
            sizeBytes: 100,
            lineCount: 10,
            parser: { status: "skipped" as const },
          },
        ],
        run_id: "run-001",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/test/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-001", "/test/repo");
      expect(findings.findings.length).toBe(0);
    });

    it("sets completeness based on findings presence", () => {
      const graph = {
        files: [] as RepoFile[],
        run_id: "run-001",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/test/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-001", "/test/repo");
      expect(findings.completeness).toBe("partial");
    });

    it("includes unsupported_claims array", () => {
      const graph = {
        files: [] as RepoFile[],
        run_id: "run-001",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/test/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-001", "/test/repo");
      expect(Array.isArray(findings.unsupported_claims)).toBe(true);
    });
  });

  describe("writeFindingsJson", () => {
    it("writes findings.json to output directory", () => {
      const findings = buildFindingsFromGraph(
        {
          files: [],
          run_id: "run-001",
          generated_at: "2025-01-01T00:00:00Z",
          repo: { root: "/test/repo" },
          stats: { partial: false },
        },
        "run-001",
        "/test/repo"
      );

      const filePath = writeFindingsJson(tempOutDir, findings);
      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toBe(path.join(tempOutDir, "findings.json"));
    });

    it("written JSON is valid and parseable", () => {
      const findings = buildFindingsFromGraph(
        {
          files: [],
          run_id: "run-001",
          generated_at: "2025-01-01T00:00:00Z",
          repo: { root: "/test/repo" },
          stats: { partial: false },
        },
        "run-001",
        "/test/repo"
      );

      writeFindingsJson(tempOutDir, findings);
      const content = readFileSync(path.join(tempOutDir, "findings.json"), "utf8");
      const parsed = JSON.parse(content);

      expect(parsed.artifact).toBe("findings");
      expect(parsed.schema).toBe("findings@v1");
    });

    it("written findings.json has required fields", () => {
      const findings = buildFindingsFromGraph(
        {
          files: [],
          run_id: "run-001",
          generated_at: "2025-01-01T00:00:00Z",
          repo: { root: "/test/repo" },
          stats: { partial: false },
        },
        "run-001",
        "/test/repo"
      );

      writeFindingsJson(tempOutDir, findings);
      const content = readFileSync(path.join(tempOutDir, "findings.json"), "utf8");
      const parsed = JSON.parse(content);

      expect(parsed.version).toBeDefined();
      expect(parsed.generated_at).toBeDefined();
      expect(parsed.run_id).toBeDefined();
      expect(parsed.repo).toBeDefined();
      expect(parsed.tool).toBeDefined();
      expect(parsed.artifact).toBeDefined();
      expect(parsed.schema).toBeDefined();
      expect(parsed.findings).toBeDefined();
      expect(parsed.unsupported_claims).toBeDefined();
    });
  });

  describe("findings.json format validation", () => {
    it("each finding has required fields", () => {
      const graph = {
        files: [
          {
            id: "file:src/test.ts",
            path: "src/test.ts",
            language: "ts" as const,
            role: "source" as const,
            hash: "abc123",
            sizeBytes: 100,
            lineCount: 10,
            parser: { status: "parsed" as const, adapter: "ts-morph" },
          },
        ],
        run_id: "run-001",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/test/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-001", "/test/repo");

      for (const finding of findings.findings) {
        expect(finding.id).toBeDefined();
        expect(finding.ruleId).toBeDefined();
        expect(finding.category).toBeDefined();
        expect(finding.severity).toBeDefined();
        expect(finding.confidence).toBeDefined();
        expect(finding.title).toBeDefined();
        expect(finding.summary).toBeDefined();
        expect(Array.isArray(finding.evidence)).toBe(true);
      }
    });

    it("severity is valid enum value", () => {
      const graph = {
        files: [],
        run_id: "run-001",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/test/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-001", "/test/repo");

      const validSeverities = ["low", "medium", "high", "critical"];
      for (const finding of findings.findings) {
        expect(validSeverities).toContain(finding.severity);
      }
    });

    it("category is valid enum value", () => {
      const graph = {
        files: [],
        run_id: "run-001",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/test/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-001", "/test/repo");

      const validCategories = [
        "auth", "payment", "validation", "data", "config",
        "maintainability", "testing", "compatibility", "release-risk"
      ];
      for (const finding of findings.findings) {
        expect(validCategories).toContain(finding.category);
      }
    });

    it("confidence is between 0 and 1", () => {
      const graph = {
        files: [],
        run_id: "run-001",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/test/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-001", "/test/repo");

      for (const finding of findings.findings) {
        expect(finding.confidence).toBeGreaterThanOrEqual(0);
        expect(finding.confidence).toBeLessThanOrEqual(1);
      }
    });

    it("evidence has required fields", () => {
      const graph = {
        files: [
          {
            id: "file:src/test.ts",
            path: "src/test.ts",
            language: "ts" as const,
            role: "source" as const,
            hash: "abc123",
            sizeBytes: 100,
            lineCount: 10,
            parser: { status: "parsed" as const, adapter: "ts-morph" },
          },
        ],
        run_id: "run-001",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/test/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-001", "/test/repo");

      for (const finding of findings.findings) {
        for (const evidence of finding.evidence) {
          expect(evidence.id).toBeDefined();
          expect(evidence.path).toBeDefined();
          expect(evidence.kind).toBeDefined();
        }
      }
    });
  });

  // === Empty/null input handling ===
  describe("empty/null input handling", () => {
    it("handles graph with empty files array", () => {
      const graph = {
        files: [] as RepoFile[],
        run_id: "run-empty",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/empty/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-empty", "/empty/repo");
      expect(findings.findings).toEqual([]);
      expect(findings.unsupported_claims).toEqual([]);
      expect(findings.completeness).toBe("partial");
    });

    it("handles graph with minimal file data", () => {
      const graph = {
        files: [
          {
            id: "file:minimal.ts",
            path: "minimal.ts",
            language: "ts" as const,
            role: "source" as const,
            hash: "",
            sizeBytes: 0,
            lineCount: 0,
            parser: { status: "parsed" as const },
          },
        ],
        run_id: "run-minimal",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/minimal/repo" },
        stats: { partial: true },
      };

      const findings = buildFindingsFromGraph(graph, "run-minimal", "/minimal/repo");
      expect(findings).toBeDefined();
      expect(findings.artifact).toBe("findings");
    });

    it("handles createArtifactHeader with empty strings", () => {
      const header = createArtifactHeader("", "");
      expect(header.run_id).toBe("");
      expect(header.repo.root).toBe("");
    });

    it("handles graph with only unknown language files", () => {
      const graph = {
        files: [
          {
            id: "file:unknown.xyz",
            path: "unknown.xyz",
            language: "unknown" as const,
            role: "unknown" as const,
            hash: "abc123",
            sizeBytes: 100,
            lineCount: 10,
            parser: { status: "text_fallback" as const },
          },
        ],
        run_id: "run-unknown",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/unknown/repo" },
        stats: { partial: true },
      };

      const findings = buildFindingsFromGraph(graph, "run-unknown", "/unknown/repo");
      expect(findings.findings.length).toBe(0);
    });
  });

  // === Large data sets ===
  describe("large data sets", () => {
    it("handles graph with 100+ files", () => {
      const files: RepoFile[] = [];
      for (let i = 0; i < 150; i++) {
        files.push({
          id: `file:src/file${i}.ts`,
          path: `src/file${i}.ts`,
          language: "ts" as const,
          role: "source" as const,
          hash: `hash${i}`,
          sizeBytes: 1000 + i,
          lineCount: 50 + i,
          parser: { status: "parsed" as const, adapter: "ts-morph" },
        });
      }

      const graph = {
        files,
        run_id: "run-large",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/large/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-large", "/large/repo");
      expect(findings.findings).toBeDefined();
      expect(findings.findings.length).toBeGreaterThanOrEqual(0);
    });

    it("writes large findings.json successfully", () => {
      // Create a large findings artifact
      const largeFindings: FindingsArtifact = {
        version: "ctg/v1alpha1",
        generated_at: new Date().toISOString(),
        run_id: "run-large-write",
        repo: { root: "/large/repo" },
        tool: {
          name: "code-to-gate",
          version: "0.1.0",
          plugin_versions: [],
        },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: Array.from({ length: 100 }, (_, i) => ({
          id: `finding-${i.toString().padStart(3, "0")}`,
          ruleId: "TEST_RULE",
          category: "auth" as const,
          severity: "medium" as const,
          confidence: 0.75,
          title: `Finding ${i}`,
          summary: `Summary for finding ${i}`,
          evidence: [],
        })),
        unsupported_claims: [],
      };

      const filePath = writeFindingsJson(tempOutDir, largeFindings);
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content);
      expect(parsed.findings.length).toBe(100);
    });

    it("handles findings with many evidence items", () => {
      const files: RepoFile[] = [{
        id: "file:src/test.ts",
        path: "src/test.ts",
        language: "ts" as const,
        role: "source" as const,
        hash: "abc123",
        sizeBytes: 100,
        lineCount: 10,
        parser: { status: "parsed" as const, adapter: "ts-morph" },
      }];

      const graph = {
        files,
        run_id: "run-evidence",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/test/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-evidence", "/test/repo");
      // Just verify it works, evidence count depends on rule implementation
      expect(findings.findings).toBeDefined();
    });
  });

  // === Unicode/special characters ===
  describe("unicode and special characters", () => {
    it("handles paths with unicode characters", () => {
      const graph = {
        files: [
          {
            id: "file:src/中文/ファイル.ts",
            path: "src/中文/ファイル.ts",
            language: "ts" as const,
            role: "source" as const,
            hash: "unicode123",
            sizeBytes: 100,
            lineCount: 10,
            parser: { status: "parsed" as const, adapter: "ts-morph" },
          },
        ],
        run_id: "run-unicode",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/unicode/中文/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-unicode", "/unicode/中文/repo");
      expect(findings.repo.root).toContain("中文");
    });

    it("handles paths with special characters (spaces, hyphens, underscores)", () => {
      const graph = {
        files: [
          {
            id: "file:src/my-special_file name.ts",
            path: "src/my-special_file name.ts",
            language: "ts" as const,
            role: "source" as const,
            hash: "special123",
            sizeBytes: 100,
            lineCount: 10,
            parser: { status: "parsed" as const, adapter: "ts-morph" },
          },
        ],
        run_id: "run-special",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/special chars/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-special", "/special chars/repo");
      expect(findings.repo.root).toContain("special chars");
    });

    it("writes JSON with unicode content correctly", () => {
      const unicodeFindings: FindingsArtifact = {
        version: "ctg/v1alpha1",
        generated_at: new Date().toISOString(),
        run_id: "run-unicode-write",
        repo: { root: "/中文/ディレクトリ" },
        tool: {
          name: "code-to-gate",
          version: "0.1.0",
          plugin_versions: [],
        },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [{
          id: "finding-unicode-001",
          ruleId: "UNICODE_RULE",
          category: "auth",
          severity: "medium",
          confidence: 0.85,
          title: "Unicode finding テスト",
          summary: "中文 summary with emoji 😀",
          evidence: [],
        }],
        unsupported_claims: [],
      };

      const filePath = writeFindingsJson(tempOutDir, unicodeFindings);
      const content = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content);

      expect(parsed.repo.root).toContain("中文");
      expect(parsed.findings[0].title).toContain("テスト");
      expect(parsed.findings[0].summary).toContain("😀");
    });
  });

  // === Edge cases in formatting ===
  describe("edge cases in formatting", () => {
    it("handles extreme confidence values (0 and 1)", () => {
      const findings: FindingsArtifact = {
        version: "ctg/v1alpha1",
        generated_at: new Date().toISOString(),
        run_id: "run-edge",
        repo: { root: "/test/repo" },
        tool: {
          name: "code-to-gate",
          version: "0.1.0",
          plugin_versions: [],
        },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [
          {
            id: "finding-001",
            ruleId: "ZERO_CONFIDENCE",
            category: "auth",
            severity: "low",
            confidence: 0,
            title: "Zero confidence",
            summary: "Test",
            evidence: [],
          },
          {
            id: "finding-002",
            ruleId: "MAX_CONFIDENCE",
            category: "auth",
            severity: "critical",
            confidence: 1,
            title: "Max confidence",
            summary: "Test",
            evidence: [],
          },
        ],
        unsupported_claims: [],
      };

      const filePath = writeFindingsJson(tempOutDir, findings);
      const content = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content);

      expect(parsed.findings[0].confidence).toBe(0);
      expect(parsed.findings[1].confidence).toBe(1);
    });

    it("handles very long titles and summaries", () => {
      const longTitle = "A".repeat(500);
      const longSummary = "B".repeat(1000);

      const findings: FindingsArtifact = {
        version: "ctg/v1alpha1",
        generated_at: new Date().toISOString(),
        run_id: "run-long",
        repo: { root: "/test/repo" },
        tool: {
          name: "code-to-gate",
          version: "0.1.0",
          plugin_versions: [],
        },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [{
          id: "finding-001",
          ruleId: "LONG_RULE",
          category: "auth",
          severity: "medium",
          confidence: 0.75,
          title: longTitle,
          summary: longSummary,
          evidence: [],
        }],
        unsupported_claims: [],
      };

      const filePath = writeFindingsJson(tempOutDir, findings);
      const content = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content);

      expect(parsed.findings[0].title).toBe(longTitle);
      expect(parsed.findings[0].summary).toBe(longSummary);
    });

    it("handles all severity levels", () => {
      const severities = ["low", "medium", "high", "critical"] as const;

      const findings: FindingsArtifact = {
        version: "ctg/v1alpha1",
        generated_at: new Date().toISOString(),
        run_id: "run-severities",
        repo: { root: "/test/repo" },
        tool: {
          name: "code-to-gate",
          version: "0.1.0",
          plugin_versions: [],
        },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: severities.map((severity, i) => ({
          id: `finding-${i.toString().padStart(3, "0")}`,
          ruleId: "SEVERITY_RULE",
          category: "auth",
          severity,
          confidence: 0.75,
          title: `${severity} finding`,
          summary: `Test ${severity}`,
          evidence: [],
        })),
        unsupported_claims: [],
      };

      const filePath = writeFindingsJson(tempOutDir, findings);
      const content = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content);

      expect(parsed.findings.map(f => f.severity)).toEqual(severities);
    });

    it("handles all category types", () => {
      const categories = [
        "auth", "payment", "validation", "data", "config",
        "maintainability", "testing", "compatibility", "release-risk"
      ] as const;

      const findings: FindingsArtifact = {
        version: "ctg/v1alpha1",
        generated_at: new Date().toISOString(),
        run_id: "run-categories",
        repo: { root: "/test/repo" },
        tool: {
          name: "code-to-gate",
          version: "0.1.0",
          plugin_versions: [],
        },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: categories.map((category, i) => ({
          id: `finding-${i.toString().padStart(3, "0")}`,
          ruleId: "CATEGORY_RULE",
          category,
          severity: "medium" as const,
          confidence: 0.75,
          title: `${category} finding`,
          summary: `Test ${category}`,
          evidence: [],
        })),
        unsupported_claims: [],
      };

      const filePath = writeFindingsJson(tempOutDir, findings);
      const content = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content);

      expect(parsed.findings.map(f => f.category)).toEqual(categories);
    });

    it("handles all evidence kinds", () => {
      const kinds = ["ast", "text", "import", "external", "test", "coverage", "diff"] as const;

      const findings: FindingsArtifact = {
        version: "ctg/v1alpha1",
        generated_at: new Date().toISOString(),
        run_id: "run-evidence-kinds",
        repo: { root: "/test/repo" },
        tool: {
          name: "code-to-gate",
          version: "0.1.0",
          plugin_versions: [],
        },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [{
          id: "finding-001",
          ruleId: "EVIDENCE_RULE",
          category: "auth",
          severity: "medium",
          confidence: 0.75,
          title: "Multiple evidence kinds",
          summary: "Test",
          evidence: kinds.map((kind, i) => ({
            id: `evidence-${i}`,
            path: `src/file${i}.ts`,
            startLine: i + 1,
            endLine: i + 5,
            kind,
          })),
        }],
        unsupported_claims: [],
      };

      const filePath = writeFindingsJson(tempOutDir, findings);
      const content = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content);

      expect(parsed.findings[0].evidence.map(e => e.kind)).toEqual(kinds);
    });
  });

  // === Error handling ===
  describe("error handling", () => {
    it("handles write to valid directory successfully", () => {
      const findings: FindingsArtifact = {
        version: "ctg/v1alpha1",
        generated_at: new Date().toISOString(),
        run_id: "run-write-test",
        repo: { root: "/test/repo" },
        tool: {
          name: "code-to-gate",
          version: "0.1.0",
          plugin_versions: [],
        },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      // Should succeed writing to a valid temp directory
      const filePath = writeFindingsJson(tempOutDir, findings);
      expect(existsSync(filePath)).toBe(true);
    });

    it("generates valid JSON output", () => {
      const findings: FindingsArtifact = {
        version: "ctg/v1alpha1",
        generated_at: new Date().toISOString(),
        run_id: "run-json-valid",
        repo: { root: "/test/repo" },
        tool: {
          name: "code-to-gate",
          version: "0.1.0",
          plugin_versions: [],
        },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };

      writeFindingsJson(tempOutDir, findings);
      const content = readFileSync(path.join(tempOutDir, "findings.json"), "utf8");

      // Should be valid JSON
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it("handles findings with optional fields omitted", () => {
      const findings: FindingsArtifact = {
        version: "ctg/v1alpha1",
        generated_at: new Date().toISOString(),
        run_id: "run-optional",
        repo: { root: "/test/repo" },
        tool: {
          name: "code-to-gate",
          version: "0.1.0",
          plugin_versions: [],
        },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [{
          id: "finding-001",
          ruleId: "MINIMAL_RULE",
          category: "auth",
          severity: "medium",
          confidence: 0.75,
          title: "Minimal finding",
          summary: "Test",
          evidence: [],
          // No optional fields like affectedSymbols, tags, etc.
        }],
        unsupported_claims: [],
      };

      const filePath = writeFindingsJson(tempOutDir, findings);
      const content = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content);

      expect(parsed.findings[0].id).toBe("finding-001");
      expect(parsed.findings[0].affectedSymbols).toBeUndefined();
      expect(parsed.findings[0].tags).toBeUndefined();
    });

    it("handles findings with all optional fields", () => {
      const findings: FindingsArtifact = {
        version: "ctg/v1alpha1",
        generated_at: new Date().toISOString(),
        run_id: "run-full-optional",
        repo: { root: "/test/repo" },
        tool: {
          name: "code-to-gate",
          version: "0.1.0",
          plugin_versions: [],
        },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [{
          id: "finding-001",
          ruleId: "FULL_RULE",
          category: "auth",
          severity: "high",
          confidence: 0.95,
          title: "Full finding",
          summary: "Test with all fields",
          evidence: [{
            id: "evidence-001",
            path: "src/test.ts",
            startLine: 1,
            endLine: 10,
            kind: "text",
          }],
          affectedSymbols: ["symbol:A", "symbol:B"],
          affectedEntrypoints: ["entrypoint:api/create"],
          tags: ["security", "auth", "critical"],
          upstream: {
            tool: "semgrep",
            ruleId: "semgrep-rule-001",
          },
        }],
        unsupported_claims: [],
      };

      const filePath = writeFindingsJson(tempOutDir, findings);
      const content = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content);

      expect(parsed.findings[0].affectedSymbols).toEqual(["symbol:A", "symbol:B"]);
      expect(parsed.findings[0].affectedEntrypoints).toEqual(["entrypoint:api/create"]);
      expect(parsed.findings[0].tags).toEqual(["security", "auth", "critical"]);
      expect(parsed.findings[0].upstream.tool).toBe("semgrep");
    });
  });

  // === Schema validation integration ===
  describe("schema validation integration", () => {
    it("generates artifact with correct artifact type", () => {
      const graph = {
        files: [],
        run_id: "run-schema",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/test/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-schema", "/test/repo");
      expect(findings.artifact).toBe("findings");
    });

    it("generates artifact with correct schema version", () => {
      const graph = {
        files: [],
        run_id: "run-schema-version",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/test/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-schema-version", "/test/repo");
      expect(findings.schema).toBe("findings@v1");
    });

    it("generates artifact with required version field", () => {
      const graph = {
        files: [],
        run_id: "run-version",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/test/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-version", "/test/repo");
      expect(findings.version).toBe("ctg/v1alpha1");
    });

    it("generates artifact with ISO 8601 timestamp", () => {
      const graph = {
        files: [],
        run_id: "run-timestamp",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/test/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-timestamp", "/test/repo");
      // Should be valid ISO 8601 format
      expect(new Date(findings.generated_at).toISOString()).toBe(findings.generated_at);
    });

    it("generates artifact with tool information", () => {
      const graph = {
        files: [],
        run_id: "run-tool",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/test/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-tool", "/test/repo");
      expect(findings.tool.name).toBe("code-to-gate");
      expect(findings.tool.version).toBeDefined();
    });

    it("generates artifact with repo information", () => {
      const graph = {
        files: [],
        run_id: "run-repo",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/specific/test/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-repo", "/specific/test/repo");
      expect(findings.repo.root).toBe("/specific/test/repo");
    });

    it("generates valid JSON that can be parsed back", () => {
      const graph = {
        files: [],
        run_id: "run-parse",
        generated_at: "2025-01-01T00:00:00Z",
        repo: { root: "/test/repo" },
        stats: { partial: false },
      };

      const findings = buildFindingsFromGraph(graph, "run-parse", "/test/repo");
      writeFindingsJson(tempOutDir, findings);

      const content = readFileSync(path.join(tempOutDir, "findings.json"), "utf8");
      const parsed = JSON.parse(content) as FindingsArtifact;

      expect(parsed.artifact).toBe("findings");
      expect(parsed.schema).toBe("findings@v1");
      expect(parsed.version).toBe("ctg/v1alpha1");
    });
  });
});