/**
 * False Positive Evaluation System for code-to-gate
 *
 * Evaluates findings to determine FP rate based on human review.
 * Based on docs/product-acceptance-v1.md FP evaluation requirements:
 * - Phase 1: FP rate <= 15%
 * - Phase 2: FP rate <= 10%
 * - Phase 3: FP rate <= 5%
 */

import type { Finding, FindingsArtifact, Severity } from "../types/artifacts.js";

// === Types ===

/**
 * Classification of a finding by human reviewer
 */
export type FindingClassification = "TP" | "FP" | "Uncertain";

/**
 * Target FP rate for each phase
 */
export const FP_RATE_TARGETS: Record<string, number> = {
  phase1: 15, // <= 15%
  phase2: 10, // <= 10%
  phase3: 5,  // <= 5%
};

/**
 * Individual finding review result
 */
export interface FindingReview {
  /** Finding ID from findings.json */
  finding_id: string;
  /** Rule ID that triggered the finding */
  rule_id: string;
  /** Human classification */
  classification: FindingClassification;
  /** Optional reviewer comment */
  comment?: string;
  /** Severity from original finding */
  severity: Severity;
  /** Category from original finding */
  category: Finding["category"];
}

/**
 * Complete FP evaluation result
 */
export interface FPEvaluationResult {
  /** Unique evaluation ID */
  evaluation_id: string;
  /** Repository being evaluated */
  repo: string;
  /** Reviewer identifier */
  evaluator: string;
  /** Evaluation date (ISO 8601) */
  date: string;
  /** Target phase for this evaluation */
  phase: keyof typeof FP_RATE_TARGETS;
  /** Individual finding reviews */
  findings: FindingReview[];
  /** Summary statistics */
  summary: {
    total: number;
    tp: number;
    fp: number;
    uncertain: number;
    fp_rate: number;
    target: number;
    pass: boolean;
  };
  /** Recommended suppressions for FP findings */
  suppression_recommendations?: SuppressionRecommendation[];
}

/**
 * Suppression recommendation for an FP finding
 */
export interface SuppressionRecommendation {
  /** Rule ID to suppress */
  rule_id: string;
  /** File path pattern */
  path_pattern: string;
  /** Reason for suppression */
  reason: string;
  /** Expiry date for temporary suppressions */
  expiry?: string;
  /** Finding IDs that triggered this recommendation */
  finding_ids: string[];
}

/**
 * FP evaluation input (YAML template for human review)
 */
export interface FPEvaluationInput {
  evaluation_id: string;
  repo: string;
  evaluator: string;
  date: string;
  phase: keyof typeof FP_RATE_TARGETS;
  findings: Array<{
    finding_id: string;
    rule_id: string;
    classification: FindingClassification;
    comment?: string;
  }>;
}

// === Core Functions ===

/**
 * Calculate FP rate from reviews
 *
 * FP rate = FP_count / (TP_count + FP_count + Uncertain_count)
 */
export function calculateFPRate(reviews: FindingReview[]): number {
  const counts = classifyFindings(reviews);
  const total = counts.tp + counts.fp + counts.uncertain;

  if (total === 0) {
    return 0;
  }

  const fpRate = (counts.fp / total) * 100;
  return Math.round(fpRate * 100) / 100; // Round to 2 decimal places
}

/**
 * Count findings by classification
 */
export function classifyFindings(reviews: FindingReview[]): {
  tp: number;
  fp: number;
  uncertain: number;
} {
  return {
    tp: reviews.filter((r) => r.classification === "TP").length,
    fp: reviews.filter((r) => r.classification === "FP").length,
    uncertain: reviews.filter((r) => r.classification === "Uncertain").length,
  };
}

/**
 * Evaluate FP rate against target
 */
export function evaluateFP(
  reviews: FindingReview[],
  phase: keyof typeof FP_RATE_TARGETS
): {
  fp_rate: number;
  target: number;
  pass: boolean;
  conditional: boolean;
} {
  const fpRate = calculateFPRate(reviews);
  const target = FP_RATE_TARGETS[phase];
  const pass = fpRate <= target;

  // Phase 1 allows conditional go for 15-20%
  const conditional =
    phase === "phase1" && fpRate > target && fpRate <= target + 5;

  return { fp_rate: fpRate, target, pass, conditional };
}

