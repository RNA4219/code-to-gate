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
import { parseYamlContent } from "./plugin-yaml-parser.js";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Default Plugin Loader Implementation
 */
export class PluginLoaderImpl implements PluginLoader {
  async loadManifest(pluginPath: string): Promise<PluginLoadResult> {
    const errors: Array<{ code: string; message: string; path?: string }> = [];

    try {
      const stat = await fs.stat(pluginPath);
      if (!stat.isDirectory()) {
        return {
          manifest: null,
          path: pluginPath,
          status: "manifest_not_found",
          errors: [{ code: "PATH_NOT_DIRECTORY", message: "Plugin path must be a directory" }],
        };
      }

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
          continue;
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

      const manifest = await this.parseManifest(manifestContent, manifestFormat);

      if (!manifest) {
        return {
          manifest: null,
          path: pluginPath,
          status: "manifest_invalid",
          errors: [{ code: "PARSE_ERROR", message: "Failed to parse manifest file", path: manifestPath }],
        };
      }

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

  async validateManifest(manifest: unknown): Promise<{
    valid: boolean;
    errors?: Array<{ code: string; message: string; path?: string }>;
  }> {
    const errors: Array<{ code: string; message: string; path?: string }> = [];

    if (!manifest || typeof manifest !== "object") {
      return { valid: false, errors: [{ code: "INVALID_TYPE", message: "Manifest must be an object" }] };
    }

    const m = manifest as Record<string, unknown>;

    const requiredFields = ["apiVersion", "kind", "name", "version", "visibility", "entry", "capabilities", "receives", "returns"];
    for (const field of requiredFields) {
      if (!(field in m)) {
        errors.push({ code: "MISSING_FIELD", message: `Required field '${field}' is missing`, path: field });
      }
    }

    if (m.apiVersion !== PLUGIN_MANIFEST_VERSION) {
      errors.push({
        code: "INVALID_VERSION",
        message: `apiVersion must be '${PLUGIN_MANIFEST_VERSION}'`,
        path: "apiVersion",
      });
    }

    if (!VALID_PLUGIN_KINDS.includes(m.kind as PluginKind)) {
      errors.push({
        code: "INVALID_KIND",
        message: `kind must be one of: ${VALID_PLUGIN_KINDS.join(", ")}`,
        path: "kind",
      });
    }

    if (typeof m.name === "string" && !isValidPluginName(m.name)) {
      errors.push({
        code: "INVALID_NAME",
        message: "name must be lowercase alphanumeric with hyphens, 2-64 characters",
        path: "name",
      });
    }

    if (typeof m.version === "string" && !isValidSemver(m.version)) {
      errors.push({
        code: "INVALID_VERSION_FORMAT",
        message: "version must be semver format (e.g., 1.0.0)",
        path: "version",
      });
    }

    if (!VALID_PLUGIN_VISIBILITY.includes(m.visibility as PluginVisibility)) {
      errors.push({
        code: "INVALID_VISIBILITY",
        message: "visibility must be 'public' or 'private'",
        path: "visibility",
      });
    }

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

  async parseManifest(content: string, format: "yaml" | "json"): Promise<PluginManifest | null> {
    try {
      if (format === "json") {
        return JSON.parse(content) as PluginManifest;
      }

      return parseYamlContent(content) as unknown as PluginManifest;
    } catch {
      return null;
    }
  }

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