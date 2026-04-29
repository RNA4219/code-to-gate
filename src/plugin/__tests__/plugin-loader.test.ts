/**
 * Plugin Loader Tests
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PluginLoaderImpl,
  createPluginLoader,
  loadPluginManifests,
  filterPluginsByStatus,
  getLoadedManifests,
} from "../plugin-loader.js";
import {
  createDefaultManifest,
  isValidPluginName,
  isValidSemver,
  isValidSchemaRef,
} from "../plugin-schema.js";
import type { PluginLoadResult, PluginManifest } from "../types.js";
import * as fs from "fs/promises";
import * as path from "path";

const TEST_DIR = path.join(process.cwd(), ".test-temp", "plugin-loader-tests");

describe("PluginLoader", () => {
  beforeAll(async () => {
    // Create test directory
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    // Cleanup test directory
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("createPluginLoader", () => {
    it("should create a plugin loader instance", () => {
      const loader = createPluginLoader();
      expect(loader).toBeDefined();
      expect(loader.loadManifest).toBeDefined();
      expect(loader.validateManifest).toBeDefined();
      expect(loader.parseManifest).toBeDefined();
    });
  });

  describe("parseManifest", () => {
    it("should parse JSON manifest", async () => {
      const loader = new PluginLoaderImpl();
      const manifest = createDefaultManifest("test-plugin");
      const jsonContent = JSON.stringify(manifest);

      const result = await loader.parseManifest(jsonContent, "json");

      expect(result).toBeDefined();
      expect(result?.name).toBe("test-plugin");
      expect(result?.apiVersion).toBe("ctg/v1alpha1");
      expect(result?.kind).toBe("rule-plugin");
    });

    it("should parse simple YAML manifest", async () => {
      const loader = new PluginLoaderImpl();
      const yamlContent = `
apiVersion: ctg/v1alpha1
kind: rule-plugin
name: my-plugin
version: 1.0.0
visibility: public
description: Test plugin
entry:
  command: ["node", "./dist/index.js"]
  timeout: 60
capabilities: ["evaluate"]
receives: ["normalized-repo-graph@v1"]
returns: ["findings@v1"]
`;

      const result = await loader.parseManifest(yamlContent, "yaml");

      expect(result).toBeDefined();
      expect(result?.name).toBe("my-plugin");
      expect(result?.version).toBe("1.0.0");
      expect(result?.capabilities).toContain("evaluate");
    });

    it("should return null for invalid JSON", async () => {
      const loader = new PluginLoaderImpl();
      const invalidJson = "{ invalid json }";

      const result = await loader.parseManifest(invalidJson, "json");

      expect(result).toBeNull();
    });
  });

  describe("validateManifest", () => {
    it("should validate a valid manifest", async () => {
      const loader = new PluginLoaderImpl();
      const manifest = createDefaultManifest("valid-plugin");

      const result = await loader.validateManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("should fail validation for missing required fields", async () => {
      const loader = new PluginLoaderImpl();
      const incompleteManifest = {
        apiVersion: "ctg/v1alpha1",
        name: "incomplete-plugin",
        // Missing kind, version, visibility, entry, capabilities, etc.
      };

      const result = await loader.validateManifest(incompleteManifest);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some(e => e.path === "kind")).toBe(true);
      expect(result.errors?.some(e => e.path === "version")).toBe(true);
    });

    it("should fail validation for invalid apiVersion", async () => {
      const loader = new PluginLoaderImpl();
      const manifest = {
        ...createDefaultManifest("test-plugin"),
        apiVersion: "invalid-version",
      };

      const result = await loader.validateManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.code === "INVALID_VERSION")).toBe(true);
    });

    it("should fail validation for invalid plugin name", async () => {
      const loader = new PluginLoaderImpl();
      const manifest = {
        ...createDefaultManifest("Invalid-Plugin-Name"),
        name: "Invalid-Plugin-Name", // Upper case not allowed
      };

      const result = await loader.validateManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.code === "INVALID_NAME")).toBe(true);
    });

    it("should fail validation for empty capabilities", async () => {
      const loader = new PluginLoaderImpl();
      const manifest = {
        ...createDefaultManifest("test-plugin"),
        capabilities: [],
      };

      const result = await loader.validateManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.code === "EMPTY_CAPABILITIES")).toBe(true);
    });

    it("should fail validation for invalid timeout", async () => {
      const loader = new PluginLoaderImpl();
      const manifest = {
        ...createDefaultManifest("test-plugin"),
        entry: {
          command: ["node", "./dist/index.js"],
          timeout: 500, // Exceeds max 300
        },
      };

      const result = await loader.validateManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.code === "INVALID_TIMEOUT")).toBe(true);
    });
  });

  describe("loadManifest", () => {
    it("should load manifest from valid plugin directory", async () => {
      // Create test plugin directory with manifest
      const pluginDir = path.join(TEST_DIR, "test-plugin-valid");
      await fs.mkdir(pluginDir, { recursive: true });

      const manifest = createDefaultManifest("test-plugin-valid");
      await fs.writeFile(
        path.join(pluginDir, "plugin-manifest.json"),
        JSON.stringify(manifest)
      );

      const loader = new PluginLoaderImpl();
      const result = await loader.loadManifest(pluginDir);

      expect(result.status).toBe("loaded");
      expect(result.manifest).toBeDefined();
      expect(result.manifest?.name).toBe("test-plugin-valid");
    });

    it("should fail for non-directory path", async () => {
      // Create a file instead of directory
      const filePath = path.join(TEST_DIR, "not-a-directory.txt");
      await fs.writeFile(filePath, "test content");

      const loader = new PluginLoaderImpl();
      const result = await loader.loadManifest(filePath);

      expect(result.status).toBe("manifest_not_found");
      expect(result.errors?.some(e => e.code === "PATH_NOT_DIRECTORY")).toBe(true);
    });

    it("should fail for directory without manifest", async () => {
      // Create directory without manifest
      const emptyDir = path.join(TEST_DIR, "empty-plugin-dir");
      await fs.mkdir(emptyDir, { recursive: true });

      const loader = new PluginLoaderImpl();
      const result = await loader.loadManifest(emptyDir);

      expect(result.status).toBe("manifest_not_found");
      expect(result.errors?.some(e => e.code === "MANIFEST_NOT_FOUND")).toBe(true);
    });

    it("should load YAML manifest", async () => {
      // Create test plugin directory with YAML manifest
      const pluginDir = path.join(TEST_DIR, "test-plugin-yaml");
      await fs.mkdir(pluginDir, { recursive: true });

      const yamlContent = `
apiVersion: ctg/v1alpha1
kind: rule-plugin
name: test-plugin-yaml
version: 1.0.0
visibility: public
entry:
  command: ["node", "./dist/index.js"]
capabilities: ["evaluate"]
receives: ["normalized-repo-graph@v1"]
returns: ["findings@v1"]
`;

      await fs.writeFile(
        path.join(pluginDir, "plugin-manifest.yaml"),
        yamlContent
      );

      const loader = new PluginLoaderImpl();
      const result = await loader.loadManifest(pluginDir);

      expect(result.status).toBe("loaded");
      expect(result.manifest?.name).toBe("test-plugin-yaml");
    });
  });

  describe("checkCapabilities", () => {
    it("should return true when all required capabilities are present", async () => {
      const loader = new PluginLoaderImpl();
      const manifest = createDefaultManifest("test-plugin");
      manifest.capabilities = ["evaluate", "parse"];

      const result = loader.checkCapabilities(manifest, ["evaluate"]);

      expect(result).toBe(true);
    });

    it("should return false when required capability is missing", async () => {
      const loader = new PluginLoaderImpl();
      const manifest = createDefaultManifest("test-plugin");
      manifest.capabilities = ["parse"];

      const result = loader.checkCapabilities(manifest, ["evaluate"]);

      expect(result).toBe(false);
    });
  });

  describe("resolveDependencies", () => {
    it("should resolve when no dependencies", async () => {
      const loader = new PluginLoaderImpl();
      const manifest = createDefaultManifest("test-plugin");

      const result = await loader.resolveDependencies(manifest);

      expect(result.resolved).toBe(true);
    });

    it("should resolve optional dependencies", async () => {
      const loader = new PluginLoaderImpl();
      const manifest = createDefaultManifest("test-plugin");
      manifest.dependencies = [
        { name: "optional-dep", optional: true },
      ];

      const result = await loader.resolveDependencies(manifest);

      expect(result.resolved).toBe(true);
    });
  });
});

describe("Plugin Schema Utilities", () => {
  describe("isValidPluginName", () => {
    it("should accept valid plugin names", () => {
      expect(isValidPluginName("my-plugin")).toBe(true);
      expect(isValidPluginName("test-plugin-123")).toBe(true);
      expect(isValidPluginName("a-b")).toBe(true);
    });

    it("should reject invalid plugin names", () => {
      expect(isValidPluginName("My-Plugin")).toBe(false); // Upper case
      expect(isValidPluginName("a")).toBe(false); // Too short
      expect(isValidPluginName("-plugin")).toBe(false); // Starts with hyphen
      expect(isValidPluginName("plugin-")).toBe(false); // Ends with hyphen
      expect(isValidPluginName("plugin-name-very-long-xyz-abc-123-456-789-extra-extra-extra-extra")).toBe(false); // Too long (>64 chars)
    });
  });

  describe("isValidSemver", () => {
    it("should accept valid semver versions", () => {
      expect(isValidSemver("1.0.0")).toBe(true);
      expect(isValidSemver("0.1.0")).toBe(true);
      expect(isValidSemver("1.0.0-alpha")).toBe(true);
      expect(isValidSemver("1.0.0-alpha.1")).toBe(true);
    });

    it("should reject invalid semver versions", () => {
      expect(isValidSemver("1")).toBe(false);
      expect(isValidSemver("1.0")).toBe(false);
      expect(isValidSemver("v1.0.0")).toBe(false);
    });
  });

  describe("isValidSchemaRef", () => {
    it("should accept valid schema references", () => {
      expect(isValidSchemaRef("normalized-repo-graph@v1")).toBe(true);
      expect(isValidSchemaRef("findings@v1")).toBe(true);
      expect(isValidSchemaRef("risk-seeds@v2")).toBe(true);
    });

    it("should reject invalid schema references", () => {
      expect(isValidSchemaRef("normalized-repo-graph")).toBe(false);
      expect(isValidSchemaRef("normalized-repo-graph@v")).toBe(false);
      expect(isValidSchemaRef("@v1")).toBe(false);
    });
  });
});

describe("Plugin Loading Helpers", () => {
  it("should load multiple plugins", async () => {
    // Create test plugins
    const pluginDir1 = path.join(TEST_DIR, "multi-plugin-1");
    const pluginDir2 = path.join(TEST_DIR, "multi-plugin-2");
    await fs.mkdir(pluginDir1, { recursive: true });
    await fs.mkdir(pluginDir2, { recursive: true });

    const manifest1 = createDefaultManifest("multi-plugin-1");
    const manifest2 = createDefaultManifest("multi-plugin-2");
    manifest2.kind = "language-plugin";

    await fs.writeFile(
      path.join(pluginDir1, "plugin-manifest.json"),
      JSON.stringify(manifest1)
    );
    await fs.writeFile(
      path.join(pluginDir2, "plugin-manifest.json"),
      JSON.stringify(manifest2)
    );

    const results = await loadPluginManifests([pluginDir1, pluginDir2]);

    expect(results.length).toBe(2);
    expect(results.every(r => r.status === "loaded")).toBe(true);
  });

  it("should filter plugins by status", () => {
    const results: PluginLoadResult[] = [
      { manifest: null, path: "p1", status: "loaded" },
      { manifest: null, path: "p2", status: "manifest_not_found" },
      { manifest: null, path: "p3", status: "loaded" },
    ];

    const loaded = filterPluginsByStatus(results, "loaded");
    expect(loaded.length).toBe(2);

    const failed = filterPluginsByStatus(results, "manifest_not_found");
    expect(failed.length).toBe(1);
  });

  it("should get loaded manifests", () => {
    const manifest1 = createDefaultManifest("plugin-1");
    const manifest2 = createDefaultManifest("plugin-2");

    const results: PluginLoadResult[] = [
      { manifest: manifest1, path: "p1", status: "loaded" },
      { manifest: null, path: "p2", status: "manifest_not_found" },
      { manifest: manifest2, path: "p3", status: "loaded" },
    ];

    const loadedManifests = getLoadedManifests(results);

    expect(loadedManifests.length).toBe(2);
    expect(loadedManifests.map(m => m.name)).toEqual(["plugin-1", "plugin-2"]);
  });
});