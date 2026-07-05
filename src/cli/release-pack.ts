import { createReleasePack } from "../release-pack/release-pack.js";
import type { EXIT, getOption } from "./exit-codes.js";
import { emitCliError, emitCliSummary } from "./output.js";

export interface ReleasePackCliOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

const VALUE_OPTIONS = new Set(["--from", "--out", "--ci-url"]);
const FLAG_OPTIONS = new Set(["--include-optional", "--allow-partial", "--quiet"]);

function printReleasePackHelp(): void {
  console.log(`code-to-gate release-pack [--from <artifact-dir>] [--out <file-or-dir>] [--ci-url <url>] [--include-optional] [--allow-partial] [--quiet]

Assembles release-pack.json, release-pack.html, and release-pack.zip from release evidence artifacts.`);
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
    return `unknown release-pack option: ${arg}`;
  }
  return null;
}

export async function releasePackCommand(args: string[], options: ReleasePackCliOptions): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printReleasePackHelp();
    return options.EXIT.OK;
  }

  const argError = validateArgs(args);
  if (argError) {
    emitCliError(argError, {
      code: "USAGE_ERROR",
      command: "release-pack",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }

  try {
    const result = createReleasePack({
      version: options.VERSION,
      fromDir: options.getOption(args, "--from") ?? ".qh",
      out: options.getOption(args, "--out"),
      ciUrl: options.getOption(args, "--ci-url"),
      includeOptional: args.includes("--include-optional"),
      allowPartial: args.includes("--allow-partial"),
    });
    const exitCode = result.missingRequired.length > 0 && !args.includes("--allow-partial")
      ? options.EXIT.READINESS_NOT_CLEAR
      : options.EXIT.OK;

    emitCliSummary(args, {
      schema: "ctg.cli.summary@v1",
      tool: { name: "code-to-gate", version: options.VERSION },
      command: "release-pack",
      status: result.artifact.status,
      exit_code: exitCode,
      output: {
        manifest: result.artifact.outputs.manifest,
        html: result.artifact.outputs.html,
        zip: result.artifact.outputs.zip,
      },
      missing_required: result.missingRequired.map((entry) => entry.id),
      summary: result.artifact.summary,
    });
    return exitCode;
  } catch (error) {
    emitCliError(error instanceof Error ? error.message : String(error), {
      code: "RELEASE_PACK_FAILED",
      command: "release-pack",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }
}
