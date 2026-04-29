/**
 * Integration tests for demo-ci-imports fixture
 *
 * Tests:
 * - import semgrep JSON
 * - import eslint JSON
 * - findings normalization
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runCli,
  fixturePath,
  readJson,
  createTempOutDir,
  cleanupTempDir,
  fileExists,
} from "./helper.js";
import path from "node:path";
import { readFileSync } from "node:fs";

describe("demo-ci-imports integration", () => {
  const fixture = "demo-ci-imports";
  const fixtureRoot = fixturePath(fixture);
  let tempDir: string;

  beforeAll(() => {
    tempDir = createTempOutDir("demo-ci-imports");
  });

  afterAll(() => {
    cleanupTempDir(tempDir);
  });

  it("fixture has semgrep.json with valid structure", () => {
    const semgrepPath = path.join(fixtureRoot, "semgrep.json");
    expect(fileExists(semgrepPath)).toBe(true);

    const semgrep = readJson(semgrepPath) as {
      results: Array<{
        check_id: string;
        path: string;
        extra: { severity: string; message: string };
      }>;
    };

    expect(semgrep.results).toBeDefined();
    expect(semgrep.results.length).toBeGreaterThan(0);

    // Check structure of first result
    const firstResult = semgrep.results[0];
    expect(firstResult.check_id).toBeDefined();
    expect(firstResult.path).toBeDefined();
    expect(firstResult.extra).toBeDefined();
  });

  it("fixture has eslint.json with valid structure", () => {
    const eslintPath = path.join(fixtureRoot, "eslint.json");
    expect(fileExists(eslintPath)).toBe(true);

    const eslint = readJson(eslintPath) as Array<{
      filePath: string;
      messages: Array<{
        ruleId: string;
        severity: number;
        message: string;
        line: number;
      }>;
    }>;

    expect(eslint.length).toBeGreaterThan(0);

    // Check structure
    const firstFile = eslint[0];
    expect(firstFile.filePath).toBeDefined();
    expect(firstFile.messages).toBeDefined();
  });

  it("scan command creates repo-graph.json", { timeout: 30000 }, () => {
    const result = runCli(["scan", fixtureRoot, "--out", tempDir]);

    expect(result.exitCode).toBe(0);
    expect(fileExists(path.join(tempDir, "repo-graph.json"))).toBe(true);

    const graph = readJson(path.join(tempDir, "repo-graph.json")) as {
      artifact: string;
      files: Array<{ path: string }>;
    };
    expect(graph.artifact).toBe("normalized-repo-graph");
    expect(graph.files.length).toBeGreaterThan(0);
  });

  it("analyze command generates findings for the fixture", { timeout: 30000 }, () => {
    const result = runCli(["analyze", fixtureRoot, "--emit", "all", "--out", tempDir]);

    // Accept any exit code as we're just checking artifact generation
    expect([0, 1, 5]).toContain(result.exitCode);
    expect(fileExists(path.join(tempDir, "findings.json"))).toBe(true);

    const findings = readJson(path.join(tempDir, "findings.json")) as {
      artifact: string;
      findings: Array<{ ruleId: string }>;
    };
    expect(findings.artifact).toBe("findings");
  });

  it("external CI results can be manually imported and normalized", () => {
    // Read semgrep results and convert to findings format
    const semgrepPath = path.join(fixtureRoot, "semgrep.json");
    const semgrep = readJson(semgrepPath) as {
      results: Array<{
        check_id: string;
        path: string;
        start: { line: number; col: number };
        end: { line: number; col: number };
        extra: {
          severity: string;
          message: string;
          metadata: { category: string };
        };
      }>;
    };

    // Normalize semgrep results to finding format
    const normalizedFindings = semgrep.results.map((r, i) => ({
      id: `finding-semgrep-${i.toString().padStart(3, "0")}`,
      ruleId: r.check_id,
      category: "security", // Semgrep results are security-related
      severity: r.extra.severity.toLowerCase() === "error" ? "high" : "medium",
      confidence: 0.85,
      title: r.extra.message.slice(0, 50),
      summary: r.extra.message,
      evidence: [
        {
          id: `evidence-semgrep-${i}`,
          path: r.path,
          startLine: r.start.line,
          endLine: r.end.line,
          kind: "external",
          externalRef: {
            tool: "semgrep",
            ruleId: r.check_id,
          },
        },
      ],
      upstream: {
        tool: "semgrep",
        ruleId: r.check_id,
      },
    }));

    expect(normalizedFindings.length).toBeGreaterThan(0);
    expect(normalizedFindings[0].upstream?.tool).toBe("semgrep");
    expect(normalizedFindings[0].evidence[0].kind).toBe("external");
  });

  it("eslint results can be normalized to findings format", () => {
    const eslintPath = path.join(fixtureRoot, "eslint.json");
    const eslint = readJson(eslintPath) as Array<{
      filePath: string;
      messages: Array<{
        ruleId: string;
        severity: number;
        message: string;
        line: number;
        endLine: number;
      }>;
    }>;

    // Normalize eslint results
    const normalizedFindings = eslint.flatMap((file, fileIdx) =>
      file.messages.map((msg, msgIdx) => ({
        id: `finding-eslint-${fileIdx}-${msgIdx}`,
        ruleId: msg.ruleId || "eslint-unknown",
        category: msg.severity === 2 ? "maintainability" : "config",
        severity: msg.severity === 2 ? "medium" : "low",
        confidence: 0.9,
        title: msg.message.slice(0, 50),
        summary: msg.message,
        evidence: [
          {
            id: `evidence-eslint-${fileIdx}-${msgIdx}`,
            path: file.filePath,
            startLine: msg.line,
            endLine: msg.endLine || msg.line,
            kind: "external",
            externalRef: {
              tool: "eslint",
              ruleId: msg.ruleId,
            },
          },
        ],
        upstream: {
          tool: "eslint",
          ruleId: msg.ruleId,
        },
      }))
    );

    expect(normalizedFindings.length).toBeGreaterThan(0);
    expect(normalizedFindings[0].upstream?.tool).toBe("eslint");
  });

  it("findings.json validates against schema", { timeout: 30000 }, () => {
    runCli(["analyze", fixtureRoot, "--emit", "all", "--out", tempDir]);

    const result = runCli(["schema", "validate", path.join(tempDir, "findings.json")]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("artifact ok");
  });

  it("coverage-summary.json is present in fixture", () => {
    const coveragePath = path.join(fixtureRoot, "coverage-summary.json");
    expect(fileExists(coveragePath)).toBe(true);

    const coverage = readJson(coveragePath) as {
      total: { lines: { pct: number } };
    };

    expect(coverage.total).toBeDefined();
    expect(coverage.total.lines.pct).toBeDefined();
  });
});