#!/usr/bin/env node
import { schemaValidate } from "./cli/schema-validate.js";
import { scanCommand } from "./cli/scan.js";
import { analyzeCommand } from "./cli/analyze.js";
import { diffCommand } from "./cli/diff.js";
import { importCommand } from "./cli/import.js";
import { readinessCommand } from "./cli/readiness.js";
import { exportCommand } from "./cli/export.js";
import { viewerCommand } from "./cli/viewer.js";
import { llmHealthCommand } from "./cli/llm-health.js";
import { historicalCommand } from "./cli/historical.js";
import { evidenceCommand } from "./cli/evidence.js";
import { pluginSandboxCommand } from "./cli/plugin-sandbox.js";
import { EXIT, getOption } from "./cli/exit-codes.js";

const VERSION = "0.2.0-alpha.1";

function printHelp(): void {
  console.log(`code-to-gate ${VERSION}

Usage:
  code-to-gate schema validate <artifact-or-schema>
  code-to-gate scan <repo> --out <dir>
  code-to-gate analyze <repo> [--emit all] --out <dir> [--require-llm] [--llm-provider <provider>]
  code-to-gate diff <repo> --base <ref> --head <ref> --out <dir>
  code-to-gate import <tool> <input-file> --out <dir>
    Tools: eslint, semgrep, tsc, coverage, test
  code-to-gate readiness <repo> --policy <file> [--from <dir>] --out <dir>
  code-to-gate export <target> --from <dir> [--out <file>]
    Targets: gatefield, state-gate, manual-bb, workflow-evidence, sarif
  code-to-gate viewer --from <dir> [--out <file>] [--title <title>] [--dark]
  code-to-gate historical --current <dir> --previous <dir> [--out <file>] [--history <dir>]
  code-to-gate llm-health [--provider <provider>] [--all]
  code-to-gate evidence <command>
    Commands: bundle, validate, list, extract
    bundle:   Create evidence bundle from artifact directory
              --from <dir> --out <bundle.zip> [--include-optional] [--sign]
    validate: Validate evidence bundle
              <bundle.zip> [--strict] [--validate-schemas]
    list:     List bundle contents
              <bundle.zip>
    extract:  Extract bundle contents
              <bundle.zip> --out <dir>
  code-to-gate plugin-sandbox <command>
    Commands: status, run, build-image
    status:      Check Docker availability and sandbox status
    run:         Execute a plugin in sandbox mode
                 <plugin-path> --input <file> [--sandbox docker] [--timeout <s>]
    build-image: Build the Docker image for plugin execution

Options:
  --out <dir>        Output directory (default: .qh)
  --base <ref>       Base ref for diff (branch, commit, tag)
  --head <ref>       Head ref for diff (branch, commit, tag)
  --policy <file>    Policy file for readiness evaluation
  --from <dir>       Input artifact directory
  --emit <formats>   Output formats (all, json, yaml, md, mermaid)
  --require-llm      Require LLM analysis
  --llm-provider     LLM provider (ollama, llamacpp, deterministic)
  --llm-mode         LLM mode (local-only, allow-cloud)
  --llm-model        Model name for provider
  --llm-port         Custom port for provider
  --cache <mode>     Cache mode: enabled, disabled, force (default: enabled)
                     enabled  - Use incremental cache for faster scans
                     disabled - Skip caching, fresh scan each time
                     force    - Ignore cache, rebuild and update cache
  --parallel <n>     Max parallel workers for file parsing (default: 4)
  --plugin-sandbox   Sandbox mode for plugin execution: none, docker (default: none)
  --verbose          Show detailed progress and timing information
  --title <title>    Report title for viewer
  --dark             Enable dark mode for viewer
  --current <dir>    Current run artifact directory (historical)
  --previous <dir>   Previous run artifact directory (historical)
  --history <dir>    Directory with historical runs for trend analysis
  --help, -h         Show this help
  --version          Show version

Local LLM Providers:
  ollama       - Ollama server (default port: 11434)
  llamacpp     - llama.cpp server (default port: 8080)
  deterministic - Built-in deterministic fallback (always available)

Plugin Sandbox:
  none         - Direct process execution (no isolation)
  docker       - Execute plugins in isolated Docker containers`);
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

    if (command === "viewer") {
      return await viewerCommand(args, { VERSION, EXIT, getOption });
    }

    if (command === "llm-health") {
      return await llmHealthCommand(args, { VERSION, EXIT, getOption });
    }

    if (command === "historical") {
      return await historicalCommand(args, { VERSION, EXIT, getOption });
    }

    if (command === "evidence") {
      return await evidenceCommand(args, { VERSION, EXIT, getOption });
    }

    if (command === "plugin-sandbox") {
      return await pluginSandboxCommand(args, { VERSION, EXIT, getOption });
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