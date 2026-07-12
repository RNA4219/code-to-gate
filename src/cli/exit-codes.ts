/**
 * Centralized exit codes for CLI commands
 */

import { createRequire } from "module";
import { getOption } from "../core/config-utils.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json");

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
  ASSURANCE_FAILED: number;
  PARTIAL_SUCCESS: number;
  EXECUTION_TIMEOUT: number;
  RETRY_EXHAUSTED: number;
  RESUME_CONFLICT: number;
  PROTOCOL_UNSUPPORTED: number;
  RUN_BUSY: number;
  EXECUTION_CANCELLED: number;
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
  ASSURANCE_FAILED: 11,
  PARTIAL_SUCCESS: 12,
  EXECUTION_TIMEOUT: 13,
  RETRY_EXHAUSTED: 14,
  RESUME_CONFLICT: 15,
  PROTOCOL_UNSUPPORTED: 16,
  RUN_BUSY: 17,
  EXECUTION_CANCELLED: 18,
};

export { getOption };

export const VERSION = pkg.version;

export type CacheMode = "enabled" | "disabled" | "force";

export function parseCacheMode(value: string | undefined): CacheMode {
  if (!value || value === "enabled") return "enabled";
  if (value === "disabled") return "disabled";
  if (value === "force") return "force";
  return "enabled";
}

export function parseParallelWorkers(value: string | undefined): number {
  if (!value) return 4;
  const num = parseInt(value, 10);
  if (isNaN(num) || num < 1) return 4;
  return Math.min(num, 16);
}

export function isVerbose(args: string[]): boolean {
  return args.includes("--verbose") || args.includes("-v");
}

export type SandboxModeCli = "none" | "docker";

export function parseSandboxModeCli(value: string | undefined): SandboxModeCli {
  if (!value || value === "none" || value === "disabled") return "none";
  if (value === "docker") return "docker";
  return "none";
}
