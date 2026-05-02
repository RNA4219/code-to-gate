/**
 * Docker Execution Utilities
 * Helper functions for executing Docker commands
 */

import { exec } from "child_process";

/**
 * Execute command with timeout
 */
export async function execDockerCommand(
  cmd: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`TIMEOUT: Command exceeded ${timeoutMs}ms`));
    }, timeoutMs);

    exec(
      cmd.join(" "),
      { timeout: timeoutMs },
      (error, stdout, stderr) => {
        clearTimeout(timeoutId);

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
              exitCode: error.code ?? 1,
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
      5000
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
    const result = await execDockerCommand(["docker", "logs", containerId], 5000);
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
    await execDockerCommand(["docker", "stop", containerId], 10000);
    await execDockerCommand(["docker", "rm", containerId], 5000);
    return true;
  } catch (e) {
    console.error(`[container-utils] Failed to stop/remove container ${containerId}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/**
 * Check Docker version
 */
export async function checkDockerVersion(): Promise<{ available: boolean; version?: string }> {
  try {
    const result = await execDockerCommand(["docker", "--version"], 5000);
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
    const result = await execDockerCommand(["docker", "image", "inspect", imageName], 5000);
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
      ["docker", "system", "info", "--format", "{{.MemTotal}}"],
      5000
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