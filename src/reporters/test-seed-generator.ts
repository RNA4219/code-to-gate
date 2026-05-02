/**
 * Test Seed Generator - generates test-seeds.json from findings
 *
 * Maps findings to test seeds with appropriate intents:
 * - negative/abuse: security, auth, payment findings
 * - boundary: validation, data findings
 * - regression: maintainability findings
 * - smoke: testing gaps
 */

import {
  ArtifactHeader,
  Finding,
  FindingsArtifact,
  TestSeed,
  TestSeedsArtifact,
  TestIntent,
  TestLevel,
  TestSeedEvidence,
  EvidenceRef,
  CTG_VERSION,
  Completeness,
} from "../types/artifacts.js";

import { writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const VERSION = "1.0.0";

/**
 * Map finding category to test intent
 */
function mapCategoryToIntent(category: string): TestIntent {
  switch (category) {
    case "security":
    case "auth":
      return "abuse";
    case "payment":
      return "negative";
    case "validation":
    case "data":
      return "boundary";
    case "testing":
      return "smoke";
    case "maintainability":
      return "regression";
    case "config":
      return "boundary";
    case "compatibility":
      return "compatibility";
    default:
      return "negative";
  }
}

/**
 * Map finding severity to suggested test level
 */
function mapSeverityToLevel(severity: string): TestLevel {
  switch (severity) {
    case "critical":
      return "e2e";
    case "high":
      return "integration";
    case "medium":
      return "unit";
    case "low":
      return "manual";
    default:
      return "unit";
  }
}

/**
 * Convert EvidenceRef to TestSeedEvidence
 */
function convertEvidence(evidence: EvidenceRef[], seedId: string): TestSeedEvidence[] {
  return evidence.map((e, i) => ({
    id: `evidence-${seedId}-${i.toString().padStart(2, "0")}`,
    path: e.path,
    startLine: e.startLine,
    endLine: e.endLine,
    kind: e.kind,
    excerptHash: e.excerptHash || (e.kind === "text" ? createHash("sha256").update(e.path).digest("hex") : undefined),
  }));
}

/**
 * Generate a unique seed ID
 */
function generateSeedId(index: number): string {
  return `seed-${index.toString().padStart(3, "0")}`;
}

/**
 * Create title from finding
 */
function createTitleForFinding(finding: Finding): string {
  return `Test for ${finding.ruleId}: ${finding.title}`;
}

/**
 * Build test seeds from findings
 */
export function buildTestSeedsFromFindings(
  findings: FindingsArtifact,
  runId: string,
  repoRoot: string,
  policyId?: string
): TestSeedsArtifact {
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

  const seeds: TestSeed[] = [];
  const oracle_gaps: string[] = []; // Seeds without strong expected result evidence
  const known_gaps: string[] = [];  // Seeds needing manual verification
  let seedIndex = 0;

  // Generate seeds from findings
  for (const finding of findings.findings) {
    const seedId = generateSeedId(seedIndex);
    const intent = mapCategoryToIntent(finding.category);
    const level = mapSeverityToLevel(finding.severity);

    seeds.push({
      id: seedId,
      title: createTitleForFinding(finding),
      intent,
      sourceRiskIds: [], // Populated from risk register if available
      sourceFindingIds: [finding.id],
      evidence: convertEvidence(finding.evidence, seedId),
      suggestedLevel: level,
      notes: finding.summary,
    });

    // Track oracle gaps - low confidence findings have uncertain expected results
    if (finding.confidence < 0.7) {
      oracle_gaps.push(`Seed ${seedId}: Expected result derived from low-confidence finding (${finding.confidence.toFixed(2)})`);
    }

    // Track known gaps - testing category findings need manual verification
    if (finding.category === "testing" && finding.evidence.length === 0) {
      known_gaps.push(`Seed ${seedId}: No evidence location for test gap`);
    }

    seedIndex++;
  }

  // Add smoke test for coverage gaps if testing category findings exist
  const testingFindings = findings.findings.filter(f => f.category === "testing");
  if (testingFindings.length > 0) {
    const seedId = generateSeedId(seedIndex);
    seeds.push({
      id: seedId,
      title: "Smoke test for critical paths coverage",
      intent: "smoke",
      sourceRiskIds: [],
      sourceFindingIds: testingFindings.map(f => f.id),
      evidence: testingFindings.flatMap(f => convertEvidence(f.evidence, seedId)),
      suggestedLevel: "e2e",
      notes: "Verify all critical entrypoints have basic coverage",
    });
    // Smoke tests are inherently oracle-less without specific expected outcomes
    oracle_gaps.push(`Seed ${seedId}: Smoke test has no specific expected result`);
  }

  return {
    ...header,
    artifact: "test-seeds",
    schema: "test-seeds@v1",
    completeness: seeds.length > 0 ? "complete" : "partial",
    seeds,
    oracle_gaps,
    known_gaps,
  };
}

/**
 * Write test-seeds.json to output directory
 */
export function writeTestSeedsJson(outDir: string, artifact: TestSeedsArtifact): string {
  const filePath = path.join(outDir, "test-seeds.json");
  writeFileSync(filePath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  return filePath;
}