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
 * - provenance-index: Human surface locator to source artifact index
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
  generateQeos039040ManualBbSeedV1,
  generateWorkflowEvidence,
  generateSarif,
  generateGatefieldResultV1,
  generateStateGateEvidenceV1,
  generateManualBbSeedV1,
  generateWorkflowEvidenceV1,
} from "./export-generators.js";
import {
  generateQEGCodeToGateEvidence,
  readinessStatusToProducerConclusion,
  summarizeAssuranceFindings,
} from "../qeg/qeg-connector.js";
import { generateArtifactHashes } from "../qeg/qeg-artifact-io.js";
import { nodeFileAccess } from "../adapters/node-file-access.js";
import { nodeHashService } from "../adapters/node-hash-service.js";
import { nodePathService } from "../adapters/node-path-service.js";
import { validateAllArtifactsWithResults, validateArtifactFile } from "./schema-validate.js";
import { loadReleaseReadinessArtifact } from "./artifact-loader.js";
import { generateEvidenceDagFromArtifacts } from "../evidence/evidence-dag.js";
import { generateEvidenceProvenanceIndex } from "../evidence/provenance-index.js";
import type { ArtifactHash } from "../qeg/qeg-types.js";

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
  generateQeos039040ManualBbSeedV1,
  generateWorkflowEvidence,
  generateSarif,
  // V1 generators
  generateGatefieldResultV1,
  generateStateGateEvidenceV1,
  generateManualBbSeedV1,
  generateWorkflowEvidenceV1,
};

function severityCounts(findings: FindingsArtifact): { critical: number; high: number; medium: number; low: number } {
  return {
    critical: findings.findings.filter((finding) => finding.severity === "critical").length,
    high: findings.findings.filter((finding) => finding.severity === "high").length,
    medium: findings.findings.filter((finding) => finding.severity === "medium").length,
    low: findings.findings.filter((finding) => finding.severity === "low").length,
  };
}

function resolveQegHeadSha(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.CTG_QEG_HEAD_SHA ?? env.GITHUB_HEAD_SHA ?? env.GITHUB_SHA;
}

function qegSourceRef(id: string, pathValue: string, label?: string): Record<string, unknown> {
  return { id, path: pathValue, ...(label ? { label } : {}) };
}

function qegTrace(sourceRef: Record<string, unknown>, confidence: "low" | "medium" | "high" = "high"): Record<string, unknown> {
  return { sourceRefs: [sourceRef], assumptions: [], confidence };
}

function artifactRefFromHash(hash: ArtifactHash, revision?: string, adapter = "code-to-gate"): Record<string, unknown> {
  return {
    id: `${adapter === "hate" ? "hate" : "ctg"}:artifact-${hash.artifact.replace(/[^A-Za-z0-9_.-]/g, "-")}`,
    adapter,
    kind: hash.artifact.replace(/\.json$/, ""),
    path: hash.path,
    contentHash: hash.hash,
    ...(revision ? { revision } : {}),
  };
}

