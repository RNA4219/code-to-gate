/**
 * Plugin CLI Commands
 * Handles plugin-related CLI operations including sandbox execution
 */

import { EXIT, getOption, VERSION } from "./exit-codes.js";
import {
  createPluginLoader,
  createPluginRunner,
  validateSandboxConfig,
  DEFAULT_SANDBOX_CONFIG,
  isDockerSandboxAvailable,
  loadPluginExecutionPolicy,
  verifyTrustedPlugin,
} from "../plugin/index.js";
import type { PluginRegistryEntry, SandboxConfig } from "../plugin/index.js";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import {
  buildDockerImage as buildDockerImageUtil,
  checkDockerImageExists,
  checkDockerVersion,
  getDockerSystemMemory,
} from "../plugin/docker-exec-utils.js";

interface PluginOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
  dependencies?: Partial<PluginSandboxDependencies>;
}

interface PluginSandboxDependencies {
  createPluginLoader: typeof createPluginLoader;
  createPluginRunner: typeof createPluginRunner;
  validateSandboxConfig: typeof validateSandboxConfig;
  isDockerSandboxAvailable: typeof isDockerSandboxAvailable;
  buildDockerImage: typeof buildDockerImageUtil;
  checkDockerImageExists: typeof checkDockerImageExists;
  checkDockerVersion: typeof checkDockerVersion;
  getDockerSystemMemory: typeof getDockerSystemMemory;
}

function dependencies(options: PluginOptions): PluginSandboxDependencies {
  return {
    createPluginLoader,
    createPluginRunner,
    validateSandboxConfig,
    isDockerSandboxAvailable,
    buildDockerImage: buildDockerImageUtil,
    checkDockerImageExists,
    checkDockerVersion,
    getDockerSystemMemory,
    ...options.dependencies,
  };
}

/**
 * Plugin sandbox command
 */
export async function pluginSandboxCommand(args: string[], options: PluginOptions): Promise<number> {
  const subcommand = args[0];

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    printPluginSandboxHelp();
    return options.EXIT.OK;
  }

  if (subcommand === "status") {
    return await sandboxStatusCommand(args.slice(1), options);
  }

  if (subcommand === "run") {
    return await sandboxRunCommand(args.slice(1), options);
  }

  if (subcommand === "build-image") {
    return await buildImageCommand(args.slice(1), options);
  }

  console.error(`unknown plugin sandbox subcommand: ${subcommand}`);
  console.error("Run 'code-to-gate plugin-sandbox --help' for usage information");
  return options.EXIT.USAGE_ERROR;
}

/**
 * Print plugin sandbox help
 */
function printPluginSandboxHelp(): void {
  console.log(`code-to-gate plugin-sandbox ${VERSION}

Manage and execute plugins in isolated Docker containers.

Usage:
  code-to-gate plugin-sandbox status [--docker-image <image>]
  code-to-gate plugin-sandbox run <plugin-path> --input <file> [--sandbox <process|docker|none>] [--execution-policy <file>] [--unsafe-allow-none] [--output <file>]
  code-to-gate plugin-sandbox build-image [--docker-image <image>]

Subcommands:
  status           Check Docker availability and sandbox status
  run              Execute a plugin in sandbox mode
  build-image      Build the Docker image for plugin execution

Options:
  --docker-image   Docker image to use for sandbox (default: code-to-gate-plugin-runner:latest)
  --input          Input JSON file for plugin execution
  --output         Output file for plugin result (default: stdout)
  --sandbox        Sandbox mode: process (default), docker, or none
  --execution-policy  Trusted plugin policy required for Process mode
  --unsafe-allow-none Explicitly allow none outside CI/release only
  --timeout        Execution timeout in seconds (default: 60)
  --memory         Memory limit in MB (default: 512)
  --cpu            CPU limit as fraction (default: 0.5)
  --allow-network  Allow network access (default: blocked)
  --verbose        Show detailed execution information
  --help, -h       Show this help

Examples:
  # Check sandbox status
  code-to-gate plugin-sandbox status

  # Run plugin in Docker sandbox
  code-to-gate plugin-sandbox run ./my-plugin --input input.json --sandbox docker

  # Build custom Docker image
  code-to-gate plugin-sandbox build-image --docker-image my-custom-runner:latest`);
}

/**
 * Sandbox status command
 */
