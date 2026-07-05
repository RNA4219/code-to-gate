import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import type {
  Severity,
  SpecDriftArtifact,
  SpecDriftCheck,
  SpecDriftCheckStatus,
  SpecDriftCheckType,
  SpecDriftEvidence,
  SpecDriftFinding,
} from "../types/artifacts.js";

interface DetectorOptions {
  repoRoot: string;
  version: string;
  now?: Date;
}

interface ArtifactDocRef {
  fileName: string;
  schemaFile: string;
}

const PUBLIC_SCHEMA_EXCLUDES = new Set([
  "shared-defs.schema.json",
  "evidence-ref.schema.json",
  "policy.schema.json",
]);

const DOC_ARTIFACT_SCHEMA_MAP: Record<string, string | undefined> = {
  "repo-graph.json": "normalized-repo-graph.schema.json",
  "raw-findings.json": "raw-findings.schema.json",
  "findings.json": "findings.schema.json",
  "risk-register.yaml": "risk-register.schema.json",
  "invariants.json": "invariants.schema.json",
  "invariants.yaml": "invariants.schema.json",
  "test-seeds.json": "test-seeds.schema.json",
  "test-plan.json": "test-plan.schema.json",
  "quality-pack.json": "quality-pack.schema.json",
  "release-pack.json": "release-pack.schema.json",
  "release-pack.html": undefined,
  "release-pack.zip": undefined,
  "hosted-static-report.json": "hosted-static-report.schema.json",
  "schema-migration.json": "schema-migration.schema.json",
  "ownership-risk.json": "ownership-risk.schema.json",
  "release-readiness.json": "release-readiness.schema.json",
  "audit.json": "audit.schema.json",
  "database-assets.json": "database-assets.schema.json",
  "diff.json": "diff-analysis.schema.json",
  "diff-analysis.json": "diff-analysis.schema.json",
  "self-analysis-debt.json": "self-analysis-debt.schema.json",
  "evidence-dag.json": "evidence-dag.schema.json",
  "spec-drift.json": "spec-drift.schema.json",
  "doctor.json": "doctor.schema.json",
};

const DOC_ARTIFACT_IGNORE = new Set([
  "analysis-report.md",
  "results.sarif",
  "sbom.json",
  "qeg-code-to-gate.json",
  "gatefield.json",
  "state-gate.json",
  "manual-bb.json",
  "workflow.json",
  "gatefield-static-result.json",
  "state-gate-evidence.json",
  "manual-bb-seed.json",
  "workflow-evidence.json",
]);

function readText(repoRoot: string, relativePath: string): string {
  const filePath = path.join(repoRoot, relativePath);
  if (!existsSync(filePath)) {
    return "";
  }
  return readFileSync(filePath, "utf8");
}

function pathExists(repoRoot: string, relativePath: string): boolean {
  return existsSync(path.join(repoRoot, relativePath));
}

function collectEvidence(paths: string[], detail: string): SpecDriftEvidence[] {
  return paths.map((p) => ({ path: p, detail }));
}

function createCheck(input: {
  id: string;
  type: SpecDriftCheckType;
  status: SpecDriftCheckStatus;
  summary: string;
  expected?: string[];
  actual?: string[];
  evidence: SpecDriftEvidence[];
}): SpecDriftCheck {
  return input;
}

function missingItems(expected: string[], text: string): string[] {
  return expected.filter((item) => !text.includes(item));
}

function extractSupportedExportTargets(exportTypesContent: string): string[] {
  const match = exportTypesContent.match(/SUPPORTED_TARGETS\s*=\s*\[([^\]]+)\]/s);
  if (!match) {
    return [];
  }

  return Array.from(match[1].matchAll(/"([^"]+)"/g), (targetMatch) => targetMatch[1]).sort();
}

function extractSchemaValidateFiles(schemaValidateContent: string): string[] {
  const match = schemaValidateContent.match(/const schemaFiles\s*=\s*\[([\s\S]*?)\];/);
  if (!match) {
    return [];
  }

  return Array.from(match[1].matchAll(/"([^"]+\.schema\.json)"/g), (fileMatch) => fileMatch[1]).sort();
}

function listPublicSchemaFiles(repoRoot: string): string[] {
  const schemaDir = path.join(repoRoot, "schemas");
  if (!existsSync(schemaDir) || !statSync(schemaDir).isDirectory()) {
    return [];
  }

  return readdirSync(schemaDir)
    .filter((file) => file.endsWith(".schema.json"))
    .filter((file) => !PUBLIC_SCHEMA_EXCLUDES.has(file))
    .sort();
}

