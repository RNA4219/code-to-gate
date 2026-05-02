/**
 * Export command - Downstream adapter export
 *
 * Generates target-specific payloads for downstream systems:
 * - gatefield: GatefieldStaticResult
 * - state-gate: StateGateEvidence
 * - manual-bb: ManualBbSeed
 * - workflow-evidence: WorkflowEvidence
 * - sarif: SARIF v2.1.0
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EXIT, getOption } from "./exit-codes.js";
import type { FindingsArtifact } from "../types/artifacts.js";
import {
  type GatefieldStaticResult,
  type StateGateEvidence,
  type ManualBbSeed,
  type WorkflowEvidence,
  type SarifResult,
  SUPPORTED_TARGETS,
} from "./export-types.js";
import {
  generateGatefieldResult,
  generateStateGateEvidence,
  generateManualBbSeed,
  generateWorkflowEvidence,
  generateSarif,
} from "./export-generators.js";

export interface ExportOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

// Re-export types for backward compatibility
export {
  GatefieldStaticResult,
  StateGateEvidence,
  ManualBbSeed,
  WorkflowEvidence,
  SarifResult,
  SUPPORTED_TARGETS,
};

export async function exportCommand(args: string[], options: ExportOptions): Promise<number> {
  const targetArg = args[0];
  const fromDir = options.getOption(args, "--from");
  const outFile = options.getOption(args, "--out");

  if (!targetArg || !fromDir) {
    console.error("usage: code-to-gate export <target> --from <dir> [--out <file>]");
    console.error(`supported targets: ${SUPPORTED_TARGETS.join(", ")}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!SUPPORTED_TARGETS.includes(targetArg)) {
    console.error(`unsupported target: ${targetArg}`);
    console.error(`supported targets: ${SUPPORTED_TARGETS.join(", ")}`);
    return options.EXIT.USAGE_ERROR;
  }

  const cwd = process.cwd();
  const artifactDir = path.resolve(cwd, fromDir);

  if (!existsSync(artifactDir)) {
    console.error(`artifact directory not found: ${fromDir}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!statSync(artifactDir).isDirectory()) {
    console.error(`artifact path is not a directory: ${fromDir}`);
    return options.EXIT.USAGE_ERROR;
  }

  const findingsPath = path.join(artifactDir, "findings.json");
  if (!existsSync(findingsPath)) {
    console.error(`core artifact not found: ${fromDir}/findings.json`);
    return options.EXIT.USAGE_ERROR;
  }

  try {
    const findingsContent = readFileSync(findingsPath, "utf8");
    const findings: FindingsArtifact = JSON.parse(findingsContent);

    let output: unknown;
    let outputPath: string;

    switch (targetArg) {
      case "gatefield":
        output = generateGatefieldResult(findings);
        outputPath = outFile ?? path.join(artifactDir, "gatefield-static-result.json");
        break;

      case "state-gate":
        output = generateStateGateEvidence(findings);
        outputPath = outFile ?? path.join(artifactDir, "state-gate-evidence.json");
        break;

      case "manual-bb":
        output = generateManualBbSeed(findings);
        outputPath = outFile ?? path.join(artifactDir, "manual-bb-seed.json");
        break;

      case "workflow-evidence":
        output = generateWorkflowEvidence(findings);
        outputPath = outFile ?? path.join(artifactDir, "workflow-evidence.json");
        break;

      case "sarif":
        output = generateSarif(findings);
        outputPath = outFile ?? path.join(artifactDir, "results.sarif");
        break;

      default:
        console.error(`unsupported target: ${targetArg}`);
        return options.EXIT.USAGE_ERROR;
    }

    const absoluteOutputPath = path.resolve(cwd, outputPath);
    writeFileSync(absoluteOutputPath, JSON.stringify(output, null, 2) + "\n", "utf8");

    console.log(
      JSON.stringify({
        tool: "code-to-gate",
        command: "export",
        target: targetArg,
        input: path.relative(cwd, findingsPath),
        output: path.relative(cwd, absoluteOutputPath),
        summary: {
          findings: findings.findings.length,
          rules: targetArg === "sarif"
            ? new Set(findings.findings.map((f) => f.ruleId)).size
            : undefined,
        },
      })
    );

    return options.EXIT.OK;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.INTEGRATION_EXPORT_FAILED;
  }
}