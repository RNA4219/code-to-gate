/**
 * Plugin Runner Implementation
 * Executes plugins via stdin/stdout JSON communication
 * Based on docs/product-spec-v1.md section 16 and docs/plugin-security-contract.md
 */

import type {
  PluginManifest,
  PluginInput,
  PluginExecutionResult,
  PluginRegistryEntry,
  PluginManagerConfig,
  PluginHook,
  PluginHookCallback,
  PluginExecutionContext,
} from "./types.js";
import type { PluginRunner } from "./contract.js";
import type { SandboxMode, SandboxConfig } from "./sandbox-config.js";
import { PLUGIN_CONSTANTS } from "./contract.js";
import { PluginSchemaValidatorImpl, DefaultPluginLogger } from "./plugin-context.js";
import { DockerSandboxRunner } from "./docker-sandbox.js";
import { DEFAULT_SANDBOX_CONFIG } from "./sandbox-config.js";
import { executePluginProcess, killRunningProcesses } from "./plugin-process-executor.js";
import { ChildProcess } from "child_process";
import * as fs from "fs/promises";

// Re-export utility functions
export {
  createPluginInput,
  aggregatePluginOutputs,
  allPluginsSucceeded,
  getFailedPlugins,
} from "./plugin-runner-utils.js";

/**
 * Default Plugin Runner Implementation
 */
export class PluginRunnerImpl implements PluginRunner {
  private config: PluginManagerConfig;
  private hooks: Map<PluginHook, Set<PluginHookCallback>>;
  private timeoutOverrides: Map<string, number>;
  private runningProcesses: Map<string, ChildProcess>;
  private logger: DefaultPluginLogger;
  private sandboxMode: SandboxMode;
  private sandboxConfig: SandboxConfig;
  private dockerRunner: DockerSandboxRunner | null;

  constructor(sandboxMode: SandboxMode = "none", sandboxConfig: SandboxConfig = DEFAULT_SANDBOX_CONFIG) {
    this.config = {
      timeout: PLUGIN_CONSTANTS.DEFAULT_TIMEOUT,
      retry: PLUGIN_CONSTANTS.DEFAULT_RETRY,
      parallel: false,
      maxConcurrent: 4,
      workDir: "./.qh/plugin-work",
      validateOutput: true,
      redactionPatterns: [...PLUGIN_CONSTANTS.SECRET_PATTERNS],
    };
    this.hooks = new Map();
    this.timeoutOverrides = new Map();
    this.runningProcesses = new Map();
    this.logger = new DefaultPluginLogger("runner", "info");
    this.sandboxMode = sandboxMode;
    this.sandboxConfig = sandboxConfig;
    this.dockerRunner = null;

    // Initialize Docker runner if sandbox mode is docker
    if (sandboxMode === "docker") {
      this.dockerRunner = new DockerSandboxRunner(sandboxConfig);
    }
  }

  /**
   * Get current sandbox mode
   */
  getSandboxMode(): SandboxMode {
    return this.sandboxMode;
  }

  /**
   * Set sandbox mode
   */
  setSandboxMode(mode: SandboxMode): void {
    this.sandboxMode = mode;
    if (mode === "docker" && !this.dockerRunner) {
      this.dockerRunner = new DockerSandboxRunner(this.sandboxConfig);
    } else if (mode !== "docker") {
      this.dockerRunner = null;
    }
  }

  /**
   * Initialize runner with config
   */
  async initialize(config: PluginManagerConfig): Promise<void> {
    this.config = {
      ...this.config,
      ...config,
    };

    // Ensure work directory exists
    if (this.config.workDir) {
      try {
        await fs.mkdir(this.config.workDir, { recursive: true });
      } catch (error) {
        this.logger.error("Failed to create work directory", { error });
      }
    }

    // Initialize Docker runner if sandbox mode is docker
    if (this.sandboxMode === "docker" && this.dockerRunner) {
      await this.dockerRunner.initialize(this.sandboxConfig);
    }
  }

