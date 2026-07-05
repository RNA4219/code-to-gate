/**
 * Tests for MISSING_RATE_LIMIT rule
 */

import { describe, expect, it } from "vitest";
import { MISSING_RATE_LIMIT_RULE } from "../missing-rate-limit.js";
import type { RepoFile, RuleContext, SimpleGraph } from "../index.js";

function createMockFile(path: string, content: string, language: "ts" | "js" | "py" | "go" = "ts"): RepoFile {
  return {
    id: `file:${path}`,
    path,
    language,
    role: "source",
    hash: "test-hash",
    sizeBytes: content.length,
    lineCount: content.split("\n").length,
    parser: { status: "parsed", adapter: "test" },
  };
}

function createMockContext(files: Array<{ path: string; content: string; language?: "ts" | "js" | "py" | "go" }>): RuleContext {
  const repoFiles = files.map((file) => createMockFile(file.path, file.content, file.language ?? "ts"));
  const graph: SimpleGraph = {
    files: repoFiles,
    run_id: "test-run",
    generated_at: new Date().toISOString(),
    repo: { root: "/test" },
    stats: { partial: false },
  };
  const contents = new Map(files.map((file) => [file.path, file.content]));
  return {
    graph,
    getFileContent: (path: string) => contents.get(path) ?? null,
  };
}

describe("MISSING_RATE_LIMIT_RULE", () => {
  it("flags sensitive auth routes without a rate limiter", () => {
    const context = createMockContext([
      {
        path: "src/routes/auth.ts",
        content: `
app.post("/auth/login", (req, res) => {
  res.json(login(req.body));
});
`,
      },
    ]);

    const findings = MISSING_RATE_LIMIT_RULE.evaluate(context);

    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("MISSING_RATE_LIMIT");
    expect(findings[0].severity).toBe("high");
  });

  it("does not flag health, docs, or static routes", () => {
    const context = createMockContext([
      {
        path: "src/routes/public.ts",
        content: `
app.get("/health", health);
app.get("/docs", docs);
app.get("/assets/logo.png", asset);
`,
      },
    ]);

    const findings = MISSING_RATE_LIMIT_RULE.evaluate(context);

    expect(findings).toEqual([]);
  });

  it("does not flag sensitive routes when file-level rate limiting is configured", () => {
    const context = createMockContext([
      {
        path: "src/routes/auth.ts",
        content: `
const loginLimiter = rateLimit({ windowMs: 60_000, max: 5 });
app.post("/auth/login", loginLimiter, (req, res) => {
  res.json(login(req.body));
});
`,
      },
    ]);

    const findings = MISSING_RATE_LIMIT_RULE.evaluate(context);

    expect(findings).toEqual([]);
  });

  it("does not flag non-sensitive product listing routes", () => {
    const context = createMockContext([
      {
        path: "src/routes/catalog.ts",
        content: `
app.get("/products", listProducts);
app.get("/products/:id", showProduct);
`,
      },
    ]);

    const findings = MISSING_RATE_LIMIT_RULE.evaluate(context);

    expect(findings).toEqual([]);
  });
});