function generateHateQegBundle(
  findings: FindingsArtifact,
  readinessStatus: string,
  artifactHashes: ArtifactHash[],
  artifactDir: string,
  commitSha?: string
): Record<string, unknown> {
  const now = new Date().toISOString();
  const counts = severityCounts(findings);
  const sourceRefs = ["docs/specs/SPEC-30-five-tool-qeg-gate.md"];
  const inputArtifacts = artifactHashes
    .filter((hash) => ["findings.json", "release-readiness.json", "results.sarif"].includes(hash.artifact))
    .map((hash) => ({
      kind: hash.artifact.replace(/\.json$/, ""),
      path: hash.path,
      contentHash: hash.hash,
      producer: "code-to-gate",
      ...(commitSha ? { revision: commitSha } : {}),
    }));

  return {
    metadata: {
      qegVersion: "HATE/v1",
      runId: `hate:run-${findings.run_id}`,
      runAttempt: 1,
      createdAt: now,
      profile: "standard",
      repoRoot: findings.repo.root,
      headRef: commitSha,
      inputArtifacts,
      debugOnly: false,
    },
    nodes: [
      {
        id: "hate:test-code-to-gate-ci",
        kind: "test",
        label: "code-to-gate CI quality commands",
        data: {
          layer: "system",
          command: "npm run build; npm run quality:spec-drift; npm run quality:qeos-matrix",
          existing: true,
          evidenceStrength: readinessStatus === "passed" ? 0.8 : 0.5,
          recentGreenRuns: readinessStatus === "passed" ? 1 : 0,
          sourceArtifactPaths: inputArtifacts.map((artifact) => artifact.path),
        },
        sourceRefs,
      },
      {
        id: "hate:evidence-auto-test-gap",
        kind: "execution_evidence",
        label: "Automated evidence availability and gap record",
        data: {
          passed: readinessStatus === "passed",
          readinessStatus,
          missingInputs: inputArtifacts.some((artifact) => artifact.kind === "results.sarif")
            ? []
            : ["junit", "lcov"],
          note: "HATE-compatible optional evidence; QEG remains final gate owner.",
        },
        sourceRefs,
      },
    ],
    edges: [{
      id: "hate:edge-test-evidenced-by-gap-record",
      kind: "evidenced_by",
      from: "hate:test-code-to-gate-ci",
      to: "hate:evidence-auto-test-gap",
      traceability: {
        sourceRefs,
        confidence: "medium",
        assumptions: [],
      },
    }],
    completeness: {
      score: readinessStatus === "passed" ? 0.85 : 0.65,
      partial: true,
      parserFailures: [],
      unsupportedClaims: [{
        id: "hate:unsupported-full-auto-test-ingest",
        claim: `Raw findings remain critical=${counts.critical}, high=${counts.high}; HATE records optional evidence and does not issue the release verdict.`,
        nodeIds: ["hate:evidence-auto-test-gap"],
        gateRelevant: false,
      }],
      excludedArtifacts: inputArtifacts.some((artifact) => artifact.kind === "results.sarif")
        ? []
        : ["junit", "lcov"],
    },
    summary: {
      producer: "hate",
      role: "optional_auto_test_evidence",
      readiness_status: readinessStatus,
      artifact_dir: artifactDir,
      raw_findings: counts,
    },
  };
}

