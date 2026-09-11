/**
 * Suppression Loader - loads and parses suppression files
 * Based on docs/product-spec-v1.md Section 5.3 and 12
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { CTG_VERSION } from "../types/artifacts.js";

/**
 * Default suppression file location
 */
export const DEFAULT_SUPPRESSION_FILE = ".ctg/suppressions.yaml";

/**
 * Suppression entry structure
 * Based on spec Section 5.3
 */
export interface Suppression {
  rule_id: string;
  path: string; // Glob pattern for matching file paths
  reason: string;
  expiry?: string; // ISO date string (YYYY-MM-DD)
  author?: string;
}

/**
 * Suppression file structure
 * Based on spec Section 5.3
 */
export interface SuppressionFile {
  version: string;
  suppressions: Suppression[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/**
 * Parse suppression YAML content
 * @param content - YAML content string
 * @returns Parsed suppression file object
 */
export function parseSuppressionYaml(content: string): SuppressionFile {
  let parsed: unknown;
  try {
    parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
  } catch (error) {
    throw new Error(
      `Invalid suppression YAML: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  if (Array.isArray(parsed)) {
    return { version: CTG_VERSION, suppressions: [] };
  }
  if (parsed === null || (parsed !== undefined && !asRecord(parsed))) {
    throw new Error("suppression root must be an object");
  }

  const root = asRecord(parsed) ?? {};
  if (root.version !== undefined && typeof root.version !== "string") {
    throw new Error("suppression.version must be a string");
  }
  const rawSuppressions = root.suppressions;
  if (rawSuppressions === undefined || rawSuppressions === null) {
    return {
      version: typeof root.version === "string" && root.version.trim() ? root.version : CTG_VERSION,
      suppressions: [],
    };
  }
  if (!Array.isArray(rawSuppressions)) {
    throw new Error("suppressions must be an array");
  }

  const readOptionalString = (entry: Record<string, unknown>, key: string, index: number): string | undefined => {
    const value = entry[key];
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value !== "string") {
      throw new Error(`suppressions[${index}].${key} must be a string`);
    }
    return value;
  };

  const suppressions: Suppression[] = [];
  for (const [index, rawEntry] of rawSuppressions.entries()) {
    const entry = asRecord(rawEntry);
    if (!entry) {
      continue;
    }

    const ruleId = readOptionalString(entry, "rule_id", index);
    const pathValue = readOptionalString(entry, "path", index);
    if (!ruleId || !pathValue) {
      continue;
    }

    suppressions.push({
      rule_id: ruleId,
      path: pathValue,
      reason: readOptionalString(entry, "reason", index) ?? "",
      expiry: readOptionalString(entry, "expiry", index),
      author: readOptionalString(entry, "author", index),
    });
  }

  return {
    version: typeof root.version === "string" && root.version.trim() ? root.version : CTG_VERSION,
    suppressions,
  };
}

/**
 * Load suppressions from file
 * @param suppressionPath - Path to suppression file (relative or absolute)
 * @param repoRoot - Repository root directory for resolving relative paths
 * @param policySuppressionPath - Optional policy-specified suppression path
 * @returns Loaded suppression file object or undefined if not found
 */
export function loadSuppressions(
  suppressionPath: string | undefined,
  repoRoot: string,
  policySuppressionPath?: string
): SuppressionFile | undefined {
  // Determine which path to use (policy overrides default)
  const filePath = policySuppressionPath ?? suppressionPath ?? DEFAULT_SUPPRESSION_FILE;

  // Resolve to absolute path
  const absolutePath = path.resolve(repoRoot, filePath);

  // Check if file exists
  if (!existsSync(absolutePath)) {
    return undefined;
  }

  // Read and parse file
  const content = readFileSync(absolutePath, "utf8");
  return parseSuppressionYaml(content);
}

/**
 * Get suppression file path for audit recording
 * @param suppressionPath - Suppression file path option
 * @param repoRoot - Repository root directory
 * @returns Absolute path to suppression file
 */
export function getSuppressionFilePath(
  suppressionPath: string | undefined,
  repoRoot: string
): string {
  const filePath = suppressionPath ?? DEFAULT_SUPPRESSION_FILE;
  return path.resolve(repoRoot, filePath);
}
