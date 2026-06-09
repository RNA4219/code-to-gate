import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { inspectAssurance } from "../application/assurance/assurance-detector.js";
import { nodeClockService } from "../adapters/node-clock-service.js";
import { nodeHashService } from "../adapters/node-hash-service.js";
import {
  AssuranceArtifactError,
  createAssuranceFindingsArtifact,
  loadAssuranceArtifacts,
  writeAssuranceFindingsArtifact,
} from "./assurance-artifact-io.js";
import type { EXIT, getOption } from "./exit-codes.js";

interface AssuranceCommandOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

function isDirectory(value: string): boolean {
  return existsSync(value) && statSync(value).isDirectory();
}

export async function assuranceCommand(
  args: string[],
  options: AssuranceCommandOptions
): Promise<number> {
  const [subcommand, repoArg] = args;
  const fromArg = options.getOption(args, "--from");
  if (subcommand !== "inspect" || !repoArg || !fromArg) {
    console.error("usage: code-to-gate assurance inspect <repo> --from <artifact-dir> [--out <file>] [--min-confidence <0..1>] [--include-low-confidence]");
    return options.EXIT.USAGE_ERROR;
  }

  const repo = path.resolve(repoArg);
  const artifactDir = path.resolve(fromArg);
  if (!isDirectory(repo) || !isDirectory(artifactDir)) {
    console.error("repo and --from must reference existing directories");
    return options.EXIT.USAGE_ERROR;
  }

  const confidenceArg = options.getOption(args, "--min-confidence");
  const minConfidence = args.includes("--include-low-confidence")
    ? 0
    : confidenceArg === undefined ? 0.6 : Number(confidenceArg);
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    console.error("--min-confidence must be a number between 0 and 1");
    return options.EXIT.USAGE_ERROR;
  }

  const outputPath = path.resolve(
    options.getOption(args, "--out") ?? path.join(artifactDir, "assurance-findings.json")
  );

  try {
    const loaded = await loadAssuranceArtifacts(artifactDir);
    const result = inspectAssurance(loaded.bundle, nodeHashService, { minConfidence });
    const artifact = createAssuranceFindingsArtifact(
      loaded.findingsHeader,
      result,
      nodeClockService.now(),
      nodeClockService.runId()
    );
    writeAssuranceFindingsArtifact(outputPath, artifact);
    console.log(`assurance findings: ${outputPath}`);
    console.log(`candidates: ${result.candidates.length}, unsupported claims: ${result.unsupportedClaims.length}, partial: ${artifact.completeness === "partial"}, truncated: ${result.truncated}`);
    return options.EXIT.OK;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return error instanceof AssuranceArtifactError
      ? options.EXIT.SCHEMA_FAILED
      : options.EXIT.ASSURANCE_FAILED;
  }
}
