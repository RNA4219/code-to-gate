/**
 * Sandbox Configuration for Plugin Execution
 * Defines isolation settings for Docker-based plugin sandboxing
 */

import type { PluginManifest } from "./types.js";

/**
 * Sandbox mode options
 */
export type SandboxMode = "none" | "docker" | "process";

/**
 * Sandbox configuration interface
 */
export interface SandboxConfig {
  /** Sandbox mode: none, docker, or process isolation */
  mode: SandboxMode;

  /** Timeout in seconds (default: 60) */
  timeout: number;

  /** Memory limit in MB (default: 512) */
  memoryLimit: number;

  /** CPU limit as fraction (0-1, default: 0.5) */
  cpuLimit: number;

  /** Network access: false by default for security */
  networkAccess: boolean;

  /** Allowed read paths (relative to repo root) */
  allowedReadPaths: string[];

  /** Allowed write paths (relative to work directory) */
  allowedWritePaths: string[];

  /** Environment variables to pass to plugin */
  allowedEnvVars: string[];

  /** Docker image to use for sandbox */
  dockerImage: string;

  /** Container name prefix */
  containerPrefix: string;

  /** Whether to remove container after execution */
  removeContainer: boolean;

  /** User to run as in container (for security) */
  containerUser: string;

  /** Working directory inside container */
  containerWorkDir: string;

  /** Mount point for plugin code */
  pluginMountPath: string;

  /** Mount point for input/output */
  ioMountPath: string;

  /** Maximum file size that can be written (MB) */
  maxFileSizeMB: number;

  /** Maximum captured stdout/result size */
  maxStdoutBytes: number;

  /** Maximum captured stderr size */
  maxStderrBytes: number;

  /** Maximum findings accepted from one plugin execution */
  maxFindings: number;

  /** Maximum evidence records accepted per finding */
  maxEvidencePerFinding: number;

  /** Apply the Node.js Permission Model to Node Process plugins */
  nodePermissionModel: boolean;

  /** Whether to enforce strict security (seccomp, no new privileges) */
  strictSecurity: boolean;

  /** Custom Docker options */
  customDockerOptions?: string[];
}

/**
 * Default sandbox configuration
 */
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  mode: "process",
  timeout: 60,
  memoryLimit: 512,
  cpuLimit: 0.5,
  networkAccess: false,
  allowedReadPaths: ["${repoRoot}"],
  allowedWritePaths: ["${workDir}"],
  allowedEnvVars: [],
  dockerImage: "code-to-gate-plugin-runner:latest",
  containerPrefix: "ctg-plugin-",
  removeContainer: true,
  containerUser: "node",
  containerWorkDir: "/plugin/work",
  pluginMountPath: "/plugin/code",
  ioMountPath: "/plugin/io",
  maxFileSizeMB: 10,
  maxStdoutBytes: 10 * 1024 * 1024,
  maxStderrBytes: 1024 * 1024,
  maxFindings: 1000,
  maxEvidencePerFinding: 10,
  nodePermissionModel: true,
  strictSecurity: true,
};

/**
 * Sandbox resource limits
 */
export interface SandboxResourceLimits {
  /** Memory limit in bytes */
  memoryBytes: number;

  /** CPU quota (microseconds per 100ms period) */
  cpuQuota: number;

  /** Pids limit (maximum number of processes) */
  pidsLimit: number;

  /** File descriptors limit */
  fileDescriptorLimit: number;
}

/**
 * Convert SandboxConfig to Docker resource limits
 */
export function toDockerResourceLimits(config: SandboxConfig): SandboxResourceLimits {
  return {
    memoryBytes: config.memoryLimit * 1024 * 1024,
    cpuQuota: Math.floor(config.cpuLimit * 100000),
    pidsLimit: 100,
    fileDescriptorLimit: 1024,
  };
}

/**
 * Docker security options
 */
export interface DockerSecurityOptions {
  /** Seccomp profile for syscall filtering */
  seccompProfile: string | "unconfined" | "default";

  /** Drop all capabilities by default */
  dropCapabilities: boolean;

  /** Specific capabilities to add (if needed) */
  addCapabilities: string[];

  /** Prevent gaining new privileges */
  noNewPrivileges: boolean;

  /** AppArmor profile */
  appArmorProfile: string | "unconfined";
}

/**
 * Get Docker security options from config
 */