async function sandboxStatusCommand(args: string[], options: PluginOptions): Promise<number> {
  const deps = dependencies(options);
  const dockerImage = options.getOption(args, "--docker-image") ?? DEFAULT_SANDBOX_CONFIG.dockerImage;

  console.log("Checking Docker sandbox status...\n");

  // Check Docker availability
  const dockerAvailable = await deps.isDockerSandboxAvailable();

  if (!dockerAvailable) {
    console.log("Docker: NOT AVAILABLE");
    console.log("  - Docker must be installed and running for sandbox mode");
    console.log("  - Install Docker: https://docs.docker.com/get-docker/");
    return options.EXIT.USAGE_ERROR;
  }

  console.log("Docker: AVAILABLE");

  const dockerVersion = await deps.checkDockerVersion();
  console.log(`  Version: ${dockerVersion.version ?? "Unable to determine"}`);

  const availableMemoryMB = await deps.getDockerSystemMemory();
  if (availableMemoryMB === undefined) {
    console.log("  Daemon: NOT RUNNING");
    console.log("  - Start Docker daemon before using sandbox mode");
    return options.EXIT.USAGE_ERROR;
  }
  console.log("  Daemon: Running");

  const imageExists = await deps.checkDockerImageExists(dockerImage);
  if (imageExists) {
    console.log(`Image ${dockerImage}: AVAILABLE`);
  } else {
    console.log(`Image ${dockerImage}: NOT FOUND`);
    console.log("  - Run 'code-to-gate plugin-sandbox build-image' to create the image");
  }
  console.log(`Available Memory: ${availableMemoryMB} MB`);

  console.log("\nSandbox Configuration:");
  console.log(`  Default Timeout: ${DEFAULT_SANDBOX_CONFIG.timeout} seconds`);
  console.log(`  Default Memory Limit: ${DEFAULT_SANDBOX_CONFIG.memoryLimit} MB`);
  console.log(`  Default CPU Limit: ${DEFAULT_SANDBOX_CONFIG.cpuLimit}`);
  console.log(`  Network Access: ${DEFAULT_SANDBOX_CONFIG.networkAccess ? "Allowed" : "Blocked"}`);
  console.log(`  Strict Security: ${DEFAULT_SANDBOX_CONFIG.strictSecurity ? "Enabled" : "Disabled"}`);

  return options.EXIT.OK;
}

/**
 * Sandbox run command
 */
