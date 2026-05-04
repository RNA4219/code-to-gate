/**
 * Tests for CIRCULAR_DEPENDENCY Rule
 */

import { describe, it, expect } from "vitest";
import { CIRCULAR_DEPENDENCY_RULE } from "../circular-dependency.js";
import type { RuleContext, SimpleGraph, RepoFile } from "../index.js";

function createMockFile(
  path: string,
  content: string,
  language: "ts" | "js" = "ts"
): RepoFile {
  return {
    id: `file:${path}`,
    path,
    language,
    role: "source",
    hash: "test-hash",
    sizeBytes: content.length,
    lineCount: content.split("\n").length,
    moduleId: `module:${path}`,
    parser: { status: "parsed", adapter: "test" },
  };
}

function createMockContext(files: Array<{ path: string; content: string; language?: "ts" | "js" }>): RuleContext {
  const repoFiles: RepoFile[] = files.map((f) =>
    createMockFile(f.path, f.content, f.language ?? "ts")
  );

  const graph: SimpleGraph = {
    files: repoFiles,
    run_id: "test-run",
    generated_at: new Date().toISOString(),
    repo: { root: "/test" },
    stats: { partial: false },
  };

  const fileContents = new Map<string, string>();
  for (const f of files) {
    fileContents.set(f.path, f.content);
  }

  return {
    graph,
    getFileContent: (path: string) => fileContents.get(path) ?? null,
  };
}

describe("CIRCULAR_DEPENDENCY_RULE", () => {
  it("should have correct metadata", () => {
    expect(CIRCULAR_DEPENDENCY_RULE.id).toBe("CIRCULAR_DEPENDENCY");
    expect(CIRCULAR_DEPENDENCY_RULE.name).toBe("Circular Dependency");
    expect(CIRCULAR_DEPENDENCY_RULE.category).toBe("maintainability");
    expect(CIRCULAR_DEPENDENCY_RULE.defaultSeverity).toBe("high");
  });

  describe("Simple cycles", () => {
    it("should detect simple A→B→A cycle", () => {
      const context = createMockContext([
        {
          path: "src/a.ts",
          content: `import { b } from './b';`,
        },
        {
          path: "src/b.ts",
          content: `import { a } from './a';`,
        },
      ]);

      const findings = CIRCULAR_DEPENDENCY_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].severity).toBe("high");
      expect(findings[0].title).toContain("Circular dependency");
    });

    it("should detect 3-file cycle A→B→C→A", () => {
      const context = createMockContext([
        {
          path: "src/a.ts",
          content: `import { b } from './b';`,
        },
        {
          path: "src/b.ts",
          content: `import { c } from './c';`,
        },
        {
          path: "src/c.ts",
          content: `import { a } from './a';`,
        },
      ]);

      const findings = CIRCULAR_DEPENDENCY_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].severity).toBe("high");
      expect(findings[0].title).toContain("3 files");
    });

    it("should detect deep cycle with critical severity", () => {
      const context = createMockContext([
        {
          path: "src/a.ts",
          content: `import { b } from './b';`,
        },
        {
          path: "src/b.ts",
          content: `import { c } from './c';`,
        },
        {
          path: "src/c.ts",
          content: `import { d } from './d';`,
        },
        {
          path: "src/d.ts",
          content: `import { e } from './e';`,
        },
        {
          path: "src/e.ts",
          content: `import { a } from './a';`,
        },
      ]);

      const findings = CIRCULAR_DEPENDENCY_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].severity).toBe("critical");
      // 5 files in cycle: a→b→c→d→e→a, depth is 5
      expect(findings[0].title).toContain("5 files");
    });
  });

  describe("Complex import patterns", () => {
    it("should detect cycle with CommonJS require", () => {
      const context = createMockContext([
        {
          path: "src/a.ts",
          content: `const b = require('./b');`,
        },
        {
          path: "src/b.ts",
          content: `const a = require('./a');`,
        },
      ]);

      const findings = CIRCULAR_DEPENDENCY_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
    });

    it("should detect cycle with multiple imports", () => {
      const context = createMockContext([
        {
          path: "src/a.ts",
          content: `
import { b } from './b';
import { helper } from '../utils/helper';
`,
        },
        {
          path: "src/b.ts",
          content: `
import { a } from './a';
import { other } from './other';
`,
        },
      ]);

      const findings = CIRCULAR_DEPENDENCY_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
    });

    it("should detect cycle with export from", () => {
      const context = createMockContext([
        {
          path: "src/a.ts",
          content: `export * from './b';`,
        },
        {
          path: "src/b.ts",
          content: `export { something } from './a';`,
        },
      ]);

      const findings = CIRCULAR_DEPENDENCY_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
    });

    it("should detect cycle with type imports", () => {
      const context = createMockContext([
        {
          path: "src/a.ts",
          content: `import type { BType } from './b';`,
        },
        {
          path: "src/b.ts",
          content: `import type { AType } from './a';`,
        },
      ]);

      const findings = CIRCULAR_DEPENDENCY_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe("Safe patterns", () => {
    it("should NOT detect linear imports without cycle", () => {
      const context = createMockContext([
        {
          path: "src/a.ts",
          content: `import { b } from './b';`,
        },
        {
          path: "src/b.ts",
          content: `import { c } from './c';`,
        },
        {
          path: "src/c.ts",
          content: `export const c = 'value';`,
        },
      ]);

      const findings = CIRCULAR_DEPENDENCY_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should NOT detect external package imports as cycles", () => {
      const context = createMockContext([
        {
          path: "src/a.ts",
          content: `import fs from 'fs'; import path from 'path';`,
        },
        {
          path: "src/b.ts",
          content: `import lodash from 'lodash';`,
        },
      ]);

      const findings = CIRCULAR_DEPENDENCY_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should NOT detect files without imports", () => {
      const context = createMockContext([
        {
          path: "src/a.ts",
          content: `export const a = 'value';`,
        },
        {
          path: "src/b.ts",
          content: `export const b = 'value';`,
        },
      ]);

      const findings = CIRCULAR_DEPENDENCY_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });
  });

  describe("Edge cases", () => {
    it("should skip non-source files", () => {
      const context = createMockContext([
        {
          path: "tests/a.test.ts",
          content: `import { b } from '../src/b';`,
        },
        {
          path: "src/b.ts",
          content: `import { a } from './a';`,
        },
      ]);

      // Mark test file as test role
      context.graph.files[0].role = "test";

      const findings = CIRCULAR_DEPENDENCY_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should handle files with no content", () => {
      const context = createMockContext([
        {
          path: "src/a.ts",
          content: "",
        },
        {
          path: "src/b.ts",
          content: `import { a } from './a';`,
        },
      ]);

      const findings = CIRCULAR_DEPENDENCY_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should handle parent directory imports", () => {
      const context = createMockContext([
        {
          path: "src/sub/a.ts",
          content: `import { b } from '../b';`,
        },
        {
          path: "src/b.ts",
          content: `import { a } from './sub/a';`,
        },
      ]);

      const findings = CIRCULAR_DEPENDENCY_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
    });
  });
});