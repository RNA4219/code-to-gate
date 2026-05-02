/**
 * Plugin Runner Utility Functions
 * Helper functions for plugin execution and result aggregation
 */

import type { PluginInput, PluginOutput, PluginExecutionResult } from "./types.js";
import { PLUGIN_INPUT_VERSION } from "./types.js";

/**
 * Create plugin input from repo graph
 */
export function createPluginInput(
  repoGraph: unknown,
  importedFindings?: unknown,
  config?: Record<string, unknown>,
  policy?: unknown,
  metadata?: { runId?: string; repoRoot?: string; workDir?: string }
): PluginInput {
  return {
    version: PLUGIN_INPUT_VERSION,
    repo_graph: repoGraph,
    imported_findings: importedFindings,
    config,
    policy,
    metadata: {
      run_id: metadata?.runId,
      repo_root: metadata?.repoRoot,
      work_dir: metadata?.workDir,
    },
  };
}

/**
 * Aggregate results from multiple plugin executions
 */
export function aggregatePluginOutputs(results: PluginExecutionResult[]): {
  findings: PluginOutput["findings"];
  riskSeeds: PluginOutput["risk_seeds"];
  invariantSeeds: PluginOutput["invariant_seeds"];
  testSeeds: PluginOutput["test_seeds"];
  diagnostics: PluginOutput["diagnostics"];
  errors: PluginOutput["errors"];
  successCount: number;
  failureCount: number;
} {
  const findings: PluginOutput["findings"] = [];
  const riskSeeds: PluginOutput["risk_seeds"] = [];
  const invariantSeeds: PluginOutput["invariant_seeds"] = [];
  const testSeeds: PluginOutput["test_seeds"] = [];
  const diagnostics: PluginOutput["diagnostics"] = [];
  const errors: PluginOutput["errors"] = [];

  let successCount = 0;
  let failureCount = 0;

  for (const result of results) {
    if (result.status === "success" || result.status === "partial") {
      successCount++;
      if (result.output) {
        if (result.output.findings) findings.push(...result.output.findings);
        if (result.output.risk_seeds) riskSeeds.push(...result.output.risk_seeds);
        if (result.output.invariant_seeds) invariantSeeds.push(...result.output.invariant_seeds);
        if (result.output.test_seeds) testSeeds.push(...result.output.test_seeds);
        if (result.output.diagnostics) diagnostics.push(...result.output.diagnostics);
        if (result.output.errors) errors.push(...result.output.errors);
      }
    } else {
      failureCount++;
      errors.push({
        code: `PLUGIN_${result.status.toUpperCase()}`,
        message: result.error?.message ?? "Unknown error",
        details: result.error?.details,
      });
    }
  }

  return {
    findings,
    riskSeeds,
    invariantSeeds,
    testSeeds,
    diagnostics,
    errors,
    successCount,
    failureCount,
  };
}

/**
 * Check if all plugin executions succeeded
 */
export function allPluginsSucceeded(results: PluginExecutionResult[]): boolean {
  return results.every(r => r.status === "success" || r.status === "partial");
}

/**
 * Get failed plugin executions
 */
export function getFailedPlugins(results: PluginExecutionResult[]): PluginExecutionResult[] {
  return results.filter(r => r.status !== "success" && r.status !== "partial");
}