  /**
   * Execute a single plugin
   */
  async executePlugin(
    entry: PluginRegistryEntry,
    input: PluginInput
  ): Promise<PluginExecutionResult> {
    // Use Docker sandbox if sandbox mode is docker
    if (this.sandboxMode === "docker" && this.dockerRunner) {
      this.logger.info(`Executing plugin in Docker sandbox: ${entry.manifest.name}`);
      return this.dockerRunner.executePlugin(entry, input);
    }

    // Otherwise, use regular process execution
    const manifest = entry.manifest;
    const pluginName = manifest.name;
    const pluginId = `${manifest.name}@${manifest.version}`;

    const startTime = Date.now();
    const context = this.createExecutionContext(entry);

    // Run before_execute hook
    await this.runHooks("before_execute", entry, context);

    // Get timeout for this plugin
    const timeout = this.timeoutOverrides.get(pluginName) ??
      manifest.entry.timeout ??
      this.config.timeout ??
      PLUGIN_CONSTANTS.DEFAULT_TIMEOUT;

    const maxRetry = manifest.entry.retry ?? this.config.retry ?? PLUGIN_CONSTANTS.DEFAULT_RETRY;
    let retryCount = 0;
    let result: PluginExecutionResult | null = null;

    while (retryCount <= maxRetry) {
      try {
        this.logger.info(`Executing plugin: ${pluginId}`, { retry: retryCount, timeout });

        // Spawn plugin process
        const inputJson = JSON.stringify(input);
        const output = await executePluginProcess(
          manifest,
          inputJson,
          timeout * 1000,
          this.logger,
          this.runningProcesses
        );

        // Validate output
        if (this.config.validateOutput) {
          const validator = new PluginSchemaValidatorImpl(
            [...(this.config.redactionPatterns ?? PLUGIN_CONSTANTS.SECRET_PATTERNS)],
            this.logger
          );

          const validation = await validator.validateOutput(output, manifest.returns);
          if (!validation.valid) {
            this.logger.warn("Plugin output validation failed", { errors: validation.errors });
            result = {
              pluginId,
              pluginName,
              status: "invalid_output",
              output,
              error: {
                code: "SCHEMA_INVALID",
                message: "Output schema validation failed",
                details: { validationErrors: validation.errors },
              },
              duration: Date.now() - startTime,
              retryCount,
            };
            break;
          }

          // Check for secret leaks
          const leakCheck = await validator.detectSecretLeak(output);
          if (leakCheck.detected) {
            this.logger.error("Secret leak detected in plugin output", { patterns: leakCheck.patterns });
            result = {
              pluginId,
              pluginName,
              status: "failed",
              error: {
                code: "SECRET_LEAK",
                message: "Secret leak detected in output",
                details: { patterns: leakCheck.patterns, locations: leakCheck.locations },
              },
              duration: Date.now() - startTime,
              retryCount,
            };
            break;
          }
        }

        // Success
        result = {
          pluginId,
          pluginName,
          status: output.errors && output.errors.length > 0 ? "partial" : "success",
          output,
          duration: Date.now() - startTime,
          retryCount,
        };
        break;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        if (errorMessage.includes("timeout") || errorMessage.includes("TIMEOUT")) {
          retryCount++;
          if (retryCount <= maxRetry) {
            this.logger.warn(`Plugin timeout, retrying (${retryCount}/${maxRetry})`, { pluginName });
            continue;
          }

          // Run on_timeout hook
          await this.runHooks("on_timeout", entry, context);

          result = {
            pluginId,
            pluginName,
            status: "timeout",
            error: {
              code: "TIMEOUT",
              message: `Plugin execution timed out after ${timeout} seconds`,
            },
            duration: Date.now() - startTime,
            retryCount,
          };
        } else {
          retryCount++;
          if (retryCount <= maxRetry) {
            this.logger.warn(`Plugin failed, retrying (${retryCount}/${maxRetry})`, { pluginName, error: errorMessage });
            continue;
          }

          // Run on_error hook
          await this.runHooks("on_error", entry, context);

          result = {
            pluginId,
            pluginName,
            status: "failed",
            error: {
              code: "EXECUTION_ERROR",
              message: errorMessage,
            },
            duration: Date.now() - startTime,
            retryCount,
          };
        }
        break;
      }
    }

    // Run after_execute hook
    await this.runHooks("after_execute", entry, context);

    return result!;
  }

