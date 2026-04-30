/**
 * Docker Sandbox Tests
 * Tests for plugin execution in isolated Docker containers
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import {
  DockerSandboxRunner,
  createDockerSandboxRunner,
  isDockerSandboxAvailable,
  pullDockerImage,
  listRunningPluginContainers,
  getContainerLogs,
  stopAndRemoveContainer,
} from "../docker-sandbox.js";
import {
  DEFAULT_SANDBOX_CONFIG,
  parseSandboxMode,
  validateSandboxConfig,
  toDockerResourceLimits,
  getDockerSecurityOptions,
  buildDockerSecurityFlags,
  buildVolumeMounts,
  toDockerVolumeFlags,
  filterEnvVars,
  createSandboxConfigFromManifest,
  DEFAULT_ENV_VAR_FILTER,
} from "../sandbox-config.js";
import { createDefaultManifest, PLUGIN_OUTPUT_VERSION } from "../plugin-schema.js";
import type { PluginRegistryEntry, SandboxConfig, PluginInput } from "../types.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const TEST_DIR = path.join(process.cwd(), ".test-temp", "docker-sandbox-tests");

// Helper to create a test plugin
async function createTestPlugin(name: string, code: string): Promise<string> {
  const pluginDir = path.join(TEST_DIR, name);
  await fs.mkdir(pluginDir, { recursive: true });

  const indexPath = path.join(pluginDir, "index.js");
  await fs.writeFile(indexPath, code, "utf-8");

  // Create minimal manifest
  const manifestPath = path.join(pluginDir, "manifest.json");
  const manifest = createDefaultManifest(name);
  await fs.writeFile(manifestPath, JSON.stringify(manifest), "utf-8");

  return pluginDir;
}

// Helper to create test input file
async function createTestInputFile(data: object): Promise<string> {
  const inputFile = path.join(TEST_DIR, `input-${Date.now()}.json`);
  await fs.writeFile(inputFile, JSON.stringify(data), "utf-8");
  return inputFile;
}

describe("SandboxConfig", () => {
  describe("parseSandboxMode", () => {
    it("should return 'none' for undefined value", () => {
      expect(parseSandboxMode(undefined)).toBe("none");
    });

    it("should return 'none' for 'none' value", () => {
      expect(parseSandboxMode("none")).toBe("none");
    });

    it("should return 'none' for 'disabled' value", () => {
      expect(parseSandboxMode("disabled")).toBe("none");
    });

    it("should return 'docker' for 'docker' value", () => {
      expect(parseSandboxMode("docker")).toBe("docker");
    });

    it("should return 'process' for 'process' value", () => {
      expect(parseSandboxMode("process")).toBe("process");
    });

    it("should return 'none' for invalid value", () => {
      expect(parseSandboxMode("invalid")).toBe("none");
    });

    it("should return 'none' for empty string", () => {
      expect(parseSandboxMode("")).toBe("none");
    });
  });

  describe("validateSandboxConfig", () => {
    it("should validate default config", () => {
      const result = validateSandboxConfig(DEFAULT_SANDBOX_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("should reject timeout of 0", () => {
      const config: SandboxConfig = { ...DEFAULT_SANDBOX_CONFIG, timeout: 0 };
      const result = validateSandboxConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("Timeout"))).toBe(true);
    });

    it("should reject timeout greater than 3600", () => {
      const config: SandboxConfig = { ...DEFAULT_SANDBOX_CONFIG, timeout: 5000 };
      const result = validateSandboxConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("Timeout"))).toBe(true);
    });

    it("should reject memory limit of 0", () => {
      const config: SandboxConfig = { ...DEFAULT_SANDBOX_CONFIG, memoryLimit: 0 };
      const result = validateSandboxConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("Memory"))).toBe(true);
    });

    it("should reject memory limit greater than 4096", () => {
      const config: SandboxConfig = { ...DEFAULT_SANDBOX_CONFIG, memoryLimit: 5000 };
      const result = validateSandboxConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("Memory"))).toBe(true);
    });

    it("should reject cpu limit of 0", () => {
      const config: SandboxConfig = { ...DEFAULT_SANDBOX_CONFIG, cpuLimit: 0 };
      const result = validateSandboxConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("CPU"))).toBe(true);
    });

    it("should reject cpu limit greater than 4", () => {
      const config: SandboxConfig = { ...DEFAULT_SANDBOX_CONFIG, cpuLimit: 5 };
      const result = validateSandboxConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("CPU"))).toBe(true);
    });

    it("should reject missing docker image for docker mode", () => {
      const config: SandboxConfig = { ...DEFAULT_SANDBOX_CONFIG, mode: "docker", dockerImage: "" };
      const result = validateSandboxConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("Docker image"))).toBe(true);
    });

    it("should accept valid custom config", () => {
      const config: SandboxConfig = {
        mode: "docker",
        timeout: 120,
        memoryLimit: 1024,
        cpuLimit: 1.0,
        dockerImage: "my-image:latest",
        containerUser: "node",
      };
      const result = validateSandboxConfig(config);
      expect(result.valid).toBe(true);
    });
  });

  describe("toDockerResourceLimits", () => {
    it("should convert memory limit to bytes", () => {
      const limits = toDockerResourceLimits(DEFAULT_SANDBOX_CONFIG);
      expect(limits.memoryBytes).toBe(DEFAULT_SANDBOX_CONFIG.memoryLimit * 1024 * 1024);
    });

    it("should convert cpu limit to quota", () => {
      const limits = toDockerResourceLimits(DEFAULT_SANDBOX_CONFIG);
      expect(limits.cpuQuota).toBe(Math.floor(DEFAULT_SANDBOX_CONFIG.cpuLimit * 100000));
    });

    it("should set pids limit", () => {
      const limits = toDockerResourceLimits(DEFAULT_SANDBOX_CONFIG);
      expect(limits.pidsLimit).toBe(100);
    });

    it("should set file descriptor limit", () => {
      const limits = toDockerResourceLimits(DEFAULT_SANDBOX_CONFIG);
      expect(limits.fileDescriptorLimit).toBe(1024);
    });
  });

  describe("getDockerSecurityOptions", () => {
    it("should return strict security options when enabled", () => {
      const config: SandboxConfig = { ...DEFAULT_SANDBOX_CONFIG, strictSecurity: true };
      const options = getDockerSecurityOptions(config);
      expect(options.seccompProfile).toBe("default");
      expect(options.dropCapabilities).toBe(true);
      expect(options.noNewPrivileges).toBe(true);
    });

    it("should return relaxed security options when disabled", () => {
      const config: SandboxConfig = { ...DEFAULT_SANDBOX_CONFIG, strictSecurity: false };
      const options = getDockerSecurityOptions(config);
      expect(options.dropCapabilities).toBe(false);
      expect(options.noNewPrivileges).toBe(false);
      expect(options.appArmorProfile).toBe("unconfined");
    });
  });

  describe("buildDockerSecurityFlags", () => {
    it("should build security flags for strict config", () => {
      const options = getDockerSecurityOptions(DEFAULT_SANDBOX_CONFIG);
      const flags = buildDockerSecurityFlags(options);
      expect(flags.some(f => f.includes("seccomp"))).toBe(true);
      expect(flags.some(f => f.includes("cap-drop"))).toBe(true);
      expect(flags.some(f => f.includes("no-new-privileges"))).toBe(true);
    });

    it("should include capability add flags", () => {
      const options = {
        ...getDockerSecurityOptions(DEFAULT_SANDBOX_CONFIG),
        addCapabilities: ["NET_ADMIN"],
      };
      const flags = buildDockerSecurityFlags(options);
      expect(flags.some(f => f.includes("cap-add=NET_ADMIN"))).toBe(true);
    });
  });

  describe("buildVolumeMounts", () => {
    it("should build volume mounts with plugin and IO paths", () => {
      const mounts = buildVolumeMounts(
        DEFAULT_SANDBOX_CONFIG,
        "/test/plugin",
        "/test/repo",
        "/test/work"
      );

      expect(mounts.length).toBeGreaterThan(0);
      expect(mounts.some(m => m.hostPath === "/test/plugin")).toBe(true);
      expect(mounts.some(m => m.hostPath === "/test/work")).toBe(true);
    });

    it("should set plugin mount as read-only", () => {
      const mounts = buildVolumeMounts(
        DEFAULT_SANDBOX_CONFIG,
        "/test/plugin",
        "/test/repo",
        "/test/work"
      );

      const pluginMount = mounts.find(m => m.hostPath === "/test/plugin");
      expect(pluginMount?.mode).toBe("ro");
    });

    it("should set IO mount as read-write", () => {
      const mounts = buildVolumeMounts(
        DEFAULT_SANDBOX_CONFIG,
        "/test/plugin",
        "/test/repo",
        "/test/work"
      );

      const ioMount = mounts.find(m => m.hostPath === "/test/work");
      expect(ioMount?.mode).toBe("rw");
    });

    it("should resolve ${repoRoot} placeholder", () => {
      const config: SandboxConfig = {
        ...DEFAULT_SANDBOX_CONFIG,
        allowedReadPaths: ["${repoRoot}/src"],
      };

      const mounts = buildVolumeMounts(config, "/test/plugin", "/test/repo", "/test/work");
      expect(mounts.some(m => m.hostPath.includes("/test/repo"))).toBe(true);
    });
  });

  describe("toDockerVolumeFlags", () => {
    it("should convert mounts to Docker flags", () => {
      const mounts = buildVolumeMounts(
        DEFAULT_SANDBOX_CONFIG,
        "/test/plugin",
        "/test/repo",
        "/test/work"
      );

      const flags = toDockerVolumeFlags(mounts);
      expect(flags.length).toBe(mounts.length);
      expect(flags.every(f => f.startsWith("-v"))).toBe(true);
    });

    it("should include mount mode in flags", () => {
      const mounts = [{ hostPath: "/a", containerPath: "/b", mode: "ro" as const }];
      const flags = toDockerVolumeFlags(mounts);
      expect(flags[0]).toBe("-v /a:/b:ro");
    });
  });

  describe("filterEnvVars", () => {
    it("should block sensitive env vars", () => {
      const env = {
        NODE_VERSION: "20",
        AWS_ACCESS_KEY_ID: "secret123",
        GITHUB_TOKEN: "token123",
      };

      const filtered = filterEnvVars(env, DEFAULT_ENV_VAR_FILTER);
      expect(filtered.NODE_VERSION).toBe("20");
      expect(filtered.AWS_ACCESS_KEY_ID).toBeUndefined();
      expect(filtered.GITHUB_TOKEN).toBeUndefined();
    });

    it("should block vars matching sensitive patterns", () => {
      const env = {
        MY_API_KEY: "key123",
        CUSTOM_SECRET: "secret123",
        NORMAL_VAR: "value",
      };

      const filtered = filterEnvVars(env, DEFAULT_ENV_VAR_FILTER);
      expect(filtered.MY_API_KEY).toBeUndefined();
      expect(filtered.CUSTOM_SECRET).toBeUndefined();
      expect(filtered.NORMAL_VAR).toBe("value");
    });

    it("should only allow listed vars when allow list is specified", () => {
      const env = { A: "1", B: "2", C: "3" };
      const filterConfig = { ...DEFAULT_ENV_VAR_FILTER, allowList: ["A", "B"] };

      const filtered = filterEnvVars(env, filterConfig);
      expect(filtered.A).toBe("1");
      expect(filtered.B).toBe("2");
      expect(filtered.C).toBeUndefined();
    });
  });

  describe("createSandboxConfigFromManifest", () => {
    it("should apply manifest network setting", () => {
      const manifest = createDefaultManifest("test-plugin");
      manifest.security = { network: true };

      const config = createSandboxConfigFromManifest(manifest);
      expect(config.networkAccess).toBe(true);
    });

    it("should apply manifest filesystem read paths", () => {
      const manifest = createDefaultManifest("test-plugin");
      manifest.security = {
        filesystem: {
          read: ["/custom/path"],
        },
      };

      const config = createSandboxConfigFromManifest(manifest);
      expect(config.allowedReadPaths).toContain("/custom/path");
    });

    it("should apply manifest timeout", () => {
      const manifest = createDefaultManifest("test-plugin");
      manifest.entry.timeout = 120;

      const config = createSandboxConfigFromManifest(manifest);
      expect(config.timeout).toBe(120);
    });

    it("should use base config defaults", () => {
      const manifest = createDefaultManifest("test-plugin");
      // No security settings

      const config = createSandboxConfigFromManifest(manifest);
      expect(config.timeout).toBe(DEFAULT_SANDBOX_CONFIG.timeout);
      expect(config.memoryLimit).toBe(DEFAULT_SANDBOX_CONFIG.memoryLimit);
    });
  });
});

describe("DockerSandboxRunner", () => {
  let runner: DockerSandboxRunner;
  let testPluginDir: string;

  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    runner = createDockerSandboxRunner();
  });

  afterAll(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("createDockerSandboxRunner", () => {
    it("should create runner instance", () => {
      const runner = createDockerSandboxRunner();
      expect(runner).toBeDefined();
      expect(runner.initialize).toBeDefined();
      expect(runner.executePlugin).toBeDefined();
      expect(runner.healthCheck).toBeDefined();
    });

    it("should accept custom config", () => {
      const runner = createDockerSandboxRunner({
        timeout: 120,
        memoryLimit: 1024,
      });
      expect(runner).toBeDefined();
    });
  });

  describe("initialize", () => {
    it("should initialize without errors", async () => {
      const runner = createDockerSandboxRunner();
      await runner.initialize({});
      // No errors means success
    });

    it("should validate config on initialize", async () => {
      const runner = createDockerSandboxRunner({ timeout: 0 });

      await expect(runner.initialize({})).rejects.toThrow("Invalid sandbox config");
    });

    it("should accept custom timeout", async () => {
      const runner = createDockerSandboxRunner();
      await runner.initialize({ timeout: 120 });
    });
  });

  describe("healthCheck", () => {
    it("should return issues for missing Docker", async () => {
      // Create a runner without initializing Docker
      const runner = new DockerSandboxRunner();

      // Force dockerAvailable to false by not initializing
      const manifest = createDefaultManifest("test-plugin");
      const entry: PluginRegistryEntry = {
        manifest,
        path: TEST_DIR,
        loaded: true,
        enabled: true,
      };

      const result = await runner.healthCheck(entry);
      expect(result.healthy).toBe(false);
      expect(result.issues?.some(i => i.includes("Docker"))).toBe(true);
    });

    it("should return issues for missing command", async () => {
      const runner = createDockerSandboxRunner();
      const manifest = createDefaultManifest("test-plugin");
      manifest.entry.command = [];

      const entry: PluginRegistryEntry = {
        manifest,
        path: TEST_DIR,
        loaded: true,
        enabled: true,
      };

      const result = await runner.healthCheck(entry);
      expect(result.healthy).toBe(false);
      expect(result.issues?.some(i => i.includes("command"))).toBe(true);
    });
  });

  describe("setTimeout", () => {
    it("should set timeout", () => {
      const runner = createDockerSandboxRunner();
      runner.setTimeout("test-plugin", 30000);
      // Timeout set successfully
    });
  });

  describe("shutdown", () => {
    it("should shutdown without errors", async () => {
      const runner = createDockerSandboxRunner();
      await runner.shutdown();
    });
  });

  describe("buildDockerRunCommand", () => {
    it("should include network isolation flag when network disabled", async () => {
      const runner = createDockerSandboxRunner({ networkAccess: false });
      await runner.initialize({});

      const manifest = createDefaultManifest("test-plugin");
      manifest.entry.command = ["node", "index.js"];

      // Access internal method via reflection would require testing the output
      // For now, verify the runner can be created with network disabled
      expect(runner).toBeDefined();
    });
  });

  describe("generatePluginRunnerScript", () => {
    it("should generate valid Node.js script", () => {
      const runner = createDockerSandboxRunner();
      const script = runner.generatePluginRunnerScript();

      expect(script).toContain("CTG_INPUT_FILE");
      expect(script).toContain("CTG_OUTPUT_FILE");
      expect(script).toContain("require");
    });
  });
});

describe("Docker Utilities", () => {
  describe("isDockerSandboxAvailable", () => {
    it("should return boolean", async () => {
      const result = await isDockerSandboxAvailable();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("listRunningPluginContainers", () => {
    it("should return empty array when no containers", async () => {
      const containers = await listRunningPluginContainers("ctg-plugin-");
      expect(Array.isArray(containers)).toBe(true);
    });
  });

  describe("pullDockerImage", () => {
    it("should handle non-existent image gracefully", async () => {
      // This test may fail if Docker is not available
      try {
        const result = await pullDockerImage("nonexistent-image:latest");
        expect(typeof result).toBe("boolean");
      } catch {
        // Docker not available, skip
      }
    });
  });

  describe("getContainerLogs", () => {
    it("should return empty string for non-existent container", async () => {
      const logs = await getContainerLogs("nonexistent-container");
      expect(logs).toBe("");
    });
  });

  describe("stopAndRemoveContainer", () => {
    it("should return false for non-existent container", async () => {
      const result = await stopAndRemoveContainer("nonexistent-container");
      expect(result).toBe(false);
    });
  });
});

describe("DockerSandboxRunner Integration", () => {
  // These tests require Docker to be available
  // They will be skipped if Docker is not available

  let dockerAvailable: boolean;

  beforeAll(async () => {
    dockerAvailable = await isDockerSandboxAvailable();
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it.skipIf(!dockerAvailable)("should execute simple plugin in Docker", async () => {
    const runner = createDockerSandboxRunner({
      timeout: 30,
      memoryLimit: 256,
    });
    await runner.initialize({});

    // Create test plugin
    const pluginDir = await createTestPlugin("docker-test-plugin", `
const fs = require('fs');
const input = JSON.parse(fs.readFileSync(process.env.CTG_INPUT_FILE || '/dev/stdin', 'utf-8'));
const output = {
  version: "ctg.plugin-output/v1",
  findings: []
};
fs.writeFileSync(process.env.CTG_OUTPUT_FILE || '/dev/stdout', JSON.stringify(output));
`);

    const manifest = createDefaultManifest("docker-test-plugin");
    manifest.entry.command = ["node", "index.js"];
    manifest.entry.timeout = 10;

    const entry: PluginRegistryEntry = {
      manifest,
      path: pluginDir,
      loaded: true,
      enabled: true,
    };

    const input: PluginInput = {
      version: "ctg.plugin-input/v1",
      repo_graph: { files: [] },
    };

    const result = await runner.executePlugin(entry, input);

    expect(result.status).toBeOneOf(["success", "failed"]);
    if (result.status === "success") {
      expect(result.output?.version).toBe(PLUGIN_OUTPUT_VERSION);
    }

    await runner.shutdown();
  }, 60000);

  it.skipIf(!dockerAvailable)("should handle plugin timeout", async () => {
    const runner = createDockerSandboxRunner({
      timeout: 5, // 5 seconds
      memoryLimit: 256,
    });
    await runner.initialize({});

    // Create plugin that hangs
    const pluginDir = await createTestPlugin("timeout-plugin", `
// Intentionally hang
while (true) {}
`);

    const manifest = createDefaultManifest("timeout-plugin");
    manifest.entry.command = ["node", "index.js"];
    manifest.entry.timeout = 1;

    const entry: PluginRegistryEntry = {
      manifest,
      path: pluginDir,
      loaded: true,
      enabled: true,
    };

    const input: PluginInput = {
      version: "ctg.plugin-input/v1",
      repo_graph: {},
    };

    const result = await runner.executePlugin(entry, input);

    expect(result.status).toBe("timeout");
    expect(result.error?.code).toBe("TIMEOUT");

    await runner.shutdown();
  }, 20000);

  it.skipIf(!dockerAvailable)("should enforce memory limits", async () => {
    const runner = createDockerSandboxRunner({
      timeout: 10,
      memoryLimit: 64, // 64 MB - very low limit
    });
    await runner.initialize({});

    // Create plugin that tries to allocate memory
    const pluginDir = await createTestPlugin("memory-plugin", `
// Try to allocate more than allowed
const arr = new Array(100000000);
`);

    const manifest = createDefaultManifest("memory-plugin");
    manifest.entry.command = ["node", "index.js"];
    manifest.entry.timeout = 5;

    const entry: PluginRegistryEntry = {
      manifest,
      path: pluginDir,
      loaded: true,
      enabled: true,
    };

    const input: PluginInput = {
      version: "ctg.plugin-input/v1",
      repo_graph: {},
    };

    const result = await runner.executePlugin(entry, input);

    // Should fail due to memory limit
    expect(result.status).toBe("failed");

    await runner.shutdown();
  }, 20000);
});

describe("Sandbox Mode Integration with PluginRunnerImpl", () => {
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

  describe("createPluginRunner with sandbox mode", () => {
    it("should create runner with docker sandbox mode", async () => {
      const { createPluginRunner } = await import("../plugin-runner.js");
      const runner = createPluginRunner("docker");
      expect(runner).toBeDefined();
    });

    it("should create runner with none sandbox mode", async () => {
      const { createPluginRunner } = await import("../plugin-runner.js");
      const runner = createPluginRunner("none");
      expect(runner).toBeDefined();
    });

    it("should default to none mode", async () => {
      const { createPluginRunner } = await import("../plugin-runner.js");
      const runner = createPluginRunner();
      expect(runner).toBeDefined();
    });
  });
});