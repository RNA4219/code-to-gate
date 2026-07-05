import { createOwnershipRisk, writeOwnershipRisk } from "../ownership/ownership-risk.js";
import type { EXIT, getOption } from "./exit-codes.js";
import { emitCliError, emitCliSummary } from "./output.js";

export interface OwnershipCliOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

const VALUE_OPTIONS = new Set(["--from", "--out"]);
const FLAG_OPTIONS = new Set(["--quiet"]);

function printOwnershipHelp(): void {
  console.log(`code-to-gate ownership --from <artifact-dir> [--out <file-or-dir>] [--quiet]

Generates ownership-risk.json from repo-graph.json, optional diff-analysis.json, and CODEOWNERS.`);
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
    return `unknown ownership option: ${arg}`;
  }
  return null;
}

export async function ownershipCommand(args: string[], options: OwnershipCliOptions): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printOwnershipHelp();
    return options.EXIT.OK;
  }

  const argError = validateArgs(args);
  if (argError) {
    emitCliError(argError, {
      code: "USAGE_ERROR",
      command: "ownership",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }

  try {
    const result = createOwnershipRisk({
      version: options.VERSION,
      fromDir: options.getOption(args, "--from") ?? ".qh",
      out: options.getOption(args, "--out"),
    });
    writeOwnershipRisk(result);
    emitCliSummary(args, {
      schema: "ctg.cli.summary@v1",
      tool: { name: "code-to-gate", version: options.VERSION },
      command: "ownership",
      status: result.artifact.status,
      exit_code: options.EXIT.OK,
      output: result.outputPath,
      summary: result.artifact.summary,
      reviewer_candidates: result.artifact.reviewerCandidates,
    });
    return options.EXIT.OK;
  } catch (error) {
    emitCliError(error instanceof Error ? error.message : String(error), {
      code: "OWNERSHIP_FAILED",
      command: "ownership",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }
}
