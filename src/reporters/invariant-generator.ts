/**
 * Invariant Generator - generates invariants.json from findings
 *
 * Extracts invariants from findings:
 * - security: authentication, authorization requirements
 * - business: payment validation, data constraints
 * - data: input validation, type constraints
 * - api: endpoint contracts, response guarantees
 */

import { VERSION } from "../cli/exit-codes.js";
import {
  ArtifactHeader,
  Finding,
  FindingsArtifact,
  Invariant,
  InvariantsArtifact,
  InvariantKind,
  InvariantEvidence,
  EvidenceRef,
  CTG_VERSION,
  type _Completeness,
} from "../types/artifacts.js";

import { writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

/**
 * Map finding category/rule to invariant kind
 */
function mapToInvariantKind(finding: Finding): InvariantKind {
  // Security rules
  if (finding.category === "auth") return "security";
  if (finding.category === "security") return "security";

  // Payment rules → business invariants
  if (finding.category === "payment") return "business";

  // Validation rules → data invariants
  if (finding.category === "validation") return "data";

  // Data handling → data invariants
  if (finding.category === "data") return "data";

  // Testing gaps → technical invariants (test coverage expectations)
  if (finding.category === "testing") return "technical";

  // Maintainability → technical invariants
  if (finding.category === "maintainability") return "technical";

  // Config → technical invariants
  if (finding.category === "config") return "technical";

  // API/endpoint findings
  if (finding.ruleId.includes("API") || finding.ruleId.includes("ENDPOINT")) return "api";

  // Default to security for high/critical
  if (finding.severity === "critical" || finding.severity === "high") return "security";

  return "technical";
}

/**
 * Generate invariant statement from finding
 */
function generateStatement(finding: Finding): string {
  switch (finding.ruleId) {
    case "CLIENT_TRUSTED_PRICE":
      return "Prices must be validated on the server side, not trusted from client input";

    case "WEAK_AUTH_GUARD":
      return "Authentication must be enforced before accessing protected resources";

    case "MISSING_SERVER_VALIDATION":
      return "All user input must be validated on the server before processing";

    case "UNTESTED_CRITICAL_PATH":
      return "Critical entrypoints must have test coverage before release";

    case "TRY_CATCH_SWALLOW":
      return "Exceptions must not be silently swallowed without logging or handling";

    case "RAW_SQL":
      return "SQL queries must use parameterized statements, not string concatenation";

    case "ENV_DIRECT_ACCESS":
      return "Environment variables must be validated and sanitized before use";

    case "UNSAFE_DELETE":
      return "Delete operations must have authorization checks and audit logging";

    case "LARGE_MODULE":
      return "Modules must maintain reasonable size for maintainability";

    default:
      // Generic statement based on category
      if (finding.category === "auth") {
        return `Authentication/authorization must be enforced at ${finding.evidence[0]?.path || "affected path"}`;
      }
      if (finding.category === "payment") {
        return `Payment processing must have server-side validation at ${finding.evidence[0]?.path || "affected path"}`;
      }
      if (finding.category === "validation") {
        return `Input validation must be applied at ${finding.evidence[0]?.path || "affected path"}`;
      }
      return `${finding.title} must be addressed`;
  }
}

/**
 * Generate rationale from finding
 */
function generateRationale(finding: Finding): string {
  return `Derived from ${finding.severity} severity finding (${finding.ruleId}): ${finding.summary}`;
}

/**
 * Convert EvidenceRef to InvariantEvidence
 */
function convertEvidence(evidence: EvidenceRef[], invariantId: string): InvariantEvidence[] {
  return evidence.map((e, i) => ({
    id: `evidence-${invariantId}-${i.toString().padStart(2, "0")}`,
    path: e.path,
    startLine: e.startLine,
    endLine: e.endLine,
    kind: e.kind,
    excerptHash: e.excerptHash || (e.kind === "text" ? createHash("sha256").update(e.path).digest("hex") : undefined),
  }));
}

/**
 * Generate a unique invariant ID
 */
function generateInvariantId(kind: InvariantKind, index: number): string {
  return `inv-${kind}-${index.toString().padStart(3, "0")}`;
}

/**
 * Build invariants from findings
 */
export function buildInvariantsFromFindings(
  findings: FindingsArtifact,
  runId: string,
  repoRoot: string,
  policyId?: string
): InvariantsArtifact {
  const now = new Date().toISOString();

  const header: ArtifactHeader = {
    version: CTG_VERSION,
    generated_at: now,
    run_id: runId,
    repo: {
      root: repoRoot,
      dirty: false,
    },
    tool: {
      name: "code-to-gate",
      version: VERSION,
      policy_id: policyId,
      plugin_versions: [],
    },
  };

  // Group invariants by kind for indexing
  const invariantsByKind: Map<InvariantKind, Invariant[]> = new Map();

  // Process high/critical findings into invariants
  for (const finding of findings.findings) {
    // Only generate invariants from significant findings
    if (finding.severity !== "critical" && finding.severity !== "high" && finding.confidence < 0.7) {
      continue;
    }

    const kind = mapToInvariantKind(finding);
    const existing = invariantsByKind.get(kind) || [];

    const invariantId = generateInvariantId(kind, existing.length);

    existing.push({
      id: invariantId,
      statement: generateStatement(finding),
      kind,
      confidence: finding.confidence,
      sourceFindingIds: [finding.id],
      evidence: convertEvidence(finding.evidence, invariantId),
      rationale: generateRationale(finding),
      tags: [finding.category, finding.severity],
    });

    invariantsByKind.set(kind, existing);
  }

  // Flatten all invariants
  const invariants: Invariant[] = [];
  for (const [, invList] of invariantsByKind) {
    invariants.push(...invList);
  }

  return {
    ...header,
    artifact: "invariants",
    schema: "invariants@v1",
    completeness: invariants.length > 0 ? "complete" : "partial",
    invariants,
  };
}

/**
 * Write invariants.json to output directory
 */
export function writeInvariantsJson(outDir: string, artifact: InvariantsArtifact): string {
  const filePath = path.join(outDir, "invariants.json");
  writeFileSync(filePath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  return filePath;
}