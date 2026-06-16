import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createParserRegistry } from "../parser-registry.js";
import type { RepoFile } from "../../types/graph.js";

describe("parser registry", () => {
  it("uses synchronous standard parsers when Tree-sitter is not requested", async () => {
    const registry = await createParserRegistry(false);
    const filePath = path.resolve("fixtures/demo-python/src/api/order.py");
    const parser = registry.getParser({ language: "py" } as RepoFile);

    expect(registry.isTreeSitterReady()).toBe(false);
    expect(parser).not.toBeNull();

    const result = parser!.parse(readFileSync(filePath, "utf8"), filePath, path.dirname(filePath), "file:app.py");
    expect(result).not.toBeInstanceOf(Promise);
    expect(result.parserStatus).toBe("parsed");
  });

  it("registers regex fallbacks with their language argument", async () => {
    const registry = await createParserRegistry(false);
    const filePath = path.resolve("fixtures/demo-multilang/go/main.go");
    const parser = registry.getParser({ language: "go" } as RepoFile);

    expect(parser).not.toBeNull();
    const result = parser!.parse(readFileSync(filePath, "utf8"), filePath, path.dirname(filePath), "file:main.go");
    expect(result).not.toBeInstanceOf(Promise);
    expect(result.parserAdapter).toContain("go");
  });

  it("registers tree-sitter parsers for Python, Ruby, Go, and Rust when requested", async () => {
    const registry = await createParserRegistry(true);
    const repoRoot = path.resolve("fixtures/demo-tree-sitter");
    const cases = [
      { language: "py" as const, file: "main.py", adapter: "py-tree-sitter-wasm" },
      { language: "rb" as const, file: "main.rb", adapter: "rb-tree-sitter-wasm" },
      { language: "go" as const, file: "main.go", adapter: "go-tree-sitter-wasm" },
      { language: "rs" as const, file: "main.rs", adapter: "rs-tree-sitter-wasm" },
    ];

    expect(registry.isTreeSitterReady()).toBe(true);

    for (const testCase of cases) {
      const filePath = path.join(repoRoot, testCase.file);
      const parser = registry.getParser({ language: testCase.language } as RepoFile);

      expect(parser).not.toBeNull();
      const result = parser!.parse(readFileSync(filePath, "utf8"), filePath, repoRoot, `file:${testCase.file}`);
      expect(result).not.toBeInstanceOf(Promise);
      expect(result.parserAdapter).toBe(testCase.adapter);
    }
  });
});
