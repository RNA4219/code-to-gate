import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import type { PluginManifest } from "./types.js";

export const PLUGIN_EXECUTION_POLICY_SCHEMA = "ctg/plugin-execution-policy/v1" as const;
export const DEFAULT_PLUGIN_TIMEOUT_SECONDS = 60;
export const DEFAULT_PLUGIN_STDOUT_BYTES = 10 * 1024 * 1024;
export const DEFAULT_PLUGIN_STDERR_BYTES = 1024 * 1024;
export const DEFAULT_PLUGIN_FINDINGS = 1000;
export const DEFAULT_PLUGIN_EVIDENCE_PER_FINDING = 10;

const MANIFEST_FILES = [
  "plugin-manifest.yaml",
  "plugin-manifest.yml",
  "plugin-manifest.json",
  "manifest.yaml",
  "manifest.yml",
  "manifest.json",
  "ctg-plugin.yaml",
  "ctg-plugin.json",
];

const FORBIDDEN_ENV = new Set([
  "NODE_OPTIONS",
  "NODE_PATH",
  "ELECTRON_RUN_AS_NODE",
]);

export interface TrustedPluginBinding {
  name: string;
  version: string;
  manifest_sha256: `sha256:${string}`;
  entrypoint_sha256: `sha256:${string}`;
}

export interface PluginProcessPolicy {
  allowed_env_vars?: string[];
  timeout_seconds?: number;
  max_stdout_bytes?: number;
  max_stderr_bytes?: number;
  max_findings?: number;
  max_evidence_per_finding?: number;
  node_permission_model?: boolean;
}

export interface PluginExecutionPolicy {
  schema: typeof PLUGIN_EXECUTION_POLICY_SCHEMA;
  trusted_plugins: TrustedPluginBinding[];
  process?: PluginProcessPolicy;
}

export interface VerifiedPluginExecution {
  manifestPath: string;
  entrypointPath: string;
  process: Required<PluginProcessPolicy>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDigest(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function positiveInteger(value: unknown, maximum: number, field: string, errors: string[]): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) <= 0 || (value as number) > maximum) {
    errors.push(field + " must be an integer between 1 and " + maximum);
    return undefined;
  }
  return value as number;
}

