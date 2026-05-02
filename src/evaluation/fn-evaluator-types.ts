/**
 * FN Evaluator Types - Type definitions for FN evaluation
 */

import type { Severity, FindingCategory } from "../types/artifacts.js";

/**
 * Target detection rate for each phase
 */
export const FN_RATE_TARGETS: Record<string, number> = {
  phase1: 80,
  phase2: 90,
  phase3: 95,
};

/**
 * Seeded smell definition for FN evaluation
 */
export interface SeededSmell {
  seeded_id: string;
  rule_id: string;
  fixture: string;
  expected_detection: boolean;
  path: string;
  line?: number;
  description: string;
  severity: Severity;
  category: FindingCategory;
}

/**
 * Detection result for a seeded smell
 */
export interface DetectionResult {
  seeded_id: string;
  rule_id: string;
  detected: boolean;
  finding_id?: string;
  confidence?: number;
  missed_reason?: string;
}

/**
 * FN evaluation result
 */
export interface FNEvaluationResult {
  evaluation_id: string;
  date: string;
  phase: keyof typeof FN_RATE_TARGETS;
  fixtures: string[];
  detections: DetectionResult[];
  summary: {
    seeded_count: number;
    detected_count: number;
    missed_count: number;
    detection_rate: number;
    target: number;
    pass: boolean;
  };
  missed_smells?: Array<{
    seeded_id: string;
    rule_id: string;
    reason: string;
  }>;
}