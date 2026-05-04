/**
 * Parallel Rule Evaluator - evaluates rules in parallel
 *
 * Performance requirement (Phase 2):
 * - Medium repo (500-2000 files) analyze <= 45s (LLM excluded)
 *
 * Strategy:
 * - Evaluate rules concurrently when possible
 * - Use Promise.all for parallel execution
 * - Batch files per rule for efficiency
 */

import type { RulePlugin, RuleContext, SimpleGraph } from "../rules/index.js";
import type { Finding, RepoFile } from "../types/artifacts.js";

/**
 * Options for rule evaluator
 */
export interface RuleEvaluatorOptions {
  /** Maximum concurrent rule evaluations (default: 4) */
  maxConcurrent?: number;
  /** Enable parallel evaluation (default: true) */
  parallel?: boolean;
  /** Timeout per rule in ms (default: 30000) */
  timeoutMs?: number;
}

/**
 * Result of evaluating a single rule
 */
export interface RuleEvaluationResult {
  /** Rule ID */
  ruleId: string;
  /** Findings from this rule */
  findings: Finding[];
  /** Evaluation time in ms */
  evalTimeMs: number;
  /** Whether evaluation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Result of all rule evaluations
 */
export interface AllRulesEvaluationResult {
  /** All findings combined */
  allFindings: Finding[];
  /** Per-rule results */
  ruleResults: RuleEvaluationResult[];
  /** Total evaluation time in ms */
  totalTimeMs: number;
  /** Number of files processed */
  fileCount: number;
}

/**
 * Parallel rule evaluator implementation
 */
export class RuleEvaluator {
  private options: RuleEvaluatorOptions;

  /**
   * Create a new rule evaluator
   * @param options - Evaluation options
   */
  constructor(options?: RuleEvaluatorOptions) {
    this.options = {
      maxConcurrent: 4,
      parallel: true,
      timeoutMs: 30000,
      ...options,
    };
  }

  /**
   * Evaluate all rules against a graph
   * @param rules - Rules to evaluate
   * @param graph - NormalizedRepoGraph
   * @param getFileContent - Function to get file content
   * @returns All evaluation results
   */
  async evaluateAll(
    rules: RulePlugin[],
    graph: SimpleGraph,
    getFileContent: (path: string) => string | null
  ): Promise<AllRulesEvaluationResult> {
    const startTime = Date.now();
    const ruleResults: RuleEvaluationResult[] = [];

    // Build context
    const context: RuleContext = {
      graph,
      getFileContent,
    };

    if (this.options.parallel) {
      // Evaluate rules in parallel with concurrency limit
      ruleResults.push(...await this.evaluateRulesParallel(rules, context));
    } else {
      // Evaluate rules sequentially
      ruleResults.push(...await this.evaluateRulesSequential(rules, context));
    }

    // Combine all findings
    const allFindings: Finding[] = [];
    for (const result of ruleResults) {
      allFindings.push(...result.findings);
    }

    return {
      allFindings,
      ruleResults,
      totalTimeMs: Date.now() - startTime,
      fileCount: graph.files.length,
    };
  }

  /**
   * Evaluate rules in parallel with concurrency limit
   * @param rules - Rules to evaluate
   * @param context - Evaluation context
   * @returns Per-rule results
   */
  private async evaluateRulesParallel(
    rules: RulePlugin[],
    context: RuleContext
  ): Promise<RuleEvaluationResult[]> {
    const results: RuleEvaluationResult[] = [];
    const queue = [...rules];

    while (queue.length > 0) {
      // Take batch of rules up to max concurrent
      const batch = queue.splice(0, this.options.maxConcurrent!);

      // Evaluate batch in parallel
      const batchResults = await Promise.all(
        batch.map((rule) => this.evaluateRule(rule, context))
      );

      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Evaluate rules sequentially
   * @param rules - Rules to evaluate
   * @param context - Evaluation context
   * @returns Per-rule results
   */
  private async evaluateRulesSequential(
    rules: RulePlugin[],
    context: RuleContext
  ): Promise<RuleEvaluationResult[]> {
    const results: RuleEvaluationResult[] = [];

    for (const rule of rules) {
      const result = await this.evaluateRule(rule, context);
      results.push(result);
    }

    return results;
  }

  /**
   * Evaluate a single rule
   * @param rule - Rule to evaluate
   * @param context - Evaluation context
   * @returns Rule evaluation result
   */
  private async evaluateRule(
    rule: RulePlugin,
    context: RuleContext
  ): Promise<RuleEvaluationResult> {
    const startTime = Date.now();

    try {
      // Evaluate rule with timeout
      const findings = await this.evaluateWithTimeout(rule, context);

      return {
        ruleId: rule.id,
        findings,
        evalTimeMs: Date.now() - startTime,
        success: true,
      };
    } catch (error) {
      return {
        ruleId: rule.id,
        findings: [],
        evalTimeMs: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Evaluate rule with timeout
   * @param rule - Rule to evaluate
   * @param context - Evaluation context
   * @returns Findings from rule
   */
  private async evaluateWithTimeout(
    rule: RulePlugin,
    context: RuleContext
  ): Promise<Finding[]> {
    return new Promise<Finding[]>((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        reject(new Error(`Rule ${rule.id} timed out after ${this.options.timeoutMs}ms`));
      }, this.options.timeoutMs);

      try {
        // Evaluate rule (synchronous for most rules)
        const findings = rule.evaluate(context);
        clearTimeout(timeout);
        resolve(findings);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Evaluate rules for specific files only (for incremental analysis)
   * @param rules - Rules to evaluate
   * @param graph - NormalizedRepoGraph
   * @param filesToEvaluate - Files to evaluate (relative paths)
   * @param getFileContent - Function to get file content
   * @returns Evaluation results for specified files
   */
  async evaluateForFiles(
    rules: RulePlugin[],
    graph: SimpleGraph,
    filesToEvaluate: string[],
    getFileContent: (path: string) => string | null
  ): Promise<AllRulesEvaluationResult> {
    // Filter graph to only include specified files
    const filteredFiles = graph.files.filter((f) =>
      filesToEvaluate.includes(f.path)
    );

    const filteredGraph: SimpleGraph = {
      ...graph,
      files: filteredFiles,
    };

    return this.evaluateAll(rules, filteredGraph, getFileContent);
  }

  /**
   * Get evaluator statistics
   */
  getStats(): { maxConcurrent: number; parallel: boolean; timeoutMs: number } {
    return {
      maxConcurrent: this.options.maxConcurrent!,
      parallel: this.options.parallel!,
      timeoutMs: this.options.timeoutMs!,
    };
  }
}