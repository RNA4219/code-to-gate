import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const childMocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  execFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: childMocks.spawn,
  execFile: childMocks.execFile,
}));

import {
  executePluginProcess,
  killRunningProcesses,
} from "../plugin-process-executor.js";
import { createDefaultManifest } from "../plugin-schema.js";
import { PLUGIN_OUTPUT_VERSION } from "../types.js";

function childProcess(): EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  stdin: PassThrough;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  pid: number;
  kill: ReturnType<typeof vi.fn>;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    stdin: PassThrough;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    pid: number;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.pid = 12345;
  child.kill = vi.fn(() => {
    child.exitCode = 1;
    child.emit("close", 1);
    return true;
  });
  return child;
}

function manifest() {
  const value = createDefaultManifest("executor-test");
  value.entry.command = ["node", "plugin.js"];
  return value;
}

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe("plugin process executor", () => {
  beforeEach(() => {
    childMocks.spawn.mockReset();
    childMocks.execFile.mockReset();
    vi.clearAllMocks();
  });

  it("executes valid JSON output and rejects invalid process outputs", async () => {
    const success = childProcess();
    childMocks.spawn.mockImplementationOnce(() => {
      queueMicrotask(() => {
        success.stdout.write(JSON.stringify({
          version: PLUGIN_OUTPUT_VERSION,
          findings: [],
        }));
        success.stdout.end();
        success.emit("close", 0);
      });
      return success;
    });
    const processes = new Map();
    await expect(executePluginProcess(
      manifest(), "{}", 1000, logger, processes
    )).resolves.toMatchObject({ version: PLUGIN_OUTPUT_VERSION });
    expect(processes.size).toBe(0);

    const invalid = childProcess();
    childMocks.spawn.mockImplementationOnce(() => {
      queueMicrotask(() => {
        invalid.stdout.write("{invalid");
        invalid.stdout.end();
        invalid.emit("close", 0);
      });
      return invalid;
    });
    await expect(executePluginProcess(
      manifest(), "{}", 1000, logger, processes
    )).rejects.toThrow("PARSE_ERROR");

    const wrongVersion = childProcess();
    childMocks.spawn.mockImplementationOnce(() => {
      queueMicrotask(() => {
        wrongVersion.stdout.write(JSON.stringify({ version: "wrong" }));
        wrongVersion.stdout.end();
        wrongVersion.emit("close", 0);
      });
      return wrongVersion;
    });
    await expect(executePluginProcess(
      manifest(), "{}", 1000, logger, processes
    )).rejects.toThrow("INVALID_VERSION");
  });

  it("maps process error, nonzero exit, and spawn throw", async () => {
    const processError = childProcess();
    childMocks.spawn.mockImplementationOnce(() => {
      queueMicrotask(() => processError.emit("error", new Error("spawn error")));
      return processError;
    });
    await expect(executePluginProcess(
      manifest(), "{}", 1000, logger, new Map()
    )).rejects.toThrow("PROCESS_ERROR");

    const failed = childProcess();
    childMocks.spawn.mockImplementationOnce(() => {
      queueMicrotask(() => {
        failed.stderr.write("stderr");
        failed.emit("close", 42);
      });
      return failed;
    });
    await expect(executePluginProcess(
      manifest(), "{}", 1000, logger, new Map()
    )).rejects.toThrow("EXIT_CODE_42");

    childMocks.spawn.mockImplementationOnce(() => {
      throw new Error("spawn unavailable");
    });
    await expect(executePluginProcess(
      manifest(), "{}", 1000, logger, new Map()
    )).rejects.toThrow("SPAWN_ERROR");
  });

  it("terminates a timed out child and clears running processes before retry", async () => {
    const originalPlatform = process.platform;
    const timed = childProcess();
    childMocks.spawn.mockImplementation(() => timed);
    childMocks.execFile.mockImplementation(
      (_file: string, _args: string[], _options: object, callback: () => void) => {
        timed.exitCode = 1;
        callback();
        timed.emit("close", 1);
      }
    );
    const processes = new Map<string, EventEmitter>();
    const timeoutManifest = manifest();
    timeoutManifest.entry.timeout = 1;
    Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
    try {
      await expect(executePluginProcess(
        timeoutManifest, "{}", 5, logger, processes
      )).rejects.toThrow("TIMEOUT");
      expect(processes.size).toBe(0);
      expect(childMocks.execFile).toHaveBeenCalledWith(
        "taskkill",
        ["/pid", "12345", "/T", "/F"],
        expect.any(Object),
        expect.any(Function)
      );
    } finally {
      Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
    }
  });

  it("waits for killRunningProcesses and clears the registry", async () => {
    const running = childProcess();
    childMocks.execFile.mockImplementation(
      (_file: string, _args: string[], _options: object, callback: () => void) => {
        running.exitCode = 1;
        callback();
        running.emit("close", 1);
      }
    );
    const processes = new Map([["running", running]]);
    await killRunningProcesses(processes, logger);
    expect(processes.size).toBe(0);
    expect(logger.info).toHaveBeenCalledWith("Killing running plugin: running");
  });

  it("terminates a POSIX process group with TERM", async () => {
    const originalPlatform = process.platform;
    const processKill = vi.spyOn(process, "kill").mockImplementation(
      (() => {
        const child = childMocks.spawn.mock.results[0]?.value as ReturnType<typeof childProcess> | undefined;
        if (child) {
          child.exitCode = 1;
          child.emit("close", 1);
        }
        return true;
      }) as typeof process.kill
    );
    Object.defineProperty(process, "platform", { configurable: true, value: "linux" });
    const timed = childProcess();
    childMocks.spawn.mockImplementationOnce(() => timed);
    try {
      await expect(executePluginProcess(
        manifest(), "{}", 5, logger, new Map()
      )).rejects.toThrow("TIMEOUT");
      expect(processKill).toHaveBeenCalledWith(-12345, "SIGTERM");
    } finally {
      Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
      processKill.mockRestore();
    }
  });

  it("escalates a POSIX process group from TERM to KILL", async () => {
    const originalPlatform = process.platform;
    const timed = childProcess();
    childMocks.spawn.mockImplementationOnce(() => timed);
    let calls = 0;
    const processKill = vi.spyOn(process, "kill").mockImplementation((() => {
      calls += 1;
      if (calls > 1) {
        timed.exitCode = 1;
        timed.emit("close", 1);
      }
      return true;
    }) as typeof process.kill);
    Object.defineProperty(process, "platform", { configurable: true, value: "linux" });
    try {
      await expect(executePluginProcess(
        manifest(), "{}", 5, logger, new Map()
      )).rejects.toThrow("TIMEOUT");
      expect(processKill).toHaveBeenNthCalledWith(1, -12345, "SIGTERM");
      expect(processKill).toHaveBeenNthCalledWith(2, -12345, "SIGKILL");
    } finally {
      Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
      processKill.mockRestore();
    }
  });

  it("falls back to ChildProcess.kill when taskkill does not close the child", async () => {
    const originalPlatform = process.platform;
    const timed = childProcess();
    childMocks.spawn.mockImplementationOnce(() => timed);
    childMocks.execFile.mockImplementation(
      (_file: string, _args: string[], _options: object, callback: () => void) => {
        callback();
      }
    );
    Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
    try {
      await expect(executePluginProcess(
        manifest(), "{}", 5, logger, new Map()
      )).rejects.toThrow("TIMEOUT");
      expect(timed.kill).toHaveBeenCalledWith("SIGKILL");
    } finally {
      Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
    }
  });
});
