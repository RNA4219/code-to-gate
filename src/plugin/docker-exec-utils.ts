/**
 * Docker Execution Utilities
 * Helper functions for executing Docker commands
 */

import { execFile } from "node:child_process";

const DOCKER_PROBE_TIMEOUT_MS = Number(process.env.CTG_DOCKER_PROBE_TIMEOUT_MS ?? "1000");
const DOCKER_STOP_TIMEOUT_MS = Number(process.env.CTG_DOCKER_STOP_TIMEOUT_MS ?? "1500");

/**
 * Execute command with timeout
 */
export async function execDockerCommand(
  cmd: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const [executable, ...args] = cmd;
  if (!executable) {
    throw new Error("Docker command must include an executable");
  }

  return new Promise((resolve) => {
    execFile(
      executable,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          // Check if it's a timeout
          if (error.killed) {
            resolve({
              stdout,
              stderr: stderr + "\nProcess killed due to timeout",
              exitCode: 137, // SIGKILL
            });
          } else {
            resolve({
              stdout,
              stderr,
              exitCode: typeof error.code === "number" ? error.code : 1,
            });
          }
        } else {
          resolve({
            stdout,
            stderr,
            exitCode: 0,
          });
        }
      }
    );
  });
}

/**
 * Pull Docker image from registry
 */
export async function pullDockerImage(imageName: string): Promise<boolean> {
  try {
    const result = await execDockerCommand(["docker", "pull", imageName], 120000);
    return result.exitCode === 0;
  } catch (e) {
    console.error(`[container-utils] Failed to pull Docker image ${imageName}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/**
 * List running plugin containers
 */
export async function listRunningPluginContainers(prefix: string): Promise<string[]> {
  try {
    const result = await execDockerCommand(
      ["docker", "ps", "-q", "--filter", `name=${prefix}`],
      DOCKER_PROBE_TIMEOUT_MS
    );

    return result.stdout.trim().split("\n").filter(id => id.length > 0);
  } catch (e) {
    console.error(`[container-utils] Failed to list containers with prefix ${prefix}: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

/**
 * Get container logs
 */
export async function getContainerLogs(containerId: string): Promise<string> {
  try {
    const result = await execDockerCommand(["docker", "logs", containerId], DOCKER_PROBE_TIMEOUT_MS);
    return result.stdout;
  } catch (e) {
    console.error(`[container-utils] Failed to get logs for container ${containerId}: ${e instanceof Error ? e.message : String(e)}`);
    return "";
  }
}

/**
 * Stop and remove container
 */
export async function stopAndRemoveContainer(containerId: string): Promise<boolean> {
  try {
    const stopResult = await execDockerCommand(["docker", "stop", containerId], DOCKER_STOP_TIMEOUT_MS);
    const removeResult = await execDockerCommand(["docker", "rm", containerId], DOCKER_PROBE_TIMEOUT_MS);

    if (isNoSuchContainer(stopResult.stderr) && isNoSuchContainer(removeResult.stderr)) {
      return false;
    }

    return removeResult.exitCode === 0;
  } catch (e) {
    console.error(`[container-utils] Failed to stop/remove container ${containerId}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

function isNoSuchContainer(stderr: string): boolean {
  return /No such container/i.test(stderr);
}

/**
 * Check Docker version
 */
export async function checkDockerVersion(): Promise<{ available: boolean; version?: string }> {
  try {
    const result = await execDockerCommand(["docker", "--version"], DOCKER_PROBE_TIMEOUT_MS);
    if (result.exitCode === 0) {
      return { available: true, version: result.stdout.trim() };
    }
    return { available: false };
  } catch {
    return { available: false };
  }
}

/**
 * Check if Docker image exists
 */
export async function checkDockerImageExists(imageName: string): Promise<boolean> {
  try {
    const result = await execDockerCommand(["docker", "image", "inspect", imageName], DOCKER_PROBE_TIMEOUT_MS);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get Docker system memory info
 */
export async function getDockerSystemMemory(): Promise<number | undefined> {
  try {
    const result = await execDockerCommand(
      ["docker", "info", "--format", "{{.MemTotal}}"],
      DOCKER_PROBE_TIMEOUT_MS
    );
    if (result.exitCode === 0) {
      const memTotal = parseInt(result.stdout.trim(), 10);
      if (!isNaN(memTotal)) {
        return Math.floor(memTotal / (1024 * 1024));
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build Docker image from directory
 */
export async function buildDockerImage(imageName: string, dockerfileDir: string): Promise<boolean> {
  try {
    const result = await execDockerCommand(
      ["docker", "build", "-t", imageName, dockerfileDir],
      60000
    );
    return result.exitCode === 0;
  } catch (e) {
    console.error(`[container-utils] Failed to build Docker image ${imageName}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}
