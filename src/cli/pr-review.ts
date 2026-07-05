import { createPrReview, writePrReview } from "../pr-review/pr-review.js";
import type { EXIT, getOption } from "./exit-codes.js";
import { emitCliError, emitCliSummary } from "./output.js";

export interface PrReviewCliOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

const VALUE_OPTIONS = new Set(["--from", "--out", "--comment-file", "--artifact-url"]);
const FLAG_OPTIONS = new Set(["--quiet"]);

function printPrReviewHelp(): void {
  console.log(`code-to-gate pr-review --from <artifact-dir> [--out <file-or-dir>] [--comment-file <file>] [--artifact-url <url>] [--quiet]

Generates pr-review.json and pr-review.md from readiness, findings, test-plan, spec-drift, ownership, QEG, and release evidence artifacts.`);
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
    return `unknown pr-review option: ${arg}`;
  }
  return null;
}

export async function prReviewCommand(args: string[], options: PrReviewCliOptions): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printPrReviewHelp();
    return options.EXIT.OK;
  }

  const argError = validateArgs(args);
  if (argError) {
    emitCliError(argError, {
      code: "USAGE_ERROR",
      command: "pr-review",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }

  try {
    const result = createPrReview({
      version: options.VERSION,
      fromDir: options.getOption(args, "--from") ?? ".qh",
      out: options.getOption(args, "--out"),
      commentFile: options.getOption(args, "--comment-file"),
      artifactUrl: options.getOption(args, "--artifact-url"),
    });
    writePrReview(result);
    const exitCode = result.artifact.status === "block"
      ? options.EXIT.READINESS_NOT_CLEAR
      : options.EXIT.OK;
    emitCliSummary(args, {
      schema: "ctg.cli.summary@v1",
      tool: { name: "code-to-gate", version: options.VERSION },
      command: "pr-review",
      status: result.artifact.status,
      exit_code: exitCode,
      output: {
        artifact: result.artifactPath,
        comment: result.artifact.markdown.path,
      },
      summary: result.artifact.summary,
    });
    return exitCode;
  } catch (error) {
    emitCliError(error instanceof Error ? error.message : String(error), {
      code: "PR_REVIEW_FAILED",
      command: "pr-review",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }
}
