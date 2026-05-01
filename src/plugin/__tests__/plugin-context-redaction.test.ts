/**
 * P1-02: Redaction and trust verification tests for plugin context
 */

import { describe, it, expect } from "vitest";
import { PluginSchemaValidatorImpl, DefaultPluginLogger } from "../plugin-context.js";
import { PLUGIN_CONSTANTS } from "../contract.js";

describe("Plugin Schema Validator - P1-02 Tests", () => {
  const logger = new DefaultPluginLogger("test", "info");
  const validator = new PluginSchemaValidatorImpl(
    [...PLUGIN_CONSTANTS.SECRET_PATTERNS],
    logger
  );

  describe("secret pattern redaction", () => {
    it("should detect api_key pattern in output via detectSecretLeak", async () => {
      const output = {
        version: "ctg.plugin-output/v1",
        findings: [
          {
            id: "test-1",
            ruleId: "TEST",
            summary: "Found api_key in config",
          },
        ],
      };

      const leakResult = await validator.detectSecretLeak(output);
      expect(leakResult.detected).toBe(true);
      expect(leakResult.patterns).toContain("api_key");
    });

    it("should detect password pattern in value via detectSecretLeak", async () => {
      const output = {
        version: "ctg.plugin-output/v1",
        config: {
          field: "my_password_value",
        },
      };

      const leakResult = await validator.detectSecretLeak(output);
      expect(leakResult.detected).toBe(true);
      expect(leakResult.patterns).toContain("password");
    });

    it("should detect token pattern in nested objects", async () => {
      const output = {
        version: "ctg.plugin-output/v1",
        auth: {
          credentials: {
            value: "my_token_here",
          },
        },
      };

      const leakResult = await validator.detectSecretLeak(output);
      expect(leakResult.detected).toBe(true);
      expect(leakResult.patterns).toContain("token");
    });

    it("should detect multiple secret patterns", async () => {
      const output = {
        version: "ctg.plugin-output/v1",
        secrets: {
          field1: "contains_api_key",
          field2: "has_password_in_it",
          field3: "private_key_data",
        },
      };

      const leakResult = await validator.detectSecretLeak(output);
      expect(leakResult.detected).toBe(true);
      expect(leakResult.patterns?.length).toBeGreaterThanOrEqual(3);
    });

    it("should detect secret patterns in arrays", async () => {
      const output = {
        version: "ctg.plugin-output/v1",
        items: [
          { name: "config", value: "secret_value" },
          { name: "auth_token", value: "token123" },
        ],
      };

      const leakResult = await validator.detectSecretLeak(output);
      expect(leakResult.detected).toBe(true);
    });
  });

  describe("SECRET_PATTERNS constant verification", () => {
    it("should have required secret patterns defined", () => {
      const expectedPatterns = [
        "api_key",
        "apikey",
        "token",
        "password",
        "secret",
        "credential",
        "private_key",
        "access_key",
        "auth_token",
      ];

      for (const pattern of expectedPatterns) {
        expect(PLUGIN_CONSTANTS.SECRET_PATTERNS).toContain(pattern);
      }
    });

    it("should have at least 8 secret patterns", () => {
      expect(PLUGIN_CONSTANTS.SECRET_PATTERNS.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe("manifest validation - trust boundary", () => {
    it("should reject invalid manifest structure", async () => {
      const invalidManifest = {
        name: "test-plugin",
      };

      const result = await validator.validateManifest(invalidManifest);
      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it("should accept valid manifest structure", async () => {
      const validManifest = {
        apiVersion: "ctg/v1alpha1",
        kind: "rule-plugin",
        name: "test-plugin",
        version: "1.0.0",
        visibility: "public",
        entry: "index.js",
        capabilities: ["evaluate"],
      };

      const result = await validator.validateManifest(validManifest);
      expect(result.valid).toBe(true);
    });

    it("should validate apiVersion strictly", async () => {
      const manifest = {
        apiVersion: "invalid/version",
        kind: "rule-plugin",
        name: "test-plugin",
        version: "1.0.0",
        visibility: "public",
        entry: "index.js",
        capabilities: [],
      };

      const result = await validator.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.path === "apiVersion")).toBe(true);
    });

    it("should reject invalid kind", async () => {
      const manifest = {
        apiVersion: "ctg/v1alpha1",
        kind: "Plugin",
        name: "test-plugin",
        version: "1.0.0",
        visibility: "public",
        entry: "index.js",
        capabilities: [],
      };

      const result = await validator.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.path === "kind")).toBe(true);
    });
  });

  describe("output validation - trust boundary", () => {
    it("should reject invalid output version", async () => {
      const output = {
        version: "invalid-version",
        findings: [],
      };

      const result = await validator.validateOutput(output, []);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.path === "version")).toBe(true);
    });

    it("should reject findings with missing required fields", async () => {
      const output = {
        version: "ctg.plugin-output/v1",
        findings: [
          {
            id: "test",
          },
        ],
      };

      const result = await validator.validateOutput(output, []);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.path.includes("findings"))).toBe(true);
    });

    it("should accept valid output structure", async () => {
      const output = {
        version: "ctg.plugin-output/v1",
        findings: [
          {
            id: "test-1",
            ruleId: "TEST",
            category: "security",
            severity: "medium",
            confidence: 0.8,
            title: "Test finding",
            summary: "Test summary",
            evidence: [],
          },
        ],
      };

      const result = await validator.validateOutput(output, []);
      expect(result.valid).toBe(true);
    });
  });
});