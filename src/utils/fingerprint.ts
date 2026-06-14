/**
 * Finding fingerprint generation
 *
 * Generates stable fingerprints for findings to enable reliable historical matching
 * across code changes (line moves, path renames, etc.)
 */

import { createHash } from "node:crypto";
import { Finding } from "../types/artifacts.js";

/**
 * Normalize path separators to POSIX format
 * This ensures fingerprints are stable across Windows/Linux
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * Generate a stable fingerprint for a finding
 *
 * Fingerprint contract (Phase C):
 * - 16-character lowercase hex SHA-256 shortened value
 * - Priority: rule-provided > DB semantic > generic utility
 * - Normalized affected symbols (sorted, stable order)
 * - Normalized primary evidence excerpt hash
 * - Path excluded when excerpt/symbol available (rename-resistant)
 * - Path only as fallback when identity info insufficient
 * - Input excludes: severity, confidence, category, title, summary, finding/evidence ID, line numbers
 *
 * @param finding - The finding to fingerprint
 * @returns SHA-256 hash as 16-character hex fingerprint
 */
export function generateFindingFingerprint(finding: Finding): string {
  const components: string[] = [];

  // Always include ruleId (primary identifier)
  components.push(`rule:${finding.ruleId}`);

  // Include affected symbols (sorted for stable order)
  if (finding.affectedSymbols && finding.affectedSymbols.length > 0) {
    const sortedSymbols = [...finding.affectedSymbols].sort();
    components.push(`symbols:${sortedSymbols.join(",")}`);
  }

  // Include excerpt hash from primary evidence for content-based matching
  // Prefer excerpt hash over path for rename resistance
  const primaryExcerptHash = getPrimaryExcerptHash(finding);
  if (primaryExcerptHash) {
    components.push(`excerpt:${primaryExcerptHash}`);
  }

  // Fallback: Include normalized path only when excerpt/symbol not available
  // This ensures path rename doesn't change fingerprint when we have semantic identity
  const primaryPath = getPrimaryEvidencePath(finding);
  if (primaryPath && !primaryExcerptHash && (!finding.affectedSymbols || finding.affectedSymbols.length === 0)) {
    components.push(`path:${normalizePath(primaryPath)}`);
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
 * Build fingerprint lookup map that safely handles duplicate fingerprints
 *
 * @param findings - Array of findings
 * @returns Map of fingerprint to array of findings with that fingerprint
 */
export function buildFingerprintLookupMap(
  findings: Finding[]
): Map<string, Finding[]> {
  const map = new Map<string, Finding[]>();

  for (const finding of findings) {
    if (finding.fingerprint) {
      const existing = map.get(finding.fingerprint) ?? [];
      existing.push(finding);
      map.set(finding.fingerprint, existing);
    }
  }

  return map;
}