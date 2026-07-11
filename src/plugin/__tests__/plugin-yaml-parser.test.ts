import { describe, expect, it } from "vitest";
import { parseYamlArray, parseYamlContent } from "../plugin-yaml-parser.js";

describe("plugin YAML parser", () => {
  it("parses root scalar, quoted, boolean, number, and inline array values", () => {
    expect(parseYamlContent(`
# comment
name: plugin-name
double: "quoted"
single: 'value'
enabled: true
disabled: false
timeout: 12
values: ["one", 'two', true, false, 3, raw]
empty: []
`)).toEqual({
      name: "plugin-name",
      double: "quoted",
      single: "value",
      enabled: true,
      disabled: false,
      timeout: 12,
      values: ["one", "two", true, false, 3, "raw"],
      empty: [],
    });
  });

  it("parses nested scalar and inline array values", () => {
    expect(parseYamlContent(`
entry:
  command: ["node", "plugin with spaces.js"]
  quoted: "value"
  single: 'single'
  enabled: true
  retry: 2
  raw: text
`)).toEqual({
      entry: {
        command: ["node", "plugin with spaces.js"],
        quoted: "value",
        single: "single",
        enabled: true,
        retry: 2,
        raw: "text",
      },
    });
  });

  it("parses block arrays containing every supported scalar type", () => {
    expect(parseYamlContent(`
capabilities:
  - "evaluate"
  - 'parse'
  - true
  - false
  - 42
  - export
`)).toEqual({
      capabilities: ["evaluate", "parse", true, false, 42, "export"],
    });
  });

  it("handles empty and direct inline arrays", () => {
    expect(parseYamlArray("[]")).toEqual([]);
    expect(parseYamlArray("[one, 'two', false, 1]")).toEqual([
      "one",
      "two",
      false,
      1,
    ]);
  });
});
