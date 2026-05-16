import { describe, expect, it } from "vitest";
import path from "node:path";
import { buildGraph } from "../../src/core/repo-graph-builder.js";

const fixtureRoot = path.resolve(import.meta.dirname, "../../fixtures/demo-multilang");

describe("demo-multilang static languages", () => {
  it("includes Go and multiple static typed languages in the repo graph", () => {
    const graph = buildGraph(fixtureRoot, "test");
    const languages = new Set(graph.files.map((file) => file.language));

    expect(languages.has("go")).toBe(true);
    expect(languages.has("rs")).toBe(true);
    expect(languages.has("java")).toBe(true);
    expect(languages.has("cs")).toBe(true);
    expect(languages.has("cpp")).toBe(true);
  });
});
