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
import { execDockerCommand, checkDockerVersion, checkDockerImageExists, getDockerSystemMemory, buildDockerImage as buildDockerImageUtil } from "./docker-exec-utils.js";
import { generateDockerfile, generatePluginRunnerScript } from "./docker-templates.js";
import { buildDockerRunCommand, buildPluginExecutionCommand } from "./docker-command-builder.js";
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
    const dockerCmd = buildDockerRunCommand(
      manifest,
      config,
      containerName,
      mounts,
      inputFile,
      outputFile
    );

    this.logger.debug(`Docker command: ${dockerCmd.join(" ")}`);

    try {
      const result = await execDockerCommand(dockerCmd, config.timeout * 1000);

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
   * Check Docker status
   */
  async checkDockerStatus(): Promise<SandboxStatusCheck> {
    const errors: string[] = [];

    try {
      // Check if Docker is installed and running
      const dockerCheck = await checkDockerVersion();
      if (!dockerCheck.available) {
        errors.push("Docker is not installed or not running");
        return { dockerAvailable: false, imageExists: false, errors };
      }

      const dockerVersion = dockerCheck.version ?? "";

      // Check if image exists
      const imageExists = await checkDockerImageExists(this.config.dockerImage);

      // Get available memory
      const availableMemoryMB = await getDockerSystemMemory();

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
      await fs.writeFile(dockerfile, generateDockerfile(), "utf-8");

      // Build the image using utility
      const success = await buildDockerImageUtil(this.config.dockerImage, dockerfileDir);

      // Cleanup Dockerfile
      await fs.rm(dockerfileDir, { recursive: true, force: true });

      if (success) {
        this.imageReady = true;
        this.logger.info(`Docker image built successfully: ${this.config.dockerImage}`);
        return true;
      } else {
        this.logger.error(`Failed to build Docker image`);
        return false;
      }
    } catch (error) {
      this.logger.error(`Error building Docker image: ${error instanceof Error ? error.message : "Unknown"}`);
      return false;
    }
  }

  /**
   * Generate plugin runner script for container
   */
  getPluginRunnerScript(): string {
    return generatePluginRunnerScript();
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
      const result = await execDockerCommand(
        ["docker", "ps", "-q", "--filter", `name=${this.config.containerPrefix}`],
        5000
      );

      if (result.stdout.trim()) {
        const containerIds = result.stdout.trim().split("\n");
        for (const id of containerIds) {
          await execDockerCommand(["docker", "stop", id], 10000);
          await execDockerCommand(["docker", "rm", id], 5000);
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
  const check = await checkDockerVersion();
  return check.available;
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

// Re-export utility functions from docker-exec-utils.ts
export { pullDockerImage, listRunningPluginContainers, getContainerLogs, stopAndRemoveContainer } from "./docker-exec-utils.js";