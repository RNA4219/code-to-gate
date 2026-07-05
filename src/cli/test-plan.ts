import { createTestPlan, writeTestPlan } from "../test-plan/test-plan.js";
import type { EXIT, getOption } from "./exit-codes.js";
import { emitCliError, emitCliSummary } from "./output.js";

export interface TestPlanCliOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

const VALUE_OPTIONS = new Set(["--from", "--out"]);
const FLAG_OPTIONS = new Set(["--quiet"]);

function printTestPlanHelp(): void {
  console.log(`code-to-gate test-plan --from <artifact-dir> [--out <file-or-dir>] [--quiet]

Generates test-plan.json from repo-graph.json and optional diff-analysis.json.`);
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
    return `unknown test-plan option: ${arg}`;
  }
  return null;
}

export async function testPlanCommand(args: string[], options: TestPlanCliOptions): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printTestPlanHelp();
    return options.EXIT.OK;
  }

  const argError = validateArgs(args);
  if (argError) {
    emitCliError(argError, {
      code: "USAGE_ERROR",
      command: "test-plan",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }

  try {
    const result = createTestPlan({
      version: options.VERSION,
      fromDir: options.getOption(args, "--from") ?? ".qh",
      out: options.getOption(args, "--out"),
    });
    writeTestPlan(result);
    emitCliSummary(args, {
      schema: "ctg.cli.summary@v1",
      tool: { name: "code-to-gate", version: options.VERSION },
      command: "test-plan",
      status: result.artifact.status,
      exit_code: options.EXIT.OK,
      output: result.outputPath,
      summary: result.artifact.summary,
    });
    return options.EXIT.OK;
  } catch (error) {
    emitCliError(error instanceof Error ? error.message : String(error), {
      code: "TEST_PLAN_FAILED",
      command: "test-plan",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }
}
