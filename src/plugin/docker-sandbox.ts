/**
 * Docker Sandbox Implementation for Plugin Execution
 * Executes plugins in isolated Docker containers for security
 */

import type {
  PluginManifest,
  PluginInput,
  PluginOutput,
  PluginExecutionResult,
  PluginRegistryEntry,
} from "./types.js";
import { PLUGIN_OUTPUT_VERSION } from "./types.js";
import type { PluginRunner } from "./contract.js";
import {
  type SandboxConfig,
  type SandboxExecutionResult,
  type SandboxStatusCheck,
  DEFAULT_SANDBOX_CONFIG,
  toDockerResourceLimits,
  getDockerSecurityOptions,
  buildDockerSecurityFlags,
  buildVolumeMounts,
  toDockerVolumeFlags,
  filterEnvVars,
  createSandboxConfigFromManifest,
  validateSandboxConfig,
  DEFAULT_ENV_VAR_FILTER,
} from "./sandbox-config.js";
import { DefaultPluginLogger } from "./plugin-context.js";
import { exec } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";

/**
 * Docker Sandbox Runner
 * Executes plugins in isolated Docker containers
 */
export class DockerSandboxRunner implements PluginRunner {
  private config: SandboxConfig;
  private logger: DefaultPluginLogger;
  private dockerAvailable: boolean = false;
  private imageReady: boolean = false;

  constructor(config: SandboxConfig = DEFAULT_SANDBOX_CONFIG) {
    this.config = config;
    this.logger = new DefaultPluginLogger("docker-sandbox", "info");
  }

  /**
   * Initialize the Docker sandbox runner
   */
  async initialize(config: Partial<SandboxConfig>): Promise<void> {
    this.config = { ...this.config, ...config };

    // Validate configuration
    const validation = validateSandboxConfig(this.config);
    if (!validation.valid) {
      throw new Error(`Invalid sandbox config: ${validation.errors.join(", ")}`);
    }

    // Check Docker availability
    const status = await this.checkDockerStatus();
    this.dockerAvailable = status.dockerAvailable;
    this.imageReady = status.imageExists;

    if (!this.dockerAvailable) {
      this.logger.warn("Docker not available, sandbox mode may fail");
    }

    if (!this.imageReady && this.dockerAvailable) {
      this.logger.info(`Docker image ${this.config.dockerImage} not found, attempting to build...`);
      await this.buildDockerImage();
    }
  }

