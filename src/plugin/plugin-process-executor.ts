/**
 * Plugin Process Executor
 * Handles bounded spawning and execution of trusted plugin processes.
 */

import type { PluginManifest, PluginOutput } from "./types.js";
import { PLUGIN_OUTPUT_VERSION } from "./types.js";
import { DefaultPluginLogger } from "./plugin-context.js";
import { execFile, spawn, ChildProcess } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

const TERMINATION_GRACE_MS = 500;
const DEFAULT_STDOUT_BYTES = 10 * 1024 * 1024;
const DEFAULT_STDERR_BYTES = 1024 * 1024;
const DEFAULT_FINDINGS = 1000;
const DEFAULT_EVIDENCE_PER_FINDING = 10;
const BASE_ENV_ALLOWLIST = process.platform === "win32"
  ? ["SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "PATH"]
  : ["PATH", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL"];

export interface PluginProcessExecutionOptions {
  pluginRoot?: string;
  workDir?: string;
  allowedEnvVars?: string[];
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  maxFindings?: number;
  maxEvidencePerFinding?: number;
  nodePermissionModel?: boolean;
}

export interface PluginSpawnSpec {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

function inside(root: string, target: string): boolean {
  const normalizedRoot = process.platform === "win32" ? root.toLowerCase() : root;
  const normalizedTarget = process.platform === "win32" ? target.toLowerCase() : target;
  const relative = path.relative(normalizedRoot, normalizedTarget);
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

function containedFile(pluginRoot: string, candidate: string): string {
  const root = realpathSync(pluginRoot);
  const requested = path.isAbsolute(candidate) ? candidate : path.resolve(root, candidate);
  if (!existsSync(requested) || !statSync(requested).isFile()) {
    throw new Error("ENTRYPOINT_INVALID: Plugin entrypoint does not identify a file");
  }
  const resolved = realpathSync(requested);
  if (!inside(root, resolved)) {
    throw new Error("ENTRYPOINT_ESCAPE: Plugin entrypoint escapes the plugin directory");
  }
  return resolved;
}

export function filterPluginProcessEnv(
  manifestEnv: Record<string, string>,
  allowedEnvVars: string[]
): NodeJS.ProcessEnv {
  const allowed = new Set([...BASE_ENV_ALLOWLIST, ...allowedEnvVars]);
  const env: NodeJS.ProcessEnv = {};
  for (const name of allowed) {
    const value = process.env[name];
    if (typeof value === "string") env[name] = value;
  }
  for (const [name, value] of Object.entries(manifestEnv)) {
    if (allowedEnvVars.includes(name)) env[name] = value;
  }
  return env;
}

export function buildPluginSpawnSpec(
  manifest: PluginManifest,
  options: PluginProcessExecutionOptions = {}
): PluginSpawnSpec {
  const command = manifest.entry.command;
  if (!command[0]) throw new Error("ENTRYPOINT_INVALID: Plugin command is empty");

  if (!options.pluginRoot) {
    return {
      executable: command[0],
      args: command.slice(1),
      cwd: path.dirname(command[0] === "node" ? command[1] ?? "." : command[0]),
      env: filterPluginProcessEnv(manifest.entry.env ?? {}, options.allowedEnvVars ?? []),
    };
  }

  const pluginRoot = realpathSync(options.pluginRoot);
  const workDir = path.resolve(options.workDir ?? path.join(pluginRoot, ".ctg-work"));
  const executableName = path.basename(command[0]).toLowerCase();
  const isNode = executableName === "node" || executableName === "node.exe";

  if (isNode) {
    if (!command[1]) throw new Error("ENTRYPOINT_INVALID: Node plugin script is missing");
    const script = containedFile(pluginRoot, command[1]);
    const args: string[] = [];
    if (options.nodePermissionModel !== false) {
      args.push(
        "--permission",
        "--allow-fs-read=" + pluginRoot,
        "--allow-fs-read=" + workDir,
        "--allow-fs-write=" + workDir
      );
    }
    args.push(script, ...command.slice(2));
    return {
      executable: process.execPath,
      args,
      cwd: pluginRoot,
      env: filterPluginProcessEnv(manifest.entry.env ?? {}, options.allowedEnvVars ?? []),
    };
  }

  const executable = containedFile(pluginRoot, command[0]);
  return {
    executable,
    args: command.slice(1),
    cwd: pluginRoot,
    env: filterPluginProcessEnv(manifest.entry.env ?? {}, options.allowedEnvVars ?? []),
  };
}

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
    if (pid) process.kill(-pid, "SIGTERM");
    else childProcess.kill("SIGTERM");
  } catch {
    childProcess.kill("SIGTERM");
  }

  if (await waitForExit(childProcess, TERMINATION_GRACE_MS)) return;

  try {
    if (pid) process.kill(-pid, "SIGKILL");
    else childProcess.kill("SIGKILL");
  } catch {
    childProcess.kill("SIGKILL");
  }
  await waitForExit(childProcess, TERMINATION_GRACE_MS);
}

function validateOutputLimits(
  output: PluginOutput,
  maxFindings: number,
  maxEvidencePerFinding: number
): void {
  if ((output.findings?.length ?? 0) > maxFindings) {
    throw new Error("FINDING_LIMIT_EXCEEDED: Plugin output contains too many findings");
  }
  for (const finding of output.findings ?? []) {
    if ((finding.evidence?.length ?? 0) > maxEvidencePerFinding) {
      throw new Error("EVIDENCE_LIMIT_EXCEEDED: Plugin finding contains too many evidence records");
    }
  }
}

/**
 * Execute plugin process via stdin/stdout.
 */
export async function executePluginProcess(
  manifest: PluginManifest,
  inputJson: string,
  timeoutMs: number,
  logger: DefaultPluginLogger,
  runningProcesses: Map<string, ChildProcess>,
  options: PluginProcessExecutionOptions = {}
): Promise<PluginOutput> {
  const maxStdoutBytes = options.maxStdoutBytes ?? DEFAULT_STDOUT_BYTES;
  const maxStderrBytes = options.maxStderrBytes ?? DEFAULT_STDERR_BYTES;
  const maxFindings = options.maxFindings ?? DEFAULT_FINDINGS;
  const maxEvidencePerFinding = options.maxEvidencePerFinding ?? DEFAULT_EVIDENCE_PER_FINDING;
  const spawnSpec = buildPluginSpawnSpec(manifest, options);

  return new Promise<PluginOutput>((resolve, reject) => {
    let childProcess: ChildProcess | undefined;
    let settled = false;
    let terminating = false;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutData = "";
    let stderrData = "";

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
    const terminateFor = (error: Error) => {
      if (terminating || settled) return;
      terminating = true;
      if (!childProcess) {
        rejectOnce(error);
        return;
      }
      void terminateChildProcess(childProcess).finally(() => {
        runningProcesses.delete(manifest.name);
        rejectOnce(error);
      });
    };
    const timeoutId = setTimeout(() => {
      terminateFor(new Error("TIMEOUT: Plugin execution exceeded " + timeoutMs + "ms"));
    }, timeoutMs);

    try {
      childProcess = spawn(spawnSpec.executable, spawnSpec.args, {
        cwd: spawnSpec.cwd,
        env: spawnSpec.env,
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
        windowsHide: true,
      });

      runningProcesses.set(manifest.name, childProcess);

      childProcess.stdout?.on("data", (data) => {
        const chunk = data.toString();
        stdoutBytes += Buffer.byteLength(chunk, "utf8");
        if (stdoutBytes > maxStdoutBytes) {
          terminateFor(new Error("STDOUT_LIMIT_EXCEEDED: Plugin stdout exceeded " + maxStdoutBytes + " bytes"));
          return;
        }
        stdoutData += chunk;
      });

      childProcess.stderr?.on("data", (data) => {
        const chunk = data.toString();
        stderrBytes += Buffer.byteLength(chunk, "utf8");
        if (stderrBytes > maxStderrBytes) {
          terminateFor(new Error("STDERR_LIMIT_EXCEEDED: Plugin stderr exceeded " + maxStderrBytes + " bytes"));
          return;
        }
        stderrData += chunk;
        logger.debug("Plugin stderr", { data: chunk });
      });

      childProcess.on("error", (error) => {
        if (terminating) return;
        runningProcesses.delete(manifest.name);
        rejectOnce(new Error("PROCESS_ERROR: " + error.message));
      });

      childProcess.on("close", (code) => {
        if (terminating) return;
        runningProcesses.delete(manifest.name);

        if (code !== 0) {
          rejectOnce(new Error("EXIT_CODE_" + code + ": Plugin exited with code " + code + ". stderr: " + stderrData));
          return;
        }

        try {
          const output = JSON.parse(stdoutData) as PluginOutput;
          if (output.version !== PLUGIN_OUTPUT_VERSION) {
            rejectOnce(new Error("INVALID_VERSION: Expected " + PLUGIN_OUTPUT_VERSION + ", got " + output.version));
            return;
          }
          validateOutputLimits(output, maxFindings, maxEvidencePerFinding);
          resolveOnce(output);
        } catch (error) {
          if (error instanceof Error && /_LIMIT_EXCEEDED:/.test(error.message)) {
            rejectOnce(error);
          } else {
            rejectOnce(new Error("PARSE_ERROR: Failed to parse plugin output. stdout: " + stdoutData.slice(0, 500)));
          }
        }
      });

      childProcess.stdin?.write(inputJson);
      childProcess.stdin?.end();
    } catch (spawnError) {
      rejectOnce(new Error("SPAWN_ERROR: " + (spawnError instanceof Error ? spawnError.message : "Unknown spawn error")));
    }
  });
}

/**
 * Kill running plugin processes.
 */
export async function killRunningProcesses(
  runningProcesses: Map<string, ChildProcess>,
  logger: DefaultPluginLogger
): Promise<void> {
  const processes = Array.from(runningProcesses.entries());
  await Promise.all(processes.map(async ([name, childProcess]) => {
    logger.info("Killing running plugin: " + name);
    await terminateChildProcess(childProcess);
  }));
  runningProcesses.clear();
}
