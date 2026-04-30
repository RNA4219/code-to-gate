/**
 * Centralized exit codes for CLI commands
 */

export interface ExitCodes {
  OK: number;
  READINESS_NOT_CLEAR: number;
  USAGE_ERROR: number;
  SCAN_FAILED: number;
  LLM_FAILED: number;
  POLICY_FAILED: number;
  PLUGIN_FAILED: number;
  SCHEMA_FAILED: number;
  IMPORT_FAILED: number;
  INTEGRATION_EXPORT_FAILED: number;
  INTERNAL_ERROR: number;
}

export const EXIT: ExitCodes = {
  OK: 0,
  READINESS_NOT_CLEAR: 1,
  USAGE_ERROR: 2,
  SCAN_FAILED: 3,
  LLM_FAILED: 4,
  POLICY_FAILED: 5,
  PLUGIN_FAILED: 6,
  SCHEMA_FAILED: 7,
  IMPORT_FAILED: 8,
  INTEGRATION_EXPORT_FAILED: 9,
  INTERNAL_ERROR: 10,
};

/**
 * Standard getOption function for CLI argument parsing
 */
export function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/**
 * Standard VERSION constant
 */
export const VERSION = "1.0.0";

/**
 * Cache mode options
 */
export type CacheMode = "enabled" | "disabled" | "force";

/**
 * Parse cache mode from CLI argument
 */
export function parseCacheMode(value: string | undefined): CacheMode {
  if (!value || value === "enabled") {
    return "enabled";
  }
  if (value === "disabled") {
    return "disabled";
  }
  if (value === "force") {
    return "force";
  }
  // Invalid value, default to enabled
  return "enabled";
}

/**
 * Parse parallel workers count from CLI argument
 */
export function parseParallelWorkers(value: string | undefined): number {
  if (!value) {
    return 4; // Default
  }
  const num = parseInt(value, 10);
  if (isNaN(num) || num < 1) {
    return 4;
  }
  return Math.min(num, 16); // Cap at 16 workers
}

/**
 * Check if verbose mode is enabled
 */
export function isVerbose(args: string[]): boolean {
  return args.includes("--verbose") || args.includes("-v");
}

/**
 * Sandbox mode options for plugin execution
 */
export type SandboxModeCli = "none" | "docker";

/**
 * Parse sandbox mode from CLI argument
 */
export function parseSandboxModeCli(value: string | undefined): SandboxModeCli {
  if (!value || value === "none" || value === "disabled") {
    return "none";
  }
  if (value === "docker") {
    return "docker";
  }
  // Invalid value, default to none
  return "none";
}