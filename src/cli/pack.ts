import {
  QUALITY_PACKS,
  getQualityPack,
  createQualityPackArtifact,
  createQualityPackGoldenSuiteArtifact,
  writeQualityPackArtifact,
  writeQualityPackGoldenSuiteArtifact,
  writeQualityPackPolicy,
} from "../quality-packs/quality-packs.js";
import type { EXIT, getOption } from "./exit-codes.js";
import { emitCliError, emitCliSummary } from "./output.js";

export interface PackCliOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

const VALUE_OPTIONS = new Set(["--out"]);
const FLAG_OPTIONS = new Set(["--quiet"]);

function printPackHelp(): void {
  console.log(`code-to-gate pack <command>

Commands:
  list [--quiet]
  show <id> [--out <file-or-dir>] [--quiet]
  golden-suite <id> [--out <file-or-dir>] [--quiet]
  export-policy <id> --out <file> [--quiet]

Examples:
  code-to-gate pack list
  code-to-gate pack show security-basic --out .qh
  code-to-gate pack golden-suite security-basic --out .qh
  code-to-gate pack export-policy security-basic --out .ctg/policy.yaml`);
}

function validateOptions(args: string[], allowedPositionals: number): string | null {
  let positionals = 0;
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
    if (arg.startsWith("--")) {
      return `unknown pack option: ${arg}`;
    }
    positionals += 1;
    if (positionals > allowedPositionals) {
      return `unexpected pack argument: ${arg}`;
    }
  }
  return null;
}

function positionalArgs(args: string[]): string[] {
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (VALUE_OPTIONS.has(arg)) {
      index += 1;
      continue;
    }
    if (FLAG_OPTIONS.has(arg) || arg === "--help" || arg === "-h") {
      continue;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
    }
  }
  return positionals;
}

export async function packCommand(args: string[], options: PackCliOptions): Promise<number> {
  const [command, ...rest] = args;

  if (!command || command === "--help" || command === "-h") {
    printPackHelp();
    return options.EXIT.OK;
  }

  if (command === "list") {
    const argError = validateOptions(rest, 0);
    if (argError) {
      emitCliError(argError, {
        code: "USAGE_ERROR",
        command: "pack list",
        exitCode: options.EXIT.USAGE_ERROR,
      });
      return options.EXIT.USAGE_ERROR;
    }
    emitCliSummary(rest, {
      schema: "ctg.cli.summary@v1",
      tool: { name: "code-to-gate", version: options.VERSION },
      command: "pack list",
      status: "ok",
      exit_code: options.EXIT.OK,
      packs: QUALITY_PACKS.map((qualityPack) => ({
        id: qualityPack.id,
        name: qualityPack.name,
        maturity: qualityPack.maturity,
        tags: qualityPack.tags,
      })),
    });
    return options.EXIT.OK;
  }

  if (command === "show") {
    const argError = validateOptions(rest, 1);
    const id = positionalArgs(rest)[0];
    if (argError || !id) {
      emitCliError(argError ?? "usage: code-to-gate pack show <id> [--out <file-or-dir>] [--quiet]", {
        code: "USAGE_ERROR",
        command: "pack show",
        exitCode: options.EXIT.USAGE_ERROR,
      });
      return options.EXIT.USAGE_ERROR;
    }

    try {
      const result = createQualityPackArtifact({
        id,
        version: options.VERSION,
        out: options.getOption(rest, "--out"),
      });
      const out = options.getOption(rest, "--out");
      if (out) {
        writeQualityPackArtifact(result);
      }
      if (out) {
        emitCliSummary(rest, {
          schema: "ctg.cli.summary@v1",
          tool: { name: "code-to-gate", version: options.VERSION },
          command: "pack show",
          status: "ok",
          exit_code: options.EXIT.OK,
          pack_id: result.artifact.pack.id,
          output: result.outputPath,
        });
      } else {
        emitCliSummary(rest, result.artifact as unknown as Record<string, unknown>);
      }
      return options.EXIT.OK;
    } catch (error) {
      emitCliError(error instanceof Error ? error.message : String(error), {
        code: "PACK_FAILED",
        command: "pack show",
        exitCode: options.EXIT.USAGE_ERROR,
      });
      return options.EXIT.USAGE_ERROR;
    }
  }

  if (command === "export-policy") {
    const argError = validateOptions(rest, 1);
    const id = positionalArgs(rest)[0];
    const out = options.getOption(rest, "--out");
    if (argError || !id || !out) {
      emitCliError(argError ?? "usage: code-to-gate pack export-policy <id> --out <file> [--quiet]", {
        code: "USAGE_ERROR",
        command: "pack export-policy",
        exitCode: options.EXIT.USAGE_ERROR,
      });
      return options.EXIT.USAGE_ERROR;
    }

    const qualityPack = getQualityPack(id);
    if (!qualityPack) {
      emitCliError(`unknown quality pack: ${id}`, {
        code: "PACK_FAILED",
        command: "pack export-policy",
        exitCode: options.EXIT.USAGE_ERROR,
      });
      return options.EXIT.USAGE_ERROR;
    }

    try {
      const output = writeQualityPackPolicy(qualityPack, out);
      emitCliSummary(rest, {
        schema: "ctg.cli.summary@v1",
        tool: { name: "code-to-gate", version: options.VERSION },
        command: "pack export-policy",
        status: "ok",
        exit_code: options.EXIT.OK,
        pack_id: qualityPack.id,
        output,
      });
      return options.EXIT.OK;
    } catch (error) {
      emitCliError(error instanceof Error ? error.message : String(error), {
        code: "PACK_FAILED",
        command: "pack export-policy",
        exitCode: options.EXIT.USAGE_ERROR,
      });
      return options.EXIT.USAGE_ERROR;
    }
  }

  if (command === "golden-suite") {
    const argError = validateOptions(rest, 1);
    const id = positionalArgs(rest)[0];
    if (argError || !id) {
      emitCliError(argError ?? "usage: code-to-gate pack golden-suite <id> [--out <file-or-dir>] [--quiet]", {
        code: "USAGE_ERROR",
        command: "pack golden-suite",
        exitCode: options.EXIT.USAGE_ERROR,
      });
      return options.EXIT.USAGE_ERROR;
    }

    try {
      const result = createQualityPackGoldenSuiteArtifact({
        id,
        version: options.VERSION,
        out: options.getOption(rest, "--out"),
      });
      const out = options.getOption(rest, "--out");
      if (out) {
        writeQualityPackGoldenSuiteArtifact(result);
      }
      if (out) {
        emitCliSummary(rest, {
          schema: "ctg.cli.summary@v1",
          tool: { name: "code-to-gate", version: options.VERSION },
          command: "pack golden-suite",
          status: result.artifact.fpFnSummary.status,
          exit_code: options.EXIT.OK,
          pack_id: result.artifact.packId,
          output: result.outputPath,
        });
      } else {
        emitCliSummary(rest, result.artifact as unknown as Record<string, unknown>);
      }
      return options.EXIT.OK;
    } catch (error) {
      emitCliError(error instanceof Error ? error.message : String(error), {
        code: "PACK_FAILED",
        command: "pack golden-suite",
        exitCode: options.EXIT.USAGE_ERROR,
      });
      return options.EXIT.USAGE_ERROR;
    }
  }

  emitCliError(`unknown pack command: ${command}`, {
    code: "UNKNOWN_PACK_COMMAND",
    command: "pack",
    exitCode: options.EXIT.USAGE_ERROR,
  });
  return options.EXIT.USAGE_ERROR;
}