async function sandboxRunCommand(args: string[], options: PluginOptions): Promise<number> {
  const deps = dependencies(options);
  const pluginPath = args[0];
  const inputFile = options.getOption(args, "--input");
  const outputFile = options.getOption(args, "--output");
  const sandboxValue = options.getOption(args, "--sandbox") ?? "process";
  const executionPolicyFile = options.getOption(args, "--execution-policy");
  const unsafeAllowNone = args.includes("--unsafe-allow-none");
  const timeout = parseInt(options.getOption(args, "--timeout") ?? "60", 10);
  const memory = parseInt(options.getOption(args, "--memory") ?? "512", 10);
  const cpu = parseFloat(options.getOption(args, "--cpu") ?? "0.5");
  const verbose = args.includes("--verbose");

  if (!pluginPath) {
    console.error("Error: Plugin path required");
    console.error("Usage: code-to-gate plugin-sandbox run <plugin-path> --input <file>");
    return options.EXIT.USAGE_ERROR;
  }

  if (!inputFile) {
    console.error("Error: Input file required (--input <file>)");
    return options.EXIT.USAGE_ERROR;
  }

  if (sandboxValue !== "process" && sandboxValue !== "docker" && sandboxValue !== "none") {
    console.error(`Error: Invalid sandbox mode: ${sandboxValue}. Expected process, docker, or none.`);
    return options.EXIT.USAGE_ERROR;
  }
  const sandboxMode = sandboxValue;
  const protectedEnvironment = ["CI", "GITHUB_ACTIONS", "CTG_RELEASE"].some(
    (name) => /^(1|true|yes)$/i.test(process.env[name] ?? "")
  );
  if (sandboxMode === "none" && (!unsafeAllowNone || protectedEnvironment)) {
    console.error("Error: --sandbox none requires --unsafe-allow-none and is forbidden in CI/release");
    return options.EXIT.USAGE_ERROR;
  }

  // Resolve paths
  const cwd = process.cwd();
  const absolutePluginPath = path.resolve(cwd, pluginPath);
  const absoluteInputPath = path.resolve(cwd, inputFile);

  // Check paths exist
  try {
    await fs.access(absolutePluginPath);
  } catch {
    console.error(`Error: Plugin path does not exist: ${pluginPath}`);
    return options.EXIT.USAGE_ERROR;
  }

  try {
    await fs.access(absoluteInputPath);
  } catch {
    console.error(`Error: Input file does not exist: ${inputFile}`);
    return options.EXIT.USAGE_ERROR;
  }

  // Create sandbox config
  const sandboxConfig: SandboxConfig = {
    ...DEFAULT_SANDBOX_CONFIG,
    mode: sandboxMode,
    timeout,
    memoryLimit: memory,
    cpuLimit: cpu,
    networkAccess: args.includes("--allow-network"),
  };

  // Validate sandbox config
  const validation = deps.validateSandboxConfig(sandboxConfig);
  if (!validation.valid) {
    console.error("Error: Invalid sandbox configuration:");
    for (const error of validation.errors) {
      console.error(`  - ${error}`);
    }
    return options.EXIT.USAGE_ERROR;
  }

  // Check Docker availability for docker mode
  if (sandboxMode === "docker") {
    const dockerAvailable = await deps.isDockerSandboxAvailable();
    if (!dockerAvailable) {
      console.error("Error: Docker is not available for sandbox mode");
      console.error("  - Process fallback is intentionally disabled");
      return options.EXIT.USAGE_ERROR;
    }
  }
  if (sandboxMode === "none") {
    console.error(
      "Warning: --sandbox none executes plugin code directly on the host with access to the host environment."
    );
  }

  if (verbose) {
    console.log(`Loading plugin from: ${absolutePluginPath}`);
    console.log(`Input file: ${absoluteInputPath}`);
    console.log(`Sandbox mode: ${sandboxMode}`);
    console.log(`Timeout: ${timeout} seconds`);
    console.log(`Memory limit: ${memory} MB`);
    console.log(`CPU limit: ${cpu}`);
  }

  // Load plugin manifest
  const loader = deps.createPluginLoader();
  const loadResult = await loader.loadManifest(absolutePluginPath);

  if (loadResult.status !== "loaded") {
    console.error(`Error: Failed to load plugin: ${loadResult.status}`);
    if (loadResult.errors) {
      for (const error of loadResult.errors) {
        console.error(`  - ${error.code}: ${error.message}`);
      }
    }
    return options.EXIT.PLUGIN_FAILED;
  }

  const manifest = loadResult.manifest!;

  if (sandboxMode === "process") {
    if (!executionPolicyFile) {
      console.error("Error: Process mode requires --execution-policy <file>; untrusted plugins require Docker");
      return options.EXIT.PLUGIN_FAILED;
    }
    try {
      const policyPath = path.resolve(cwd, executionPolicyFile);
      const policy = loadPluginExecutionPolicy(policyPath);
      const verified = verifyTrustedPlugin(policy, absolutePluginPath, manifest);
      sandboxConfig.timeout = Math.min(sandboxConfig.timeout, verified.process.timeout_seconds);
      sandboxConfig.allowedEnvVars = verified.process.allowed_env_vars;
      sandboxConfig.maxStdoutBytes = verified.process.max_stdout_bytes;
      sandboxConfig.maxStderrBytes = verified.process.max_stderr_bytes;
      sandboxConfig.maxFindings = verified.process.max_findings;
      sandboxConfig.maxEvidencePerFinding = verified.process.max_evidence_per_finding;
      sandboxConfig.nodePermissionModel = verified.process.node_permission_model;
    } catch (error) {
      console.error("Error: " + (error instanceof Error ? error.message : String(error)));
      return options.EXIT.PLUGIN_FAILED;
    }
  }

  const entry: PluginRegistryEntry = {
    manifest,
    path: absolutePluginPath,
    loaded: true,
    enabled: true,
  };

  if (verbose) {
    console.log(`Plugin: ${manifest.name}@${manifest.version}`);
    console.log(`Kind: ${manifest.kind}`);
    console.log(`Capabilities: ${manifest.capabilities.join(", ")}`);
  }

  // Create runner
  const runner = deps.createPluginRunner(sandboxMode, sandboxConfig);

  // Read input
  const inputContent = await fs.readFile(absoluteInputPath, "utf-8");
  const input = JSON.parse(inputContent);

  // Initialize runner
  await runner.initialize({ timeout, workDir: path.join(cwd, ".qh", "plugin-work") });

  // Execute plugin
  const startTime = Date.now();
  const result = await runner.executePlugin(entry, input);
  const duration = Date.now() - startTime;

  // Shutdown runner
  await runner.shutdown();

  if (verbose) {
    console.log(`Execution duration: ${duration}ms`);
    console.log(`Exit status: ${result.status}`);
  }

  // Handle result
  if (result.status === "success" || result.status === "partial") {
    const output = result.output;

    if (outputFile) {
      const absoluteOutputPath = path.resolve(cwd, outputFile);
      await fs.writeFile(absoluteOutputPath, JSON.stringify(output, null, 2), "utf-8");
      if (verbose) {
        console.log(`Output written to: ${outputFile}`);
      }
    } else {
      console.log(JSON.stringify(output, null, 2));
    }

    if (result.status === "partial" && output?.errors) {
      console.error("Plugin executed with errors:");
      for (const error of output.errors) {
        console.error(`  - ${error.code}: ${error.message}`);
      }
      return options.EXIT.PARTIAL_SUCCESS;
    }

    return options.EXIT.OK;
  }

  // Handle failure
  console.error(`Error: Plugin execution failed with status: ${result.status}`);
  if (result.error) {
    console.error(`  Code: ${result.error.code}`);
    console.error(`  Message: ${result.error.message}`);
    if (result.error.details) {
      console.error("  Details:", JSON.stringify(result.error.details, null, 2));
    }
  }

  if (result.status === "timeout") {
    return options.EXIT.PLUGIN_FAILED;
  }

  return options.EXIT.PLUGIN_FAILED;
}

