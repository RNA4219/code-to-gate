/**
 * Core configuration parsing utilities
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Emit format options for analysis output
 */
export type EmitFormat = "json" | "yaml" | "md" | "mermaid" | "all";

/**
 * Parse the --emit command line option
 * @param value - Option value string (e.g., "json,yaml" or "all")
 * @returns Array of emit formats
 */
export function parseEmitOption(value: string | undefined): EmitFormat[] {
  if (!value || value === "all") {
    return ["json", "yaml", "md", "mermaid"];
  }

  const formats = value.split(",").map((f) => f.trim() as EmitFormat);
  return formats.filter((f) =>
    ["json", "yaml", "md", "mermaid", "all"].includes(f)
  );
}

/**
 * Simple YAML content parser for basic policy files
 * @param content - YAML content string
 * @returns Parsed policy object
 */
export function parseSimpleYaml(content: string): {
  version?: string;
  name?: string;
  description?: string;
  blocking?: {
    severities?: string[];
    categories?: string[];
    rules?: string[];
  };
  readiness?: Record<string, string>;
} {
  const result: ReturnType<typeof parseSimpleYaml> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }

    // Parse simple key: value pairs
    if (line.startsWith("name:")) {
      result.name = line.split(":")[1]?.trim() ?? "";
    }
    if (line.startsWith("version:")) {
      result.version = line.split(":")[1]?.trim() ?? "";
    }
    if (line.startsWith("description:")) {
      result.description = line.split(":")[1]?.trim() ?? "";
    }
  }

  return result;
}

/**
 * Load and parse a policy file
 * @param policyPath - Path to the policy file (relative or absolute)
 * @param cwd - Current working directory for resolving relative paths
 * @returns Parsed policy object or undefined if path is not provided
 */
export function loadPolicy(
  policyPath: string | undefined,
  cwd: string
): {
  version: string;
  name: string;
  description?: string;
  blocking?: {
    severities?: string[];
    categories?: string[];
    rules?: string[];
  };
  readiness?: Record<string, string>;
} | undefined {
  if (!policyPath) return undefined;

  const absolutePath = path.resolve(cwd, policyPath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Policy file not found: ${policyPath}`);
  }

  const content = readFileSync(absolutePath, "utf8");
  const parsed = parseSimpleYaml(content);

  return {
    version: parsed.version ?? "ctg/v1",
    name: parsed.name ?? "unknown",
    description: parsed.description,
    blocking: parsed.blocking,
    readiness: parsed.readiness,
  };
}

/**
 * Get a command line option value
 * @param args - Array of command line arguments
 * @param name - Option name (e.g., "--out")
 * @returns Option value or undefined if not present
 */
export function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/**
 * Check if a command line flag is present
 * @param args - Array of command line arguments
 * @param name - Flag name (e.g., "--verbose")
 * @returns True if the flag is present
 */
export function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

/**
 * Validate that required arguments are present
 * @param args - Array of command line arguments
 * @param required - Array of required argument names
 * @returns Object with validation result and missing arguments
 */
export function validateRequiredArgs(
  args: string[],
  required: string[]
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const name of required) {
    if (!args.includes(name) || !getOption(args, name)) {
      missing.push(name);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Generate a unique run ID from timestamp
 * @param timestamp - ISO timestamp string
 * @returns Run ID string (e.g., "ctg-202604301234")
 */
export function generateRunId(timestamp: string): string {
  return `ctg-${timestamp.replace(/[-:.TZ]/g, "").slice(0, 12)}`;
}

/**
 * Parse JSON file safely
 * @param filePath - Path to the JSON file
 * @returns Parsed JSON object or undefined on error
 */
export function parseJsonFile(filePath: string): unknown | undefined {
  try {
    const content = readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (e) {
    console.error(`[config-utils] Failed to parse JSON file ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

/**
 * Check if a severity level is valid
 * @param severity - Severity string to check
 * @returns True if severity is a valid value
 */
export function isValidSeverity(severity: string): boolean {
  return ["low", "medium", "high", "critical"].includes(severity);
}

/**
 * Check if a finding category is valid
 * @param category - Category string to check
 * @returns True if category is a valid value
 */
export function isValidCategory(category: string): boolean {
  const validCategories = [
    "auth",
    "payment",
    "validation",
    "data",
    "config",
    "maintainability",
    "testing",
    "compatibility",
    "release-risk",
  ];
  return validCategories.includes(category);
}