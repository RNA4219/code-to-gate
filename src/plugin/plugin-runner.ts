/**
 * Plugin Runner Implementation
 * Executes plugins via stdin/stdout JSON communication
 * Based on docs/product-spec-v1.md section 16 and docs/plugin-security-contract.md
 */

import type {
  PluginManifest,
  PluginInput,
  PluginOutput,
  PluginExecutionResult,
  PluginExecutionStatus,
  PluginRegistryEntry,
  PluginManagerConfig,
  PluginHook,
  PluginHookCallback,
  PluginExecutionContext,
} from "./types.js";
import type { PluginRunner } from "./contract.js";
import type { SandboxMode, SandboxConfig } from "./sandbox-config.js";
import {
  PLUGIN_INPUT_VERSION,
  PLUGIN_OUTPUT_VERSION,
} from "./types.js";
import { PLUGIN_CONSTANTS } from "./contract.js";
import { PluginSchemaValidatorImpl } from "./plugin-context.js";
import { DefaultPluginLogger } from "./plugin-context.js";
import { DockerSandboxRunner } from "./docker-sandbox.js";
import { DEFAULT_SANDBOX_CONFIG, parseSandboxMode, validateSandboxConfig } from "./sandbox-config.js";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";

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
        const output = await this.spawnPluginProcess(manifest, input, timeout * 1000);

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
   * Spawn and execute plugin process
   */
  private async spawnPluginProcess(
    manifest: PluginManifest,
    input: PluginInput,
    timeoutMs: number
  ): Promise<PluginOutput> {
    const command = manifest.entry.command;
    const env = manifest.entry.env ?? {};

    // Prepare input JSON
    const inputJson = JSON.stringify(input);

    return new Promise<PluginOutput>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`TIMEOUT: Plugin execution exceeded ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const childProcess = spawn(command[0], command.slice(1), {
          cwd: path.dirname(command[0] === "node" ? command[1] ?? "." : command[0]),
          env: {
            ...process.env,
            ...env,
          },
          stdio: ["pipe", "pipe", "pipe"],
        });

        this.runningProcesses.set(manifest.name, childProcess);

        let stdoutData = "";
        let stderrData = "";

        childProcess.stdout?.on("data", (data) => {
          stdoutData += data.toString();
        });

        childProcess.stderr?.on("data", (data) => {
          stderrData += data.toString();
          this.logger.debug("Plugin stderr", { data: data.toString() });
        });

        childProcess.on("error", (error) => {
          clearTimeout(timeoutId);
          this.runningProcesses.delete(manifest.name);
          reject(new Error(`PROCESS_ERROR: ${error.message}`));
        });

        childProcess.on("close", (code) => {
          clearTimeout(timeoutId);
          this.runningProcesses.delete(manifest.name);

          if (code !== 0) {
            reject(new Error(`EXIT_CODE_${code}: Plugin exited with code ${code}. stderr: ${stderrData}`));
            return;
          }

          try {
            const output = JSON.parse(stdoutData) as PluginOutput;

            // Validate version
            if (output.version !== PLUGIN_OUTPUT_VERSION) {
              reject(new Error(`INVALID_VERSION: Expected ${PLUGIN_OUTPUT_VERSION}, got ${output.version}`));
              return;
            }

            resolve(output);
          } catch (parseError) {
            reject(new Error(`PARSE_ERROR: Failed to parse plugin output. stdout: ${stdoutData.slice(0, 500)}`));
          }
        });

        // Write input to stdin
        childProcess.stdin?.write(inputJson);
        childProcess.stdin?.end();

      } catch (spawnError) {
        clearTimeout(timeoutId);
        reject(new Error(`SPAWN_ERROR: ${spawnError instanceof Error ? spawnError.message : "Unknown spawn error"}`));
      }
    });
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
    for (const [name, process] of this.runningProcesses) {
      this.logger.info(`Killing running plugin: ${name}`);
      process.kill("SIGTERM");
    }
    this.runningProcesses.clear();

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

/**
 * Create plugin input from repo graph
 */
export function createPluginInput(
  repoGraph: unknown,
  importedFindings?: unknown,
  config?: Record<string, unknown>,
  policy?: unknown,
  metadata?: { runId?: string; repoRoot?: string; workDir?: string }
): PluginInput {
  return {
    version: PLUGIN_INPUT_VERSION,
    repo_graph: repoGraph,
    imported_findings: importedFindings,
    config,
    policy,
    metadata: {
      run_id: metadata?.runId,
      repo_root: metadata?.repoRoot,
      work_dir: metadata?.workDir,
    },
  };
}

/**
 * Aggregate results from multiple plugin executions
 */
export function aggregatePluginOutputs(results: PluginExecutionResult[]): {
  findings: PluginOutput["findings"];
  riskSeeds: PluginOutput["risk_seeds"];
  invariantSeeds: PluginOutput["invariant_seeds"];
  testSeeds: PluginOutput["test_seeds"];
  diagnostics: PluginOutput["diagnostics"];
  errors: PluginOutput["errors"];
  successCount: number;
  failureCount: number;
} {
  const findings: PluginOutput["findings"] = [];
  const riskSeeds: PluginOutput["risk_seeds"] = [];
  const invariantSeeds: PluginOutput["invariant_seeds"] = [];
  const testSeeds: PluginOutput["test_seeds"] = [];
  const diagnostics: PluginOutput["diagnostics"] = [];
  const errors: PluginOutput["errors"] = [];

  let successCount = 0;
  let failureCount = 0;

  for (const result of results) {
    if (result.status === "success" || result.status === "partial") {
      successCount++;
      if (result.output) {
        if (result.output.findings) findings.push(...result.output.findings);
        if (result.output.risk_seeds) riskSeeds.push(...result.output.risk_seeds);
        if (result.output.invariant_seeds) invariantSeeds.push(...result.output.invariant_seeds);
        if (result.output.test_seeds) testSeeds.push(...result.output.test_seeds);
        if (result.output.diagnostics) diagnostics.push(...result.output.diagnostics);
        if (result.output.errors) errors.push(...result.output.errors);
      }
    } else {
      failureCount++;
      errors.push({
        code: `PLUGIN_${result.status.toUpperCase()}`,
        message: result.error?.message ?? "Unknown error",
        details: result.error?.details,
      });
    }
  }

  return {
    findings,
    riskSeeds,
    invariantSeeds,
    testSeeds,
    diagnostics,
    errors,
    successCount,
    failureCount,
  };
}

/**
 * Check if all plugin executions succeeded
 */
export function allPluginsSucceeded(results: PluginExecutionResult[]): boolean {
  return results.every(r => r.status === "success" || r.status === "partial");
}

/**
 * Get failed plugin executions
 */
export function getFailedPlugins(results: PluginExecutionResult[]): PluginExecutionResult[] {
  return results.filter(r => r.status !== "success" && r.status !== "partial");
}