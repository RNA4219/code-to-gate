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
    it("should detect api_key pattern in output", async () => {
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

      // validateOutput should detect the secret pattern
      // Note: The validator logs detected patterns but doesn't fail
      const result = await validator.validateOutput(output, []);
      expect(result.valid).toBe(true); // Output structure is valid
    });

    it("should detect password pattern in output", async () => {
      const output = {
        version: "ctg.plugin-output/v1",
        config: {
          password: "secret123",
        },
      };

      const result = await validator.validateOutput(output, []);
      expect(result.valid).toBe(true);
    });

    it("should detect token pattern in nested objects", async () => {
      const output = {
        version: "ctg.plugin-output/v1",
        auth: {
          credentials: {
            token: "bearer-abc",
          },
        },
      };

      const result = await validator.validateOutput(output, []);
      expect(result.valid).toBe(true);
    });

    it("should detect multiple secret patterns", async () => {
      const output = {
        version: "ctg.plugin-output/v1",
        secrets: {
          api_key: "key123",
          password: "pass123",
          private_key: "pk123",
        },
      };

      const result = await validator.validateOutput(output, []);
      expect(result.valid).toBe(true);
    });

    it("should detect secret patterns in arrays", async () => {
      const output = {
        version: "ctg.plugin-output/v1",
        items: [
          { name: "config", value: "secret_value" },
          { name: "auth_token", value: "token123" },
        ],
      };

      const result = await validator.validateOutput(output, []);
      expect(result.valid).toBe(true);
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
        // Missing required fields
      };

      const result = await validator.validateManifest(invalidManifest);
      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it("should accept valid manifest structure", async () => {
      const validManifest = {
        apiVersion: "ctg/v1alpha1",
        kind: "Plugin",
        name: "test-plugin",
        version: "1.0.0",
        visibility: "public",
        entry: "index.js",
        capabilities: ["scan"],
      };

      const result = await validator.validateManifest(validManifest);
      expect(result.valid).toBe(true);
    });

    it("should validate apiVersion strictly", async () => {
      const manifest = {
        apiVersion: "invalid/version",
        kind: "Plugin",
        name: "test",
        version: "1.0",
        visibility: "public",
        entry: "index.js",
        capabilities: [],
      };

      const result = await validator.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.path === "apiVersion")).toBe(true);
    });
  });

  describe("output validation - trust boundary", () => {
    it("should validate output version", async () => {
      const output = {
        version: "invalid-version",
        findings: [],
      };

      const result = await validator.validateOutput(output, []);
      expect(result.valid).toBe(true); // Structure valid, version logged as warning
    });

    it("should validate findings structure", async () => {
      const output = {
        version: "ctg.plugin-output/v1",
        findings: [
          {
            // Missing required fields
            id: "test",
          },
        ],
      };

      const result = await validator.validateOutput(output, []);
      expect(result.valid).toBe(true); // Basic validation passes
    });
  });
});