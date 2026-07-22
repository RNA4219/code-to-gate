import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pluginSandboxCommand } from "../plugin-sandbox.js";
import { EXIT, VERSION, getOption } from "../exit-codes.js";

const TEST_DIR = path.join(process.cwd(), ".test-temp", "plugin-sandbox-cli");

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("plugin-sandbox run CLI", () => {
  it("prints help and rejects unknown subcommands", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      pluginSandboxCommand(["--help"], { VERSION, EXIT, getOption })
    ).resolves.toBe(EXIT.OK);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("--sandbox <process|docker|none>"));

    await expect(
      pluginSandboxCommand(["unknown"], { VERSION, EXIT, getOption })
    ).resolves.toBe(EXIT.USAGE_ERROR);
    expect(error).toHaveBeenCalledWith(
      "unknown plugin sandbox subcommand: unknown"
    );
  });

  it("reports Docker status branches through atomic helpers", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const unavailable = {
      isDockerSandboxAvailable: vi.fn().mockResolvedValue(false),
    };
    await expect(
      pluginSandboxCommand(["status"], {
        VERSION,
        EXIT,
        getOption,
        dependencies: unavailable,
      })
    ).resolves.toBe(EXIT.USAGE_ERROR);

    const daemonMissing = {
      isDockerSandboxAvailable: vi.fn().mockResolvedValue(true),
      checkDockerVersion: vi.fn().mockResolvedValue({ available: true }),
      getDockerSystemMemory: vi.fn().mockResolvedValue(undefined),
    };
    await expect(
      pluginSandboxCommand(["status"], {
        VERSION,
        EXIT,
        getOption,
        dependencies: daemonMissing,
      })
    ).resolves.toBe(EXIT.USAGE_ERROR);

    const available = {
      isDockerSandboxAvailable: vi.fn().mockResolvedValue(true),
      checkDockerVersion: vi.fn().mockResolvedValue({
        available: true,
        version: "Docker test",
      }),
      getDockerSystemMemory: vi.fn().mockResolvedValue(4096),
      checkDockerImageExists: vi.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
    };
    await expect(
      pluginSandboxCommand(["status", "--docker-image", "image with spaces"], {
        VERSION,
        EXIT,
        getOption,
        dependencies: available,
      })
    ).resolves.toBe(EXIT.OK);
    await expect(
      pluginSandboxCommand(["status"], {
        VERSION,
        EXIT,
        getOption,
        dependencies: available,
      })
    ).resolves.toBe(EXIT.OK);
    expect(available.checkDockerImageExists).toHaveBeenCalledWith("image with spaces");
  });

  it("defaults to Process mode before validating paths", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await pluginSandboxCommand(
      ["run", "plugin", "--input", "input.json"],
      { VERSION, EXIT, getOption }
    );

    expect(exitCode).toBe(EXIT.USAGE_ERROR);
    expect(error).toHaveBeenCalledWith(
      "Error: Plugin path does not exist: plugin"
    );
  });

  it("rejects an invalid sandbox mode", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await pluginSandboxCommand(
      ["run", "plugin", "--input", "input.json", "--sandbox", "docer"],
      { VERSION, EXIT, getOption }
    );

    expect(exitCode).toBe(EXIT.USAGE_ERROR);
    expect(error).toHaveBeenCalledWith(
      "Error: Invalid sandbox mode: docer. Expected process, docker, or none."
    );
  });

  it("validates required paths and sandbox configuration", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      pluginSandboxCommand(["run"], { VERSION, EXIT, getOption })
    ).resolves.toBe(EXIT.USAGE_ERROR);
    await expect(
      pluginSandboxCommand(["run", "plugin", "--sandbox", "none"], {
        VERSION,
        EXIT,
        getOption,
      })
    ).resolves.toBe(EXIT.USAGE_ERROR);
    await expect(
      pluginSandboxCommand([
        "run",
        "missing-plugin",
        "--input",
        "missing-input",
        "--sandbox",
        "none",
      ], { VERSION, EXIT, getOption })
    ).resolves.toBe(EXIT.USAGE_ERROR);

    const pluginDir = path.join(TEST_DIR, "validation-plugin");
    mkdirSync(pluginDir, { recursive: true });
    await expect(
      pluginSandboxCommand([
        "run",
        pluginDir,
        "--input",
        "missing-input",
        "--sandbox",
        "none",
      ], { VERSION, EXIT, getOption })
    ).resolves.toBe(EXIT.USAGE_ERROR);

    const inputPath = path.join(TEST_DIR, "validation-input.json");
    writeFileSync(inputPath, "{}", "utf8");
    await expect(
      pluginSandboxCommand([
        "run",
        pluginDir,
        "--input",
        inputPath,
        "--sandbox",
        "none",
        "--timeout",
        "0",
      ], { VERSION, EXIT, getOption })
    ).resolves.toBe(EXIT.USAGE_ERROR);
    expect(error).toHaveBeenCalled();
  });

  it("requires Docker for docker mode before loading a plugin", async () => {
    const pluginDir = path.join(TEST_DIR, "docker-plugin");
    const inputPath = path.join(TEST_DIR, "docker-input.json");
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(inputPath, "{}", "utf8");
    const dockerAvailable = vi.fn().mockResolvedValue(false);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      pluginSandboxCommand([
        "run",
        pluginDir,
        "--input",
        inputPath,
        "--sandbox",
        "docker",
      ], {
        VERSION,
        EXIT,
        getOption,
        dependencies: { isDockerSandboxAvailable: dockerAvailable },
      })
    ).resolves.toBe(EXIT.USAGE_ERROR);
    expect(dockerAvailable).toHaveBeenCalledOnce();
  });

  it("reports manifest loading failures", async () => {
    const pluginDir = path.join(TEST_DIR, "bad-manifest-plugin");
    const inputPath = path.join(TEST_DIR, "bad-manifest-input.json");
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(inputPath, "{}", "utf8");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      pluginSandboxCommand([
        "run",
        pluginDir,
        "--input",
        inputPath,
        "--sandbox",
        "none",
        "--unsafe-allow-none",
      ], {
        VERSION,
        EXIT,
        getOption,
        dependencies: {
          createPluginLoader: vi.fn().mockReturnValue({
            loadManifest: vi.fn().mockResolvedValue({
              status: "invalid",
              errors: [{ code: "BAD", message: "bad manifest" }],
            }),
          }),
        },
      })
    ).resolves.toBe(EXIT.PLUGIN_FAILED);
  });

  it("accepts explicit none mode and warns before host execution", async () => {
    const pluginDir = path.join(TEST_DIR, "plugin");
    const scriptPath = path.join(pluginDir, "plugin.mjs");
    const inputPath = path.join(TEST_DIR, "input.json");
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(
      scriptPath,
      'process.stdin.resume(); let data = ""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => process.stdout.write(JSON.stringify({ version: "ctg.plugin-output/v1", findings: [] })));\n',
      "utf8"
    );
    writeFileSync(inputPath, JSON.stringify({ version: "ctg.plugin-input/v1" }), "utf8");
    writeFileSync(
      path.join(pluginDir, "plugin-manifest.json"),
      JSON.stringify({
        apiVersion: "ctg/v1",
        kind: "rule-plugin",
        name: "sandbox-cli-test",
        version: "1.0.0",
        visibility: "private",
        entry: { command: [process.execPath, scriptPath], timeout: 5, retry: 0 },
        capabilities: ["evaluate"],
        receives: ["normalized-repo-graph@v1"],
        returns: ["findings@v1"],
      }),
      "utf8"
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const exitCode = await pluginSandboxCommand(
      ["run", pluginDir, "--input", inputPath, "--sandbox", "none", "--unsafe-allow-none"],
      { VERSION, EXIT, getOption }
    );

    expect(exitCode).toBe(EXIT.OK);
    expect(error).toHaveBeenCalledWith(
      "Warning: --sandbox none executes plugin code directly on the host with access to the host environment."
    );
  });

  it("writes partial output and reports plugin failures", async () => {
    const pluginDir = path.join(TEST_DIR, "injected-plugin");
    const inputPath = path.join(TEST_DIR, "injected-input.json");
    const outputPath = path.join(TEST_DIR, "result with spaces.json");
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(inputPath, JSON.stringify({ version: "ctg.plugin-input/v1" }), "utf8");
    const manifest = {
      apiVersion: "ctg/v1",
      kind: "rule-plugin",
      name: "injected",
      version: "1.0.0",
      visibility: "private",
      entry: { command: ["node", "plugin.js"], timeout: 5, retry: 0 },
      capabilities: ["evaluate"],
      receives: ["normalized-repo-graph@v1"],
      returns: ["findings@v1"],
    };
    const runner = {
      initialize: vi.fn().mockResolvedValue(undefined),
      executePlugin: vi.fn()
        .mockResolvedValueOnce({
          status: "partial",
          output: {
            version: "ctg.plugin-output/v1",
            findings: [],
            errors: [{ code: "PARTIAL", message: "partial result" }],
          },
        })
        .mockResolvedValueOnce({
          status: "timeout",
          error: {
            code: "TIMEOUT",
            message: "timed out",
            details: { timeout: 1 },
          },
        }),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    const dependencies = {
      createPluginLoader: vi.fn().mockReturnValue({
        loadManifest: vi.fn().mockResolvedValue({ status: "loaded", manifest }),
      }),
      createPluginRunner: vi.fn().mockReturnValue(runner),
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const baseArgs = [
      "run",
      pluginDir,
      "--input",
      inputPath,
      "--sandbox",
      "none",
      "--unsafe-allow-none",
      "--verbose",
    ];
    await expect(
      pluginSandboxCommand([...baseArgs, "--output", outputPath], {
        VERSION,
        EXIT,
        getOption,
        dependencies,
      })
    ).resolves.toBe(EXIT.PARTIAL_SUCCESS);
    expect(existsSync(outputPath)).toBe(true);
    expect(JSON.parse(readFileSync(outputPath, "utf8")).errors[0].code).toBe("PARTIAL");

    await expect(
      pluginSandboxCommand(baseArgs, {
        VERSION,
        EXIT,
        getOption,
        dependencies,
      })
    ).resolves.toBe(EXIT.PLUGIN_FAILED);
    expect(runner.shutdown).toHaveBeenCalledTimes(2);
  });

  it("builds images with an atomic image argument and handles failures", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const buildDockerImage = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const deps = {
      isDockerSandboxAvailable: vi.fn().mockResolvedValue(true),
      buildDockerImage,
    };

    await expect(
      pluginSandboxCommand([
        "build-image",
        "--docker-image",
        "image; with spaces",
        "--verbose",
      ], { VERSION, EXIT, getOption, dependencies: deps })
    ).resolves.toBe(EXIT.OK);
    expect(buildDockerImage).toHaveBeenCalledWith(
      "image; with spaces",
      expect.any(String)
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining("FROM node:20-alpine"));

    await expect(
      pluginSandboxCommand(["build-image"], {
        VERSION,
        EXIT,
        getOption,
        dependencies: deps,
      })
    ).resolves.toBe(EXIT.INTERNAL_ERROR);

    await expect(
      pluginSandboxCommand(["build-image"], {
        VERSION,
        EXIT,
        getOption,
        dependencies: {
          isDockerSandboxAvailable: vi.fn().mockResolvedValue(false),
        },
      })
    ).resolves.toBe(EXIT.USAGE_ERROR);
  });
});