export function getDockerSecurityOptions(config: SandboxConfig): DockerSecurityOptions {
  if (config.strictSecurity) {
    return {
      seccompProfile: "default",
      dropCapabilities: true,
      addCapabilities: [],
      noNewPrivileges: true,
      appArmorProfile: "docker-default",
    };
  }

  return {
    seccompProfile: "default",
    dropCapabilities: false,
    addCapabilities: [],
    noNewPrivileges: false,
    appArmorProfile: "unconfined",
  };
}

/**
 * Build Docker security flags array
 */
export function buildDockerSecurityFlags(options: DockerSecurityOptions): string[] {
  const flags: string[] = [];

  if (options.seccompProfile !== "unconfined") {
    flags.push("--security-opt", `seccomp=${options.seccompProfile}`);
  }

  if (options.dropCapabilities) {
    flags.push("--cap-drop", "ALL");
  }

  for (const cap of options.addCapabilities) {
    flags.push("--cap-add", cap);
  }

  if (options.noNewPrivileges) {
    flags.push("--security-opt", "no-new-privileges=true");
  }

  if (options.appArmorProfile !== "unconfined") {
    flags.push("--security-opt", `apparmor=${options.appArmorProfile}`);
  }

  return flags;
}

/**
 * Volume mount specification
 */
export interface VolumeMount {
  /** Host path */
  hostPath: string;

  /** Container path */
  containerPath: string;

  /** Mount mode: ro (read-only) or rw (read-write) */
  mode: "ro" | "rw";

  /** Whether to create host path if it doesn't exist */
  createIfMissing: boolean;
}

/**
 * Build volume mounts from config
 */
export function buildVolumeMounts(
  config: SandboxConfig,
  pluginPath: string,
  repoRoot: string,
  workDir: string
): VolumeMount[] {
  const mounts: VolumeMount[] = [];

  // Mount plugin code (read-only)
  mounts.push({
    hostPath: pluginPath,
    containerPath: config.pluginMountPath,
    mode: "ro",
    createIfMissing: false,
  });

  // Mount IO directory for input/output
  mounts.push({
    hostPath: workDir,
    containerPath: config.ioMountPath,
    mode: "rw",
    createIfMissing: true,
  });

  // Mount allowed read paths
  for (const pattern of config.allowedReadPaths) {
    const resolvedPath = pattern
      .replace("${repoRoot}", repoRoot)
      .replace("${workDir}", workDir);

    // Skip if already mounted
    if (resolvedPath === pluginPath || resolvedPath === workDir) {
      continue;
    }

    mounts.push({
      hostPath: resolvedPath,
      containerPath: resolvedPath,
      mode: "ro",
      createIfMissing: false,
    });
  }

  return mounts;
}

/**
 * Convert volume mounts to Docker flags
 */
export function toDockerVolumeFlags(mounts: VolumeMount[]): string[] {
  return mounts.flatMap((mount) => [
    "-v",
    `${mount.hostPath}:${mount.containerPath}:${mount.mode}`,
  ]);
}

/**
 * Environment variable filter configuration
 */
export interface EnvVarFilterConfig {
  /** Environment variables to always pass */
  allowList: string[];

  /** Environment variables to always block */
  blockList: string[];

  /** Patterns for sensitive env vars to block */
  sensitivePatterns: string[];
}

/**
 * Default environment variable filter config
 */
export const DEFAULT_ENV_VAR_FILTER: EnvVarFilterConfig = {
  allowList: [],
  blockList: [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "GITHUB_TOKEN",
    "GITLAB_TOKEN",
    "DOCKER_PASSWORD",
    "NPM_TOKEN",
    "SECRET",
    "PASSWORD",
    "API_KEY",
    "TOKEN",
  ],
  sensitivePatterns: [
    "_KEY",
    "_SECRET",
    "_TOKEN",
    "_PASSWORD",
    "PASSWORD",
    "SECRET",
  ],
};

/**
 * Filter environment variables for sandbox
 */
export function filterEnvVars(
  env: Record<string, string>,
  filterConfig: EnvVarFilterConfig
): Record<string, string> {
  const filtered: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    // Check if explicitly blocked
    if (filterConfig.blockList.includes(key.toUpperCase())) {
      continue;
    }

    // Check if matches sensitive pattern
    const upperKey = key.toUpperCase();
    if (filterConfig.sensitivePatterns.some(pattern => upperKey.includes(pattern))) {
      continue;
    }

    // Check if in allow list (if allow list is specified, only allow those)
    if (filterConfig.allowList.length > 0 && !filterConfig.allowList.includes(key)) {
      continue;
    }

    filtered[key] = value;
  }

  return filtered;
}

