import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import yamlImport from "js-yaml";
import type {
  FindingsArtifact,
  InvariantsArtifact,
  NormalizedRepoGraph,
  ReleaseReadinessArtifact,
  RiskRegisterArtifact,
  TestSeedsArtifact,
} from "../types/artifacts.js";
import type {
  AssuranceArtifactBundle,
  AssuranceIntake,
} from "../application/assurance/assurance-graph.js";
import type { AssuranceInspectionResult } from "../application/assurance/assurance-detector.js";
import { validateArtifactFile } from "./schema-validate.js";

export class AssuranceArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssuranceArtifactError";
  }
}

export interface LoadedAssuranceArtifacts {
  bundle: AssuranceArtifactBundle;
  findingsHeader: FindingsArtifact;
}

function readArtifact(filePath: string): unknown {
  try {
    const content = readFileSync(filePath, "utf8");
    if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
      return yamlImport.load(content, { schema: yamlImport.JSON_SCHEMA });
    }
    return JSON.parse(content);
  } catch (error) {
    throw new AssuranceArtifactError(
      `failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function requireIdentity(
  value: unknown,
  filePath: string,
  artifact: string,
  schema: string
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AssuranceArtifactError(`${filePath} must contain an artifact object`);
  }
  const record = value as Record<string, unknown>;
  if (record.artifact !== artifact || record.schema !== schema) {
    throw new AssuranceArtifactError(
      `${filePath} must identify as ${artifact}/${schema}`
    );
  }
  return record;
}

async function validateForAssurance(filePath: string): Promise<void> {
  const result = await validateArtifactFile(filePath);
  if (result.status === "error") {
    throw new AssuranceArtifactError(
      `schema validation failed for ${filePath}: ${(result.errors ?? []).join("; ")}`
    );
  }
}

async function optionalArtifact<T>(
  artifactDir: string,
  fileName: string,
  artifact: string,
  schema: string
): Promise<T | undefined> {
  const filePath = path.join(artifactDir, fileName);
  if (!existsSync(filePath)) return undefined;
  await validateForAssurance(filePath);
  const value = readArtifact(filePath);
  requireIdentity(value, filePath, artifact, schema);
  return value as T;
}

export async function loadAssuranceArtifacts(artifactDir: string): Promise<LoadedAssuranceArtifacts> {
  const findingsPath = path.join(artifactDir, "findings.json");
  const graphPath = path.join(artifactDir, "repo-graph.json");
  if (!existsSync(findingsPath)) {
    throw new AssuranceArtifactError(`required artifact missing: ${findingsPath}`);
  }
  if (!existsSync(graphPath)) {
    throw new AssuranceArtifactError(`required artifact missing: ${graphPath}`);
  }

  await validateForAssurance(findingsPath);
  await validateForAssurance(graphPath);
  const findingsValue = readArtifact(findingsPath);
  requireIdentity(findingsValue, findingsPath, "findings", "findings@v1");
  const findings = findingsValue as FindingsArtifact;

  const graphValue = readArtifact(graphPath);
  requireIdentity(graphValue, graphPath, "normalized-repo-graph", "normalized-repo-graph@v1");
  const repoGraph = graphValue as NormalizedRepoGraph;

  const risks = await optionalArtifact<RiskRegisterArtifact>(
    artifactDir, "risk-register.yaml", "risk-register", "risk-register@v1"
  );
  const testSeeds = await optionalArtifact<TestSeedsArtifact>(
    artifactDir, "test-seeds.json", "test-seeds", "test-seeds@v1"
  );
  const invariants = await optionalArtifact<InvariantsArtifact>(
    artifactDir, "invariants.json", "invariants", "invariants@v1"
  );
  const releaseReadiness = await optionalArtifact<ReleaseReadinessArtifact>(
    artifactDir, "release-readiness.json", "release-readiness", "release-readiness@v1"
  );

  const intakePath = path.join(artifactDir, "intake.json");
  const intake = existsSync(intakePath)
    ? readArtifact(intakePath) as AssuranceIntake
    : undefined;

  return {
    findingsHeader: findings,
    bundle: {
      findings: findings.findings,
      repoGraph,
      riskRegister: risks?.risks,
      testSeeds: testSeeds?.seeds,
      invariants: invariants?.invariants,
      releaseReadiness,
      intake,
    },
  };
}

export function createAssuranceFindingsArtifact(
  source: FindingsArtifact,
  result: AssuranceInspectionResult,
  generatedAt: string,
  runId: string
): FindingsArtifact {
  return {
    ...source,
    generated_at: generatedAt,
    run_id: runId,
    artifact: "findings",
    schema: "findings@v1",
    completeness: result.graph.coverage.partialInput || result.truncated ? "partial" : "complete",
    findings: result.candidates,
    unsupported_claims: result.unsupportedClaims,
  };
}

export function writeAssuranceFindingsArtifact(
  outputPath: string,
  artifact: FindingsArtifact
): void {
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}
