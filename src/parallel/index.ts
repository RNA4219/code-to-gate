/**
 * Parallel processing module exports for code-to-gate
 *
 * Performance requirement (Phase 2):
 * - Medium repo (500-2000 files) scan <= 45s
 * - Medium repo analyze <= 45s (LLM excluded)
 * - Large repo (5000+ files) scan <= 120s
 *
 * Features:
 * - Parallel file parsing using worker threads
 * - Parallel rule evaluation
 * - Streaming processing for large repos
 * - Memory-efficient chunked processing
 * - Lazy symbol loading
 */

export {
  FileProcessor,
  FileProcessorOptions,
  FileProcessorResult,
  ProcessingProgressEvent,
  LARGE_REPO_THRESHOLD,
} from "./file-processor.js";
export { RuleEvaluator, RuleEvaluatorOptions, RuleEvaluationResult } from "./rule-evaluator.js";