function extractDocumentedArtifacts(content: string): ArtifactDocRef[] {
  const files = Array.from(
    content.matchAll(/`([^`]+\.(?:json|yaml|yml|sarif|md))`/g),
    (match) => match[1]
  );

  const refs: ArtifactDocRef[] = [];
  for (const fileName of files) {
    if (DOC_ARTIFACT_IGNORE.has(fileName)) {
      continue;
    }
    const schemaFile = DOC_ARTIFACT_SCHEMA_MAP[fileName];
    if (schemaFile) {
      refs.push({ fileName, schemaFile });
    }
  }

  return refs;
}

function checkExportTargetDrift(repoRoot: string): SpecDriftCheck[] {
  const exportTypesPath = "src/cli/export-types.ts";
  const cliPath = "src/cli.ts";
  const docsPath = "docs/cli-reference.md";
  const exportTargets = extractSupportedExportTargets(readText(repoRoot, exportTypesPath));
  const cliContent = readText(repoRoot, cliPath);
  const docsContent = readText(repoRoot, docsPath);

  const missingFromCliHelp = missingItems(exportTargets, cliContent);
  const missingFromCliReference = missingItems(exportTargets, docsContent);

  return [
    createCheck({
      id: "command.export-targets.cli-help",
      type: "command",
      status: missingFromCliHelp.length > 0 ? "fail" : "pass",
      summary: missingFromCliHelp.length > 0
        ? `Export targets missing from CLI help: ${missingFromCliHelp.join(", ")}`
        : "CLI help lists every supported export target.",
      expected: exportTargets,
      actual: exportTargets.filter((target) => cliContent.includes(target)),
      evidence: collectEvidence([exportTypesPath, cliPath], "SUPPORTED_TARGETS must be reflected in top-level help."),
    }),
    createCheck({
      id: "command.export-targets.cli-reference",
      type: "command",
      status: missingFromCliReference.length > 0 ? "fail" : "pass",
      summary: missingFromCliReference.length > 0
        ? `Export targets missing from CLI reference: ${missingFromCliReference.join(", ")}`
        : "CLI reference lists every supported export target.",
      expected: exportTargets,
      actual: exportTargets.filter((target) => docsContent.includes(target)),
      evidence: collectEvidence([exportTypesPath, docsPath], "SUPPORTED_TARGETS must be documented for users and CI reviewers."),
    }),
  ];
}

function checkSchemaRegistration(repoRoot: string): SpecDriftCheck {
  const schemaValidatePath = "src/cli/schema-validate.ts";
  const publicSchemaFiles = listPublicSchemaFiles(repoRoot);
  const registeredSchemaFiles = extractSchemaValidateFiles(readText(repoRoot, schemaValidatePath));
  const missingFromRegistration = publicSchemaFiles.filter((file) => !registeredSchemaFiles.includes(file));

  return createCheck({
    id: "schema.public-schemas.registered",
    type: "schema",
    status: missingFromRegistration.length > 0 ? "fail" : "pass",
    summary: missingFromRegistration.length > 0
      ? `Public schemas missing from schema validator preload: ${missingFromRegistration.join(", ")}`
      : "All public schemas are preloaded by schema validation.",
    expected: publicSchemaFiles,
    actual: registeredSchemaFiles,
    evidence: collectEvidence(["schemas", schemaValidatePath], "Public artifact schemas must be loadable by schema validation."),
  });
}

function checkDocumentedArtifactSchemas(repoRoot: string): SpecDriftCheck {
  const docsPaths = ["README.md", "README_JA.md", "docs/cli-reference.md"];
  const schemaFiles = listPublicSchemaFiles(repoRoot);
  const documentedRefs = docsPaths.flatMap((docPath) =>
    extractDocumentedArtifacts(readText(repoRoot, docPath)).map((ref) => ({ ...ref, docPath }))
  );

  const missingSchemas = documentedRefs
    .filter((ref) => !schemaFiles.includes(ref.schemaFile))
    .map((ref) => `${ref.docPath}:${ref.fileName}->${ref.schemaFile}`);

  return createCheck({
    id: "schema.documented-artifacts.have-schema",
    type: "schema",
    status: missingSchemas.length > 0 ? "fail" : "pass",
    summary: missingSchemas.length > 0
      ? `Documented artifacts missing schema files: ${missingSchemas.join(", ")}`
      : "Documented public artifacts map to existing schemas.",
    expected: documentedRefs.map((ref) => ref.schemaFile).sort(),
    actual: schemaFiles,
    evidence: collectEvidence([...docsPaths, "schemas"], "Documented public artifacts must have schema coverage."),
  });
}

function checkSchemaTestCoverage(repoRoot: string): SpecDriftCheck {
  const coveragePath = "tests/integration/schema-coverage.test.ts";
  const coverageContent = readText(repoRoot, coveragePath);
  const publicSchemaFiles = listPublicSchemaFiles(repoRoot);
  const missingFromCoverage = publicSchemaFiles.filter((file) => !coverageContent.includes(file));

  return createCheck({
    id: "test.public-schemas.covered",
    type: "test",
    status: missingFromCoverage.length > 0 ? "fail" : "pass",
    summary: missingFromCoverage.length > 0
      ? `Public schemas missing from schema coverage tests: ${missingFromCoverage.join(", ")}`
      : "Public schemas have explicit schema coverage tests.",
    expected: publicSchemaFiles,
    actual: publicSchemaFiles.filter((file) => coverageContent.includes(file)),
    evidence: collectEvidence(["schemas", coveragePath], "Schema drift must be backed by explicit coverage."),
  });
}

function checkRequiredPaths(repoRoot: string): SpecDriftCheck {
  const requiredPaths = [
    "README.md",
    "README_JA.md",
    "RUNBOOK.md",
    "docs/quality-evidence-os-requirements.md",
    "docs/quality-evidence-os-spec.md",
    "docs/cli-reference.md",
    "src/cli.ts",
    "src/cli/export-types.ts",
    "src/cli/schema-validate.ts",
    "tests/integration/schema-coverage.test.ts",
    "schemas",
  ];
  const missingPaths = requiredPaths.filter((requiredPath) => !pathExists(repoRoot, requiredPath));

  return createCheck({
    id: "status.required-spec-surfaces.present",
    type: "status",
    status: missingPaths.length > 0 ? "fail" : "pass",
    summary: missingPaths.length > 0
      ? `Required spec surfaces are missing: ${missingPaths.join(", ")}`
      : "Required docs, schema, implementation, and test surfaces are present.",
    expected: requiredPaths,
    actual: requiredPaths.filter((requiredPath) => pathExists(repoRoot, requiredPath)),
    evidence: collectEvidence(requiredPaths, "Spec drift requires stable comparison surfaces."),
  });
}

function severityForCheck(check: SpecDriftCheck): Severity {
  if (check.type === "command" || check.type === "schema") {
    return "high";
  }
  if (check.type === "test") {
    return "medium";
  }
  return "low";
}

function findingFromFailedCheck(check: SpecDriftCheck, index: number): SpecDriftFinding {
  return {
    id: `spec-drift-${String(index + 1).padStart(3, "0")}`,
    severity: severityForCheck(check),
    category: "release-risk",
    title: `Spec drift: ${check.id}`,
    summary: check.summary,
    sourceCheckId: check.id,
    evidence: check.evidence,
  };
}

export function detectSpecDrift(options: DetectorOptions): SpecDriftArtifact {
  const generatedAt = (options.now ?? new Date()).toISOString();
  const checks = [
    checkRequiredPaths(options.repoRoot),
    ...checkExportTargetDrift(options.repoRoot),
    checkSchemaRegistration(options.repoRoot),
    checkDocumentedArtifactSchemas(options.repoRoot),
    checkSchemaTestCoverage(options.repoRoot),
  ];
  const failedChecks = checks.filter((check) => check.status === "fail");
  const warnings = checks.filter((check) => check.status === "warning");
  const findings = failedChecks.map((check, index) => findingFromFailedCheck(check, index));

  return {
    version: "ctg/v1",
    generated_at: generatedAt,
    run_id: `spec-drift-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    repo: { root: options.repoRoot },
    tool: { name: "code-to-gate", version: options.version, plugin_versions: [] },
    artifact: "spec-drift",
    schema: "spec-drift@v1",
    completeness: "complete",
    status: failedChecks.length > 0 ? "failed" : "passed",
    checks,
    findings,
    summary: {
      checks: checks.length,
      failed: failedChecks.length,
      warnings: warnings.length,
      findings: findings.length,
    },
  };
}
