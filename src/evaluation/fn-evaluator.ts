/**
 * False Negative Evaluation System for code-to-gate
 *
 * Evaluates detection rate by seeding known smells in synthetic repos.
 * Based on docs/product-acceptance-v1.md FN evaluation requirements:
 * - Phase 1: Detection rate >= 80%
 * - Phase 2: Detection rate >= 90%
 * - Phase 3: Detection rate >= 95%
 */

import type { Finding, FindingsArtifact, Severity, FindingCategory } from "../types/artifacts.js";
import { generateFPEvidenceYAML } from "./fp-evaluator.js";

// === Types ===

/**
 * Target detection rate for each phase
 */
export const FN_RATE_TARGETS: Record<string, number> = {
  phase1: 80, // >= 80%
  phase2: 90, // >= 90%
  phase3: 95, // >= 95%
};

/**
 * Seeded smell definition for FN evaluation
 */
export interface SeededSmell {
  /** Unique seeded smell ID */
  seeded_id: string;
  /** Rule ID expected to detect this smell */
  rule_id: string;
  /** Fixture/repo where the smell is seeded */
  fixture: string;
  /** Expected detection status */
  expected_detection: boolean;
  /** File path where the smell is seeded */
  path: string;
  /** Line number of seeded smell */
  line?: number;
  /** Description of the seeded smell */
  description: string;
  /** Severity category for this smell */
  severity: Severity;
  /** Category of the smell */
  category: FindingCategory;
}

/**
 * Detection result for a seeded smell
 */
export interface DetectionResult {
  /** Seeded smell ID */
  seeded_id: string;
  /** Rule ID */
  rule_id: string;
  /** Was the smell detected? */
  detected: boolean;
  /** Finding ID if detected */
  finding_id?: string;
  /** Confidence of detection */
  confidence?: number;
  /** Reason for missed detection */
  missed_reason?: string;
}

/**
 * FN evaluation result
 */
export interface FNEvaluationResult {
  /** Unique evaluation ID */
  evaluation_id: string;
  /** Evaluation date (ISO 8601) */
  date: string;
  /** Target phase for this evaluation */
  phase: keyof typeof FN_RATE_TARGETS;
  /** Fixtures evaluated */
  fixtures: string[];
  /** Individual detection results */
  detections: DetectionResult[];
  /** Summary statistics */
  summary: {
    seeded_count: number;
    detected_count: number;
    missed_count: number;
    detection_rate: number;
    target: number;
    pass: boolean;
  };
  /** Missed smells details */
  missed_smells?: Array<{
    seeded_id: string;
    rule_id: string;
    reason: string;
  }>;
}

// === Predefined Seeded Smells ===

/**
 * Default seeded smells list from product-acceptance-v1.md
 */
export const DEFAULT_SEEDED_SMELLS: SeededSmell[] = [
  {
    seeded_id: "S001",
    rule_id: "CLIENT_TRUSTED_PRICE",
    fixture: "demo-shop-ts",
    expected_detection: true,
    path: "src/api/order/create.ts",
    line: 15,
    description: "Client price is trusted without server-side validation",
    severity: "critical",
    category: "payment",
  },
  {
    seeded_id: "S002",
    rule_id: "WEAK_AUTH_GUARD",
    fixture: "demo-shop-ts",
    expected_detection: true,
    path: "src/auth/guard.ts",
    line: 6,
    description: "Authorization guard only checks token presence",
    severity: "high",
    category: "auth",
  },
  {
    seeded_id: "S003",
    rule_id: "MISSING_SERVER_VALIDATION",
    fixture: "demo-shop-ts",
    expected_detection: true,
    path: "src/api/order/create.ts",
    line: 18,
    description: "Order request body used without validation",
    severity: "high",
    category: "validation",
  },
  {
    seeded_id: "S004",
    rule_id: "UNTESTED_CRITICAL_PATH",
    fixture: "demo-shop-ts",
    expected_detection: true,
    path: "src/api/order/create.ts",
    description: "Checkout order entrypoint has no direct test coverage",
    severity: "high",
    category: "testing",
  },
  {
    seeded_id: "S005",
    rule_id: "WEAK_AUTH_GUARD",
    fixture: "demo-auth-js",
    expected_detection: true,
    path: "src/routes/admin.js",
    line: 5,
    description: "Admin route uses user guard instead of admin guard",
    severity: "high",
    category: "auth",
  },
  {
    seeded_id: "S006",
    rule_id: "TRY_CATCH_SWALLOW",
    fixture: "demo-auth-js",
    expected_detection: true,
    path: "src/services/audit-log.js",
    line: 8,
    description: "Audit logging failure is swallowed",
    severity: "medium",
    category: "maintainability",
  },
  {
    seeded_id: "S007",
    rule_id: "ENV_DIRECT_ACCESS",
    fixture: "demo-auth-js",
    expected_detection: true,
    path: "src/config/env.js",
    description: "Direct environment variable access without validation",
    severity: "medium",
    category: "config",
  },
  {
    seeded_id: "S008",
    rule_id: "RAW_SQL",
    fixture: "demo-shop-ts",
    expected_detection: true,
    path: "src/db/query.ts",
    description: "Raw SQL query without parameterization",
    severity: "high",
    category: "data",
  },
  {
    seeded_id: "S009",
    rule_id: "UNSAFE_DELETE",
    fixture: "demo-shop-ts",
    expected_detection: true,
    path: "src/api/user/delete.ts",
    description: "Delete endpoint without authorization check",
    severity: "critical",
    category: "auth",
  },
  {
    seeded_id: "S010",
    rule_id: "HIGH_FANOUT_CHANGE",
    fixture: "demo-shop-ts",
    expected_detection: true,
    path: "src/shared/utils.ts",
    description: "High fanout change (diff mode required)",
    severity: "medium",
    category: "maintainability",
  },
];

