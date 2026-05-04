/**
 * Python parser helpers
 * Utility functions for Python file parsing
 */

import { sha256, toPosix } from "../core/path-utils.js";
import { createAstEvidence } from "../core/evidence-utils.js";
import { _EvidenceRef } from "./py-parser-types.js";

// Re-export utilities for backward compatibility
export { sha256, toPosix, createAstEvidence as createEvidence };

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