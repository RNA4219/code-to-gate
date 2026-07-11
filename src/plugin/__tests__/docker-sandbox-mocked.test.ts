import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import path from "node:path";

const docker = vi.hoisted(() => ({
  exec: vi.fn(),
  version: vi.fn(),
  image: vi.fn(),
  memory: vi.fn(),
  build: vi.fn(),
}));

vi.mock("../docker-exec-utils.js", () => ({
  execDockerCommand: docker.exec,
  checkDockerVersion: docker.version,
  checkDockerImageExists: docker.image,
  getDockerSystemMemory: docker.memory,
  buildDockerImage: docker.build,
  pullDockerImage: vi.fn(),
  listRunningPluginContainers: vi.fn(),
  getContainerLogs: vi.fn(),
  stopAndRemoveContainer: vi.fn(),
}));

import {
  createDockerSandboxRunner,
  createSandboxRunner,
  isDockerSandboxAvailable,
} from "../docker-sandbox.js";
import { createDefaultManifest } from "../plugin-schema.js";
import type { PluginInput, PluginOutput, PluginRegistryEntry } from "../types.js";

const TEST_DIR = path.join(process.cwd(), ".test-temp", "docker-sandbox-mocked");

function entry(name = "mocked-plugin"): PluginRegistryEntry {
  const manifest = createDefaultManifest(name);
  manifest.entry.command = ["node", "plugin with spaces.js", "--arg=one;two"];
  return {
    manifest,
    path: path.join(TEST_DIR, "plugin with spaces"),
    loaded: true,
    enabled: true,
  };
}

function input(): PluginInput {
  return {
    version: "ctg.plugin-input/v1",
    repo_graph: { files: [] },
  };
}

async function writeContainerOutput(
  command: string[],
  output: PluginOutput
): Promise<void> {
  const outputMount = command.find((arg) => arg.endsWith(":/plugin/io:rw"));
  if (!outputMount) {
    throw new Error("output mount not found");
  }
  const hostDir = outputMount.slice(0, -":/plugin/io:rw".length);
  await fs.writeFile(path.join(hostDir, "output.json"), JSON.stringify(output), "utf8");
}

