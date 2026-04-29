/**
 * Evaluation Module - FP and FN Evaluation System
 *
 * Provides tools for evaluating False Positive (FP) and False Negative (FN)
 * rates for code-to-gate analysis results.
 *
 * Based on docs/product-acceptance-v1.md requirements:
 * - Phase 1: FP rate <= 15%, Detection rate >= 80%
 * - Phase 2: FP rate <= 10%, Detection rate >= 90%
 * - Phase 3: FP rate <= 5%, Detection rate >= 95%
 */

// FP Evaluator exports
export {
  // Types
  type FindingClassification,
  type FindingReview,
  type FPEvaluationResult,
  type FPEvaluationInput,
  type SuppressionRecommendation,
  FP_RATE_TARGETS,

  // Functions
  calculateFPRate,
  classifyFindings,
  evaluateFP,
  generateSuppressionRecommendations,
  createFPEvaluationResult,
  generateFPEvaluationTemplate,
  generateFPEvaluationReport,
  validateFPEvaluationInput,
  compareFPEvaluations,
  generateFPEvidenceYAML,
} from "./fp-evaluator.js";

// FN Evaluator exports
export {
  // Types
  type SeededSmell,
  type DetectionResult,
  type FNEvaluationResult,
  FN_RATE_TARGETS,
  DEFAULT_SEEDED_SMELLS,

  // Functions
  calculateDetectionRate,
  checkDetection,
  evaluateDetection,
  createFNEvaluationResult,
  evaluateFN,
  generateFNEvidenceYAML,
  generateFPFNEvidenceYAML,
  validateSeededSmells,
  getSeededSmellsByFixture,
  getSeededSmellsByRule,
  compareFNEvaluations,
  generateSeededSmellsTemplate,
} from "./fn-evaluator.js";

// Combined evaluation utilities
import type { FPEvaluationResult } from "./fp-evaluator.js";
import type { FNEvaluationResult } from "./fn-evaluator.js";

/**
 * Combined FP/FN evaluation result
 */
export interface CombinedEvaluationResult {
  fp: FPEvaluationResult;
  fn: FNEvaluationResult;
  phase: string;
  pass: boolean;
  summary: string;
}

/**
 * Create combined evaluation result
 */
export function createCombinedEvaluation(
  fpResult: FPEvaluationResult,
  fnResult: FNEvaluationResult
): CombinedEvaluationResult {
  const pass = fpResult.summary.pass && fnResult.summary.pass;

  let summary: string;
  if (pass) {
    summary = `FP rate ${fpResult.summary.fp_rate}% (target <= ${fpResult.summary.target}%) and detection rate ${fnResult.summary.detection_rate}% (target >= ${fnResult.summary.target}%) both pass for ${fpResult.phase}`;
  } else if (!fpResult.summary.pass && !fnResult.summary.pass) {
    summary = `Both FP rate ${fpResult.summary.fp_rate}% and detection rate ${fnResult.summary.detection_rate}% fail targets`;
  } else if (!fpResult.summary.pass) {
    summary = `FP rate ${fpResult.summary.fp_rate}% exceeds target ${fpResult.summary.target}%`;
  } else {
    summary = `Detection rate ${fnResult.summary.detection_rate}% below target ${fnResult.summary.target}%`;
  }

  return {
    fp: fpResult,
    fn: fnResult,
    phase: fpResult.phase,
    pass,
    summary,
  };
}

/**
 * Generate complete acceptance evidence YAML
 */