function generateQegGateInput(
  findings: FindingsArtifact,
  readiness: ReturnType<typeof loadReleaseReadinessArtifact>,
  artifactHashes: ArtifactHash[],
  artifactDir: string,
  commitSha?: string
): Record<string, unknown> {
  const now = new Date().toISOString();
  const counts = severityCounts(findings);
  const runId = `qeg:run-${findings.run_id}`;
  const policyHash = "sha256:ctg-qeg-policy-v1";
  const evidencePackageHash = `sha256:ctg-evidence-package-${findings.run_id}`;
  const sourceRef = qegSourceRef("ctg:sr-spec-30", "docs/specs/SPEC-30-five-tool-qeg-gate.md", "SPEC-30");
  const readinessRef = qegSourceRef("ctg:sr-readiness", "release-readiness.json", "readiness");
  const evidenceRef = qegSourceRef("ctg:sr-qeg-export", "qeg-code-to-gate.json", "QEG input");
  const inputArtifacts = artifactHashes.map((hash) => artifactRefFromHash(hash, commitSha));
  const policy = {
    policyId: "qeg:policy-ctg-five-tool-001",
    policyHash,
    profile: "ipo_controlled",
    effectiveDate: "2026-07-05T00:00:00.000Z",
    approver: "code-to-gate-maintainer",
    sourceRefs: [sourceRef],
    dqScope: Array.from({ length: 17 }, (_, index) => `DQ-${String(index + 1).padStart(2, "0")}`),
    exitCodePolicy: { go: 0, conditional_go: 2, no_go: 2, disqualified: 2 },
  };
  const metadata = {
    qegVersion: "0.1",
    runId,
    createdAt: now,
    profile: "ipo_controlled",
    repoRoot: findings.repo.root,
    headRef: commitSha,
    policyId: policy.policyId,
    policyHash,
    inputArtifacts,
    producerChecks: [{
      id: "ctg:producer-check-readiness",
      producer: "code-to-gate",
      name: "release-readiness",
      conclusion: readinessStatusToProducerConclusion(readiness.status),
      readinessStatus: readiness.status,
      headSha: commitSha,
      runId: `ctg:run-${findings.run_id}`,
      sourceRefs: [readinessRef],
    }],
  };

  const graph = {
    metadata,
    nodes: [
      {
        id: "ctg:req-five-tool-gate",
        kind: "requirement",
        title: "Five-tool evidence chain has source-backed QEG handoff",
        priority: "P1",
        acceptanceCriteriaIds: ["ctg:ac-qeg-gate-input"],
        traceability: qegTrace(sourceRef),
        sourceArtifactIds: inputArtifacts.map((artifact) => String(artifact.id)),
      },
      {
        id: "ctg:ac-qeg-gate-input",
        kind: "acceptance_criteria",
        title: "QEG gate input is generated from code-to-gate artifacts",
        requirementIds: ["ctg:req-five-tool-gate"],
        oracleRefs: [{ id: "ctg:ev-qeg-gate-input", path: "qeg-gate/gate-input.json", evidenceKind: "audit", capturedAt: now }],
        traceability: qegTrace(evidenceRef),
        sourceArtifactIds: inputArtifacts.map((artifact) => String(artifact.id)),
      },
      {
        id: "ctg:finding-debt-summary",
        kind: "finding",
        title: `Raw finding debt visible: critical=${counts.critical}, high=${counts.high}, medium=${counts.medium}, low=${counts.low}`,
        severity: counts.critical > 0 ? "critical" : counts.high > 0 ? "high" : counts.medium > 0 ? "medium" : "low",
        ruleId: "RAW_FINDING_DEBT_VISIBLE",
        changedCodeIds: [],
        traceability: qegTrace(readinessRef),
        sourceArtifactIds: inputArtifacts.map((artifact) => String(artifact.id)),
      },
      {
        id: "ctg:evidence-readiness",
        kind: "execution_evidence",
        title: `code-to-gate readiness status: ${readiness.status}`,
        evidenceRefs: [{ id: "ctg:ev-release-readiness", path: "release-readiness.json", evidenceKind: "audit", capturedAt: now, label: "release readiness" }],
        passed: readiness.status === "passed" || readiness.status === "passed_with_risk",
        traceability: qegTrace(readinessRef),
        sourceArtifactIds: inputArtifacts.map((artifact) => String(artifact.id)),
      },
    ],
    edges: [
      { id: "ctg:edge-ac-supports-requirement", kind: "satisfies", from: "ctg:ac-qeg-gate-input", to: "ctg:req-five-tool-gate", traceability: qegTrace(sourceRef) },
      { id: "ctg:edge-readiness-supports-ac", kind: "supports", from: "ctg:evidence-readiness", to: "ctg:ac-qeg-gate-input", traceability: qegTrace(readinessRef) },
    ],
    completeness: { score: 1, partial: false, parserFailures: [], unsupportedClaims: [] },
  };

  return {
    metadata,
    graph,
    policy,
    waivers: [],
    evidencePackage: {
      id: "qeg:ep-ctg-five-tool",
      createdAt: now,
      createdBy: "code-to-gate",
      inputArtifactHashes: inputArtifacts,
      qegOutputs: {
        qegBundle: { id: "qeg:qeg-ctg-five-tool", adapter: "qeg-native", kind: "quality_evidence_record", path: "output-record.json" },
        testPlacementPlan: { id: "qeg:tpp-ctg-five-tool", adapter: "qeg-native", kind: "test_model", path: "placement-plan.json" },
        gateVerdict: { id: "qeg:gv-ctg-five-tool", adapter: "qeg-native", kind: "gate_decision", path: "gate-verdict.json" },
        qualityEvidenceRecord: { id: "qeg:qer-ctg-five-tool", adapter: "qeg-native", kind: "quality_evidence_record", path: "output-record.json" },
      },
      gatePolicy: policy,
      waivers: [],
      approvalEvidence: [{
        id: "qeg:approval-ctg-five-tool",
        policyId: policy.policyId,
        policyHash,
        evidencePackageHash,
        approvedBy: "code-to-gate-maintainer",
        approvedAt: now,
        sourceRefs: [sourceRef],
      }],
      manualEvidence: [],
      retention: {
        retentionPeriod: "30 days",
        retentionOwner: "code-to-gate-maintainer",
        storageLocation: artifactDir,
        contentHash: evidencePackageHash,
        capturedAt: now,
        tamperEvidence: evidencePackageHash,
        reverificationMethod: "hash verification and QEG validate/gate",
        sourceRefs: [sourceRef],
        storageClassification: "versioned",
      },
      sourceRefs: [sourceRef, readinessRef, evidenceRef],
      phase: "release_decision",
      evidencePackageHash,
      controlRoles: {
        producer: "code-to-gate",
        reviewer: "code-to-gate-reviewer",
        approver: "code-to-gate-maintainer",
        waiverApprover: "qeg-waiver-approver",
        releaseOwner: "qeg-release-owner",
      },
    },
    placementPlan: { metadata, obligations: [], placements: [] },
  };
}

