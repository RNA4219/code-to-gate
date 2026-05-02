/**
 * False Negative Evaluation System for code-to-gate
 *
 * Evaluates detection rate by seeding known smells in synthetic repos.
 * Based on docs/product-acceptance-v1.md FN evaluation requirements:
 * - Phase 1: Detection rate >= 80%
 * - Phase 2: Detection rate >= 90%
 * - Phase 3: Detection rate >= 95%
 */

import type { Finding, FindingsArtifact } from "../types/artifacts.js";
import { generateFPEvidenceYAML } from "./fp-evaluator.js";
import {
  FN_RATE_TARGETS,
  type SeededSmell,
  type DetectionResult,
  type FNEvaluationResult,
} from "./fn-evaluator-types.js";
import {
  DEFAULT_SEEDED_SMELLS,
  getSeededSmellsByFixture,
  getSeededSmellsByRule,
  validateSeededSmells,
  generateSeededSmellsTemplate,
} from "./fn-seeded-smells.js";

// Re-export types and constants for backward compatibility
export {
  FN_RATE_TARGETS,
  DEFAULT_SEEDED_SMELLS,
  SeededSmell,
  DetectionResult,
  FNEvaluationResult,
  getSeededSmellsByFixture,
  getSeededSmellsByRule,
  validateSeededSmells,
  generateSeededSmellsTemplate,
};

/**
 * Calculate detection rate from results
 */
export function calculateDetectionRate(results: DetectionResult[]): number {
  const detectedCount = results.filter((r) => r.detected).length;
  const totalCount = results.length;

  if (totalCount === 0) {
    return 100;
  }

  const rate = (detectedCount / totalCount) * 100;
  return Math.round(rate * 100) / 100;
}

/**
 * Check if a seeded smell was detected in findings
 */
export function checkDetection(
  seeded: SeededSmell,
  findings: Finding[]
): DetectionResult {
  const matchingFinding = findings.find((f) => {
    if (f.ruleId !== seeded.rule_id) return false;

    const pathMatch = f.evidence.some((ev) => {
      if (ev.path === seeded.path) return true;
      if (ev.path.includes(seeded.path.split("/").pop() ?? "")) return true;
      return false;
    });

    return pathMatch;
  });

  if (matchingFinding) {
    return {
      seeded_id: seeded.seeded_id,
      rule_id: seeded.rule_id,
      detected: true,
      finding_id: matchingFinding.id,
      confidence: matchingFinding.confidence,
    };
  }

  return {
    seeded_id: seeded.seeded_id,
    rule_id: seeded.rule_id,
    detected: false,
    missed_reason: determineMissedReason(seeded),
  };
}

/**
 * Determine reason for missed detection
 */
function determineMissedReason(seeded: SeededSmell): string {
  const reasons: Record<string, string> = {
    CLIENT_TRUSTED_PRICE: "Price validation pattern not detected in code",
    WEAK_AUTH_GUARD: "Auth guard pattern not recognized",
    MISSING_SERVER_VALIDATION: "Validation pattern not detected",
    UNTESTED_CRITICAL_PATH: "Test coverage gap not identified",
    TRY_CATCH_SWALLOW: "Error handling pattern not detected",
    ENV_DIRECT_ACCESS: "Environment access pattern not detected",
    RAW_SQL: "SQL query pattern not recognized",
    UNSAFE_DELETE: "Delete endpoint pattern not detected",
    HIGH_FANOUT_CHANGE: "Diff mode required for fanout analysis",
  };

  return reasons[seeded.rule_id] ?? "Rule pattern not detected";
}

/**
 * Evaluate all seeded smells against findings
 */
export function evaluateDetection(
  seededSmells: SeededSmell[],
  findingsArtifacts: Map<string, FindingsArtifact>
): DetectionResult[] {
  return seededSmells.map((seeded) => {
    const artifact = findingsArtifacts.get(seeded.fixture);
    if (!artifact) {
      return {
        seeded_id: seeded.seeded_id,
        rule_id: seeded.rule_id,
        detected: false,
        missed_reason: `Fixture ${seeded.fixture} not found`,
      };
    }

    return checkDetection(seeded, artifact.findings);
  });
}

