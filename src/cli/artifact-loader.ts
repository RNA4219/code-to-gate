/**
 * Artifact Loader - loads artifacts from JSON files
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { FindingsArtifact, ReleaseReadinessArtifact } from "../types/artifacts.js";

/**
 * Load findings artifact from file
 */
export function loadFindingsArtifact(filePath: string): FindingsArtifact {
  const content = readFileSync(filePath, "utf8");
  return JSON.parse(content) as FindingsArtifact;
}

/**
 * Load release readiness artifact from file
 */
export function loadReleaseReadinessArtifact(filePath: string): ReleaseReadinessArtifact {
  const content = readFileSync(filePath, "utf8");
  return JSON.parse(content) as ReleaseReadinessArtifact;
}

/**
 * Load artifact from directory with default filename
 */
export function loadFindingsFromDir(dir: string): FindingsArtifact {
  return loadFindingsArtifact(path.join(dir, "findings.json"));
}

/**
 * Load release readiness from directory with default filename
 */
export function loadReleaseReadinessFromDir(dir: string): ReleaseReadinessArtifact {
  return loadReleaseReadinessArtifact(path.join(dir, "release-readiness.json"));
}