export async function exportCommand(args: string[], options: ExportOptions): Promise<number> {
  const targetArg = args[0];
  const fromDir = options.getOption(args, "--from");
  const outFile = options.getOption(args, "--out");
  const schemaVersion = options.getOption(args, "--schema-version") ?? "v1";
  const exportScope = options.getOption(args, "--scope");

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
        output = useV1
          ? exportScope === "qeos-039-040"
            ? generateQeos039040ManualBbSeedV1(findings)
            : generateManualBbSeedV1(findings)
          : generateManualBbSeed(findings);
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
          resolveQegHeadSha(),
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

      case "hate-qeg-bundle": {
        const readinessPath = path.join(artifactDir, "release-readiness.json");
        if (!existsSync(readinessPath)) {
          console.error(`core artifact not found: ${fromDir}/release-readiness.json`);
          console.error("hate-qeg-bundle requires both findings.json and release-readiness.json");
          return options.EXIT.USAGE_ERROR;
        }

        const readiness = loadReleaseReadinessArtifact(readinessPath);
        const artifactHashes = generateArtifactHashes(artifactDir, {
          fileAccess: nodeFileAccess,
          hashService: nodeHashService,
          pathService: nodePathService,
        });
        output = generateHateQegBundle(
          findings,
          readiness.status,
          artifactHashes,
          artifactDir,
          resolveQegHeadSha()
        );
        outputPath = outFile ?? path.join(artifactDir, "hate-qeg-bundle.json");
        break;
      }

      case "qeg-gate-input": {
        const readinessPath = path.join(artifactDir, "release-readiness.json");
        if (!existsSync(readinessPath)) {
          console.error(`core artifact not found: ${fromDir}/release-readiness.json`);
          console.error("qeg-gate-input requires both findings.json and release-readiness.json");
          return options.EXIT.USAGE_ERROR;
        }

        const readiness = loadReleaseReadinessArtifact(readinessPath);
        const artifactHashes = generateArtifactHashes(artifactDir, {
          fileAccess: nodeFileAccess,
          hashService: nodeHashService,
          pathService: nodePathService,
        });
        const gateInput = generateQegGateInput(
          findings,
          readiness,
          artifactHashes,
          artifactDir,
          resolveQegHeadSha()
        );
        const gateDir = path.resolve(cwd, outFile ?? path.join(artifactDir, "qeg-gate"));
        if (!existsSync(gateDir)) {
          await import("node:fs").then(({ mkdirSync }) => mkdirSync(gateDir, { recursive: true }));
        }
        const gateInputPath = path.join(gateDir, "gate-input.json");
        const expectedVerdictPath = path.join(gateDir, "expected-gate-verdict.json");
        writeFileSync(gateInputPath, JSON.stringify(gateInput, null, 2) + "\n", "utf8");
        writeFileSync(expectedVerdictPath, JSON.stringify({
          fixture: "code-to-gate-five-tool-qeg-gate",
          description: "Generated Code-to-gate five-tool QEG fixture should validate and gate to go when readiness passed",
          expectedVerdict: "go",
          expectedDisqualifications: [],
          expectedBlockers: [],
          expectedResidualRisks: [],
          expectedHumanReview: [],
          expectedExitCode: 0,
          contractRef: "docs/specs/SPEC-30-five-tool-qeg-gate.md",
        }, null, 2) + "\n", "utf8");

        console.log(
          JSON.stringify({
            tool: "code-to-gate",
            command: "export",
            target: "qeg-gate-input",
            input: path.relative(cwd, findingsPath),
            output: path.relative(cwd, gateInputPath),
            summary: {
              findings: findings.findings.length,
              readiness_status: readiness.status,
              artifact_hashes: artifactHashes.length,
              expected_verdict: "go",
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

      case "provenance-index":
        output = generateEvidenceProvenanceIndex({
          artifactDir,
          cwd,
          version: options.VERSION,
          findings,
        });
        outputPath = outFile ?? path.join(artifactDir, "evidence-provenance-index.json");
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