/**
 * Create FN evaluation result
 */
export function createFNEvaluationResult(
  seededSmells: SeededSmell[],
  findingsArtifacts: Map<string, FindingsArtifact>,
  phase: keyof typeof FN_RATE_TARGETS = "phase1"
): FNEvaluationResult {
  const evaluationId = `fn-eval-${phase}-${Date.now()}`;
  const date = new Date().toISOString().split("T")[0];

  const detections = evaluateDetection(seededSmells, findingsArtifacts);
  const detectionRate = calculateDetectionRate(detections);
  const target = FN_RATE_TARGETS[phase];

  const missedSmells = detections
    .filter((d) => !d.detected)
    .map((d) => ({
      seeded_id: d.seeded_id,
      rule_id: d.rule_id,
      reason: d.missed_reason ?? "Unknown",
    }));

  const fixtures = Array.from(new Set(seededSmells.map((s) => s.fixture)));

  return {
    evaluation_id: evaluationId,
    date,
    phase,
    fixtures,
    detections,
    summary: {
      seeded_count: seededSmells.length,
      detected_count: detections.filter((d) => d.detected).length,
      missed_count: missedSmells.length,
      detection_rate: detectionRate,
      target,
      pass: detectionRate >= target,
    },
    missed_smells: missedSmells.length > 0 ? missedSmells : undefined,
  };
}

/**
 * Evaluate FN rate against target
 */
export function evaluateFN(
  detections: DetectionResult[],
  phase: keyof typeof FN_RATE_TARGETS
): {
  detection_rate: number;
  target: number;
  pass: boolean;
} {
  const detectionRate = calculateDetectionRate(detections);
  const target = FN_RATE_TARGETS[phase];
  const pass = detectionRate >= target;

  return { detection_rate: detectionRate, target, pass };
}

/**
 * Generate FN evidence YAML for acceptance documentation
 */
export function generateFNEvidenceYAML(result: FNEvaluationResult): string {
  const lines = [
    "fn_evaluation:",
    `  fixtures: ${result.fixtures.join(", ")}`,
    `  seeded_smells_count: ${result.summary.seeded_count}`,
    `  detected_count: ${result.summary.detected_count}`,
    `  detection_rate: ${result.summary.detection_rate}%`,
    `  target: >= ${result.summary.target}%`,
    `  result: ${result.summary.pass ? "pass" : "fail"}`,
  ];

  if (result.missed_smells?.length) {
    lines.push("");
    lines.push("  missed_smells:");
    for (const missed of result.missed_smells) {
      lines.push(`    - seeded_id: ${missed.seeded_id}`);
      lines.push(`      rule_id: ${missed.rule_id}`);
      lines.push(`      reason: "${missed.reason}"`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate combined FP/FN evidence YAML
 */
export function generateFPFNEvidenceYAML(
  fpResult: import("./fp-evaluator.js").FPEvaluationResult,
  fnResult: FNEvaluationResult
): string {
  const lines = [
    "# fp-fn-evidence.yaml",
    `evaluation_id: ${fpResult.evaluation_id}`,
    `date: ${fpResult.date}`,
    `evaluator: ${fpResult.evaluator}`,
    "",
    generateFPEvidenceYAML(fpResult),
    "",
    generateFNEvidenceYAML(fnResult),
  ];

  return lines.join("\n");
}

/**
 * Compare detection rates across multiple evaluations
 */
export function compareFNEvaluations(
  results: FNEvaluationResult[]
): {
  average_detection_rate: number;
  worst_detection_rate: number;
  best_detection_rate: number;
  all_pass: boolean;
} {
  const rates = results.map((r) => r.summary.detection_rate);

  return {
    average_detection_rate: Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100,
    worst_detection_rate: Math.min(...rates),
    best_detection_rate: Math.max(...rates),
    all_pass: results.every((r) => r.summary.pass),
  };
}