/**
 * Generate suppression recommendations for FP findings
 */
export function generateSuppressionRecommendations(
  reviews: FindingReview[]
): SuppressionRecommendation[] {
  const fpFindings = reviews.filter((r) => r.classification === "FP");

  // Group by rule_id and path pattern
  const groups = new Map<string, FindingReview[]>();

  for (const review of fpFindings) {
    // Extract path from finding evidence (simplified pattern)
    const key = `${review.rule_id}`;
    const existing = groups.get(key) ?? [];
    existing.push(review);
    groups.set(key, existing);
  }

  const recommendations: SuppressionRecommendation[] = [];

  for (const entry of Array.from(groups.entries())) {
    const [ruleId, findings] = entry;
    // Check if findings share common path patterns
    const paths = findings.map((f) => {
      // Try to get path from comment or use generic pattern
      const pathMatch = f.comment?.match(/path:\s*(\S+)/);
      return pathMatch?.[1] ?? "**";
    });

    const uniquePaths = new Set(paths);
    const pathPattern = uniquePaths.size === 1 ? paths[0] : "**";

    recommendations.push({
      rule_id: ruleId,
      path_pattern: pathPattern,
      reason: findings[0]?.comment ?? "Human review determined this is a false positive",
      expiry: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // 90 days default
      finding_ids: findings.map((f) => f.finding_id),
    });
  }

  return recommendations;
}

/**
 * Create FP evaluation result from findings artifact and human reviews
 */
export function createFPEvaluationResult(
  findingsArtifact: FindingsArtifact,
  input: FPEvaluationInput,
  additionalInfo?: {
    severity?: Severity;
    category?: Finding["category"];
  }[]
): FPEvaluationResult {
  const reviews: FindingReview[] = input.findings.map((f, index) => ({
    finding_id: f.finding_id,
    rule_id: f.rule_id,
    classification: f.classification,
    comment: f.comment,
    severity: additionalInfo?.[index]?.severity ?? findingsArtifact.findings[index]?.severity ?? "medium",
    category: additionalInfo?.[index]?.category ?? findingsArtifact.findings[index]?.category ?? "release-risk",
  }));

  const { fp_rate, target, pass } = evaluateFP(reviews, input.phase);
  const counts = classifyFindings(reviews);

  const result: FPEvaluationResult = {
    evaluation_id: input.evaluation_id,
    repo: input.repo,
    evaluator: input.evaluator,
    date: input.date,
    phase: input.phase,
    findings: reviews,
    summary: {
      total: reviews.length,
      tp: counts.tp,
      fp: counts.fp,
      uncertain: counts.uncertain,
      fp_rate,
      target,
      pass,
    },
  };

  // Add suppression recommendations if FP > 0
  if (counts.fp > 0) {
    result.suppression_recommendations = generateSuppressionRecommendations(reviews);
  }

  return result;
}

/**
 * Generate YAML template for human FP review
 */
export function generateFPEvaluationTemplate(
  findingsArtifact: FindingsArtifact,
  repo: string,
  phase: keyof typeof FP_RATE_TARGETS = "phase1"
): string {
  const evaluationId = `fp-eval-${phase}-${Date.now()}`;
  const date = new Date().toISOString().split("T")[0];

  const lines = [
    "# FP Evaluation Template",
    "# Fill in classification (TP/FP/Uncertain) for each finding",
    "# TP = True Positive (correct finding)",
    "# FP = False Positive (incorrect finding)",
    "# Uncertain = Needs further investigation",
    "",
    `evaluation_id: ${evaluationId}`,
    `repo: ${repo}`,
    `evaluator: ""  # Fill in reviewer name`,
    `date: ${date}`,
    `phase: ${phase}`,
    "",
    "findings:",
  ];

  for (const finding of findingsArtifact.findings) {
    lines.push(`  - finding_id: ${finding.id}`);
    lines.push(`    rule_id: ${finding.ruleId}`);
    lines.push(`    classification: ""  # TP, FP, or Uncertain`);
    lines.push(`    comment: ""  # Optional explanation`);
    lines.push("");
  }

  lines.push("# Summary (auto-calculated after review)");
  lines.push(`# target: ${FP_RATE_TARGETS[phase]}%`);
  lines.push("# fp_rate: (calculated)");
  lines.push("# pass: (calculated)");

  return lines.join("\n");
}