function inside(root: string, target: string): boolean {
  const normalizedRoot = process.platform === "win32" ? root.toLowerCase() : root;
  const normalizedTarget = process.platform === "win32" ? target.toLowerCase() : target;
  const relative = path.relative(normalizedRoot, normalizedTarget);
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

function containedFile(pluginRoot: string, candidate: string, label: string): string {
  const realRoot = realpathSync(pluginRoot);
  const requested = path.isAbsolute(candidate) ? candidate : path.resolve(realRoot, candidate);
  if (!existsSync(requested) || !statSync(requested).isFile()) {
    throw new Error(label + " does not identify a file");
  }
  const resolved = realpathSync(requested);
  if (!inside(realRoot, resolved)) {
    throw new Error(label + " escapes the plugin directory");
  }
  return resolved;
}

function sha256File(filePath: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(readFileSync(filePath)).digest("hex")}`;
}

export function locatePluginManifest(pluginRoot: string): string {
  for (const name of MANIFEST_FILES) {
    const candidate = path.join(pluginRoot, name);
    if (existsSync(candidate)) return containedFile(pluginRoot, candidate, "plugin manifest");
  }
  throw new Error("plugin manifest file is missing");
}

export function resolvePluginEntrypoint(pluginRoot: string, manifest: PluginManifest): string {
  const command = manifest.entry.command;
  const executable = path.basename(command[0] ?? "").toLowerCase();
  const entrypoint = executable === "node" || executable === "node.exe"
    ? command[1]
    : command[0];
  if (!entrypoint) {
    throw new Error("plugin entrypoint is missing");
  }
  return containedFile(pluginRoot, entrypoint, "plugin entrypoint");
}

export function validatePluginExecutionPolicy(value: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["policy must be an object"] };
  if (value.schema !== PLUGIN_EXECUTION_POLICY_SCHEMA) {
    errors.push("schema must be " + PLUGIN_EXECUTION_POLICY_SCHEMA);
  }
  if (!Array.isArray(value.trusted_plugins)) {
    errors.push("trusted_plugins must be an array");
  } else {
    const identities = new Set<string>();
    value.trusted_plugins.forEach((entry, index) => {
      if (!isRecord(entry)) {
        errors.push("trusted_plugins[" + index + "] must be an object");
        return;
      }
      if (typeof entry.name !== "string" || entry.name.length === 0) errors.push("trusted plugin name is required");
      if (typeof entry.version !== "string" || entry.version.length === 0) errors.push("trusted plugin version is required");
      if (!isDigest(entry.manifest_sha256)) errors.push("trusted plugin manifest_sha256 is invalid");
      if (!isDigest(entry.entrypoint_sha256)) errors.push("trusted plugin entrypoint_sha256 is invalid");
      const identity = String(entry.name) + "@" + String(entry.version);
      if (identities.has(identity)) errors.push("duplicate trusted plugin identity: " + identity);
      identities.add(identity);
    });
  }

  if (value.process !== undefined) {
    if (!isRecord(value.process)) {
      errors.push("process must be an object");
    } else {
      const processPolicy = value.process;
      positiveInteger(processPolicy.timeout_seconds, DEFAULT_PLUGIN_TIMEOUT_SECONDS, "timeout_seconds", errors);
      positiveInteger(processPolicy.max_stdout_bytes, DEFAULT_PLUGIN_STDOUT_BYTES, "max_stdout_bytes", errors);
      positiveInteger(processPolicy.max_stderr_bytes, DEFAULT_PLUGIN_STDERR_BYTES, "max_stderr_bytes", errors);
      positiveInteger(processPolicy.max_findings, DEFAULT_PLUGIN_FINDINGS, "max_findings", errors);
      positiveInteger(processPolicy.max_evidence_per_finding, DEFAULT_PLUGIN_EVIDENCE_PER_FINDING, "max_evidence_per_finding", errors);
      if (processPolicy.node_permission_model !== undefined && typeof processPolicy.node_permission_model !== "boolean") {
        errors.push("node_permission_model must be boolean");
      }
      if (processPolicy.allowed_env_vars !== undefined) {
        if (!Array.isArray(processPolicy.allowed_env_vars)) {
          errors.push("allowed_env_vars must be an array");
        } else {
          for (const name of processPolicy.allowed_env_vars) {
            if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
              errors.push("allowed_env_vars contains an invalid name");
            } else if (FORBIDDEN_ENV.has(name.toUpperCase())) {
              errors.push("allowed_env_vars contains forbidden variable " + name);
            }
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function loadPluginExecutionPolicy(filePath: string): PluginExecutionPolicy {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      "cannot read plugin execution policy: " + (error instanceof Error ? error.message : String(error)),
      { cause: error }
    );
  }
  const validation = validatePluginExecutionPolicy(value);
  if (!validation.valid) {
    throw new Error("invalid plugin execution policy: " + validation.errors.join("; "));
  }
  return value as PluginExecutionPolicy;
}

export function verifyTrustedPlugin(
  policy: PluginExecutionPolicy,
  pluginRoot: string,
  manifest: PluginManifest
): VerifiedPluginExecution {
  const binding = policy.trusted_plugins.find(
    (entry) => entry.name === manifest.name && entry.version === manifest.version
  );
  if (!binding) {
    throw new Error("plugin is not trusted for Process execution; Docker sandbox is required");
  }

  const manifestPath = locatePluginManifest(pluginRoot);
  const entrypointPath = resolvePluginEntrypoint(pluginRoot, manifest);
  if (sha256File(manifestPath) !== binding.manifest_sha256) {
    throw new Error("trusted plugin manifest digest mismatch");
  }
  if (sha256File(entrypointPath) !== binding.entrypoint_sha256) {
    throw new Error("trusted plugin entrypoint digest mismatch");
  }

  return {
    manifestPath,
    entrypointPath,
    process: {
      allowed_env_vars: [...new Set(policy.process?.allowed_env_vars ?? [])].sort(),
      timeout_seconds: policy.process?.timeout_seconds ?? DEFAULT_PLUGIN_TIMEOUT_SECONDS,
      max_stdout_bytes: policy.process?.max_stdout_bytes ?? DEFAULT_PLUGIN_STDOUT_BYTES,
      max_stderr_bytes: policy.process?.max_stderr_bytes ?? DEFAULT_PLUGIN_STDERR_BYTES,
      max_findings: policy.process?.max_findings ?? DEFAULT_PLUGIN_FINDINGS,
      max_evidence_per_finding: policy.process?.max_evidence_per_finding ?? DEFAULT_PLUGIN_EVIDENCE_PER_FINDING,
      node_permission_model: policy.process?.node_permission_model ?? true,
    },
  };
}
