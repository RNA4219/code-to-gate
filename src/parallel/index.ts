/**
 * Parallel processing module exports for code-to-gate
 *
 * Performance requirement (Phase 2):
 * - Medium repo (500-2000 files) scan <= 45s
 * - Medium repo analyze <= 45s (LLM excluded)
 *
 * Features:
 * - Parallel file parsing using worker threads
 * - Parallel rule evaluation
 */

export { FileProcessor, FileProcessorOptions, FileProcessorResult } from "./file-processor.js";
export { RuleEvaluator, RuleEvaluatorOptions, RuleEvaluationResult } from "./rule-evaluator.js";