/**
 * Build image command
 */
async function buildImageCommand(args: string[], options: PluginOptions): Promise<number> {
  const deps = dependencies(options);
  const dockerImage = options.getOption(args, "--docker-image") ?? DEFAULT_SANDBOX_CONFIG.dockerImage;
  const verbose = args.includes("--verbose");

  // Check Docker availability
  const dockerAvailable = await deps.isDockerSandboxAvailable();
  if (!dockerAvailable) {
    console.error("Error: Docker is not available");
    return options.EXIT.USAGE_ERROR;
  }

  console.log(`Building Docker image: ${dockerImage}`);

  if (verbose) {
    console.log("Creating Dockerfile...");
  }

  // Create Dockerfile
  const dockerfileDir = path.join(os.tmpdir(), "ctg-dockerfile-build");
  await fs.mkdir(dockerfileDir, { recursive: true });

  const dockerfile = path.join(dockerfileDir, "Dockerfile");
  const dockerfileContent = `# Minimal Node.js plugin runner for code-to-gate
FROM node:20-alpine

# Create non-root user for security
RUN addgroup -S plugin && adduser -S node -G plugin

# Set working directory
WORKDIR /plugin/work

# Set permissions
RUN chmod 755 /plugin/work

# Switch to non-root user
USER node

# Default entrypoint - reads from stdin, writes to stdout
ENTRYPOINT ["node"]
CMD ["-e", "const fs=require('fs');const input=JSON.parse(fs.readFileSync(0,'utf-8'));console.log(JSON.stringify({version:'ctg.plugin-output/v1',findings:[]}))"]
`;

  await fs.writeFile(dockerfile, dockerfileContent, "utf-8");

  if (verbose) {
    console.log("Dockerfile created:");
    console.log(dockerfileContent);
  }

  try {
    console.log("Running docker build...");
    const built = await deps.buildDockerImage(dockerImage, dockerfileDir);
    if (!built) {
      throw new Error("docker build returned a non-zero exit code");
    }

    // Cleanup
    await fs.rm(dockerfileDir, { recursive: true, force: true });

    console.log(`Successfully built image: ${dockerImage}`);
    return options.EXIT.OK;
  } catch (error) {
    console.error(`Error: Failed to build Docker image`);
    console.error(error instanceof Error ? error.message : String(error));

    // Cleanup
    try {
      await fs.rm(dockerfileDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    return options.EXIT.INTERNAL_ERROR;
  }
}
