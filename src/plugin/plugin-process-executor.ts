/**
 * Plugin Process Executor
 * Handles spawning and execution of plugin processes
 */

import type { PluginManifest, PluginOutput } from "./types.js";
import { PLUGIN_OUTPUT_VERSION } from "./types.js";
import { DefaultPluginLogger } from "./plugin-context.js";
import { execFile, spawn, ChildProcess } from "node:child_process";
import * as path from "path";

const TERMINATION_GRACE_MS = 500;

function waitForExit(childProcess: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let completed = false;
    const timeoutId = setTimeout(() => {
      if (completed) return;
      completed = true;
      childProcess.removeListener("close", onClose);
      resolve(false);
    }, timeoutMs);
    const onClose = () => {
      if (completed) return;
      completed = true;
      clearTimeout(timeoutId);
      resolve(true);
    };
    childProcess.once("close", onClose);
  });
}

async function terminateChildProcess(childProcess: ChildProcess): Promise<void> {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return;
  }

  const pid = childProcess.pid;
  if (process.platform === "win32" && pid) {
    await new Promise<void>((resolve) => {
      execFile(
        "taskkill",
        ["/pid", String(pid), "/T", "/F"],
        { windowsHide: true },
        () => resolve()
      );
    });
    if (!(await waitForExit(childProcess, TERMINATION_GRACE_MS))) {
      childProcess.kill("SIGKILL");
      await waitForExit(childProcess, TERMINATION_GRACE_MS);
    }
    return;
  }

  try {
    if (pid) {
      process.kill(-pid, "SIGTERM");
    } else {
      childProcess.kill("SIGTERM");
    }
  } catch {
    childProcess.kill("SIGTERM");
  }

  if (await waitForExit(childProcess, TERMINATION_GRACE_MS)) {
    return;
  }

  try {
    if (pid) {
      process.kill(-pid, "SIGKILL");
    } else {
      childProcess.kill("SIGKILL");
    }
  } catch {
    childProcess.kill("SIGKILL");
  }
  await waitForExit(childProcess, TERMINATION_GRACE_MS);
}

/**
 * Execute plugin process via stdin/stdout
 */
export async function executePluginProcess(
  manifest: PluginManifest,
  inputJson: string,
  timeoutMs: number,
  logger: DefaultPluginLogger,
  runningProcesses: Map<string, ChildProcess>
): Promise<PluginOutput> {
  const command = manifest.entry.command;
  const env = manifest.entry.env ?? {};

  return new Promise<PluginOutput>((resolve, reject) => {
    let childProcess: ChildProcess | undefined;
    let settled = false;
    let timedOut = false;

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      reject(error);
    };
    const resolveOnce = (output: PluginOutput) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(output);
    };
    const timeoutId = setTimeout(() => {
      timedOut = true;
      const timeoutError = new Error(`TIMEOUT: Plugin execution exceeded ${timeoutMs}ms`);
      if (!childProcess) {
        rejectOnce(timeoutError);
        return;
      }
      void terminateChildProcess(childProcess).finally(() => {
        runningProcesses.delete(manifest.name);
        rejectOnce(timeoutError);
      });
    }, timeoutMs);

    try {
      childProcess = spawn(command[0], command.slice(1), {
        cwd: path.dirname(command[0] === "node" ? command[1] ?? "." : command[0]),
        env: {
          ...process.env,
          ...env,
        },
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });

      runningProcesses.set(manifest.name, childProcess);

      let stdoutData = "";
      let stderrData = "";

      childProcess.stdout?.on("data", (data) => {
        stdoutData += data.toString();
      });

      childProcess.stderr?.on("data", (data) => {
        stderrData += data.toString();
        logger.debug("Plugin stderr", { data: data.toString() });
      });

      childProcess.on("error", (error) => {
        if (timedOut) return;
        runningProcesses.delete(manifest.name);
        rejectOnce(new Error(`PROCESS_ERROR: ${error.message}`));
      });

      childProcess.on("close", (code) => {
        if (timedOut) return;
        runningProcesses.delete(manifest.name);

        if (code !== 0) {
          rejectOnce(new Error(`EXIT_CODE_${code}: Plugin exited with code ${code}. stderr: ${stderrData}`));
          return;
        }

        try {
          const output = JSON.parse(stdoutData) as PluginOutput;

          // Validate version
          if (output.version !== PLUGIN_OUTPUT_VERSION) {
            rejectOnce(new Error(`INVALID_VERSION: Expected ${PLUGIN_OUTPUT_VERSION}, got ${output.version}`));
            return;
          }

          resolveOnce(output);
        } catch (_parseError) {
          rejectOnce(new Error(`PARSE_ERROR: Failed to parse plugin output. stdout: ${stdoutData.slice(0, 500)}`));
        }
      });

      // Write input to stdin
      childProcess.stdin?.write(inputJson);
      childProcess.stdin?.end();

    } catch (spawnError) {
      rejectOnce(new Error(`SPAWN_ERROR: ${spawnError instanceof Error ? spawnError.message : "Unknown spawn error"}`));
    }
  });
}

/**
 * Kill running plugin processes
 */
export async function killRunningProcesses(
  runningProcesses: Map<string, ChildProcess>,
  logger: DefaultPluginLogger
): Promise<void> {
  const processes = Array.from(runningProcesses.entries());
  await Promise.all(processes.map(async ([name, childProcess]) => {
    logger.info(`Killing running plugin: ${name}`);
    await terminateChildProcess(childProcess);
  }));
  runningProcesses.clear();
}
