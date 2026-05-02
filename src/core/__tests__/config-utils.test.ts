/**
 * Tests for config-utils.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  parseEmitOption,
  parseSimpleYaml,
  loadPolicy,
  getOption,
  hasFlag,
  validateRequiredArgs,
  generateRunId,
  parseJsonFile,
  isValidSeverity,
  isValidCategory,
} from "../config-utils.js";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

describe("config-utils", () => {
  let tempTestDir: string;

  beforeAll(() => {
    tempTestDir = path.join(tmpdir(), `ctg-config-utils-test-${Date.now()}`);
    mkdirSync(tempTestDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempTestDir)) {
      rmSync(tempTestDir, { recursive: true, force: true });
    }
  });

  describe("parseEmitOption", () => {
    it("returns all formats when value is undefined", () => {
      const result = parseEmitOption(undefined);
      expect(result).toEqual(["json", "yaml", "md", "mermaid"]);
    });

    it("returns all formats when value is 'all'", () => {
      const result = parseEmitOption("all");
      expect(result).toEqual(["json", "yaml", "md", "mermaid"]);
    });

    it("returns specific format when single value provided", () => {
      expect(parseEmitOption("json")).toEqual(["json"]);
      expect(parseEmitOption("yaml")).toEqual(["yaml"]);
      expect(parseEmitOption("md")).toEqual(["md"]);
      expect(parseEmitOption("mermaid")).toEqual(["mermaid"]);
    });

    it("returns multiple formats for comma-separated values", () => {
      expect(parseEmitOption("json,yaml")).toEqual(["json", "yaml"]);
      expect(parseEmitOption("json,yaml,md")).toEqual(["json", "yaml", "md"]);
    });

    it("handles whitespace in comma-separated values", () => {
      expect(parseEmitOption("json, yaml, md")).toEqual(["json", "yaml", "md"]);
      expect(parseEmitOption(" json , yaml ")).toEqual(["json", "yaml"]);
    });

    it("filters out invalid format values", () => {
      expect(parseEmitOption("json,invalid,yaml")).toEqual(["json", "yaml"]);
      expect(parseEmitOption("invalid")).toEqual([]);
    });

    it("handles empty string", () => {
      expect(parseEmitOption("")).toEqual(["json", "yaml", "md", "mermaid"]);
    });
  });

  describe("parseSimpleYaml", () => {
    it("parses name field", () => {
      const yaml = "name: my-policy";
      const result = parseSimpleYaml(yaml);
      expect(result.name).toBe("my-policy");
    });

    it("parses version field", () => {
      const yaml = "version: ctg/v1alpha1";
      const result = parseSimpleYaml(yaml);
      expect(result.version).toBe("ctg/v1alpha1");
    });

    it("parses description field", () => {
      const yaml = "description: This is a test policy";
      const result = parseSimpleYaml(yaml);
      expect(result.description).toBe("This is a test policy");
    });

    it("parses multiple fields", () => {
      const yaml = `
name: my-policy
version: ctg/v1alpha1
description: Test policy
`;
      const result = parseSimpleYaml(yaml);
      expect(result.name).toBe("my-policy");
      expect(result.version).toBe("ctg/v1alpha1");
      expect(result.description).toBe("Test policy");
    });

    it("ignores comments", () => {
      const yaml = `
# This is a comment
name: my-policy
# Another comment
`;
      const result = parseSimpleYaml(yaml);
      expect(result.name).toBe("my-policy");
    });

    it("ignores empty lines", () => {
      const yaml = `
name: my-policy

version: ctg/v1alpha1
`;
      const result = parseSimpleYaml(yaml);
      expect(result.name).toBe("my-policy");
      expect(result.version).toBe("ctg/v1alpha1");
    });

    it("returns empty object for empty content", () => {
      const result = parseSimpleYaml("");
      expect(result).toEqual({});
    });

    it("returns empty object for only comments", () => {
      const yaml = `
# Comment 1
# Comment 2
`;
      const result = parseSimpleYaml(yaml);
      expect(result).toEqual({});
    });

    it("handles whitespace around values", () => {
      const yaml = "name:   my-policy   ";
      const result = parseSimpleYaml(yaml);
      expect(result.name).toBe("my-policy");
    });

    it("handles values with special characters", () => {
      const yaml = "name: my-policy-v1.0";
      const result = parseSimpleYaml(yaml);
      expect(result.name).toBe("my-policy-v1.0");
    });
  });

  describe("loadPolicy", () => {
    it("returns undefined when path is undefined", () => {
      const result = loadPolicy(undefined, tempTestDir);
      expect(result).toBeUndefined();
    });

    it("throws error for non-existent file", () => {
      expect(() => loadPolicy("nonexistent.yaml", tempTestDir)).toThrow(
        "Policy file not found"
      );
    });

    it("loads and parses valid policy file", () => {
      const policyPath = path.join(tempTestDir, "test-policy.yaml");
      writeFileSync(policyPath, `
name: test-policy
version: ctg/v1
description: Test policy
`, "utf8");

      const result = loadPolicy("test-policy.yaml", tempTestDir);
      expect(result?.name).toBe("test-policy");
      expect(result?.version).toBe("ctg/v1");
      expect(result?.description).toBe("Test policy");
    });

    it("uses default version if not specified", () => {
      const policyPath = path.join(tempTestDir, "no-version.yaml");
      writeFileSync(policyPath, "name: policy", "utf8");

      const result = loadPolicy("no-version.yaml", tempTestDir);
      expect(result?.version).toBe("ctg/v1");
    });

    it("uses default name if not specified", () => {
      const policyPath = path.join(tempTestDir, "no-name.yaml");
      writeFileSync(policyPath, "version: v1", "utf8");

      const result = loadPolicy("no-name.yaml", tempTestDir);
      expect(result?.name).toBe("unknown");
    });

    it("handles absolute paths", () => {
      const policyPath = path.join(tempTestDir, "absolute-policy.yaml");
      writeFileSync(policyPath, "name: absolute-test", "utf8");

      const result = loadPolicy(policyPath, tempTestDir);
      expect(result?.name).toBe("absolute-test");
    });
  });

  describe("getOption", () => {
    it("returns value for existing option", () => {
      const args = ["--out", "/output/dir"];
      expect(getOption(args, "--out")).toBe("/output/dir");
    });

    it("returns undefined for non-existent option", () => {
      const args = ["--out", "/output/dir"];
      expect(getOption(args, "--emit")).toBeUndefined();
    });

    it("returns undefined if option has no value", () => {
      const args = ["--out"];
      expect(getOption(args, "--out")).toBeUndefined();
    });

    it("handles empty args array", () => {
      const args: string[] = [];
      expect(getOption(args, "--out")).toBeUndefined();
    });

    it("returns correct value for multiple options", () => {
      const args = ["--out", "/output", "--emit", "json", "--policy", "policy.yaml"];
      expect(getOption(args, "--out")).toBe("/output");
      expect(getOption(args, "--emit")).toBe("json");
      expect(getOption(args, "--policy")).toBe("policy.yaml");
    });

    it("returns first occurrence of option", () => {
      const args = ["--out", "/first", "--out", "/second"];
      expect(getOption(args, "--out")).toBe("/first");
    });
  });

  describe("hasFlag", () => {
    it("returns true when flag is present", () => {
      expect(hasFlag(["--verbose"], "--verbose")).toBe(true);
      expect(hasFlag(["--help"], "--help")).toBe(true);
    });

    it("returns false when flag is not present", () => {
      expect(hasFlag(["--verbose"], "--quiet")).toBe(false);
      expect(hasFlag([], "--verbose")).toBe(false);
    });

    it("handles multiple flags", () => {
      const args = ["--verbose", "--dry-run", "--force"];
      expect(hasFlag(args, "--verbose")).toBe(true);
      expect(hasFlag(args, "--dry-run")).toBe(true);
      expect(hasFlag(args, "--force")).toBe(true);
      expect(hasFlag(args, "--quiet")).toBe(false);
    });
  });

  describe("validateRequiredArgs", () => {
    it("returns valid=true when all required args present", () => {
      const args = ["--out", "/output", "--emit", "json"];
      const result = validateRequiredArgs(args, ["--out", "--emit"]);
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("returns valid=false when args missing", () => {
      const args = ["--out", "/output"];
      const result = validateRequiredArgs(args, ["--out", "--emit"]);
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(["--emit"]);
    });

    it("returns valid=false when option missing value", () => {
      const args = ["--out"];
      const result = validateRequiredArgs(args, ["--out"]);
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(["--out"]);
    });

    it("handles empty args", () => {
      const result = validateRequiredArgs([], ["--out"]);
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(["--out"]);
    });

    it("handles empty required array", () => {
      const result = validateRequiredArgs(["--out", "/output"], []);
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });
  });

  describe("generateRunId", () => {
    it("generates run ID from timestamp", () => {
      const timestamp = "2026-04-30T12:34:56Z";
      const result = generateRunId(timestamp);
      expect(result).toBe("ctg-202604301234");
    });

    it("handles timestamp with milliseconds", () => {
      const timestamp = "2026-04-30T12:34:56.789Z";
      const result = generateRunId(timestamp);
      expect(result).toBe("ctg-202604301234");
    });

    it("handles timestamp without timezone", () => {
      const timestamp = "2026-04-30T12:34:56";
      const result = generateRunId(timestamp);
      expect(result).toBe("ctg-202604301234");
    });

    it("always returns 16-character string", () => {
      expect(generateRunId("2026-04-30T12:34:56Z").length).toBe(16);
      expect(generateRunId("2025-01-01T00:00:00Z").length).toBe(16);
    });

    it("starts with ctg-", () => {
      const result = generateRunId("2026-04-30T12:34:56Z");
      expect(result.startsWith("ctg-")).toBe(true);
    });
  });

  describe("parseJsonFile", () => {
    it("parses valid JSON file", () => {
      const filePath = path.join(tempTestDir, "valid.json");
      writeFileSync(filePath, '{"name": "test", "value": 123}', "utf8");

      const result = parseJsonFile(filePath);
      expect(result).toEqual({ name: "test", value: 123 });
    });

    it("returns undefined for invalid JSON", () => {
      const filePath = path.join(tempTestDir, "invalid.json");
      writeFileSync(filePath, "{ not valid json }", "utf8");

      const result = parseJsonFile(filePath);
      expect(result).toBeUndefined();
    });

    it("returns undefined for non-existent file", () => {
      const result = parseJsonFile("/nonexistent/file.json");
      expect(result).toBeUndefined();
    });

    it("parses empty JSON object", () => {
      const filePath = path.join(tempTestDir, "empty.json");
      writeFileSync(filePath, "{}", "utf8");

      const result = parseJsonFile(filePath);
      expect(result).toEqual({});
    });

    it("parses JSON array", () => {
      const filePath = path.join(tempTestDir, "array.json");
      writeFileSync(filePath, '[1, 2, 3]', "utf8");

      const result = parseJsonFile(filePath);
      expect(result).toEqual([1, 2, 3]);
    });

    it("parses JSON with nested objects", () => {
      const filePath = path.join(tempTestDir, "nested.json");
      writeFileSync(filePath, '{"outer": {"inner": {"value": "test"}}}', "utf8");

      const result = parseJsonFile(filePath);
      expect(result).toEqual({ outer: { inner: { value: "test" } } });
    });
  });

  describe("isValidSeverity", () => {
    it("returns true for valid severity values", () => {
      expect(isValidSeverity("low")).toBe(true);
      expect(isValidSeverity("medium")).toBe(true);
      expect(isValidSeverity("high")).toBe(true);
      expect(isValidSeverity("critical")).toBe(true);
    });

    it("returns false for invalid severity values", () => {
      expect(isValidSeverity("info")).toBe(false);
      expect(isValidSeverity("warning")).toBe(false);
      expect(isValidSeverity("error")).toBe(false);
      expect(isValidSeverity("")).toBe(false);
    });

    it("is case-sensitive", () => {
      expect(isValidSeverity("HIGH")).toBe(false);
      expect(isValidSeverity("Critical")).toBe(false);
    });
  });

  describe("isValidCategory", () => {
    it("returns true for valid category values", () => {
      expect(isValidCategory("auth")).toBe(true);
      expect(isValidCategory("payment")).toBe(true);
      expect(isValidCategory("validation")).toBe(true);
      expect(isValidCategory("data")).toBe(true);
      expect(isValidCategory("config")).toBe(true);
      expect(isValidCategory("maintainability")).toBe(true);
      expect(isValidCategory("testing")).toBe(true);
      expect(isValidCategory("compatibility")).toBe(true);
      expect(isValidCategory("release-risk")).toBe(true);
    });

    it("returns false for invalid category values", () => {
      expect(isValidCategory("security")).toBe(false);
      expect(isValidCategory("performance")).toBe(false);
      expect(isValidCategory("")).toBe(false);
      expect(isValidCategory("unknown")).toBe(false);
    });

    it("is case-sensitive", () => {
      expect(isValidCategory("AUTH")).toBe(false);
      expect(isValidCategory("Payment")).toBe(false);
    });
  });
});