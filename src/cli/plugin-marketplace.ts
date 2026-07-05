import { createPluginMarketplace, writePluginMarketplace } from "../plugin/marketplace.js";
import type { EXIT, getOption } from "./exit-codes.js";
import { emitCliError, emitCliSummary } from "./output.js";

export interface PluginMarketplaceCliOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

const VALUE_OPTIONS = new Set(["--plugins", "--out"]);
const FLAG_OPTIONS = new Set(["--allow-invalid", "--quiet"]);

function printPluginMarketplaceHelp(): void {
  console.log(`code-to-gate plugin-marketplace --plugins <dir[,dir...]> [--out <file-or-dir>] [--allow-invalid] [--quiet]

Builds plugin-marketplace.json from local plugin manifests.`);
}

function validateArgs(args: string[]): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (VALUE_OPTIONS.has(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        return `${arg} requires a value`;
      }
      index += 1;
      continue;
    }
    if (FLAG_OPTIONS.has(arg) || arg === "--help" || arg === "-h") {
      continue;
    }
    return `unknown plugin-marketplace option: ${arg}`;
  }
  return null;
}

function parsePluginPaths(args: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--plugins") {
      continue;
    }
    const value = args[index + 1];
    if (value) {
      values.push(...value.split(/[;,]/).map((item) => item.trim()).filter(Boolean));
    }
    index += 1;
  }
  return [...new Set(values)];
}

export async function pluginMarketplaceCommand(args: string[], options: PluginMarketplaceCliOptions): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printPluginMarketplaceHelp();
    return options.EXIT.OK;
  }

  const argError = validateArgs(args);
  if (argError) {
    emitCliError(argError, {
      code: "USAGE_ERROR",
      command: "plugin-marketplace",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }

  const pluginPaths = parsePluginPaths(args);
  if (pluginPaths.length === 0) {
    emitCliError("plugin-marketplace requires --plugins <dir[,dir...]>", {
      code: "USAGE_ERROR",
      command: "plugin-marketplace",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }

  try {
    const result = await createPluginMarketplace({
      version: options.VERSION,
      pluginPaths,
      out: options.getOption(args, "--out"),
    });
    writePluginMarketplace(result);
    const exitCode = result.artifact.summary.invalid > 0 && !args.includes("--allow-invalid")
      ? options.EXIT.PLUGIN_FAILED
      : options.EXIT.OK;
    emitCliSummary(args, {
      schema: "ctg.cli.summary@v1",
      tool: { name: "code-to-gate", version: options.VERSION },
      command: "plugin-marketplace",
      status: result.artifact.status,
      exit_code: exitCode,
      output: result.outputPath,
      summary: result.artifact.summary,
    });
    return exitCode;
  } catch (error) {
    emitCliError(error instanceof Error ? error.message : String(error), {
      code: "PLUGIN_MARKETPLACE_FAILED",
      command: "plugin-marketplace",
      exitCode: options.EXIT.PLUGIN_FAILED,
    });
    return options.EXIT.PLUGIN_FAILED;
  }
}