  /**
   * Execute a single plugin in Docker sandbox
   */
  async executePlugin(
    entry: PluginRegistryEntry,
    input: PluginInput
  ): Promise<PluginExecutionResult> {
    const manifest = entry.manifest;
    const pluginName = manifest.name;
    const pluginId = `${manifest.name}@${manifest.version}`;
    const startTime = Date.now();

    // Create sandbox config from manifest
    const sandboxConfig = createSandboxConfigFromManifest(manifest, this.config);

    this.logger.info(`Executing plugin in Docker sandbox: ${pluginId}`);

    // Ensure Docker is available
    if (!this.dockerAvailable) {
      return {
        pluginId,
        pluginName,
        status: "failed",
        error: {
          code: "DOCKER_NOT_AVAILABLE",
          message: "Docker is not available on this system",
        },
        duration: Date.now() - startTime,
      };
    }

    // Ensure image exists
    if (!this.imageReady) {
      await this.buildDockerImage();
    }

    // Prepare input/output directory
    const ioDir = path.join(
      os.tmpdir(),
      "ctg-plugin-io",
      `${pluginName}-${Date.now()}`
    );
    await fs.mkdir(ioDir, { recursive: true });

    // Write input to file
    const inputFile = path.join(ioDir, "input.json");
    await fs.writeFile(inputFile, JSON.stringify(input), "utf-8");

    // Create output file path
    const outputFile = path.join(ioDir, "output.json");

    try {
      // Run plugin in Docker container
      const result = await this.runInContainer(
        manifest,
        sandboxConfig,
        entry.path,
        ioDir,
        inputFile,
        outputFile
      );

      if (!result.success) {
        return {
          pluginId,
          pluginName,
          status: result.exitCode === 137 ? "timeout" : "failed",
          error: {
            code: result.exitCode === 137 ? "TIMEOUT" : "CONTAINER_ERROR",
            message: result.error ?? "Container execution failed",
            details: {
              exitCode: result.exitCode,
              containerId: result.containerId,
              securityViolations: result.securityViolations,
            },
          },
          duration: Date.now() - startTime,
        };
      }

      // Read and parse output
      const outputContent = await fs.readFile(outputFile, "utf-8");
      const output = JSON.parse(outputContent) as PluginOutput;

      // Validate output version
      if (output.version !== PLUGIN_OUTPUT_VERSION) {
        return {
          pluginId,
          pluginName,
          status: "invalid_output",
          error: {
            code: "INVALID_VERSION",
            message: `Expected ${PLUGIN_OUTPUT_VERSION}, got ${output.version}`,
          },
          duration: Date.now() - startTime,
        };
      }

      return {
        pluginId,
        pluginName,
        status: output.errors && output.errors.length > 0 ? "partial" : "success",
        output,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        pluginId,
        pluginName,
        status: "failed",
        error: {
          code: "EXECUTION_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        duration: Date.now() - startTime,
      };
    } finally {
      // Cleanup IO directory
      try {
        await fs.rm(ioDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Execute multiple plugins
   */
  async executePlugins(
    entries: PluginRegistryEntry[],
    input: PluginInput
  ): Promise<PluginExecutionResult[]> {
    const results: PluginExecutionResult[] = [];

    // Sequential execution in sandbox mode
    for (const entry of entries) {
      const result = await this.executePlugin(entry, input);
      results.push(result);
    }

    return results;
  }

  /**
   * Run plugin in Docker container
   */
  private async runInContainer(
    manifest: PluginManifest,
    config: SandboxConfig,
    pluginPath: string,
    ioDir: string,
    inputFile: string,
    outputFile: string
  ): Promise<SandboxExecutionResult> {
    const containerName = `${config.containerPrefix}${manifest.name}-${Date.now()}`;
    const startTime = Date.now();

    // Build volume mounts
    const mounts = buildVolumeMounts(
      config,
      pluginPath,
      process.cwd(),
      ioDir
    );

    // Build Docker command
    const dockerCmd = this.buildDockerRunCommand(
      manifest,
      config,
      containerName,
      mounts,
      inputFile,
      outputFile
    );

    this.logger.debug(`Docker command: ${dockerCmd.join(" ")}`);

    try {
      const result = await this.execCommand(dockerCmd, config.timeout * 1000);

      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode,
        durationMs: Date.now() - startTime,
        containerId: containerName,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        exitCode: 1,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Build Docker run command
   */
  private buildDockerRunCommand(
    manifest: PluginManifest,
    config: SandboxConfig,
    containerName: string,
    mounts: ReturnType<typeof buildVolumeMounts>,
    inputFile: string,
    outputFile: string
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
    const pluginCmd = this.buildPluginExecutionCommand(manifest, config);
    cmd.push(...pluginCmd);

    return cmd;
  }

  /**
   * Build plugin execution command for container
   */
  private buildPluginExecutionCommand(
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

  /**
   * Execute command with timeout
   */
  private async execCommand(
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
   * Check Docker status
   */
  async checkDockerStatus(): Promise<SandboxStatusCheck> {
    const errors: string[] = [];

    try {
      // Check if Docker is installed and running
      const dockerVersionResult = await this.execCommand(["docker", "--version"], 5000);

      if (dockerVersionResult.exitCode !== 0) {
        errors.push("Docker is not installed or not running");
        return { dockerAvailable: false, imageExists: false, errors };
      }

      const dockerVersion = dockerVersionResult.stdout.trim();

      // Check if image exists
      const imageCheckResult = await this.execCommand(
        ["docker", "image", "inspect", this.config.dockerImage],
        5000
      );

      const imageExists = imageCheckResult.exitCode === 0;

      // Get available memory
      const systemInfoResult = await this.execCommand(
        ["docker", "system", "info", "--format", "{{.MemTotal}}"],
        5000
      );

      let availableMemoryMB: number | undefined;
      if (systemInfoResult.exitCode === 0) {
        const memTotal = parseInt(systemInfoResult.stdout.trim(), 10);
        if (!isNaN(memTotal)) {
          availableMemoryMB = Math.floor(memTotal / (1024 * 1024));
        }
      }

      return {
        dockerAvailable: true,
        dockerVersion,
        imageExists,
        availableMemoryMB,
        errors,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Failed to check Docker status");
      return { dockerAvailable: false, imageExists: false, errors };
    }
  }

  /**
   * Build Docker image for plugin execution
   */
  async buildDockerImage(): Promise<boolean> {
    this.logger.info(`Building Docker image: ${this.config.dockerImage}`);

    try {
      // Create temporary Dockerfile
      const dockerfileDir = path.join(os.tmpdir(), "ctg-dockerfile");
      await fs.mkdir(dockerfileDir, { recursive: true });

      const dockerfile = path.join(dockerfileDir, "Dockerfile");
      await fs.writeFile(dockerfile, this.generateDockerfile(), "utf-8");

      // Build the image
      const result = await this.execCommand(
        ["docker", "build", "-t", this.config.dockerImage, dockerfileDir],
        60000 // 60 seconds to build
      );

      // Cleanup Dockerfile
      await fs.rm(dockerfileDir, { recursive: true, force: true });

      if (result.exitCode === 0) {
        this.imageReady = true;
        this.logger.info(`Docker image built successfully: ${this.config.dockerImage}`);
        return true;
      } else {
        this.logger.error(`Failed to build Docker image: ${result.stderr}`);
        return false;
      }
    } catch (error) {
      this.logger.error(`Error building Docker image: ${error instanceof Error ? error.message : "Unknown"}`);
      return false;
    }
  }

  /**
   * Generate Dockerfile for minimal Node.js plugin runner
   */
  private generateDockerfile(): string {
    return `# Minimal Node.js plugin runner for code-to-gate
FROM node:20-alpine

# Create non-root user for security
RUN addgroup -S plugin && adduser -S node -G plugin

# Set working directory
WORKDIR /plugin/work

# Copy plugin runner script
COPY plugin-runner.js /usr/local/bin/plugin-runner.js

# Set permissions
RUN chmod 755 /usr/local/bin/plugin-runner.js

# Switch to non-root user
USER node

# Default entrypoint
ENTRYPOINT ["node", "/usr/local/bin/plugin-runner.js"]
`;
  }

  /**
   * Generate plugin runner script for container
   */
  generatePluginRunnerScript(): string {
    return `#!/usr/bin/env node
/**
 * Plugin Runner Script for Docker Container
 * Reads input from CTG_INPUT_FILE, executes plugin, writes output to CTG_OUTPUT_FILE
 */

const fs = require('fs');
const path = require('path');

async function run() {
  const inputFile = process.env.CTG_INPUT_FILE || '/plugin/io/input.json';
  const outputFile = process.env.CTG_OUTPUT_FILE || '/plugin/io/output.json';

  try {
    // Read input
    const input = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

    // Execute plugin (plugin code is mounted at /plugin/code)
    const pluginScript = process.argv[2] || '/plugin/code/index.js';
    const pluginModule = require(pluginScript);

    // Call plugin execute function
    const output = await pluginModule.execute(input);

    // Write output
    fs.writeFileSync(outputFile, JSON.stringify(output), 'utf-8');

    process.exit(0);
  } catch (error) {
    console.error('Plugin execution failed:', error.message);
    process.exit(1);
  }
}

run();
`;
  }

  /**
   * Register hook callback (not used in Docker sandbox)
   */
  registerHook(): void {
    // Hooks not supported in Docker sandbox mode
    this.logger.warn("Hooks are not supported in Docker sandbox mode");
  }

  /**
   * Unregister hook callback (not used in Docker sandbox)
   */
  unregisterHook(): void {
    // Hooks not supported in Docker sandbox mode
  }

  /**
   * Set timeout for execution
   */
  setTimeout(_pluginName: string, timeoutMs: number): void {
    this.config.timeout = timeoutMs / 1000;
  }

  /**
   * Check if plugin is healthy
   */
  async healthCheck(entry: PluginRegistryEntry): Promise<{
    healthy: boolean;
    issues?: string[];
  }> {
    const issues: string[] = [];

    // Check Docker availability
    if (!this.dockerAvailable) {
      issues.push("Docker is not available");
    }

    // Check image availability
    if (!this.imageReady) {
      issues.push(`Docker image ${this.config.dockerImage} not ready`);
    }

    // Check manifest validity
    const manifest = entry.manifest;
    if (!manifest.entry.command || manifest.entry.command.length === 0) {
      issues.push("Missing or invalid entry command");
    }

    // Check if network access is requested but not allowed
    if (manifest.security?.network && !this.config.networkAccess) {
      issues.push("Plugin requests network access but sandbox denies it");
    }

    return {
      healthy: issues.length === 0,
      issues: issues.length > 0 ? issues : undefined,
    };
  }

  /**
   * Shutdown Docker sandbox runner
   */
  async shutdown(): Promise<void> {
    // Cleanup any running containers
    try {
      const result = await this.execCommand(
        ["docker", "ps", "-q", "--filter", `name=${this.config.containerPrefix}`],
        5000
      );

      if (result.stdout.trim()) {
        const containerIds = result.stdout.trim().split("\n");
        for (const id of containerIds) {
          await this.execCommand(["docker", "stop", id], 10000);
          await this.execCommand(["docker", "rm", id], 5000);
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Create Docker sandbox runner
 */
export function createDockerSandboxRunner(config?: Partial<SandboxConfig>): DockerSandboxRunner {
  const fullConfig = { ...DEFAULT_SANDBOX_CONFIG, ...config };
  return new DockerSandboxRunner(fullConfig);
}

/**
 * Check if Docker sandbox is available
 */
export async function isDockerSandboxAvailable(): Promise<boolean> {
  try {
    const result = await new Promise<{ exitCode: number }>((resolve) => {
      exec("docker --version", { timeout: 5000 }, (error) => {
        resolve({ exitCode: error ? 1 : 0 });
      });
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Create sandbox runner based on mode
 */
export function createSandboxRunner(
  mode: "docker" | "none",
  config?: Partial<SandboxConfig>
): PluginRunner | null {
  if (mode === "docker") {
    return createDockerSandboxRunner(config);
  }
  return null; // Use default runner for 'none' mode
}

/**
 * Pull Docker image from registry
 */
export async function pullDockerImage(imageName: string): Promise<boolean> {
  try {
    const result = await new Promise<{ exitCode: number; stderr: string }>((resolve) => {
      exec(`docker pull ${imageName}`, { timeout: 120000 }, (error, _stdout, stderr) => {
        resolve({
          exitCode: error ? error.code ?? 1 : 0,
          stderr,
        });
      });
    });

    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * List running plugin containers
 */
export async function listRunningPluginContainers(prefix: string): Promise<string[]> {
  try {
    const result = await new Promise<{ stdout: string }>((resolve) => {
      exec(
        `docker ps -q --filter "name=${prefix}"`,
        { timeout: 5000 },
        (_error, stdout) => {
          resolve({ stdout });
        }
      );
    });

    return result.stdout.trim().split("\n").filter(id => id.length > 0);
  } catch {
    return [];
  }
}

/**
 * Get container logs
 */
export async function getContainerLogs(containerId: string): Promise<string> {
  try {
    const result = await new Promise<{ stdout: string }>((resolve) => {
      exec(
        `docker logs ${containerId}`,
        { timeout: 5000 },
        (_error, stdout) => {
          resolve({ stdout });
        }
      );
    });

    return result.stdout;
  } catch {
    return "";
  }
}

/**
 * Stop and remove container
 */
export async function stopAndRemoveContainer(containerId: string): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) => {
      exec(`docker stop ${containerId}`, { timeout: 10000 }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      exec(`docker rm ${containerId}`, { timeout: 5000 }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    return true;
  } catch {
    return false;
  }
}