export function generateAcceptanceEvidenceYAML(
  combinedResult: CombinedEvaluationResult
): string {
  const lines = [
    "# fp-fn-evidence.yaml",
    `evaluation_id: ${combinedResult.fp.evaluation_id}`,
    `date: ${combinedResult.fp.date}`,
    `evaluator: ${combinedResult.fp.evaluator}`,
    "",
    "fp_evaluation:",
    `  repo: ${combinedResult.fp.repo}`,
    `  findings_count: ${combinedResult.fp.summary.total}`,
    `  tp_count: ${combinedResult.fp.summary.tp}`,
    `  fp_count: ${combinedResult.fp.summary.fp}`,
    `  uncertain_count: ${combinedResult.fp.summary.uncertain}`,
    `  fp_rate: ${combinedResult.fp.summary.fp_rate}%`,
    `  target: <= ${combinedResult.fp.summary.target}%`,
    `  result: ${combinedResult.fp.summary.pass ? "pass" : "fail"}`,
    "",
    "fn_evaluation:",
    `  fixtures: ${combinedResult.fn.fixtures.join(", ")}`,
    `  seeded_smells_count: ${combinedResult.fn.summary.seeded_count}`,
    `  detected_count: ${combinedResult.fn.summary.detected_count}`,
    `  detection_rate: ${combinedResult.fn.summary.detection_rate}%`,
    `  target: >= ${combinedResult.fn.summary.target}%`,
    `  result: ${combinedResult.fn.summary.pass ? "pass" : "fail"}`,
    "",
    `combined_result: ${combinedResult.pass ? "pass" : "fail"}`,
    `summary: "${combinedResult.summary}"`,
  ];

  // Add missed smells if present
  if (combinedResult.fn.missed_smells?.length) {
    lines.push("");
    lines.push("missed_smells:");
    for (const missed of combinedResult.fn.missed_smells) {
      lines.push(`  - seeded_id: ${missed.seeded_id}`);
      lines.push(`    rule_id: ${missed.rule_id}`);
      lines.push(`    reason: "${missed.reason}"`);
    }
  }

  // Add suppression recommendations if present
  if (combinedResult.fp.suppression_recommendations?.length) {
    lines.push("");
    lines.push("suppression_recommendations:");
    for (const rec of combinedResult.fp.suppression_recommendations) {
      lines.push(`  - rule_id: ${rec.rule_id}`);
      lines.push(`    path_pattern: ${rec.path_pattern}`);
      lines.push(`    reason: "${rec.reason}"`);
      lines.push(`    expiry: ${rec.expiry}`);
    }
  }

  return lines.join("\n");
}

/**
 * Evaluate if a release can proceed based on FP/FN rates
 */
export function evaluateReleaseReadiness(
  fpRate: number,
  detectionRate: number,
  phase: string
): {
  go: boolean;
  conditional_go: boolean;
  no_go: boolean;
  blockers: string[];
  warnings: string[];
} {
  const fpTargets = { phase1: 15, phase2: 10, phase3: 5 };
  const fnTargets = { phase1: 80, phase2: 90, phase3: 95 };

  const fpTarget = fpTargets[phase as keyof typeof fpTargets] ?? 15;
  const fnTarget = fnTargets[phase as keyof typeof fnTargets] ?? 80;

  const blockers: string[] = [];
  const warnings: string[] = [];

  // No-Go conditions
  const fpNoGo = fpRate > fpTarget + 5; // > 20% for phase1
  const fnNoGo = detectionRate < fnTarget - 10; // < 70% for phase1

  if (fpNoGo) {
    blockers.push(`FP rate ${fpRate}% exceeds maximum threshold ${fpTarget + 5}%`);
  }

  if (fnNoGo) {
    blockers.push(`Detection rate ${detectionRate}% below minimum threshold ${fnTarget - 10}%`);
  }

  // Conditional Go conditions
  const fpConditional = fpRate > fpTarget && fpRate <= fpTarget + 5;

  if (fpConditional) {
    warnings.push(`FP rate ${fpRate}% exceeds target ${fpTarget}% but within conditional range`);
  }

  if (detectionRate < fnTarget && detectionRate >= fnTarget - 5) {
    warnings.push(`Detection rate ${detectionRate}% slightly below target ${fnTarget}%`);
  }

  const go = blockers.length === 0 && fpRate <= fpTarget && detectionRate >= fnTarget;
  const conditionalGo = blockers.length === 0 && (warnings.length > 0 || fpConditional);
  const noGo = blockers.length > 0;

  return {
    go,
    conditional_go: conditionalGo && !go,
    no_go: noGo,
    blockers,
    warnings,
  };
}