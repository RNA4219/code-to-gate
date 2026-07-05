import { createRuleScaffold } from "../rule-sdk/rule-scaffold.js";
import type { EXIT, getOption } from "./exit-codes.js";
import { emitCliError, emitCliSummary } from "./output.js";

export interface RuleCliOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

function printRuleHelp(): void {
  console.log(`code-to-gate rule <command>

Commands:
  new <id> [--out <dir>] [--category <category>] [--severity <severity>] [--description <text>] [--force]

Examples:
  code-to-gate rule new unsafe-redirect --out .ctg/rules
  code-to-gate rule new payment-total --category payment --severity critical`);
}

export async function ruleCommand(args: string[], options: RuleCliOptions): Promise<number> {
  const [command, ...rest] = args;

  if (!command || command === "--help" || command === "-h") {
    printRuleHelp();
    return options.EXIT.OK;
  }

  if (command !== "new") {
    emitCliError(`unknown rule command: ${command}`, {
      code: "UNKNOWN_RULE_COMMAND",
      command: "rule",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }

  const id = rest[0];
  if (!id || id.startsWith("-")) {
    emitCliError("usage: code-to-gate rule new <id> [--out <dir>] [--category <category>] [--severity <severity>] [--description <text>] [--force]", {
      code: "USAGE_ERROR",
      command: "rule new",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }

  try {
    const result = createRuleScaffold({
      id,
      outRoot: options.getOption(rest, "--out") ?? ".ctg/rules",
      category: options.getOption(rest, "--category"),
      severity: options.getOption(rest, "--severity"),
      description: options.getOption(rest, "--description"),
      force: rest.includes("--force"),
    });

    emitCliSummary(rest, {
      schema: "ctg.cli.summary@v1",
      tool: { name: "code-to-gate", version: options.VERSION },
      command: "rule new",
      status: "ok",
      exit_code: options.EXIT.OK,
      rule_id: result.ruleId,
      output_dir: result.outputDir,
      files: result.files,
    });
    return options.EXIT.OK;
  } catch (error) {
    emitCliError(error instanceof Error ? error.message : String(error), {
      code: "RULE_SCAFFOLD_FAILED",
      command: "rule new",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }
}