/**
 * Generate JSON report for FP evaluation result
 */
export function generateFPEvaluationReport(result: FPEvaluationResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Validate FP evaluation input
 */
export function validateFPEvaluationInput(input: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["Input must be an object"] };
  }

  const obj = input as Record<string, unknown>;

  // Required fields
  if (!obj.evaluation_id || typeof obj.evaluation_id !== "string") {
    errors.push("evaluation_id is required and must be a string");
  }

  if (!obj.repo || typeof obj.repo !== "string") {
    errors.push("repo is required and must be a string");
  }

  if (!obj.evaluator || typeof obj.evaluator !== "string") {
    errors.push("evaluator is required and must be a string");
  }

  if (!obj.date || typeof obj.date !== "string") {
    errors.push("date is required and must be a string");
  }

  if (!obj.phase || !FP_RATE_TARGETS[obj.phase as keyof typeof FP_RATE_TARGETS]) {
    errors.push(`phase is required and must be one of: ${Object.keys(FP_RATE_TARGETS).join(", ")}`);
  }

  // Findings array
  if (!Array.isArray(obj.findings)) {
    errors.push("findings must be an array");
  } else {
    for (let i = 0; i < obj.findings.length; i++) {
      const finding = obj.findings[i] as Record<string, unknown>;
      if (!finding.finding_id || typeof finding.finding_id !== "string") {
        errors.push(`findings[${i}].finding_id is required`);
      }
      if (!finding.rule_id || typeof finding.rule_id !== "string") {
        errors.push(`findings[${i}].rule_id is required`);
      }
      if (
        finding.classification &&
        !["TP", "FP", "Uncertain"].includes(finding.classification as string)
      ) {
        errors.push(`findings[${i}].classification must be TP, FP, or Uncertain`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Compare FP rate across multiple evaluations
 */
export function compareFPEvaluations(
  results: FPEvaluationResult[]
): {
  average_fp_rate: number;
  worst_fp_rate: number;
  best_fp_rate: number;
  all_pass: boolean;
  any_conditional: boolean;
} {
  const fpRates = results.map((r) => r.summary.fp_rate);

  return {
    average_fp_rate: Math.round((fpRates.reduce((a, b) => a + b, 0) / fpRates.length) * 100) / 100,
    worst_fp_rate: Math.max(...fpRates),
    best_fp_rate: Math.min(...fpRates),
    all_pass: results.every((r) => r.summary.pass),
    any_conditional: results.some((r) => r.summary.fp_rate > r.summary.target),
  };
}

/**
 * Generate FP evidence YAML for acceptance documentation
 */
export function generateFPEvidenceYAML(result: FPEvaluationResult): string {
  const lines = [
    "# fp-fn-evidence.yaml",
    `evaluation_id: ${result.evaluation_id}`,
    `date: ${result.date}`,
    `evaluator: ${result.evaluator}`,
    "",
    "fp_evaluation:",
    `  repo: ${result.repo}`,
    `  findings_count: ${result.summary.total}`,
    `  tp_count: ${result.summary.tp}`,
    `  fp_count: ${result.summary.fp}`,
    `  uncertain_count: ${result.summary.uncertain}`,
    `  fp_rate: ${result.summary.fp_rate}%`,
    `  target: <= ${result.summary.target}%`,
    `  result: ${result.summary.pass ? "pass" : "fail"}`,
  ];

  if (result.suppression_recommendations?.length) {
    lines.push("");
    lines.push("  suppression_recommendations:");
    for (const rec of result.suppression_recommendations) {
      lines.push(`    - rule_id: ${rec.rule_id}`);
      lines.push(`      path_pattern: ${rec.path_pattern}`);
      lines.push(`      reason: "${rec.reason}"`);
    }
  }

  return lines.join("\n");
}