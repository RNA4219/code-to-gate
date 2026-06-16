import type { FileAccess, HashService, PathService } from "../types/contracts.js";
import type { ArtifactHash, QEGCodeToGateEvidence } from "./qeg-types.js";

export interface QEGArtifactServices {
  fileAccess: FileAccess;
  hashService: HashService;
  pathService: PathService;
}

export type LoadQEGCodeToGateEvidenceResult =
  | { status: "success"; value: QEGCodeToGateEvidence }
  | { status: "missing" }
  | { status: "invalid_json"; message: string };

const ARTIFACT_NAMES = [
  "findings.json",
  "release-readiness.json",
  "repo-graph.json",
  "audit.json",
  "risk-register.yaml",
  "test-seeds.json",
  "invariants.json",
  "assurance-findings.json",
] as const;

export function generateArtifactHashes(
  artifactDir: string,
  services: QEGArtifactServices
): ArtifactHash[] {
  const hashes: ArtifactHash[] = [];

  for (const artifact of ARTIFACT_NAMES) {
    const filePath = services.pathService.join(artifactDir, artifact);
    const content = services.fileAccess.readFile(filePath);
    if (content !== null) {
      hashes.push({
        artifact,
        path: filePath,
        hash: `sha256:${services.hashService.sha256(content)}`,
      });
    }
  }

  return hashes;
}

export function writeQEGCodeToGateEvidence(
  outDir: string,
  evidence: QEGCodeToGateEvidence,
  services: Pick<QEGArtifactServices, "fileAccess" | "pathService">
): string {
  const filePath = services.pathService.join(outDir, "qeg-code-to-gate.json");
  services.fileAccess.writeFile(filePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return filePath;
}

export function loadQEGCodeToGateEvidence(
  dir: string,
  services: Pick<QEGArtifactServices, "fileAccess" | "pathService">
): QEGCodeToGateEvidence | null {
  const result = loadQEGCodeToGateEvidenceResult(dir, services);
  return result.status === "success" ? result.value : null;
}

export function loadQEGCodeToGateEvidenceResult(
  dir: string,
  services: Pick<QEGArtifactServices, "fileAccess" | "pathService">
): LoadQEGCodeToGateEvidenceResult {
  const content = services.fileAccess.readFile(services.pathService.join(dir, "qeg-code-to-gate.json"));
  if (content === null) return { status: "missing" };

  try {
    return { status: "success", value: JSON.parse(content) as QEGCodeToGateEvidence };
  } catch (error) {
    return {
      status: "invalid_json",
      message: error instanceof Error ? error.message : "Invalid JSON",
    };
  }
}
