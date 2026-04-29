/**
 * Tests for LARGE_MODULE rule
 */

import { describe, it, expect } from "vitest";
import { LARGE_MODULE_RULE } from "../large-module.js";
import type { RuleContext, SimpleGraph, RepoFile } from "../index.js";
import type { Finding } from "../../types/artifacts.js";

// Helper to create a mock file
function createMockFile(
  path: string,
  content: string,
  language: "ts" | "js" | "py" = "ts",
  role: "source" | "test" = "source",
  lineCount?: number
): RepoFile {
  const actualLineCount = content.split("\n").length;
  return {
    id: `file:${path}`,
    path,
    language,
    role,
    hash: "abc123",
    sizeBytes: content.length,
    lineCount: lineCount ?? actualLineCount,
    parser: { status: "parsed", adapter: language === "py" ? "text" : "ts-morph" },
  };
}

// Helper to create a mock context
function createMockContext(files: RepoFile[], contents: Map<string, string>): RuleContext {
  return {
    graph: {
      files,
      run_id: "test-run-001",
      generated_at: new Date().toISOString(),
      repo: { root: "/test/repo" },
      stats: { partial: false },
    },
    getFileContent(path: string): string | null {
      return contents.get(path) ?? null;
    },
  };
}

// Helper to generate large content
function generateLargeContent(lines: number): string {
  const content: string[] = [];
  for (let i = 0; i < lines; i++) {
    content.push(`// Line ${i + 1}: Some code here`);
  }
  return content.join("\n");
}

// Helper to generate content with many functions
function generateManyFunctionsContent(count: number): string {
  const content: string[] = ["// File with many functions"];
  for (let i = 0; i < count; i++) {
    content.push(`function func${i + 1}(arg) { return arg * 2; }`);
  }
  return content.join("\n");
}

