import type { FileAccess, HashService, PathService } from "../types/contracts.js";
import type { ArtifactHash, QEGCodeToGateEvidence } from "./qeg-types.js";

export interface QEGArtifactServices {
  fileAccess: FileAccess;
  hashService: HashService;
  pathService: PathService;
}

const ARTIFACT_NAMES = [
  "findings.json",
  "release-readiness.json",
  "repo-graph.json",
  "audit.json",
  "risk-register.yaml",
  "test-seeds.json",
  "invariants.json",
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
  const content = services.fileAccess.readFile(services.pathService.join(dir, "qeg-code-to-gate.json"));
  if (content === null) return null;

  try {
    return JSON.parse(content) as QEGCodeToGateEvidence;
  } catch {
    return null;
  }
}
