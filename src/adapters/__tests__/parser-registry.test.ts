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
});