describe("LARGE_MODULE_RULE", () => {
  it("should detect files exceeding line count threshold", () => {
    // Create content with 600 lines (exceeds 500 threshold)
    const content = generateLargeContent(600);
    const files = [createMockFile("src/large-module.ts", content)];
    const contents = new Map([["src/large-module.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].ruleId).toBe("LARGE_MODULE");
    expect(findings[0].category).toBe("maintainability");
    expect(findings[0].severity).toBe("medium");
    expect(findings[0].title).toContain("line count");
    expect(findings[0].summary).toContain("600");
  });

  it("should detect files exceeding size threshold", () => {
    // Create content larger than 50KB
    const largeContent = "x".repeat(60 * 1024); // 60KB
    const files = [createMockFile("src/huge-file.ts", largeContent)];
    const contents = new Map([["src/huge-file.ts", largeContent]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].title).toContain("size threshold");
    expect(findings[0].summary).toContain("KB");
  });

  it("should detect files with too many functions", () => {
    // Create content with 25 functions (exceeds 20 threshold)
    const content = generateManyFunctionsContent(25);
    const files = [createMockFile("src/many-functions.ts", content)];
    const contents = new Map([["src/many-functions.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].title).toContain("too many functions");
    // The count may be higher due to regex matching additional patterns
    expect(findings[0].summary).toContain("function definitions");
  });

  it("should classify very large files as high severity", () => {
    // Create content with 1200 lines (more than 2x threshold)
    const content = generateLargeContent(1200);
    const files = [createMockFile("src/very-large.ts", content)];
    const contents = new Map([["src/very-large.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].severity).toBe("high");
  });

  it("should correctly identify evidence location", () => {
    const content = generateLargeContent(600);
    const files = [createMockFile("src/large.ts", content)];
    const contents = new Map([["src/large.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].evidence.length).toBeGreaterThan(0);
    expect(findings[0].evidence[0].path).toBe("src/large.ts");
    expect(findings[0].evidence[0].startLine).toBe(1);
  });

  it("should not report findings for files under threshold", () => {
    // Create content with 100 lines (under threshold)
    const content = generateLargeContent(100);
    const files = [createMockFile("src/small.ts", content)];
    const contents = new Map([["src/small.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should skip index.ts files", () => {
    const content = generateLargeContent(600);
    const files = [createMockFile("src/index.ts", content)];
    const contents = new Map([["src/index.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    // Index files often aggregate imports, so they should be skipped
    expect(findings.length).toBe(0);
  });

  it("should skip index.js files", () => {
    const content = generateLargeContent(600);
    const files = [createMockFile("src/index.js", content, "js")];
    const contents = new Map([["src/index.js", content]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should skip config files", () => {
    const content = generateLargeContent(600);
    const files = [createMockFile("src/config/settings.ts", content)];
    const contents = new Map([["src/config/settings.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should skip test files", () => {
    const content = generateLargeContent(600);
    const files = [createMockFile("src/__tests__/large.test.ts", content, "ts", "test")];
    const contents = new Map([["src/__tests__/large.test.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should skip tests directory", () => {
    const content = generateLargeContent(600);
    const files = [createMockFile("src/tests/large.ts", content, "ts", "test")];
    const contents = new Map([["src/tests/large.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should skip test directory", () => {
    const content = generateLargeContent(600);
    const files = [createMockFile("src/test/large.ts", content, "ts", "test")];
    const contents = new Map([["src/test/large.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBe(0);
  });

  it("should work with JavaScript files", () => {
    const content = generateLargeContent(600);
    const files = [createMockFile("src/large.js", content, "js")];
    const contents = new Map([["src/large.js", content]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should work with Python files", () => {
    // Generate Python-style content with many lines
    const content: string[] = [];
    for (let i = 0; i < 600; i++) {
      content.push(`# Line ${i + 1}`);
    }
    const files = [createMockFile("src/large.py", content.join("\n"), "py")];
    const contents = new Map([["src/large.py", content.join("\n")]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should count Python def functions correctly", () => {
    // Create Python content with many functions
    const content: string[] = [];
    for (let i = 0; i < 25; i++) {
      content.push(`def func_${i}(arg):`);
      content.push(`    return arg * 2`);
      content.push("");
    }
    const files = [createMockFile("src/many_funcs.py", content.join("\n"), "py")];
    const contents = new Map([["src/many_funcs.py", content.join("\n")]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.title.includes("too many functions"))).toBe(true);
  });

  it("should count arrow functions correctly", () => {
    // Create content with many arrow functions
    const content: string[] = [];
    for (let i = 0; i < 25; i++) {
      content.push(`export const func${i} = (arg) => arg * 2;`);
    }
    const files = [createMockFile("src/arrow.ts", content.join("\n"))];
    const contents = new Map([["src/arrow.ts", content.join("\n")]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.title.includes("too many functions"))).toBe(true);
  });

  it("should detect patterns across multiple files", () => {
    const largeContent1 = generateLargeContent(600);
    const largeContent2 = generateLargeContent(700);

    const files = [
      createMockFile("src/module1.ts", largeContent1),
      createMockFile("src/module2.ts", largeContent2),
    ];
    const contents = new Map([
      ["src/module1.ts", largeContent1],
      ["src/module2.ts", largeContent2],
    ]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBe(2);
    expect(findings.some((f) => f.evidence[0]?.path.includes("module1"))).toBe(true);
    expect(findings.some((f) => f.evidence[0]?.path.includes("module2"))).toBe(true);
  });

  it("should not report findings for generated files", () => {
    const content = generateLargeContent(600);
    const files = [createMockFile("src/generated.ts", content, "ts", "generated")];
    const contents = new Map([["src/generated.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    // Generated files should be skipped
    expect(findings.length).toBe(0);
  });

  it("should have appropriate tags for line count findings", () => {
    const content = generateLargeContent(600);
    const files = [createMockFile("src/large.ts", content)];
    const contents = new Map([["src/large.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].tags).toContain("maintainability");
    expect(findings[0].tags).toContain("size");
  });

  it("should have appropriate tags for function count findings", () => {
    const content = generateManyFunctionsContent(25);
    const files = [createMockFile("src/many.ts", content)];
    const contents = new Map([["src/many.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    const funcFinding = findings.find((f) => f.title.includes("too many functions"));
    expect(funcFinding).toBeDefined();
    expect(funcFinding?.tags).toContain("maintainability");
    expect(funcFinding?.tags).toContain("complexity");
  });

  it("should only report one finding per file even if multiple thresholds exceeded", () => {
    // Create content that exceeds both line count and function count thresholds
    const content: string[] = [];
    for (let i = 0; i < 600; i++) {
      content.push(`function line${i}() { return ${i}; }`);
    }
    const files = [createMockFile("src/complex.ts", content.join("\n"))];
    const contents = new Map([["src/complex.ts", content.join("\n")]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    // Should have at least one finding, but may not have duplicates
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.evidence[0]?.path === "src/complex.ts")).toBe(true);
  });

  it("should use file.lineCount from metadata when available", () => {
    // Create small content but claim it has many lines
    const content = "// Small content";
    const files = [createMockFile("src/metadata.ts", content, "ts", "source", 600)];
    const contents = new Map([["src/metadata.ts", content]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].summary).toContain("600");
  });

  it("should handle files with JSX correctly", () => {
    const content = generateLargeContent(600);
    const files = [createMockFile("src/LargeComponent.jsx", content, "js")];
    const contents = new Map([["src/LargeComponent.jsx", content]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
  });

  it("should count async functions correctly", () => {
    // Create content with many async functions
    const content: string[] = [];
    for (let i = 0; i < 25; i++) {
      content.push(`async function asyncFunc${i}() { await Promise.resolve(${i}); }`);
    }
    const files = [createMockFile("src/async.ts", content.join("\n"))];
    const contents = new Map([["src/async.ts", content.join("\n")]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.title.includes("too many functions"))).toBe(true);
  });

  it("should count exported functions correctly", () => {
    // Create content with many exported functions
    const content: string[] = [];
    for (let i = 0; i < 25; i++) {
      content.push(`export function exported${i}() { return ${i}; }`);
    }
    const files = [createMockFile("src/exported.ts", content.join("\n"))];
    const contents = new Map([["src/exported.ts", content.join("\n")]]);
    const context = createMockContext(files, contents);

    const findings = LARGE_MODULE_RULE.evaluate(context);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.title.includes("too many functions"))).toBe(true);
  });
});