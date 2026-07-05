import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createRuleScaffold } from "../rule-sdk/rule-scaffold.js";
import { createRuleQualityScore } from "../rule-sdk/rule-quality-score.js";
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
  score <rule-or-plugin> [--out <file-or-dir>] [--quiet]

Examples:
  code-to-gate rule new unsafe-redirect --out .ctg/rules
  code-to-gate rule new payment-total --category payment --severity critical
  code-to-gate rule score .ctg/rules/unsafe-redirect --out .qh`);
}

function scoreOutputPath(target: string, out: string | undefined): string {
  if (!out) return path.resolve(process.cwd(), target, "rule-quality-score.json");
  const absolute = path.resolve(process.cwd(), out);
  return absolute.endsWith(".json") ? absolute : path.join(absolute, "rule-quality-score.json");
}

export async function ruleCommand(args: string[], options: RuleCliOptions): Promise<number> {
  const [command, ...rest] = args;

  if (!command || command === "--help" || command === "-h") {
    printRuleHelp();
    return options.EXIT.OK;
  }

  if (command === "score") {
    const target = rest[0];
    if (!target || target.startsWith("-")) {
      emitCliError("usage: code-to-gate rule score <rule-or-plugin> [--out <file-or-dir>] [--quiet]", {
        code: "USAGE_ERROR",
        command: "rule score",
        exitCode: options.EXIT.USAGE_ERROR,
      });
      return options.EXIT.USAGE_ERROR;
    }

    try {
      const artifact = createRuleQualityScore({ target, version: options.VERSION });
      const outputPath = scoreOutputPath(target, options.getOption(rest, "--out"));
      mkdirSync(path.dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
      emitCliSummary(rest, {
        schema: "ctg.cli.summary@v1",
        tool: { name: "code-to-gate", version: options.VERSION },
        command: "rule score",
        status: "ok",
        exit_code: options.EXIT.OK,
        output: outputPath,
        summary: artifact.summary,
      });
      return options.EXIT.OK;
    } catch (error) {
      emitCliError(error instanceof Error ? error.message : String(error), {
        code: "RULE_SCORE_FAILED",
        command: "rule score",
        exitCode: options.EXIT.USAGE_ERROR,
      });
      return options.EXIT.USAGE_ERROR;
    }
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