// === Core Functions ===

/**
 * Calculate detection rate from results
 *
 * Detection rate = Detected_count / Seeded_count
 */
export function calculateDetectionRate(results: DetectionResult[]): number {
  const detectedCount = results.filter((r) => r.detected).length;
  const totalCount = results.length;

  if (totalCount === 0) {
    return 100; // No smells to detect = perfect detection
  }

  const rate = (detectedCount / totalCount) * 100;
  return Math.round(rate * 100) / 100; // Round to 2 decimal places
}

/**
 * Check if a seeded smell was detected in findings
 */
export function checkDetection(
  seeded: SeededSmell,
  findings: Finding[]
): DetectionResult {
  // Find matching finding by rule_id and path
  const matchingFinding = findings.find((f) => {
    if (f.ruleId !== seeded.rule_id) return false;

    // Check if path matches any evidence
    const pathMatch = f.evidence.some((ev) => {
      if (ev.path === seeded.path) return true;
      // Allow partial path match
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
 * Validate seeded smells configuration
 */
export function validateSeededSmells(smells: unknown[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (let i = 0; i < smells.length; i++) {
    const smell = smells[i] as Record<string, unknown>;

    if (!smell.seeded_id || typeof smell.seeded_id !== "string") {
      errors.push(`smells[${i}]. seeded_id is required and must be a string`);
    }

    if (!smell.rule_id || typeof smell.rule_id !== "string") {
      errors.push(`smells[${i}].rule_id is required and must be a string`);
    }

    if (!smell.fixture || typeof smell.fixture !== "string") {
      errors.push(`smells[${i}].fixture is required and must be a string`);
    }

    if (!smell.path || typeof smell.path !== "string") {
      errors.push(`smells[${i}].path is required and must be a string`);
    }

    if (
      smell.severity &&
      !["low", "medium", "high", "critical"].includes(smell.severity as string)
    ) {
      errors.push(`smells[${i}].severity must be low, medium, high, or critical`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get seeded smells by fixture
 */
export function getSeededSmellsByFixture(
  smells: SeededSmell[],
  fixture: string
): SeededSmell[] {
  return smells.filter((s) => s.fixture === fixture);
}

/**
 * Get seeded smells by rule
 */
export function getSeededSmellsByRule(
  smells: SeededSmell[],
  ruleId: string
): SeededSmell[] {
  return smells.filter((s) => s.rule_id === ruleId);
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

/**
 * Generate seeded smells configuration template
 */
export function generateSeededSmellsTemplate(
  fixtures: string[] = ["demo-shop-ts", "demo-auth-js"]
): string {
  const lines = [
    "# Seeded Smells Configuration",
    "# Define expected code smells for FN evaluation",
    "",
    "seeded_smells:",
  ];

  // Add template entries for common rules
  const commonRules = [
    { rule_id: "CLIENT_TRUSTED_PRICE", category: "payment", severity: "critical" },
    { rule_id: "WEAK_AUTH_GUARD", category: "auth", severity: "high" },
    { rule_id: "MISSING_SERVER_VALIDATION", category: "validation", severity: "high" },
    { rule_id: "UNTESTED_CRITICAL_PATH", category: "testing", severity: "high" },
    { rule_id: "TRY_CATCH_SWALLOW", category: "maintainability", severity: "medium" },
  ];

  for (const fixture of fixtures) {
    for (const rule of commonRules) {
      lines.push(`  - seeded_id: "" # Unique ID like S001`);
      lines.push(`    rule_id: ${rule.rule_id}`);
      lines.push(`    fixture: ${fixture}`);
      lines.push(`    path: "" # File path`);
      lines.push(`    line: 1 # Optional line number`);
      lines.push(`    description: "" # Smell description`);
      lines.push(`    severity: ${rule.severity}`);
      lines.push(`    category: ${rule.category}`);
      lines.push(`    expected_detection: true`);
      lines.push("");
    }
  }

  return lines.join("\n");
}