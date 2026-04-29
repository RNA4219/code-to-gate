#!/usr/bin/env node
import { schemaValidate } from "./cli/schema-validate.js";
import { scanCommand } from "./cli/scan.js";
import { analyzeCommand } from "./cli/analyze.js";
import { diffCommand } from "./cli/diff.js";
import { importCommand } from "./cli/import.js";
import { readinessCommand } from "./cli/readiness.js";
import { exportCommand } from "./cli/export.js";

const EXIT = {
  OK: 0,
  READINESS_NOT_CLEAR: 1,
  USAGE_ERROR: 2,
  SCAN_FAILED: 3,
  LLM_FAILED: 4,
  POLICY_FAILED: 5,
  PLUGIN_FAILED: 6,
  SCHEMA_FAILED: 7,
  IMPORT_FAILED: 8,
  INTEGRATION_EXPORT_FAILED: 9,
  INTERNAL_ERROR: 10,
};

const VERSION = "0.1.0";

function printHelp(): void {
  console.log(`code-to-gate ${VERSION}

Usage:
  code-to-gate schema validate <artifact-or-schema>
  code-to-gate scan <repo> --out <dir>
  code-to-gate analyze <repo> [--emit all] --out <dir> [--require-llm]
  code-to-gate diff <repo> --base <ref> --head <ref> --out <dir>
  code-to-gate import <tool> <input-file> --out <dir>
    Tools: eslint, semgrep, tsc, coverage, test
  code-to-gate readiness <repo> --policy <file> [--from <dir>] --out <dir>
  code-to-gate export <target> --from <dir> [--out <file>]
    Targets: gatefield, state-gate, manual-bb, workflow-evidence, sarif

Options:
  --out <dir>        Output directory (default: .qh)
  --base <ref>       Base ref for diff (branch, commit, tag)
  --head <ref>       Head ref for diff (branch, commit, tag)
  --policy <file>    Policy file for readiness evaluation
  --from <dir>       Input artifact directory
  --emit <formats>   Output formats (all, json, yaml, md, mermaid)
  --require-llm      Require LLM analysis (not yet implemented)
  --help, -h         Show this help
  --version          Show version`);
}

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(): Promise<number> {
  try {
    const [command, ...args] = process.argv.slice(2);

    if (!command || command === "--help" || command === "-h") {
      printHelp();
      return EXIT.OK;
    }

    if (command === "--version") {
      console.log(`code-to-gate ${VERSION}`);
      return EXIT.OK;
    }

    if (command === "schema") {
      return await schemaValidate(args);
    }

    if (command === "scan") {
      return scanCommand(args, { VERSION, EXIT, getOption });
    }

    if (command === "analyze") {
      return await analyzeCommand(args, { VERSION, EXIT, getOption });
    }

    if (command === "diff") {
      return await diffCommand(args, { VERSION, EXIT, getOption });
    }

    if (command === "import") {
      return await importCommand(args, { VERSION, EXIT, getOption });
    }

    if (command === "readiness") {
      return await readinessCommand(args, { VERSION, EXIT, getOption });
    }

    if (command === "export") {
      return await exportCommand(args, { VERSION, EXIT, getOption });
    }

    console.error(`unknown command: ${command}`);
    console.error("Run 'code-to-gate --help' for usage information");
    return EXIT.USAGE_ERROR;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return EXIT.INTERNAL_ERROR;
  }
}

main().then((code) => {
  process.exitCode = code;
});