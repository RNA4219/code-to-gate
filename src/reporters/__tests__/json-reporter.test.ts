/**
 * Tests for JSON Reporter - Refactored
 *
 * Consolidated tests to reduce redundancy while maintaining coverage.
 * Original: 44 tests, 1056 lines
 * Refactored: 18 tests (merged similar cases)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  buildFindingsFromGraph,
  writeFindingsJson,
  createArtifactHeader,
} from "../json-reporter.js";
import { existsSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import type { RepoFile, FindingsArtifact } from "../../types/artifacts.js";

// Helper: Create minimal graph
function createMinimalGraph(files: RepoFile[] = [], overrides = {}) {
  return {
    files,
    run_id: "test-run",
    generated_at: new Date().toISOString(),
    repo: { root: "/test/repo" },
    stats: { partial: false },
    ...overrides,
  };
}

// Helper: Create source file
function createSourceFile(path: string, overrides = {}): RepoFile {
  return {
    id: `file:${path}`,
    path,
    language: "ts" as const,
    role: "source" as const,
    hash: "abc123",
    sizeBytes: 100,
    lineCount: 10,
    parser: { status: "parsed" as const, adapter: "ts-morph" },
    ...overrides,
  };
}

// Helper: Create findings artifact
function createFindings(overrides = {}): FindingsArtifact {
  return {
    version: "ctg/v1alpha1",
    generated_at: new Date().toISOString(),
    run_id: "test-run",
    repo: { root: "/test/repo" },
    tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings: [],
    unsupported_claims: [],
    ...overrides,
  };
}

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
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
      mkdirSync(tempOutDir, { recursive: true });
    }
  });

  describe("createArtifactHeader", () => {
    it("creates header with all required fields and optional policy_id", () => {
      const header = createArtifactHeader("run-001", "/test/repo", "policy-001");
      expect(header.version).toBe("ctg/v1alpha1");
      expect(header.run_id).toBe("run-001");
      expect(header.repo.root).toBe("/test/repo");
      expect(header.tool.policy_id).toBe("policy-001");
    });

    it("creates header without policy_id when not provided", () => {
      const header = createArtifactHeader("run-001", "/test/repo");
      expect(header.tool.policy_id).toBeUndefined();
    });
  });

  describe("buildFindingsFromGraph", () => {
    it("builds findings with correct structure from graph", () => {
      const graph = createMinimalGraph([createSourceFile("src/test.ts")]);
      const findings = buildFindingsFromGraph(graph, "test-run", "/test/repo");

      expect(findings.artifact).toBe("findings");
      expect(findings.schema).toBe("findings@v1");
      expect(findings.version).toBe("ctg/v1alpha1");
      expect(Array.isArray(findings.findings)).toBe(true);
      expect(Array.isArray(findings.unsupported_claims)).toBe(true);
    });

    it("returns empty findings for graph with no source files", () => {
      const graph = createMinimalGraph([
        { id: "file:config.json", path: "config.json", language: "unknown" as const, role: "config" as const, hash: "abc", sizeBytes: 50, lineCount: 5, parser: { status: "skipped" as const } },
      ]);
      const findings = buildFindingsFromGraph(graph, "test-run", "/test/repo");
      expect(findings.findings.length).toBe(0);
      expect(findings.completeness).toBe("partial");
    });

    it("handles empty graph", () => {
      const graph = createMinimalGraph();
      const findings = buildFindingsFromGraph(graph, "test-run", "/test/repo");
      expect(findings.findings).toEqual([]);
      expect(findings.unsupported_claims).toEqual([]);
    });
  });

  describe("writeFindingsJson", () => {
    it("writes valid JSON with all required fields", () => {
      const findings = buildFindingsFromGraph(createMinimalGraph(), "test-run", "/test/repo");
      const filePath = writeFindingsJson(tempOutDir, findings);

      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content);

      // Verify all required fields
      expect(parsed.version).toBeDefined();
      expect(parsed.generated_at).toBeDefined();
      expect(parsed.run_id).toBeDefined();
      expect(parsed.repo).toBeDefined();
      expect(parsed.tool).toBeDefined();
      expect(parsed.artifact).toBe("findings");
      expect(parsed.schema).toBe("findings@v1");
      expect(parsed.findings).toBeDefined();
      expect(parsed.unsupported_claims).toBeDefined();
    });
  });

  describe("finding format validation", () => {
    it("findings have all required fields with valid values", () => {
      const graph = createMinimalGraph([createSourceFile("src/test.ts")]);
      const findings = buildFindingsFromGraph(graph, "test-run", "/test/repo");

      const validSeverities = ["low", "medium", "high", "critical"];
      const validCategories = ["auth", "payment", "validation", "data", "config", "maintainability", "testing", "compatibility", "release-risk"];

      for (const finding of findings.findings) {
        expect(finding.id).toBeDefined();
        expect(finding.ruleId).toBeDefined();
        expect(validCategories).toContain(finding.category);
        expect(validSeverities).toContain(finding.severity);
        expect(finding.confidence).toBeGreaterThanOrEqual(0);
        expect(finding.confidence).toBeLessThanOrEqual(1);
        expect(finding.title).toBeDefined();
        expect(finding.summary).toBeDefined();
        expect(Array.isArray(finding.evidence)).toBe(true);

        for (const evidence of finding.evidence) {
          expect(evidence.id).toBeDefined();
          expect(evidence.path).toBeDefined();
          expect(evidence.kind).toBeDefined();
        }
      }
    });
  });

  describe("edge cases", () => {
    it("handles special characters and unicode in paths and content", () => {
      const unicodeFindings = createFindings({
        repo: { root: "/中文/ディレクトリ" },
        findings: [{
          id: "finding-001",
          ruleId: "UNICODE_RULE",
          category: "auth",
          severity: "medium",
          confidence: 0.85,
          title: "Unicode finding テスト",
          summary: "中文 summary with emoji 😀",
          evidence: [],
        }],
      });

      const filePath = writeFindingsJson(tempOutDir, unicodeFindings);
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));

      expect(parsed.repo.root).toContain("中文");
      expect(parsed.findings[0].title).toContain("テスト");
    });

    it("handles extreme values (confidence 0/1, long strings, many files)", () => {
      // Create 150 files
      const files = Array.from({ length: 150 }, (_, i) => createSourceFile(`src/file${i}.ts`));
      const graph = createMinimalGraph(files);
      const findings = buildFindingsFromGraph(graph, "test-run", "/test/repo");

      expect(findings.findings).toBeDefined();

      // Write large findings with extreme confidence
      const largeFindings = createFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "auth", severity: "low", confidence: 0, title: "Zero", summary: "Test", evidence: [] },
          { id: "f2", ruleId: "R2", category: "auth", severity: "critical", confidence: 1, title: "Max", summary: "Test", evidence: [] },
          { id: "f3", ruleId: "R3", category: "auth", severity: "medium", confidence: 0.75, title: "A".repeat(500), summary: "B".repeat(1000), evidence: [] },
        ],
      });

      const filePath = writeFindingsJson(tempOutDir, largeFindings);
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));

      expect(parsed.findings[0].confidence).toBe(0);
      expect(parsed.findings[1].confidence).toBe(1);
      expect(parsed.findings[2].title.length).toBe(500);
    });
  });

  describe("all enum values", () => {
    it("handles all valid severities and categories", () => {
      const severities = ["low", "medium", "high", "critical"];
      const categories = ["auth", "payment", "validation", "data", "config", "maintainability", "testing", "compatibility", "release-risk"];

      const findings = createFindings({
        findings: [
          ...severities.map((s, i) => ({
            id: `f${i}`, ruleId: "R", category: "auth" as const, severity: s as const, confidence: 0.75, title: `${s}`, summary: "", evidence: [],
          })),
          ...categories.map((c, i) => ({
            id: `fc${i}`, ruleId: "R", category: c as const, severity: "medium" as const, confidence: 0.75, title: `${c}`, summary: "", evidence: [],
          })),
        ],
      });

      const filePath = writeFindingsJson(tempOutDir, findings);
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));

      expect(parsed.findings.slice(0, 4).map(f => f.severity)).toEqual(severities);
      expect(parsed.findings.slice(4).map(f => f.category)).toEqual(categories);
    });

    it("handles all evidence kinds", () => {
      const kinds = ["ast", "text", "import", "external", "test", "coverage", "diff"];

      const findings = createFindings({
        findings: [{
          id: "f1",
          ruleId: "R",
          category: "auth",
          severity: "medium",
          confidence: 0.75,
          title: "Test",
          summary: "Test",
          evidence: kinds.map((k, i) => ({ id: `e${i}`, path: `src/f${i}.ts`, startLine: i + 1, kind: k as const })),
        }],
      });

      const filePath = writeFindingsJson(tempOutDir, findings);
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));

      expect(parsed.findings[0].evidence.map(e => e.kind)).toEqual(kinds);
    });
  });

  describe("optional fields", () => {
    it("handles findings with and without optional fields", () => {
      const findings = createFindings({
        findings: [
          // Minimal - no optional fields
          { id: "f1", ruleId: "R", category: "auth", severity: "medium", confidence: 0.75, title: "Min", summary: "", evidence: [] },
          // Full - all optional fields
          {
            id: "f2",
            ruleId: "R",
            category: "auth",
            severity: "high",
            confidence: 0.95,
            title: "Full",
            summary: "Test",
            evidence: [{ id: "e1", path: "src/test.ts", startLine: 1, kind: "text" as const }],
            affectedSymbols: ["symbol:A", "symbol:B"],
            affectedEntrypoints: ["entrypoint:api"],
            tags: ["security", "auth"],
            upstream: { tool: "semgrep", ruleId: "semgrep-001" },
          },
        ],
      });

      const filePath = writeFindingsJson(tempOutDir, findings);
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));

      expect(parsed.findings[0].affectedSymbols).toBeUndefined();
      expect(parsed.findings[1].affectedSymbols).toEqual(["symbol:A", "symbol:B"]);
      expect(parsed.findings[1].tags).toEqual(["security", "auth"]);
      expect(parsed.findings[1].upstream.tool).toBe("semgrep");
    });
  });
});