import { existsSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ensureDir } from "../core/file-utils.js";
import { detectSpecDrift } from "../spec-drift/spec-drift-detector.js";
import type { EXIT, getOption } from "./exit-codes.js";
import { emitCliSummary } from "./output.js";

export interface SpecDriftCommandOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

export async function specDriftCommand(
  args: string[],
  options: SpecDriftCommandOptions
): Promise<number> {
  const repoArg = args[0];
  const outDir = options.getOption(args, "--out") ?? ".qh";

  if (!repoArg || repoArg.startsWith("--")) {
    console.error("usage: code-to-gate spec-drift <repo> --out <dir>");
    return options.EXIT.USAGE_ERROR;
  }

  const cwd = process.cwd();
  const repoRoot = path.resolve(cwd, repoArg);
  const absoluteOutDir = path.resolve(cwd, outDir);

  if (!existsSync(repoRoot)) {
    console.error(`repository not found: ${repoArg}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!statSync(repoRoot).isDirectory()) {
    console.error(`repository path is not a directory: ${repoArg}`);
    return options.EXIT.USAGE_ERROR;
  }

  try {
    ensureDir(absoluteOutDir);
    const artifact = detectSpecDrift({ repoRoot, version: options.VERSION });
    const outputPath = path.join(absoluteOutDir, "spec-drift.json");
    writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");

    emitCliSummary(args, {
      schema: "ctg.cli.summary@v1",
      tool: "code-to-gate",
      command: "spec-drift",
      status: artifact.status,
      exit_code: artifact.status === "passed" ? options.EXIT.OK : options.EXIT.READINESS_NOT_CLEAR,
      output: path.relative(cwd, outputPath),
      summary: artifact.summary,
    });

    return artifact.status === "passed" ? options.EXIT.OK : options.EXIT.READINESS_NOT_CLEAR;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.INTERNAL_ERROR;
  }
}