/**
 * Create sandbox config from plugin manifest
 */
export function createSandboxConfigFromManifest(
  manifest: PluginManifest,
  baseConfig: SandboxConfig = DEFAULT_SANDBOX_CONFIG
): SandboxConfig {
  const config: SandboxConfig = { ...baseConfig };

  // Apply manifest security settings
  if (manifest.security) {
    if (manifest.security.network !== undefined) {
      config.networkAccess = manifest.security.network;
    }

    if (manifest.security.filesystem?.read) {
      config.allowedReadPaths = manifest.security.filesystem.read;
    }

    if (manifest.security.filesystem?.write) {
      config.allowedWritePaths = manifest.security.filesystem.write;
    }

    if (manifest.security.secrets?.allow) {
      // Add allowed secrets to env var allow list
      config.allowedEnvVars = [...config.allowedEnvVars, ...manifest.security.secrets.allow];
    }
  }

  // Apply manifest timeout
  if (manifest.entry.timeout) {
    config.timeout = manifest.entry.timeout;
  }

  return config;
}

/**
 * Parse sandbox mode from string
 */
export function parseSandboxMode(value: string | undefined): SandboxMode {
  if (!value) {
    return "process";
  }
  if (value === "none" || value === "disabled") {
    return "none";
  }
  if (value === "docker") {
    return "docker";
  }
  if (value === "process") {
    return "process";
  }
  // Invalid values fail toward the policy-gated Process mode.
  return "process";
}

/**
 * Validate sandbox configuration
 */
export function validateSandboxConfig(config: SandboxConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate timeout
  if (config.timeout <= 0 || config.timeout > 60) {
    errors.push("Timeout must be between 1 and 60 seconds");
  }

  if (config.maxStdoutBytes <= 0 || config.maxStdoutBytes > 10 * 1024 * 1024) {
    errors.push("maxStdoutBytes must be between 1 and 10485760");
  }
  if (config.maxStderrBytes <= 0 || config.maxStderrBytes > 1024 * 1024) {
    errors.push("maxStderrBytes must be between 1 and 1048576");
  }
  if (config.maxFindings <= 0 || config.maxFindings > 1000) {
    errors.push("maxFindings must be between 1 and 1000");
  }
  if (config.maxEvidencePerFinding <= 0 || config.maxEvidencePerFinding > 10) {
    errors.push("maxEvidencePerFinding must be between 1 and 10");
  }

  // Validate memory limit
  if (config.memoryLimit <= 0 || config.memoryLimit > 4096) {
    errors.push("Memory limit must be between 1 and 4096 MB");
  }

  // Validate CPU limit
  if (config.cpuLimit <= 0 || config.cpuLimit > 4) {
    errors.push("CPU limit must be between 0.1 and 4 (fraction or multiplier)");
  }

  if (config.mode === "docker" && config.networkAccess) {
    errors.push("Docker sandbox requires networkAccess=false");
  }
  if (config.mode === "docker" && config.strictSecurity === false) {
    errors.push("Docker sandbox requires strictSecurity=true");
  }

  // Validate Docker image
  if (config.mode === "docker" && !config.dockerImage) {
    errors.push("Docker image must be specified for Docker sandbox mode");
  }

  // Validate container user
  if (config.mode === "docker" && !config.containerUser) {
    errors.push("Container user must be specified for Docker sandbox mode");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Sandbox execution result
 */
export interface SandboxExecutionResult {
  /** Execution succeeded */
  success: boolean;

  /** Output from plugin */
  output?: string;

  /** Error message if failed */
  error?: string;

  /** Exit code */
  exitCode: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Container ID (for Docker mode) */
  containerId?: string;

  /** Resource usage stats */
  resourceUsage?: {
    memoryUsedMB: number;
    cpuPercent: number;
    pidsUsed: number;
  };

  /** Security violations detected */
  securityViolations?: string[];
}

/**
 * Sandbox status check result
 */
export interface SandboxStatusCheck {
  /** Docker is available */
  dockerAvailable: boolean;

  /** Docker version */
  dockerVersion?: string;

  /** Required image exists */
  imageExists: boolean;

  /** Available memory for containers */
  availableMemoryMB?: number;

  /** Error messages */
  errors: string[];
}
