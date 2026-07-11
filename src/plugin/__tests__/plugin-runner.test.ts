/**
 * Plugin Runner Tests
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  PluginRunnerImpl,
  createPluginRunner,
  createPluginInput,
  aggregatePluginOutputs,
  allPluginsSucceeded,
  getFailedPlugins,
} from "../plugin-runner.js";
import {
  createDefaultManifest,
} from "../plugin-schema.js";
import type {
  PluginRegistryEntry,
  PluginExecutionResult,
  PluginInput,
  PluginOutput,
} from "../types.js";
import { PLUGIN_INPUT_VERSION, PLUGIN_OUTPUT_VERSION } from "../types.js";
import * as fs from "fs/promises";
import * as path from "path";

const TEST_DIR = path.join(process.cwd(), ".test-temp", "plugin-runner-tests");

describe("PluginRunner", () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("createPluginRunner", () => {
    it("should create a plugin runner instance", () => {
      const runner = createPluginRunner();
      expect(runner).toBeDefined();
      expect(runner.initialize).toBeDefined();
      expect(runner.executePlugin).toBeDefined();
      expect(runner.executePlugins).toBeDefined();
      expect(runner.healthCheck).toBeDefined();
    });

    it("preserves the programmatic none default and supports mode switches", () => {
      const runner = new PluginRunnerImpl();
      expect(runner.getSandboxMode()).toBe("none");
      runner.setSandboxMode("docker");
      expect(runner.getSandboxMode()).toBe("docker");
      runner.setSandboxMode("process");
      expect(runner.getSandboxMode()).toBe("process");
      expect(createPluginRunner(undefined)).toBeDefined();
    });

    it("delegates initialize, execute, and shutdown in docker mode", async () => {
      const runner = new PluginRunnerImpl("docker");
      const internal = runner as unknown as {
        dockerRunner: {
          initialize: ReturnType<typeof vi.fn>;
          executePlugin: ReturnType<typeof vi.fn>;
          shutdown: ReturnType<typeof vi.fn>;
        };
      };
      internal.dockerRunner.initialize = vi.fn().mockResolvedValue(undefined);
      internal.dockerRunner.executePlugin = vi.fn().mockResolvedValue({
        pluginId: "docker-plugin@0.1.0",
        pluginName: "docker-plugin",
        status: "success",
        duration: 1,
      });
      internal.dockerRunner.shutdown = vi.fn().mockResolvedValue(undefined);
      const manifest = createDefaultManifest("docker-plugin");
      const entry: PluginRegistryEntry = {
        manifest,
        path: TEST_DIR,
        loaded: true,
        enabled: true,
      };

      await runner.initialize({});
      await expect(runner.executePlugin(entry, createPluginInput({ files: [] })))
        .resolves.toMatchObject({ status: "success" });
      await runner.shutdown();
      expect(internal.dockerRunner.initialize).toHaveBeenCalledOnce();
      expect(internal.dockerRunner.executePlugin).toHaveBeenCalledOnce();
      expect(internal.dockerRunner.shutdown).toHaveBeenCalledOnce();
    });
  });

  describe("initialize", () => {
    it("should initialize with default config", async () => {
      const runner = new PluginRunnerImpl();
      await runner.initialize({});
      // No errors means success
      expect(true).toBe(true);
    });

    it("should initialize with custom config", async () => {
      const runner = new PluginRunnerImpl();
      await runner.initialize({
        timeout: 30,
        retry: 2,
        parallel: true,
        maxConcurrent: 8,
        workDir: TEST_DIR,
      });
      // No errors means success
      expect(true).toBe(true);
    });
  });

  describe("registerHook", () => {
    it("should register and unregister hooks", () => {
      const runner = new PluginRunnerImpl();
      const callback = vi.fn();

      runner.registerHook("before_execute", callback);
      runner.unregisterHook("before_execute", callback);

      // Hook registered and unregistered successfully
      expect(true).toBe(true);
    });

    it("runs hooks and isolates hook callback failures", async () => {
      const runner = new PluginRunnerImpl();
      await runner.initialize({ workDir: TEST_DIR, validateOutput: false });
      const pluginDir = path.join(TEST_DIR, "hook-plugin");
      await fs.mkdir(pluginDir, { recursive: true });
      const scriptPath = path.join(pluginDir, "index.js");
      await fs.writeFile(
        scriptPath,
        `console.log(JSON.stringify({ version: "${PLUGIN_OUTPUT_VERSION}", findings: [] }));`
      );
      const manifest = createDefaultManifest("hook-plugin");
      manifest.entry.command = ["node", scriptPath];
      const entry: PluginRegistryEntry = {
        manifest,
        path: pluginDir,
        loaded: true,
        enabled: true,
      };
      const before = vi.fn();
      const failing = vi.fn().mockRejectedValue(new Error("hook failed"));
      const after = vi.fn();
      runner.registerHook("before_execute", before);
      runner.registerHook("before_execute", failing);
      runner.registerHook("after_execute", after);

      await expect(runner.executePlugin(entry, createPluginInput({ files: [] })))
        .resolves.toMatchObject({ status: "success" });
      expect(before).toHaveBeenCalledOnce();
      expect(failing).toHaveBeenCalledOnce();
      expect(after).toHaveBeenCalledOnce();
      runner.unregisterHook("before_execute", before);
      runner.unregisterHook("on_error", before);
      await runner.shutdown();
    });
  });

  describe("setTimeout", () => {
    it("should set timeout for specific plugin", () => {
      const runner = new PluginRunnerImpl();
      runner.setTimeout("test-plugin", 30000);
      // Timeout set successfully
      expect(true).toBe(true);
    });
  });

  describe("healthCheck", () => {
    it("should return healthy for valid plugin", async () => {
      const runner = new PluginRunnerImpl();
      await runner.initialize({ workDir: TEST_DIR });

      // Create a valid plugin script
      const pluginDir = path.join(TEST_DIR, "health-plugin");
      await fs.mkdir(pluginDir, { recursive: true });
      const scriptPath = path.join(pluginDir, "index.js");

      await fs.writeFile(scriptPath, `
import { readFileSync } from 'fs';
const input = JSON.parse(readFileSync(0, 'utf-8'));
const output = {
  version: "${PLUGIN_OUTPUT_VERSION}",
  findings: []
};
console.log(JSON.stringify(output));
`);

      const manifest = createDefaultManifest("health-plugin");
      manifest.entry.command = ["node", scriptPath];

      const entry: PluginRegistryEntry = {
        manifest,
        path: pluginDir,
        loaded: true,
        enabled: true,
      };

      const result = await runner.healthCheck(entry);

      expect(result.healthy).toBe(true);
      expect(result.issues).toBeUndefined();
    });

    it("should return issues for plugin with missing command", async () => {
      const runner = new PluginRunnerImpl();
      await runner.initialize({ workDir: TEST_DIR });

      const manifest = createDefaultManifest("invalid-plugin");
      manifest.entry.command = [];

      const entry: PluginRegistryEntry = {
        manifest,
        path: TEST_DIR,
        loaded: true,
        enabled: true,
      };

      const result = await runner.healthCheck(entry);

      expect(result.healthy).toBe(false);
      expect(result.issues).toBeDefined();
      expect(result.issues?.some(i => i.includes("command"))).toBe(true);
    });

    it("should return issues for plugin with empty capabilities", async () => {
      const runner = new PluginRunnerImpl();
      await runner.initialize({ workDir: TEST_DIR });

      const manifest = createDefaultManifest("no-cap-plugin");
      manifest.capabilities = [];

      const entry: PluginRegistryEntry = {
        manifest,
        path: TEST_DIR,
        loaded: true,
        enabled: true,
      };

      const result = await runner.healthCheck(entry);

      expect(result.healthy).toBe(false);
      expect(result.issues?.some(i => i.includes("capabilities"))).toBe(true);
    });

    it("reports inaccessible scripts and previous failed/timeout executions", async () => {
      const runner = new PluginRunnerImpl();
      const manifest = createDefaultManifest("unhealthy-plugin");
      manifest.entry.command = ["node", path.join(TEST_DIR, "missing.js")];
      const failedEntry: PluginRegistryEntry = {
        manifest,
        path: TEST_DIR,
        loaded: true,
        enabled: true,
        lastExecution: {
          pluginId: "unhealthy-plugin@0.1.0",
          pluginName: "unhealthy-plugin",
          status: "failed",
          error: { code: "FAILED", message: "previous failure" },
          duration: 1,
        },
      };
      const failed = await runner.healthCheck(failedEntry);
      expect(failed.issues).toEqual(expect.arrayContaining([
        expect.stringContaining("not accessible"),
        "Last execution failed: previous failure",
      ]));

      failedEntry.lastExecution = {
        ...failedEntry.lastExecution,
        status: "timeout",
      };
      const timeout = await runner.healthCheck(failedEntry);
      expect(timeout.issues).toContain("Last execution timed out");
    });
  });

  describe("executePlugins", () => {
    it("uses bounded batches in parallel mode and supports sequential mode", async () => {
      const entries = ["one", "two", "three"].map((name) => ({
        manifest: createDefaultManifest(name),
        path: TEST_DIR,
        loaded: true,
        enabled: true,
      }));
      const input = createPluginInput({ files: [] });
      const parallel = new PluginRunnerImpl();
      await parallel.initialize({ parallel: true, maxConcurrent: 2 });
      vi.spyOn(parallel, "executePlugin").mockImplementation(async (item) => ({
        pluginId: `${item.manifest.name}@${item.manifest.version}`,
        pluginName: item.manifest.name,
        status: "success",
        duration: 1,
      }));
      await expect(parallel.executePlugins(entries, input)).resolves.toHaveLength(3);

      const sequential = new PluginRunnerImpl();
      await sequential.initialize({ parallel: false });
      vi.spyOn(sequential, "executePlugin").mockImplementation(async (item) => ({
        pluginId: `${item.manifest.name}@${item.manifest.version}`,
        pluginName: item.manifest.name,
        status: "success",
        duration: 1,
      }));
      await expect(sequential.executePlugins(entries, input)).resolves.toHaveLength(3);
    });
  });

  describe("shutdown", () => {
    it("should shutdown gracefully", async () => {
      const runner = new PluginRunnerImpl();
      await runner.initialize({});
      await runner.shutdown();
      // Shutdown completed
      expect(true).toBe(true);
    });
  });
});

describe("createPluginInput", () => {
  it("should create valid plugin input", () => {
    const repoGraph = { version: "ctg/v1", files: [] };
    const input = createPluginInput(repoGraph);

    expect(input.version).toBe(PLUGIN_INPUT_VERSION);
    expect(input.repo_graph).toEqual(repoGraph);
  });

  it("should create input with all optional fields", () => {
    const repoGraph = { version: "ctg/v1" };
    const importedFindings = { findings: [] };
    const config = { custom: true };
    const policy = { blocking: {} };
    const metadata = { runId: "test-run", repoRoot: "/repo", workDir: "/work" };

    const input = createPluginInput(repoGraph, importedFindings, config, policy, metadata);

    expect(input.version).toBe(PLUGIN_INPUT_VERSION);
    expect(input.repo_graph).toEqual(repoGraph);
    expect(input.imported_findings).toEqual(importedFindings);
    expect(input.config).toEqual(config);
    expect(input.policy).toEqual(policy);
    expect(input.metadata?.run_id).toBe("test-run");
    expect(input.metadata?.repo_root).toBe("/repo");
    expect(input.metadata?.work_dir).toBe("/work");
  });
});

describe("aggregatePluginOutputs", () => {
  it("should aggregate successful outputs", () => {
    const output1: PluginOutput = {
      version: PLUGIN_OUTPUT_VERSION,
      findings: [{ id: "f1", ruleId: "R1", category: "auth", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [] }],
      diagnostics: [{ id: "d1", severity: "info", code: "C1", message: "M1" }],
    };

    const output2: PluginOutput = {
      version: PLUGIN_OUTPUT_VERSION,
      findings: [{ id: "f2", ruleId: "R2", category: "data", severity: "medium", confidence: 0.6, title: "T2", summary: "S2", evidence: [] }],
      risk_seeds: [{ id: "r1", title: "Risk", severity: "high", likelihood: "medium", impact: [], confidence: 0.7, sourceFindingIds: [], evidence: [], recommendedActions: [] }],
    };

    const results: PluginExecutionResult[] = [
      { pluginId: "p1", pluginName: "plugin1", status: "success", output: output1, duration: 100 },
      { pluginId: "p2", pluginName: "plugin2", status: "success", output: output2, duration: 200 },
    ];

    const aggregated = aggregatePluginOutputs(results);

    expect(aggregated.successCount).toBe(2);
    expect(aggregated.failureCount).toBe(0);
    expect(aggregated.findings.length).toBe(2);
    expect(aggregated.riskSeeds?.length).toBe(1);
    expect(aggregated.diagnostics?.length).toBe(1);
  });

  it("should handle failed plugins", () => {
    const results: PluginExecutionResult[] = [
      { pluginId: "p1", pluginName: "plugin1", status: "failed", error: { code: "ERR", message: "Failed" }, duration: 100 },
      { pluginId: "p2", pluginName: "plugin2", status: "timeout", error: { code: "TIMEOUT", message: "Timeout" }, duration: 60000 },
    ];

    const aggregated = aggregatePluginOutputs(results);

    expect(aggregated.successCount).toBe(0);
    expect(aggregated.failureCount).toBe(2);
    expect(aggregated.errors?.length).toBe(2);
    expect(aggregated.findings.length).toBe(0);
  });

  it("should handle partial success", () => {
    const output: PluginOutput = {
      version: PLUGIN_OUTPUT_VERSION,
      findings: [{ id: "f1", ruleId: "R1", category: "auth", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [] }],
      errors: [{ code: "PARTIAL", message: "Partial execution" }],
    };

    const results: PluginExecutionResult[] = [
      { pluginId: "p1", pluginName: "plugin1", status: "partial", output, duration: 100 },
    ];

    const aggregated = aggregatePluginOutputs(results);

    expect(aggregated.successCount).toBe(1);
    expect(aggregated.failureCount).toBe(0);
    expect(aggregated.findings.length).toBe(1);
    expect(aggregated.errors?.length).toBe(1);
  });
});

describe("allPluginsSucceeded", () => {
  it("should return true when all succeeded", () => {
    const results: PluginExecutionResult[] = [
      { pluginId: "p1", pluginName: "p1", status: "success", duration: 100 },
      { pluginId: "p2", pluginName: "p2", status: "partial", duration: 100 },
    ];

    expect(allPluginsSucceeded(results)).toBe(true);
  });

  it("should return false when any failed", () => {
    const results: PluginExecutionResult[] = [
      { pluginId: "p1", pluginName: "p1", status: "success", duration: 100 },
      { pluginId: "p2", pluginName: "p2", status: "failed", error: { code: "ERR", message: "Error" }, duration: 100 },
    ];

    expect(allPluginsSucceeded(results)).toBe(false);
  });
});

describe("getFailedPlugins", () => {
  it("should return only failed plugins", () => {
    const results: PluginExecutionResult[] = [
      { pluginId: "p1", pluginName: "p1", status: "success", duration: 100 },
      { pluginId: "p2", pluginName: "p2", status: "failed", error: { code: "ERR", message: "Error" }, duration: 100 },
      { pluginId: "p3", pluginName: "p3", status: "timeout", error: { code: "TIMEOUT", message: "Timeout" }, duration: 60000 },
    ];

    const failed = getFailedPlugins(results);

    expect(failed.length).toBe(2);
    expect(failed.every(r => r.status !== "success" && r.status !== "partial")).toBe(true);
  });
});

describe("PluginRunner Integration", () => {
  it("validates schema, rejects secret leaks, and accepts partial output", async () => {
    const runner = new PluginRunnerImpl();
    await runner.initialize({
      workDir: TEST_DIR,
      validateOutput: true,
      retry: 0,
      redactionPatterns: ["password"],
    });
    const pluginDir = path.join(TEST_DIR, "validation-branches");
    await fs.mkdir(pluginDir, { recursive: true });
    const scriptPath = path.join(pluginDir, "index.js");
    const manifest = createDefaultManifest("validation-branches");
    manifest.entry.command = ["node", scriptPath];
    manifest.entry.retry = 0;
    const entry: PluginRegistryEntry = {
      manifest,
      path: pluginDir,
      loaded: true,
      enabled: true,
    };
    const input = createPluginInput({ files: [] });

    await fs.writeFile(
      scriptPath,
      `console.log(JSON.stringify({ version: "${PLUGIN_OUTPUT_VERSION}", unexpected: true }));`
    );
    await expect(runner.executePlugin(entry, input)).resolves.toMatchObject({
      status: "invalid_output",
      error: { code: "SCHEMA_INVALID" },
    });

    await fs.writeFile(
      scriptPath,
      `console.log(JSON.stringify({ version: "${PLUGIN_OUTPUT_VERSION}", findings: [], metadata: { note: "PASSWORD=secret" } }));`
    );
    await expect(runner.executePlugin(entry, input)).resolves.toMatchObject({
      status: "failed",
      error: { code: "SECRET_LEAK" },
    });

    await fs.writeFile(
      scriptPath,
      `console.log(JSON.stringify({ version: "${PLUGIN_OUTPUT_VERSION}", findings: [], errors: [{ code: "PARTIAL", message: "partial" }] }));`
    );
    await expect(runner.executePlugin(entry, input)).resolves.toMatchObject({
      status: "partial",
    });
    await runner.shutdown();
  });

  it("should execute a simple echo plugin", async () => {
    const runner = new PluginRunnerImpl();
    await runner.initialize({ workDir: TEST_DIR, validateOutput: false });

    // Create a simple plugin script that echoes valid output
    const pluginDir = path.join(TEST_DIR, "echo-plugin");
    await fs.mkdir(pluginDir, { recursive: true });
    const scriptPath = path.join(pluginDir, "index.js");

    await fs.writeFile(scriptPath, `
import { readFileSync } from 'fs';
// Read from stdin synchronously
const input = JSON.parse(readFileSync(0, 'utf-8'));
const output = {
  version: "${PLUGIN_OUTPUT_VERSION}",
  findings: []
};
console.log(JSON.stringify(output));
`);

    const manifest = createDefaultManifest("echo-plugin");
    manifest.entry.command = ["node", scriptPath];
    manifest.entry.timeout = 10;

    const entry: PluginRegistryEntry = {
      manifest,
      path: pluginDir,
      loaded: true,
      enabled: true,
    };

    const input = createPluginInput({ version: "ctg/v1", files: [] });

    const result = await runner.executePlugin(entry, input);

    expect(result.status).toBe("success");
    expect(result.output).toBeDefined();
    expect(result.output?.version).toBe(PLUGIN_OUTPUT_VERSION);

    await runner.shutdown();
  }, 10000);

  it("should handle plugin timeout", async () => {
    const runner = new PluginRunnerImpl();
    await runner.initialize({ workDir: TEST_DIR, retry: 1 });

    // Create a plugin that would write a sentinel after the timeout if its process survives.
    const pluginDir = path.join(TEST_DIR, "timeout-plugin");
    await fs.mkdir(pluginDir, { recursive: true });
    const scriptPath = path.join(pluginDir, "index.js");
    const sentinelPath = path.join(pluginDir, "survived-timeout.txt");
    await fs.rm(sentinelPath, { force: true });

    await fs.writeFile(scriptPath, `
import { setTimeout as sleep } from 'timers/promises';
import { writeFile } from 'node:fs/promises';
await sleep(10000);
await writeFile(${JSON.stringify(sentinelPath)}, 'process survived timeout');
console.log(JSON.stringify({ version: "${PLUGIN_OUTPUT_VERSION}", findings: [] }));
`);

    const manifest = createDefaultManifest("timeout-plugin");
    manifest.entry.command = ["node", scriptPath];
    manifest.entry.timeout = 1; // 1 second timeout
    manifest.entry.retry = 1;

    const entry: PluginRegistryEntry = {
      manifest,
      path: pluginDir,
      loaded: true,
      enabled: true,
    };

    const input = createPluginInput({ version: "ctg/v1" });

    const result = await runner.executePlugin(entry, input);

    expect(result.status).toBe("timeout");
    expect(result.error?.code).toBe("TIMEOUT");
    expect(result.retryCount).toBe(2);
    const runningProcesses = (
      runner as unknown as { runningProcesses: Map<string, unknown> }
    ).runningProcesses;
    expect(runningProcesses.size).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 9000));
    await expect(fs.access(sentinelPath)).rejects.toThrow();

    await runner.shutdown();
  }, 30000);

  it("should handle invalid output", async () => {
    const runner = new PluginRunnerImpl();
    await runner.initialize({ workDir: TEST_DIR, validateOutput: true, retry: 0 });

    // Create a plugin that returns invalid output
    const pluginDir = path.join(TEST_DIR, "invalid-output-plugin");
    await fs.mkdir(pluginDir, { recursive: true });
    const scriptPath = path.join(pluginDir, "index.js");

    await fs.writeFile(scriptPath, `
import { readFileSync } from 'fs';
const input = JSON.parse(readFileSync(0, 'utf-8'));
console.log(JSON.stringify({ version: "invalid-version", findings: [] }));
`);

    const manifest = createDefaultManifest("invalid-output-plugin");
    manifest.entry.command = ["node", scriptPath];
    manifest.entry.timeout = 10;

    const entry: PluginRegistryEntry = {
      manifest,
      path: pluginDir,
      loaded: true,
      enabled: true,
    };

    const input = createPluginInput({ version: "ctg/v1" });

    const result = await runner.executePlugin(entry, input);

    // The runner will fail due to invalid version parsing error (retries exhausted)
    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("EXECUTION_ERROR");

    await runner.shutdown();
  }, 10000);

  it("should isolate plugin crash without adopting output", async () => {
    const runner = new PluginRunnerImpl();
    await runner.initialize({ workDir: TEST_DIR, retry: 0 });

    const pluginDir = path.join(TEST_DIR, "crash-plugin");
    await fs.mkdir(pluginDir, { recursive: true });
    const scriptPath = path.join(pluginDir, "index.js");

    await fs.writeFile(scriptPath, `
process.stderr.write("intentional crash");
process.exit(42);
`);

    const manifest = createDefaultManifest("crash-plugin");
    manifest.entry.command = ["node", scriptPath];
    manifest.entry.timeout = 10;

    const entry: PluginRegistryEntry = {
      manifest,
      path: pluginDir,
      loaded: true,
      enabled: true,
    };

    const input = createPluginInput({ version: "ctg/v1" });
    const result = await runner.executePlugin(entry, input);

    expect(result.status).toBe("failed");
    expect(result.output).toBeUndefined();
    expect(result.error?.code).toBe("EXECUTION_ERROR");
    expect(result.error?.message).toContain("EXIT_CODE_42");

    await runner.shutdown();
  }, 10000);
});
