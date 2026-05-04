/**
 * Tests for DEPRECATED_API_USAGE Rule
 */

import { describe, it, expect } from "vitest";
import { DEPRECATED_API_USAGE_RULE } from "../deprecated-api.js";
import type { RuleContext, SimpleGraph, RepoFile } from "../index.js";

function createMockFile(
  path: string,
  content: string,
  language: "ts" | "js" | "py" = "ts"
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

function createMockContext(files: Array<{ path: string; content: string; language?: "ts" | "js" | "py" }>): RuleContext {
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

describe("DEPRECATED_API_USAGE_RULE", () => {
  it("should have correct metadata", () => {
    expect(DEPRECATED_API_USAGE_RULE.id).toBe("DEPRECATED_API_USAGE");
    expect(DEPRECATED_API_USAGE_RULE.name).toBe("Deprecated API Usage");
    expect(DEPRECATED_API_USAGE_RULE.category).toBe("maintainability");
    expect(DEPRECATED_API_USAGE_RULE.defaultSeverity).toBe("medium");
  });

  describe("Node.js deprecated APIs", () => {
    it("should detect util.isArray", () => {
      const context = createMockContext([
        {
          path: "src/utils/type-check.ts",
          content: `
import util from 'util';

function checkType(val) {
  if (util.isArray(val)) {
    return 'array';
  }
}
`,
        },
      ]);

      const findings = DEPRECATED_API_USAGE_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].title).toContain("util.isArray");
      expect(findings[0].summary).toContain("Array.isArray()");
    });

    it("should detect new Buffer()", () => {
      const context = createMockContext([
        {
          path: "src/buffer-utils.ts",
          content: `
function createBuffer(str) {
  return new Buffer(str);
}
`,
        },
      ]);

      const findings = DEPRECATED_API_USAGE_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].title).toContain("new Buffer()");
    });

    it("should detect fs.exists", () => {
      const context = createMockContext([
        {
          path: "src/file-utils.ts",
          content: `
import fs from 'fs';

fs.exists('/path/to/file', (exists) => {
  if (exists) {
    console.log('File exists');
  }
});
`,
        },
      ]);

      const findings = DEPRECATED_API_USAGE_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].title).toContain("fs.exists");
    });

    it("should detect util.isNullOrUndefined", () => {
      const context = createMockContext([
        {
          path: "src/utils/null-check.ts",
          content: `
const util = require('util');

function isNullOrUndefined(val) {
  return util.isNullOrUndefined(val);
}
`,
        },
      ]);

      const findings = DEPRECATED_API_USAGE_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe("Browser deprecated APIs", () => {
    it("should detect document.write", () => {
      const context = createMockContext([
        {
          path: "src/legacy-script.ts",
          content: `
function writeContent(html) {
  document.write(html);
}
`,
        },
      ]);

      const findings = DEPRECATED_API_USAGE_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].title).toContain("document.write");
    });

    it("should detect XMLHttpRequest", () => {
      const context = createMockContext([
        {
          path: "src/api/legacy-http.ts",
          content: `
function fetchLegacy(url) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url);
  xhr.send();
  return xhr.responseText;
}
`,
        },
      ]);

      const findings = DEPRECATED_API_USAGE_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].title).toContain("XMLHttpRequest");
    });
  });

  describe("Express deprecated APIs", () => {
    it("should detect app.del", () => {
      const context = createMockContext([
        {
          path: "src/routes/users.ts",
          content: `
import express from 'express';
const app = express();

app.del('/users/:id', deleteUser);
`,
        },
      ]);

      const findings = DEPRECATED_API_USAGE_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].title).toContain("app.del");
    });

    it("should detect res.sendfile", () => {
      const context = createMockContext([
        {
          path: "src/routes/files.ts",
          content: `
app.get('/download', (req, res) => {
  res.sendfile('/path/to/file.pdf');
});
`,
        },
      ]);

      const findings = DEPRECATED_API_USAGE_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].title).toContain("res.sendfile");
    });
  });

  describe("Python deprecated APIs", () => {
    it("should detect raw_input", () => {
      const context = createMockContext([
        {
          path: "src/input.py",
          content: `
def get_user_input():
    name = raw_input("Enter your name: ")
    return name
`,
          language: "py",
        },
      ]);

      const findings = DEPRECATED_API_USAGE_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].title).toContain("raw_input");
    });

    it("should detect xrange", () => {
      const context = createMockContext([
        {
          path: "src/loops.py",
          content: `
for i in xrange(10):
    print(i)
`,
          language: "py",
        },
      ]);

      const findings = DEPRECATED_API_USAGE_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].title).toContain("xrange");
    });
  });

  describe("Safe patterns", () => {
    it("should NOT detect modern Buffer.from", () => {
      const context = createMockContext([
        {
          path: "src/modern-buffer.ts",
          content: `
function createBuffer(str) {
  return Buffer.from(str, 'utf8');
}
`,
        },
      ]);

      const findings = DEPRECATED_API_USAGE_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should NOT detect Array.isArray", () => {
      const context = createMockContext([
        {
          path: "src/modern-check.ts",
          content: `
function checkType(val) {
  if (Array.isArray(val)) {
    return 'array';
  }
}
`,
        },
      ]);

      const findings = DEPRECATED_API_USAGE_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should NOT detect fetch API", () => {
      const context = createMockContext([
        {
          path: "src/api/modern-fetch.ts",
          content: `
async function fetchData(url) {
  const response = await fetch(url);
  return response.json();
}
`,
        },
      ]);

      const findings = DEPRECATED_API_USAGE_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should NOT detect commented deprecated APIs", () => {
      const context = createMockContext([
        {
          path: "src/docs/examples.ts",
          content: `
// Example of deprecated API:
// const buf = new Buffer('hello');
// Use Buffer.from() instead
`,
        },
      ]);

      const findings = DEPRECATED_API_USAGE_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should NOT detect APIs with eslint-disable comments", () => {
      const context = createMockContext([
        {
          path: "src/legacy-compat.ts",
          content: `
/* eslint-disable deprecation/deprecation */
function legacyCheck(val) {
  return util.isArray(val);
}
`,
        },
      ]);

      const findings = DEPRECATED_API_USAGE_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });
  });

  describe("SMELL markers", () => {
    it("should detect SMELL: DEPRECATED_API_USAGE marker", () => {
      const context = createMockContext([
        {
          path: "src/legacy/api.ts",
          content: `
// SMELL: DEPRECATED_API_USAGE
const buf = new Buffer('data');
const xhr = new XMLHttpRequest();
// END SMELL
`,
        },
      ]);

      const findings = DEPRECATED_API_USAGE_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].title).toContain("Deprecated API");
    });
  });

  describe("Edge cases", () => {
    it("should skip non-source files", () => {
      const context = createMockContext([
        {
          path: "tests/type-check.test.ts",
          content: `
it('should check types', () => {
  expect(util.isArray([1, 2, 3])).toBe(true);
});
`,
        },
      ]);

      // Mark as test file
      context.graph.files[0].role = "test";

      const findings = DEPRECATED_API_USAGE_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should return empty array for files with no deprecated APIs", () => {
      const context = createMockContext([
        {
          path: "src/utils/helpers.ts",
          content: `
export function formatDate(date: Date): string {
  return date.toISOString();
}
`,
        },
      ]);

      const findings = DEPRECATED_API_USAGE_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });
  });
});