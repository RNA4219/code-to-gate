/**
 * JSON Writer - file I/O for JSON artifacts
 *
 * This module handles file writing for JSON artifacts.
 * Separated from json-reporter.ts to keep reporters focused on artifact generation.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import type { FindingsArtifact } from "../types/artifacts.js";

/**
 * Write findings.json to output directory
 * Uses Node.js fs directly - will be refactored to use FileAccess contract in Phase 6
 */
export function writeFindingsJson(outDir: string, artifact: FindingsArtifact): string {
  const filePath = path.join(outDir, "findings.json");
  writeFileSync(filePath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  return filePath;
}

/**
 * Write any JSON artifact to output directory
 */
export function writeJsonArtifact<T>(outDir: string, filename: string, artifact: T): string {
  const filePath = path.join(outDir, filename);
  writeFileSync(filePath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  return filePath;
}