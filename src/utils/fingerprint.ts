/**
 * Finding fingerprint generation
 *
 * Generates stable fingerprints for findings to enable reliable historical matching
 * across code changes (line moves, path renames, etc.)
 */

import { createHash } from "node:crypto";
import { Finding, EvidenceRef } from "../types/artifacts.js";

/**
 * Generate a stable fingerprint for a finding
 *
 * The fingerprint is based on:
 * - ruleId (primary identifier)
 * - primary evidence path (file location)
 * - affected symbols (if available, for more precise matching)
 * - excerpt hash (if available, for code content matching)
 *
 * @param finding - The finding to fingerprint
 * @returns SHA-256 hash as fingerprint string
 */
export function generateFindingFingerprint(finding: Finding): string {
  const components: string[] = [];

  // Always include ruleId
  components.push(`rule:${finding.ruleId}`);

  // Include primary evidence path
  const primaryPath = getPrimaryEvidencePath(finding);
  if (primaryPath) {
    components.push(`path:${primaryPath}`);
  }

  // Include affected symbols for more precise matching
  if (finding.affectedSymbols && finding.affectedSymbols.length > 0) {
    const sortedSymbols = [...finding.affectedSymbols].sort();
    components.push(`symbols:${sortedSymbols.join(",")}`);
  }

  // Include excerpt hash from primary evidence for content-based matching
  const primaryExcerptHash = getPrimaryExcerptHash(finding);
  if (primaryExcerptHash) {
    components.push(`excerpt:${primaryExcerptHash}`);
  }

  // Combine components and hash
  const combined = components.join("|");
  return createHash("sha256").update(combined).digest("hex").slice(0, 16);
}

/**
 * Get primary evidence path from finding
 */
function getPrimaryEvidencePath(finding: Finding): string | null {
  if (finding.evidence.length > 0) {
    return finding.evidence[0].path;
  }
  return null;
}

/**
 * Get excerpt hash from primary evidence
 */
function getPrimaryExcerptHash(finding: Finding): string | null {
  if (finding.evidence.length > 0) {
    const primary = finding.evidence[0];
    if (primary.excerptHash) {
      return primary.excerptHash;
    }
  }
  return null;
}

/**
 * Generate fingerprints for all findings in an artifact
 *
 * @param findings - Array of findings
 * @returns Array of findings with fingerprints added
 */
export function addFingerprintsToFindings(findings: Finding[]): Finding[] {
  return findings.map((finding) => ({
    ...finding,
    fingerprint: generateFindingFingerprint(finding),
  }));
}

/**
 * Match findings by fingerprint
 *
 * @param current - Current findings
 * @param previous - Previous findings
 * @returns Map of fingerprint to previous finding
 */
export function buildFingerprintLookupMap(
  findings: Finding[]
): Map<string, Finding> {
  const map = new Map<string, Finding>();

  for (const finding of findings) {
    if (finding.fingerprint) {
      map.set(finding.fingerprint, finding);
    }
  }

  return map;
}