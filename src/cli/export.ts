/**
 * Export command - Downstream adapter export
 *
 * Generates target-specific payloads for downstream systems:
 * - gatefield: GatefieldStaticResult
 * - state-gate: StateGateEvidence
 * - manual-bb: ManualBbSeed
 * - workflow-evidence: WorkflowEvidence
 * - sarif: SARIF v2.1.0
 * - evidence-dag: Cross-artifact evidence graph
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
  type GatefieldStaticResultV1,
  type StateGateEvidenceV1,
  type ManualBbSeedV1,
  type WorkflowEvidenceV1,
  SUPPORTED_TARGETS,
} from "./export-types.js";
import {
  generateGatefieldResult,
  generateStateGateEvidence,
  generateManualBbSeed,
  generateWorkflowEvidence,
  generateSarif,
  generateGatefieldResultV1,
  generateStateGateEvidenceV1,
  generateManualBbSeedV1,
  generateWorkflowEvidenceV1,
} from "./export-generators.js";
import {
  generateQEGCodeToGateEvidence,
  summarizeAssuranceFindings,
} from "../qeg/qeg-connector.js";
import { generateArtifactHashes } from "../qeg/qeg-artifact-io.js";
import { nodeFileAccess } from "../adapters/node-file-access.js";
import { nodeHashService } from "../adapters/node-hash-service.js";
import { nodePathService } from "../adapters/node-path-service.js";
import { validateAllArtifactsWithResults, validateArtifactFile } from "./schema-validate.js";
import { loadReleaseReadinessArtifact } from "./artifact-loader.js";
import { generateEvidenceDagFromArtifacts } from "../evidence/evidence-dag.js";

export interface ExportOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

// Re-export all types and generators for backward compatibility and testing
export {
  // Legacy v1alpha1 types
  GatefieldStaticResult,
  StateGateEvidence,
  ManualBbSeed,
  WorkflowEvidence,
  SarifResult,
  SUPPORTED_TARGETS,
  // V1 types
  GatefieldStaticResultV1,
  StateGateEvidenceV1,
  ManualBbSeedV1,
  WorkflowEvidenceV1,
  // Legacy v1alpha1 generators
  generateGatefieldResult,
  generateStateGateEvidence,
  generateManualBbSeed,
  generateWorkflowEvidence,
  generateSarif,
  // V1 generators
  generateGatefieldResultV1,
  generateStateGateEvidenceV1,
  generateManualBbSeedV1,
  generateWorkflowEvidenceV1,
};

export async function exportCommand(args: string[], options: ExportOptions): Promise<number> {
  const targetArg = args[0];
  const fromDir = options.getOption(args, "--from");
  const outFile = options.getOption(args, "--out");
  const schemaVersion = options.getOption(args, "--schema-version") ?? "v1";

  if (!targetArg || !fromDir) {
    console.error("usage: code-to-gate export <target> --from <dir> [--out <file>] [--schema-version v1|v1alpha1]");
    console.error(`supported targets: ${SUPPORTED_TARGETS.join(", ")}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!SUPPORTED_TARGETS.includes(targetArg)) {
    console.error(`unsupported target: ${targetArg}`);
    console.error(`supported targets: ${SUPPORTED_TARGETS.join(", ")}`);
    return options.EXIT.USAGE_ERROR;
  }

  // Validate schema version
  if (schemaVersion !== "v1" && schemaVersion !== "v1alpha1") {
    console.error(`unsupported schema version: ${schemaVersion}`);
    console.error("supported versions: v1, v1alpha1");
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

    // Use v1 generators by default, v1alpha1 for backward compatibility
    const useV1 = schemaVersion === "v1";

    switch (targetArg) {
      case "gatefield":
        output = useV1 ? generateGatefieldResultV1(findings) : generateGatefieldResult(findings);
        outputPath = outFile ?? path.join(artifactDir, useV1 ? "gatefield.json" : "gatefield-static-result.json");
        break;

      case "state-gate":
        output = useV1 ? generateStateGateEvidenceV1(findings) : generateStateGateEvidence(findings);
        outputPath = outFile ?? path.join(artifactDir, useV1 ? "state-gate.json" : "state-gate-evidence.json");
        break;

      case "manual-bb":
        output = useV1 ? generateManualBbSeedV1(findings) : generateManualBbSeed(findings);
        outputPath = outFile ?? path.join(artifactDir, useV1 ? "manual-bb.json" : "manual-bb-seed.json");
        break;

      case "workflow-evidence":
        output = useV1 ? generateWorkflowEvidenceV1(findings) : generateWorkflowEvidence(findings);
        outputPath = outFile ?? path.join(artifactDir, useV1 ? "workflow.json" : "workflow-evidence.json");
        break;

      case "sarif":
        output = generateSarif(findings);
        outputPath = outFile ?? path.join(artifactDir, "results.sarif");
        break;

      case "qeg-code-to-gate": {
        // QEG export requires release-readiness.json and schema validation
        const readinessPath = path.join(artifactDir, "release-readiness.json");
        if (!existsSync(readinessPath)) {
          console.error(`core artifact not found: ${fromDir}/release-readiness.json`);
          console.error("qeg-code-to-gate requires both findings.json and release-readiness.json");
          return options.EXIT.USAGE_ERROR;
        }

        const readiness = loadReleaseReadinessArtifact(readinessPath);
        const assurancePath = path.join(artifactDir, "assurance-findings.json");
        let assuranceSummary;
        if (existsSync(assurancePath)) {
          const assuranceValidation = await validateArtifactFile(assurancePath);
          if (assuranceValidation.status === "error") {
            console.error("qeg-code-to-gate requires schema-compliant assurance-findings.json when provided");
            return options.EXIT.INTEGRATION_EXPORT_FAILED;
          }
          const assuranceFindings = JSON.parse(readFileSync(assurancePath, "utf8")) as FindingsArtifact;
          assuranceSummary = summarizeAssuranceFindings(assuranceFindings);
        }
        const schemaResults = await validateAllArtifactsWithResults(artifactDir, true, true, false, { profile: "full" });
        const schemaFailures = schemaResults.filter((result) => result.status === "error");
        if (schemaFailures.length > 0) {
          console.error("qeg-code-to-gate requires strict schema-compliant artifacts");
          for (const failure of schemaFailures) {
            console.error(`  ${failure.artifact}: ${failure.errors?.join(", ") ?? "schema validation failed"}`);
          }
          return options.EXIT.INTEGRATION_EXPORT_FAILED;
        }

        // Generate evidence-only export (no decision)
        const artifactHashes = generateArtifactHashes(artifactDir, {
          fileAccess: nodeFileAccess,
          hashService: nodeHashService,
          pathService: nodePathService,
        });
        const evidence = generateQEGCodeToGateEvidence(
          findings,
          readiness,
          schemaResults,
          artifactDir,
          findings.run_id,
          process.env.GITHUB_SHA?.slice(0, 7),
          artifactHashes,
          assuranceSummary
        );

        outputPath = path.resolve(cwd, outFile ?? path.join(artifactDir, "qeg-code-to-gate.json"));
        writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + "\n", "utf8");

        console.log(
          JSON.stringify({
            tool: "code-to-gate",
            command: "export",
            target: "qeg-code-to-gate",
            input: path.relative(cwd, findingsPath),
            output: path.relative(cwd, outputPath),
            summary: {
              findings: findings.findings.length,
              readiness_status: readiness.status,
              schema_compliance: schemaResults.filter((r) => r.status === "ok").length,
              artifact_hashes: evidence.artifact_hashes.length,
            },
          })
        );

        return options.EXIT.OK;
      }

      case "evidence-dag":
        output = generateEvidenceDagFromArtifacts({
          artifactDir,
          cwd,
          version: options.VERSION,
          ciEnv: process.env,
        });
        outputPath = outFile ?? path.join(artifactDir, "evidence-dag.json");
        break;

      default:
        console.error(`unsupported target: ${targetArg}`);
        return options.EXIT.USAGE_ERROR;
    }

    const absoluteOutputPath = path.resolve(cwd, outputPath);
    writeFileSync(absoluteOutputPath, JSON.stringify(output, null, 2) + "\n", "utf8");

    // Deprecation warning for v1alpha1
    if (!useV1 && targetArg !== "sarif") {
      console.log(
        JSON.stringify({
          warning: "v1alpha1 schema is deprecated, use --schema-version v1 for integration schema compliance",
        })
      );
    }

    console.log(
      JSON.stringify({
        tool: "code-to-gate",
        command: "export",
        target: targetArg,
        schema_version: schemaVersion,
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