  /**
   * Execute multiple plugins
   */
  async executePlugins(
    entries: PluginRegistryEntry[],
    input: PluginInput
  ): Promise<PluginExecutionResult[]> {
    if (this.config.parallel) {
      // Parallel execution with concurrency limit
      const results: PluginExecutionResult[] = [];
      const maxConcurrent = this.config.maxConcurrent ?? 4;

      for (let i = 0; i < entries.length; i += maxConcurrent) {
        const batch = entries.slice(i, i + maxConcurrent);
        const batchResults = await Promise.all(
          batch.map(entry => this.executePlugin(entry, input))
        );
        results.push(...batchResults);
      }

      return results;
    } else {
      // Sequential execution
      const results: PluginExecutionResult[] = [];
      for (const entry of entries) {
        const result = await this.executePlugin(entry, input);
        results.push(result);
      }
      return results;
    }
  }

  /**
   * Create execution context
   */
  private createExecutionContext(entry: PluginRegistryEntry): PluginExecutionContext {
    return {
      runId: `plugin-run-${Date.now()}`,
      repoRoot: process.cwd(),
      workDir: this.config.workDir ?? "./.qh/plugin-work",
      startTime: new Date(),
    };
  }

  /**
   * Run hooks for a specific event
   */
  private async runHooks(
    hook: PluginHook,
    plugin: PluginRegistryEntry,
    context: PluginExecutionContext
  ): Promise<void> {
    const callbacks = this.hooks.get(hook);
    if (!callbacks) return;

    for (const callback of callbacks) {
      try {
        await callback(plugin, context);
      } catch (error) {
        this.logger.warn(`Hook callback failed for ${hook}`, { error });
      }
    }
  }

  /**
   * Register hook callback
   */
  registerHook(hook: PluginHook, callback: PluginHookCallback): void {
    if (!this.hooks.has(hook)) {
      this.hooks.set(hook, new Set());
    }
    this.hooks.get(hook)!.add(callback);
  }

  /**
   * Unregister hook callback
   */
  unregisterHook(hook: PluginHook, callback: PluginHookCallback): void {
    const callbacks = this.hooks.get(hook);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  /**
   * Set timeout for execution
   */
  setTimeout(pluginName: string, timeoutMs: number): void {
    this.timeoutOverrides.set(pluginName, timeoutMs / 1000);
  }

  /**
   * Check if plugin is healthy
   */
  async healthCheck(entry: PluginRegistryEntry): Promise<{
    healthy: boolean;
    issues?: string[];
  }> {
    const issues: string[] = [];
    const manifest = entry.manifest;

    // Check if manifest is valid
    if (!manifest.entry.command || manifest.entry.command.length === 0) {
      issues.push("Missing or invalid entry command");
    }

    // Check if command executable exists
    const command = manifest.entry.command[0];
    try {
      // For node scripts, check if the script file exists
      if (command === "node") {
        const scriptPath = manifest.entry.command[1];
        if (scriptPath) {
          await fs.access(scriptPath);
        }
      }
    } catch {
      issues.push(`Command executable not accessible: ${command}`);
    }

    // Check for capability requirements
    if (manifest.capabilities.length === 0) {
      issues.push("No capabilities defined");
    }

    // Check last execution status if available
    if (entry.lastExecution) {
      if (entry.lastExecution.status === "failed") {
        issues.push(`Last execution failed: ${entry.lastExecution.error?.message}`);
      } else if (entry.lastExecution.status === "timeout") {
        issues.push("Last execution timed out");
      }
    }

    return {
      healthy: issues.length === 0,
      issues: issues.length > 0 ? issues : undefined,
    };
  }

  /**
   * Shutdown runner
   */
  async shutdown(): Promise<void> {
    // Kill any running processes
    killRunningProcesses(this.runningProcesses, this.logger);

    // Clear hooks
    this.hooks.clear();

    // Shutdown Docker runner if active
    if (this.dockerRunner) {
      await this.dockerRunner.shutdown();
    }
  }
}

/**
 * Create default plugin runner
 */
export function createPluginRunner(
  sandboxMode?: SandboxMode,
  sandboxConfig?: SandboxConfig
): PluginRunner {
  const mode = sandboxMode ?? "none";
  const config = sandboxConfig ?? DEFAULT_SANDBOX_CONFIG;
  return new PluginRunnerImpl(mode, config);
}