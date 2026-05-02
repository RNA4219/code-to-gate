/**
 * Plugin Process Executor
 * Handles spawning and execution of plugin processes
 */

import type { PluginManifest, PluginOutput } from "./types.js";
import { PLUGIN_OUTPUT_VERSION } from "./types.js";
import { DefaultPluginLogger } from "./plugin-context.js";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";

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
        clearTimeout(timeoutId);
        runningProcesses.delete(manifest.name);
        reject(new Error(`PROCESS_ERROR: ${error.message}`));
      });

      childProcess.on("close", (code) => {
        clearTimeout(timeoutId);
        runningProcesses.delete(manifest.name);

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
 * Kill running plugin processes
 */
export function killRunningProcesses(
  runningProcesses: Map<string, ChildProcess>,
  logger: DefaultPluginLogger
): void {
  for (const [name, process] of runningProcesses) {
    logger.info(`Killing running plugin: ${name}`);
    process.kill("SIGTERM");
  }
  runningProcesses.clear();
}