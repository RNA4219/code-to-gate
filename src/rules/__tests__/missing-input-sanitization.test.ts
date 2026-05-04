/**
 * Tests for MISSING_INPUT_SANITIZATION Rule
 */

import { describe, it, expect } from "vitest";
import { MISSING_INPUT_SANITIZATION_RULE } from "../missing-input-sanitization.js";
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

describe("MISSING_INPUT_SANITIZATION_RULE", () => {
  it("should have correct metadata", () => {
    expect(MISSING_INPUT_SANITIZATION_RULE.id).toBe("MISSING_INPUT_SANITIZATION");
    expect(MISSING_INPUT_SANITIZATION_RULE.name).toBe("Missing Input Sanitization");
    expect(MISSING_INPUT_SANITIZATION_RULE.category).toBe("security");
    expect(MISSING_INPUT_SANITIZATION_RULE.defaultSeverity).toBe("critical");
  });

  describe("SQL injection detection", () => {
    it("should detect SQL template literal injection", () => {
      const context = createMockContext([
        {
          path: "src/db/user-query.ts",
          content: `
app.get("/user/:id", (req, res) => {
  const query = \`SELECT * FROM users WHERE id = \${req.params.id}\`;
  db.query(query);
});
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].title).toContain("SQL");
      expect(findings[0].severity).toBe("critical");
    });

    it("should detect db.query with user input", () => {
      const context = createMockContext([
        {
          path: "src/db/search.ts",
          content: `
app.post("/search", (req, res) => {
  db.query(\`SELECT * FROM products WHERE name LIKE \${req.body.searchTerm}\`);
});
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe("XSS detection", () => {
    it("should detect innerHTML assignment with user input", () => {
      const context = createMockContext([
        {
          path: "src/frontend/comment.ts",
          content: `
app.post("/comment", (req, res) => {
  element.innerHTML = req.body.comment;
});
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].title).toContain("XSS");
      expect(findings[0].severity).toBe("critical");
    });

    it("should detect document.write with user input", () => {
      const context = createMockContext([
        {
          path: "src/frontend/legacy.ts",
          content: `
function renderContent(req) {
  document.write(req.query.content);
}
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe("Command injection detection", () => {
    it("should detect exec with user input in template literal", () => {
      const context = createMockContext([
        {
          path: "src/cli/file-reader.ts",
          content: `
app.get("/read", (req, res) => {
  exec(\`cat \${req.query.filename}\`);
});
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].title).toContain("COMMAND");
      expect(findings[0].severity).toBe("critical");
    });

    it("should detect spawn with user input", () => {
      const context = createMockContext([
        {
          path: "src/cli/process.ts",
          content: `
app.get("/run", (req, res) => {
  spawn(\`ls \${req.params.directory}\`);
});
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe("Path traversal detection", () => {
    it("should detect fs.readFile with user input", () => {
      const context = createMockContext([
        {
          path: "src/files/download.ts",
          content: `
app.get("/download/:filename", (req, res) => {
  fs.readFile("/data/" + req.params.filename, (err, data) => {
    res.send(data);
  });
});
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].title).toContain("PATH");
      expect(findings[0].severity).toBe("high");
    });

    it("should detect path.join without sanitization", () => {
      const context = createMockContext([
        {
          path: "src/files/reader.ts",
          content: `
function readFile(req) {
  const filePath = path.join("/data", req.query.file);
  return fs.readFileSync(filePath);
}
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe("NoSQL injection detection", () => {
    it("should detect MongoDB query with user input", () => {
      const context = createMockContext([
        {
          path: "src/db/mongo-query.ts",
          content: `
app.post("/find", (req, res) => {
  db.collection.find({ name: req.body.name });
});
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].title).toContain("NOSQL");
      expect(findings[0].severity).toBe("critical");
    });
  });

  describe("Safe patterns", () => {
    it("should NOT detect sanitized SQL queries", () => {
      const context = createMockContext([
        {
          path: "src/db/safe-query.ts",
          content: `
app.get("/user/:id", (req, res) => {
  const safeId = sanitize(req.params.id);
  const query = "SELECT * FROM users WHERE id = ?";
  db.query(query, [safeId]);
});
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should NOT detect DOMPurify-sanitized innerHTML", () => {
      const context = createMockContext([
        {
          path: "src/frontend/safe-render.ts",
          content: `
app.post("/comment", (req, res) => {
  element.innerHTML = DOMPurify.sanitize(req.body.comment);
});
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should NOT detect escaped command arguments", () => {
      const context = createMockContext([
        {
          path: "src/cli/safe-exec.ts",
          content: `
app.get("/read", (req, res) => {
  const safeFile = escape(req.query.filename);
  exec(\`cat "\${safeFile}"\`);
});
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should NOT detect validated file paths", () => {
      const context = createMockContext([
        {
          path: "src/files/safe-download.ts",
          content: `
app.get("/download/:filename", (req, res) => {
  const safeFilename = validate(req.params.filename);
  fs.readFile(path.join("/data", safeFilename), (err, data) => {
    res.send(data);
  });
});
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should NOT detect textContent assignment (safe)", () => {
      const context = createMockContext([
        {
          path: "src/frontend/safe-text.ts",
          content: `
app.post("/display", (req, res) => {
  element.textContent = req.body.text;
});
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should NOT detect parameterized queries", () => {
      const context = createMockContext([
        {
          path: "src/db/parameterized.ts",
          content: `
app.get("/search", (req, res) => {
  const query = "SELECT * FROM users WHERE name = ?";
  db.query(query, [req.body.name]);
});
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });
  });

  describe("SMELL markers", () => {
    it("should detect SMELL: MISSING_INPUT_SANITIZATION marker", () => {
      const context = createMockContext([
        {
          path: "src/vulnerable/api.ts",
          content: `
// SMELL: MISSING_INPUT_SANITIZATION
app.get("/user/:id", (req, res) => {
  const query = \`SELECT * FROM users WHERE id = \${req.params.id}\`;
  db.query(query);
});
// END SMELL
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      // When pattern matches inside SMELL marker, the pattern's title is used
      // or the SMELL marker creates its own finding
      expect(findings[0].title).toMatch(/Missing input sanitization|SQL injection/i);
    });
  });

  describe("Edge cases", () => {
    it("should skip non-source files", () => {
      const context = createMockContext([
        {
          path: "tests/db.test.ts",
          content: `
it('should query database', () => {
  const query = \`SELECT * FROM users WHERE id = \${req.params.id}\`;
  db.query(query);
});
`,
        },
      ]);

      // Mark as test file
      context.graph.files[0].role = "test";

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should return empty array for files with no vulnerabilities", () => {
      const context = createMockContext([
        {
          path: "src/safe/utils.ts",
          content: `
export function safeFunction(x: number): number {
  return x * 2;
}
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should skip commented code", () => {
      const context = createMockContext([
        {
          path: "src/docs/examples.ts",
          content: `
// Example of dangerous code (not actual implementation):
// const query = \`SELECT * FROM users WHERE id = \${req.params.id}\`;
// Use parameterized queries instead
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should skip eslint-disable suppressed code", () => {
      const context = createMockContext([
        {
          path: "src/legacy/compat.ts",
          content: `
/* eslint-disable security/detect-object-injection */
app.get("/legacy", (req, res) => {
  db.query(\`SELECT * FROM data WHERE key = \${req.query.key}\`);
});
`,
        },
      ]);

      const findings = MISSING_INPUT_SANITIZATION_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });
  });
});