describe("DockerSandboxRunner with mocked Docker", () => {
  beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
    docker.exec.mockReset();
    docker.version.mockReset().mockResolvedValue({
      available: true,
      version: "Docker mocked",
    });
    docker.image.mockReset().mockResolvedValue(true);
    docker.memory.mockReset().mockResolvedValue(4096);
    docker.build.mockReset().mockResolvedValue(true);
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it("checks availability and creates runners by explicit mode", async () => {
    await expect(isDockerSandboxAvailable()).resolves.toBe(true);
    docker.version.mockResolvedValueOnce({ available: false });
    await expect(isDockerSandboxAvailable()).resolves.toBe(false);
    docker.version.mockResolvedValueOnce({ available: true });
    docker.memory.mockResolvedValueOnce(undefined);
    await expect(isDockerSandboxAvailable()).resolves.toBe(false);
    expect(createSandboxRunner("docker")).not.toBeNull();
    expect(createSandboxRunner("none")).toBeNull();
  });

  it("initializes, builds a missing image, and reports status failures", async () => {
    docker.image.mockResolvedValueOnce(false);
    const runner = createDockerSandboxRunner({ dockerImage: "image with spaces" });
    await runner.initialize({});
    expect(docker.build).toHaveBeenCalledWith("image with spaces", expect.any(String));

    docker.version.mockResolvedValueOnce({ available: false });
    await expect(runner.checkDockerStatus()).resolves.toMatchObject({
      dockerAvailable: false,
      imageExists: false,
    });

    docker.version.mockResolvedValueOnce({ available: true, version: "Docker mocked" });
    docker.memory.mockResolvedValueOnce(undefined);
    await expect(runner.checkDockerStatus()).resolves.toMatchObject({
      dockerAvailable: false,
      dockerVersion: "Docker mocked",
    });

    docker.version.mockRejectedValueOnce(new Error("status exploded"));
    await expect(runner.checkDockerStatus()).resolves.toMatchObject({
      dockerAvailable: false,
      errors: ["status exploded"],
    });

    await expect(
      createDockerSandboxRunner({ timeout: 0 }).initialize({})
    ).rejects.toThrow("Invalid sandbox config");
  });

  it("covers image build failures and compatibility methods", async () => {
    const runner = createDockerSandboxRunner();
    docker.build.mockResolvedValueOnce(false);
    await expect(runner.buildDockerImage()).resolves.toBe(false);
    docker.build.mockRejectedValueOnce(new Error("build exploded"));
    await expect(runner.buildDockerImage()).resolves.toBe(false);

    expect(runner.getPluginRunnerScript()).toContain("CTG_OUTPUT_FILE");
    runner.registerHook();
    runner.unregisterHook();
    runner.setTimeout("plugin", 2500);

    const invalid = entry("invalid-health");
    invalid.manifest.entry.command = [];
    invalid.manifest.security = { network: true };
    await expect(runner.healthCheck(invalid)).resolves.toMatchObject({
      healthy: false,
      issues: expect.arrayContaining([
        "Docker is not available",
        expect.stringContaining("not ready"),
        "Missing or invalid entry command",
        "Plugin requests network access but sandbox denies it",
      ]),
    });
  });

  it("executes success, partial, invalid, timeout, and error outcomes", async () => {
    const runner = createDockerSandboxRunner();
    await runner.initialize({});
    const plugin = entry();

    docker.exec.mockImplementationOnce(async (command: string[]) => {
      await writeContainerOutput(command, {
        version: "ctg.plugin-output/v1",
        findings: [],
      });
      return { stdout: "", stderr: "", exitCode: 0 };
    });
    await expect(runner.executePlugin(plugin, input())).resolves.toMatchObject({
      status: "success",
    });
    expect(docker.exec.mock.calls[0][0].some(
      (arg: string) => arg.endsWith("plugin with spaces.js")
    )).toBe(true);
    expect(docker.exec.mock.calls[0][0]).toContain("--arg=one;two");

    docker.exec.mockImplementationOnce(async (command: string[]) => {
      await writeContainerOutput(command, {
        version: "ctg.plugin-output/v1",
        findings: [],
        errors: [{ code: "PARTIAL", message: "partial" }],
      });
      return { stdout: "", stderr: "", exitCode: 0 };
    });
    await expect(runner.executePlugin(plugin, input())).resolves.toMatchObject({
      status: "partial",
    });

    docker.exec.mockImplementationOnce(async (command: string[]) => {
      await writeContainerOutput(command, {
        version: "invalid",
        findings: [],
      } as PluginOutput);
      return { stdout: "", stderr: "", exitCode: 0 };
    });
    await expect(runner.executePlugin(plugin, input())).resolves.toMatchObject({
      status: "invalid_output",
      error: { code: "INVALID_VERSION" },
    });

    docker.exec.mockResolvedValueOnce({
      stdout: "",
      stderr: "timeout",
      exitCode: 137,
    });
    await expect(runner.executePlugin(plugin, input())).resolves.toMatchObject({
      status: "timeout",
      error: { code: "TIMEOUT" },
    });

    docker.exec.mockRejectedValueOnce(new Error("Docker exploded"));
    await expect(runner.executePlugin(plugin, input())).resolves.toMatchObject({
      status: "failed",
      error: { code: "CONTAINER_ERROR", message: "Docker exploded" },
    });
  });

  it("handles unavailable Docker, multiple plugins, health, and shutdown", async () => {
    const unavailable = createDockerSandboxRunner();
    await expect(unavailable.executePlugin(entry("unavailable"), input()))
      .resolves.toMatchObject({
        status: "failed",
        error: { code: "DOCKER_NOT_AVAILABLE" },
      });

    const runner = createDockerSandboxRunner({ networkAccess: false });
    await runner.initialize({});
    const networkPlugin = entry("network-plugin");
    networkPlugin.manifest.security = { network: true };
    await expect(runner.healthCheck(networkPlugin)).resolves.toMatchObject({
      healthy: false,
      issues: expect.arrayContaining([
        "Plugin requests network access but sandbox denies it",
      ]),
    });

    docker.exec
      .mockResolvedValueOnce({ stdout: "", stderr: "failed", exitCode: 1 })
      .mockResolvedValueOnce({ stdout: "", stderr: "failed", exitCode: 1 });
    const results = await runner.executePlugins(
      [entry("one"), entry("two")],
      input()
    );
    expect(results).toHaveLength(2);
    expect(results.every((result) => result.status === "failed")).toBe(true);

    docker.exec
      .mockResolvedValueOnce({ stdout: "id-one\nid-two\n", stderr: "", exitCode: 0 })
      .mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
    await runner.shutdown();
    expect(docker.exec).toHaveBeenCalledWith(["docker", "stop", "id-one"], 10000);
    expect(docker.exec).toHaveBeenCalledWith(["docker", "rm", "id-two"], 5000);

    docker.exec.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    await runner.shutdown();
    docker.exec.mockRejectedValueOnce(new Error("cleanup exploded"));
    await expect(runner.shutdown()).resolves.toBeUndefined();
  });
});
