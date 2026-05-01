/**
 * Python parser helpers
 * Utility functions for Python file parsing
 */

import { createHash } from "node:crypto";
import { EvidenceRef } from "./py-parser-types.js";

/**
 * Generate SHA-256 hash
 */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Convert path to POSIX format
 */
export function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

/**
 * Create an evidence reference
 */
export function createEvidence(
  id: string,
  filePath: string,
  startLine: number,
  endLine: number,
  nodeId?: string,
  symbolId?: string
): EvidenceRef {
  const excerptHash = sha256(`${filePath}:${startLine}-${endLine}`);
  return {
    id,
    path: filePath,
    startLine,
    endLine,
    kind: "ast",
    excerptHash,
    nodeId,
    symbolId,
  };
}

/**
 * Find the end line of a code block based on indentation
 */
export function findBlockEnd(
  lines: string[],
  startLineIndex: number,
  baseIndent: number
): number {
  let endLine = startLineIndex;

  for (let i = startLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    // Calculate indentation
    const indent = line.length - line.trimStart().length;

    // If we hit a line with same or less indentation that's not a continuation, we're done
    if (
      indent <= baseIndent &&
      !trimmed.startsWith("elif") &&
      !trimmed.startsWith("else") &&
      !trimmed.startsWith("except") &&
      !trimmed.startsWith("finally")
    ) {
      return endLine;
    }

    endLine = i;
  }

  return endLine;
}