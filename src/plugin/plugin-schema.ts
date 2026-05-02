/**
 * Plugin Schema Validation Functions
 * Validation utilities for plugin manifest fields
 */

import type { PluginManifest, PluginCapability, PluginKind, PluginVisibility } from "./types.js";
import {
  PLUGIN_MANIFEST_SCHEMA,
  PLUGIN_INPUT_SCHEMA,
  PLUGIN_OUTPUT_SCHEMA,
} from "./plugin-schemas.js";

// Re-export schemas for external use
export {
  PLUGIN_MANIFEST_SCHEMA,
  PLUGIN_INPUT_SCHEMA,
  PLUGIN_OUTPUT_SCHEMA,
};

/**
 * Valid plugin kinds
 */
export const VALID_PLUGIN_KINDS: PluginKind[] = [
  "rule-plugin",
  "language-plugin",
  "importer-plugin",
  "reporter-plugin",
  "exporter-plugin",
];

/**
 * Valid plugin capabilities
 */
export const VALID_PLUGIN_CAPABILITIES: PluginCapability[] = [
  "evaluate",
  "parse",
  "import",
  "report",
  "export",
];

/**
 * Valid plugin visibility levels
 */
export const VALID_PLUGIN_VISIBILITY: PluginVisibility[] = [
  "public",
  "private",
];

/**
 * Valid schema references that plugins can receive
 */
export const VALID_RECEIVE_SCHEMAS = [
  "normalized-repo-graph@v1",
  "findings@v1",
  "risk-register@v1",
  "test-seeds@v1",
];

/**
 * Valid schema references that plugins can return
 */
export const VALID_RETURN_SCHEMAS = [
  "findings@v1",
  "risk-seeds@v1",
  "invariant-seeds@v1",
  "test-seeds@v1",
  "diagnostics@v1",
];

/**
 * Validate schema reference format
 */
export function isValidSchemaRef(ref: string): boolean {
  const pattern = /^[a-z0-9-]+@v[0-9]+$/;
  return pattern.test(ref);
}

/**
 * Validate semver version format
 */
export function isValidSemver(version: string): boolean {
  const pattern = /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/;
  return pattern.test(version);
}

/**
 * Validate plugin name format
 */
export function isValidPluginName(name: string): boolean {
  const pattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
  return pattern.test(name) && name.length >= 2 && name.length <= 64;
}

/**
 * Validate rule ID format
 */
export function isValidRuleId(ruleId: string): boolean {
  const pattern = /^[A-Z][A-Z0-9_]*$/;
  return pattern.test(ruleId);
}

/**
 * Validate confidence value
 */
export function isValidConfidence(confidence: number): boolean {
  return confidence >= 0 && confidence <= 1;
}

/**
 * Validate severity value
 */
export function isValidSeverity(severity: string): boolean {
  return ["low", "medium", "high", "critical"].includes(severity);
}

/**
 * Validate category value
 */
export function isValidCategory(category: string): boolean {
  return [
    "auth",
    "payment",
    "validation",
    "data",
    "config",
    "maintainability",
    "testing",
    "compatibility",
    "release-risk",
    "security",
  ].includes(category);
}

/**
 * Validate evidence kind
 */
export function isValidEvidenceKind(kind: string): boolean {
  return ["ast", "text", "import", "external", "test"].includes(kind);
}

/**
 * Validate excerpt hash (SHA-256)
 */
export function isValidExcerptHash(hash: string): boolean {
  const pattern = /^[a-f0-9]{64}$/;
  return pattern.test(hash);
}

/**
 * Validate UUID format
 */
export function isValidUuid(id: string): boolean {
  const pattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  return pattern.test(id);
}

/**
 * Create default manifest for testing
 */
export function createDefaultManifest(name: string = "example-plugin"): PluginManifest {
  return {
    apiVersion: "ctg/v1",
    kind: "rule-plugin",
    name,
    version: "0.1.0",
    visibility: "public",
    description: "Example plugin",
    entry: {
      command: ["node", "./dist/index.js"],
      timeout: 60,
      retry: 1,
    },
    capabilities: ["evaluate"],
    receives: ["normalized-repo-graph@v1"],
    returns: ["findings@v1"],
    security: {
      network: false,
      filesystem: {
        read: ["${repoRoot}"],
        write: ["${workDir}/plugin-output"],
      },
      secrets: {
        allow: [],
      },
    },
  };
}