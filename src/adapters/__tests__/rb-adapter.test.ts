import { describe, expect, it } from "vitest";
import path from "node:path";
import { parseRubyFile } from "../rb-adapter.js";

const fixturesDir = path.resolve(import.meta.dirname, "../../../fixtures");
const demoRubyDir = path.join(fixturesDir, "demo-ruby");

describe("rb-adapter", () => {
  it("parses Ruby files and extracts symbols", () => {
    const filePath = path.join(demoRubyDir, "app.rb");
    const result = parseRubyFile(filePath, demoRubyDir, "file:app.rb");

    expect(result.parserStatus).toBe("parsed");
    expect(result.parserAdapter).toBe("rb-regex-v0");
    expect(result.symbols.some((symbol) => symbol.name === "OrderApp" && symbol.kind === "class")).toBe(true);
    expect(result.symbols.some((symbol) => symbol.name === "create_order" && symbol.kind === "method")).toBe(true);
  });

  it("extracts require and route relations", () => {
    const filePath = path.join(demoRubyDir, "app.rb");
    const result = parseRubyFile(filePath, demoRubyDir, "file:app.rb");

    expect(result.relations.some((relation) => relation.kind === "imports" && relation.to === "json")).toBe(true);
    expect(result.relations.some((relation) => relation.kind === "configures" && relation.to === "route:POST /orders")).toBe(true);
  });

  it("marks spec files as tests", () => {
    const filePath = path.join(demoRubyDir, "spec/order_service_spec.rb");
    const result = parseRubyFile(filePath, demoRubyDir, "file:spec/order_service_spec.rb");

    expect(result.symbols.some((symbol) => symbol.kind === "test")).toBe(true);
  });
});
