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
export const VERSION = "0.1.0";