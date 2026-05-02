/**
 * Import command - External tool result import
 *
 * Imports findings from external tools like ESLint, Semgrep, TSC, Coverage
 * and normalizes them to code-to-gate findings format.
 */

import { existsSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ensureDir } from "../core/file-utils.js";
import { EXIT, getOption, VERSION } from "./exit-codes.js";
import {
  FindingsArtifact,
  Finding,
  UpstreamTool,
  CTG_VERSION,
} from "../types/artifacts.js";
import {
  importESLint,
  importSemgrep,
  importTSC,
  importCoverage,
  importTest,
} from "./import-parsers.js";

interface ImportOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

export async function importCommand(args: string[], options: ImportOptions): Promise<number> {
  const toolArg = args[0];
  const inputArg = args[1];
  const outDir = options.getOption(args, "--out") ?? ".qh";

  const supportedTools: UpstreamTool[] = ["eslint", "semgrep", "tsc", "coverage", "test"];

  if (!toolArg || !inputArg) {
    console.error("usage: code-to-gate import <tool> <input-file> --out <dir>");
    console.error(`supported tools: ${supportedTools.join(", ")}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!supportedTools.includes(toolArg as UpstreamTool)) {
    console.error(`unsupported tool: ${toolArg}`);
    console.error(`supported tools: ${supportedTools.join(", ")}`);
    return options.EXIT.USAGE_ERROR;
  }

  const cwd = process.cwd();
  const inputFile = path.resolve(cwd, inputArg);

  if (!existsSync(inputFile)) {
    console.error(`input file not found: ${inputArg}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!statSync(inputFile).isFile()) {
    console.error(`input is not a file: ${inputArg}`);
    return options.EXIT.USAGE_ERROR;
  }

  const absoluteOutDir = path.resolve(cwd, outDir);
  const importsDir = path.join(absoluteOutDir, "imports");

  try {
    let findings: Finding[];

    switch (toolArg) {
      case "eslint":
        findings = importESLint(inputFile);
        break;
      case "semgrep":
        findings = importSemgrep(inputFile);
        break;
      case "tsc":
        findings = importTSC(inputFile);
        break;
      case "coverage":
        findings = importCoverage(inputFile);
        break;
      case "test":
        findings = importTest(inputFile);
        break;
      default:
        console.error(`unsupported tool: ${toolArg}`);
        return options.EXIT.USAGE_ERROR;
    }

    ensureDir(importsDir);

    const now = new Date().toISOString();
    const runId = `import-${toolArg}-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}`;

    const artifact: FindingsArtifact = {
      version: CTG_VERSION,
      generated_at: now,
      run_id: runId,
      repo: { root: "." },
      tool: {
        name: "code-to-gate",
        version: VERSION,
        plugin_versions: [],
      },
      artifact: "findings",
      schema: "findings@v1",
      completeness: findings.length > 0 ? "complete" : "partial",
      findings,
      unsupported_claims: [],
    };

    const outputPath = path.join(importsDir, `${toolArg}-findings.json`);
    writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");

    console.log(
      JSON.stringify({
        tool: "code-to-gate",
        command: "import",
        source: toolArg,
        input: inputArg,
        output: path.relative(cwd, outputPath),
        summary: {
          findings: findings.length,
          critical: findings.filter((f) => f.severity === "critical").length,
          high: findings.filter((f) => f.severity === "high").length,
          medium: findings.filter((f) => f.severity === "medium").length,
          low: findings.filter((f) => f.severity === "low").length,
        },
      })
    );

    return options.EXIT.OK;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.IMPORT_FAILED;
  }
}