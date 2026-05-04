/**
 * Docker Command Builder
 * Builds Docker run commands for plugin execution
 */

import type { PluginManifest } from "./types.js";
import type { SandboxConfig } from "./sandbox-config.js";
import {
  toDockerResourceLimits,
  getDockerSecurityOptions,
  buildDockerSecurityFlags,
  toDockerVolumeFlags,
  filterEnvVars,
  DEFAULT_ENV_VAR_FILTER,
  type VolumeMount,
} from "./sandbox-config.js";
import * as path from "path";

/**
 * Build Docker run command for plugin execution
 */
export function buildDockerRunCommand(
  manifest: PluginManifest,
  config: SandboxConfig,
  containerName: string,
  mounts: VolumeMount[],
  _inputFile: string,
  _outputFile: string
): string[] {
  const cmd: string[] = ["docker", "run", "--rm"];

  // Container name
  cmd.push("--name", containerName);

  // Network isolation (unless explicitly allowed)
  if (!config.networkAccess) {
    cmd.push("--network=none");
  }

  // Memory limit
  const resources = toDockerResourceLimits(config);
  cmd.push(`--memory=${resources.memoryBytes}`);
  cmd.push(`--memory-swap=${resources.memoryBytes}`); // Disable swap

  // CPU limit
  cmd.push(`--cpu-quota=${resources.cpuQuota}`);
  cmd.push("--cpu-period=100000");

  // PIDs limit
  cmd.push(`--pids-limit=${resources.pidsLimit}`);

  // Security options
  const securityOptions = getDockerSecurityOptions(config);
  cmd.push(...buildDockerSecurityFlags(securityOptions));

  // Volume mounts
  cmd.push(...toDockerVolumeFlags(mounts));

  // User
  cmd.push("--user", config.containerUser);

  // Working directory
  cmd.push("--workdir", config.containerWorkDir);

  // Environment variables (filtered)
  const filteredEnv = filterEnvVars(manifest.entry.env ?? {}, DEFAULT_ENV_VAR_FILTER);
  for (const [key, value] of Object.entries(filteredEnv)) {
    cmd.push("-e", `${key}=${value}`);
  }

  // Pass input/output paths as env vars
  cmd.push("-e", `CTG_INPUT_FILE=${config.ioMountPath}/input.json`);
  cmd.push("-e", `CTG_OUTPUT_FILE=${config.ioMountPath}/output.json`);

  // Image
  cmd.push(config.dockerImage);

  // Plugin execution command
  const pluginCmd = buildPluginExecutionCommand(manifest, config);
  cmd.push(...pluginCmd);

  return cmd;
}

/**
 * Build plugin execution command for container
 */
export function buildPluginExecutionCommand(
  manifest: PluginManifest,
  config: SandboxConfig
): string[] {
  // The container entrypoint reads from CTG_INPUT_FILE and writes to CTG_OUTPUT_FILE
  // We need to adapt the plugin's command to work within the container

  const originalCmd = manifest.entry.command;

  // For Node.js plugins, we wrap with a runner script
  if (originalCmd[0] === "node") {
    const scriptPath = originalCmd[1];

    // Map the script path to container mount path
    const containerScriptPath = scriptPath
      ? path.join(config.pluginMountPath, path.basename(scriptPath))
      : config.pluginMountPath;

    return [
      "node",
      containerScriptPath,
      "--input",
      `${config.ioMountPath}/input.json`,
      "--output",
      `${config.ioMountPath}/output.json`,
    ];
  }

  // For other plugins, just use the original command with mapped paths
  return originalCmd.map(arg => {
    if (arg.startsWith("/") || arg.startsWith("./")) {
      return path.join(config.pluginMountPath, path.basename(arg));
    }
    return arg;
  });
}