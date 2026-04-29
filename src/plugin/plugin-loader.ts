/**
 * Plugin Loader Implementation
 * Loads and validates plugin manifests
 * Based on docs/product-spec-v1.md section 16
 */

import type {
  PluginManifest,
  PluginLoadResult,
  PluginLoadStatus,
  PluginCapability,
  PluginKind,
  PluginVisibility,
} from "./types.js";
import type { PluginLoader } from "./contract.js";
import { PLUGIN_MANIFEST_VERSION } from "./types.js";
import {
  VALID_PLUGIN_KINDS,
  VALID_PLUGIN_CAPABILITIES,
  VALID_PLUGIN_VISIBILITY,
  isValidPluginName,
  isValidSemver,
  isValidSchemaRef,
} from "./plugin-schema.js";
import { parseJsonFile } from "../core/index.js";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Default Plugin Loader Implementation
 */
export class PluginLoaderImpl implements PluginLoader {
  /**
   * Load plugin manifest from path
   */
  async loadManifest(pluginPath: string): Promise<PluginLoadResult> {
    const errors: Array<{ code: string; message: string; path?: string }> = [];

    try {
      // Check if path exists
      const stat = await fs.stat(pluginPath);
      if (!stat.isDirectory()) {
        return {
          manifest: null,
          path: pluginPath,
          status: "manifest_not_found",
          errors: [{ code: "PATH_NOT_DIRECTORY", message: "Plugin path must be a directory" }],
        };
      }

      // Try to find manifest file
      const manifestFiles = [
        "plugin-manifest.yaml",
        "plugin-manifest.yml",
        "plugin-manifest.json",
        "manifest.yaml",
        "manifest.yml",
        "manifest.json",
        "ctg-plugin.yaml",
        "ctg-plugin.json",
      ];

      let manifestPath: string | null = null;
      let manifestContent: string | null = null;
      let manifestFormat: "yaml" | "json" = "yaml";

      for (const filename of manifestFiles) {
        const candidatePath = path.join(pluginPath, filename);
        try {
          manifestContent = await fs.readFile(candidatePath, "utf-8");
          manifestPath = candidatePath;
          manifestFormat = filename.endsWith(".json") ? "json" : "yaml";
          break;
        } catch {
          // Continue to next candidate
        }
      }

      if (!manifestContent || !manifestPath) {
        return {
          manifest: null,
          path: pluginPath,
          status: "manifest_not_found",
          errors: [{ code: "MANIFEST_NOT_FOUND", message: "No manifest file found in plugin directory" }],
        };
      }

      // Parse manifest
      const manifest = await this.parseManifest(manifestContent, manifestFormat);

      if (!manifest) {
        return {
          manifest: null,
          path: pluginPath,
          status: "manifest_invalid",
          errors: [{ code: "PARSE_ERROR", message: "Failed to parse manifest file", path: manifestPath }],
        };
      }

      // Validate manifest
      const validation = await this.validateManifest(manifest);

      if (!validation.valid) {
        return {
          manifest,
          path: pluginPath,
          status: "schema_invalid",
          errors: validation.errors?.map(e => ({
            code: "VALIDATION_ERROR",
            message: e.message,
            path: e.path,
          })),
        };
      }

      return {
        manifest,
        path: pluginPath,
        status: "loaded",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return {
        manifest: null,
        path: pluginPath,
        status: "manifest_not_found",
        errors: [{ code: "LOAD_ERROR", message: errorMessage }],
      };
    }
  }

  /**
   * Validate manifest structure
   */
  async validateManifest(manifest: unknown): Promise<{
    valid: boolean;
    errors?: Array<{ code: string; message: string; path?: string }>;
  }> {
    const errors: Array<{ code: string; message: string; path?: string }> = [];

    if (!manifest || typeof manifest !== "object") {
      return { valid: false, errors: [{ code: "INVALID_TYPE", message: "Manifest must be an object" }] };
    }

    const m = manifest as Record<string, unknown>;

    // Required fields
    const requiredFields = ["apiVersion", "kind", "name", "version", "visibility", "entry", "capabilities", "receives", "returns"];
    for (const field of requiredFields) {
      if (!(field in m)) {
        errors.push({ code: "MISSING_FIELD", message: `Required field '${field}' is missing`, path: field });
      }
    }

    // Validate apiVersion
    if (m.apiVersion !== PLUGIN_MANIFEST_VERSION) {
      errors.push({
        code: "INVALID_VERSION",
        message: `apiVersion must be '${PLUGIN_MANIFEST_VERSION}'`,
        path: "apiVersion",
      });
    }

    // Validate kind
    if (!VALID_PLUGIN_KINDS.includes(m.kind as PluginKind)) {
      errors.push({
        code: "INVALID_KIND",
        message: `kind must be one of: ${VALID_PLUGIN_KINDS.join(", ")}`,
        path: "kind",
      });
    }

    // Validate name
    if (typeof m.name === "string" && !isValidPluginName(m.name)) {
      errors.push({
        code: "INVALID_NAME",
        message: "name must be lowercase alphanumeric with hyphens, 2-64 characters",
        path: "name",
      });
    }

    // Validate version
    if (typeof m.version === "string" && !isValidSemver(m.version)) {
      errors.push({
        code: "INVALID_VERSION_FORMAT",
        message: "version must be semver format (e.g., 1.0.0)",
        path: "version",
      });
    }

    // Validate visibility
    if (!VALID_PLUGIN_VISIBILITY.includes(m.visibility as PluginVisibility)) {
      errors.push({
        code: "INVALID_VISIBILITY",
        message: "visibility must be 'public' or 'private'",
        path: "visibility",
      });
    }

    // Validate entry
    if (m.entry && typeof m.entry === "object") {
      const entry = m.entry as Record<string, unknown>;
      if (!entry.command || !Array.isArray(entry.command) || entry.command.length === 0) {
        errors.push({
          code: "INVALID_ENTRY",
          message: "entry.command must be a non-empty array",
          path: "entry.command",
        });
      }
      if (entry.timeout !== undefined && (typeof entry.timeout !== "number" || entry.timeout < 1 || entry.timeout > 300)) {
        errors.push({
          code: "INVALID_TIMEOUT",
          message: "entry.timeout must be a number between 1 and 300 seconds",
          path: "entry.timeout",
        });
      }
      if (entry.retry !== undefined && (typeof entry.retry !== "number" || entry.retry < 0 || entry.retry > 5)) {
        errors.push({
          code: "INVALID_RETRY",
          message: "entry.retry must be a number between 0 and 5",
          path: "entry.retry",
        });
      }
    }

    // Validate capabilities
    if (m.capabilities && Array.isArray(m.capabilities)) {
      for (const cap of m.capabilities) {
        if (!VALID_PLUGIN_CAPABILITIES.includes(cap as PluginCapability)) {
          errors.push({
            code: "INVALID_CAPABILITY",
            message: `capability '${cap}' is not valid`,
            path: "capabilities",
          });
        }
      }
      if (m.capabilities.length === 0) {
        errors.push({
          code: "EMPTY_CAPABILITIES",
          message: "capabilities must have at least one entry",
          path: "capabilities",
        });
      }
    }

    // Validate receives
    if (m.receives && Array.isArray(m.receives)) {
      for (const ref of m.receives) {
        if (!isValidSchemaRef(ref as string)) {
          errors.push({
            code: "INVALID_RECEIVES_SCHEMA",
            message: `receives '${ref}' is not a valid schema reference`,
            path: "receives",
          });
        }
      }
    }

    // Validate returns
    if (m.returns && Array.isArray(m.returns)) {
      if (m.returns.length === 0) {
        errors.push({
          code: "EMPTY_RETURNSS",
          message: "returns must have at least one entry",
          path: "returns",
        });
      }
      for (const ref of m.returns) {
        if (!isValidSchemaRef(ref as string)) {
          errors.push({
            code: "INVALID_RETURNS_SCHEMA",
            message: `returns '${ref}' is not a valid schema reference`,
            path: "returns",
          });
        }
      }
    }

    // Validate security if present
    if (m.security && typeof m.security === "object") {
      const security = m.security as Record<string, unknown>;
      if (security.network !== undefined && typeof security.network !== "boolean") {
        errors.push({
          code: "INVALID_SECURITY",
          message: "security.network must be boolean",
          path: "security.network",
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Parse YAML or JSON manifest
   */
  async parseManifest(content: string, format: "yaml" | "json"): Promise<PluginManifest | null> {
    try {
      if (format === "json") {
        return JSON.parse(content) as PluginManifest;
      }

      // Simple YAML parser (basic implementation)
      // For production, use a proper YAML parser library
      const lines = content.split("\n");
      const result: Record<string, unknown> = {};
      let currentKey = "";
      let currentArray: unknown[] | null = null;
      let currentObject: Record<string, unknown> | null = null;
      let inNestedObject = false;

      for (const line of lines) {
        // Skip empty lines and comments
        if (line.trim() === "" || line.trim().startsWith("#")) {
          continue;
        }

        const indent = line.search(/\S/);
        const trimmed = line.trim();

        // Check for key-value pair
        const colonIndex = trimmed.indexOf(":");
        if (colonIndex > 0) {
          const key = trimmed.substring(0, colonIndex).trim();
          const value = trimmed.substring(colonIndex + 1).trim();

          if (indent === 0) {
            // Top-level key
            currentKey = key;
            inNestedObject = false;
            currentArray = null;
            currentObject = null;

            if (value === "") {
              // Empty value - may be nested object or array
              result[key] = {};
              currentObject = result[key] as Record<string, unknown>;
              inNestedObject = true;
            } else if (value.startsWith("[")) {
              // Inline array
              result[key] = this.parseYamlArray(value);
            } else if (value.startsWith('"') || value.startsWith("'")) {
              // Quoted string
              result[key] = value.slice(1, -1);
            } else if (value === "true" || value === "false") {
              result[key] = value === "true";
            } else if (!isNaN(Number(value))) {
              result[key] = Number(value);
            } else {
              result[key] = value;
            }
          } else if (inNestedObject && currentObject) {
            // Nested key
            if (value === "") {
              currentObject[key] = {};
              currentObject = currentObject[key] as Record<string, unknown>;
            } else if (value.startsWith("[")) {
              currentObject[key] = this.parseYamlArray(value);
            } else if (value.startsWith('"') || value.startsWith("'")) {
              currentObject[key] = value.slice(1, -1);
            } else if (value === "true" || value === "false") {
              currentObject[key] = value === "true";
            } else if (!isNaN(Number(value))) {
              currentObject[key] = Number(value);
            } else {
              currentObject[key] = value;
            }
          }
        } else if (trimmed.startsWith("- ")) {
          // Array item
          const value = trimmed.substring(2).trim();
          if (currentKey && !currentArray) {
            currentArray = [];
            result[currentKey] = currentArray;
            inNestedObject = false;
          }
          if (currentArray) {
            if (value.startsWith('"') || value.startsWith("'")) {
              currentArray.push(value.slice(1, -1));
            } else if (value === "true" || value === "false") {
              currentArray.push(value === "true");
            } else if (!isNaN(Number(value))) {
              currentArray.push(Number(value));
            } else {
              currentArray.push(value);
            }
          }
        }
      }

      return result as unknown as PluginManifest;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse inline YAML array
   */
  private parseYamlArray(value: string): unknown[] {
    // Remove brackets
    const inner = value.slice(1, -1).trim();
    if (inner === "") {
      return [];
    }

    // Split by comma and parse each item
    return inner.split(",").map(item => {
      const trimmed = item.trim();
      if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
        return trimmed.slice(1, -1);
      }
      if (trimmed === "true" || trimmed === "false") {
        return trimmed === "true";
      }
      if (!isNaN(Number(trimmed))) {
        return Number(trimmed);
      }
      return trimmed;
    });
  }

  /**
   * Check plugin capabilities match requirements
   */
  checkCapabilities(
    manifest: PluginManifest,
    requiredCapabilities: PluginCapability[]
  ): boolean {
    for (const required of requiredCapabilities) {
      if (!manifest.capabilities.includes(required)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Resolve plugin dependencies
   */
  async resolveDependencies(manifest: PluginManifest): Promise<{
    resolved: boolean;
    missing?: string[];
  }> {
    if (!manifest.dependencies || manifest.dependencies.length === 0) {
      return { resolved: true };
    }

    const missing: string[] = [];

    for (const dep of manifest.dependencies) {
      if (dep.optional) {
        continue;
      }

      // In a real implementation, we would check if the dependency
      // is available in the plugin registry or file system
      // For now, we assume all dependencies are resolved
    }

    return {
      resolved: missing.length === 0,
      missing: missing.length > 0 ? missing : undefined,
    };
  }
}

/**
 * Create default plugin loader
 */
export function createPluginLoader(): PluginLoader {
  return new PluginLoaderImpl();
}

/**
 * Load multiple plugin manifests
 */
export async function loadPluginManifests(paths: string[]): Promise<PluginLoadResult[]> {
  const loader = createPluginLoader();
  const results: PluginLoadResult[] = [];

  for (const pluginPath of paths) {
    const result = await loader.loadManifest(pluginPath);
    results.push(result);
  }

  return results;
}

/**
 * Filter loaded plugins by status
 */
export function filterPluginsByStatus(
  results: PluginLoadResult[],
  status: PluginLoadStatus
): PluginLoadResult[] {
  return results.filter(r => r.status === status);
}

/**
 * Get successfully loaded manifests
 */
export function getLoadedManifests(results: PluginLoadResult[]): PluginManifest[] {
  return results
    .filter(r => r.status === "loaded" && r.manifest)
    .map(r => r.manifest!);
}