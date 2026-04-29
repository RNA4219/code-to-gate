/**
 * Historical comparison module exports
 *
 * Provides functionality to compare artifacts between runs,
 * detect regressions, and track risk trends over time.
 */

// Types
export {
  // Run Reference
  RunReference,

  // Finding Comparison
  FindingChangeStatus,
  FindingComparison,
  FindingsComparisonResult,

  // Risk Comparison
  RiskChangeStatus,
  RiskComparison,
  RisksComparisonResult,

  // Historical Report
  HistoricalSummaryReport,

  // Readiness Comparison
  ReadinessComparisonResult,

  // Risk Trends
  RiskTrendPoint,
  RiskTrendAnalysis,

  // Regression
  RegressionConfig,
  RegressionReport,

  // Baseline
  BaselineConfig,
  BaselineStatus,

  // Options
  HistoricalOptions,
} from "./types.js";

// Baseline Management
export {
  DEFAULT_BASELINE_DIR,
  loadBaselineFindings,
  loadBaselineRisks,
  loadBaselineReadiness,
  loadBaselineStatus,
  saveBaselineFindings,
  saveBaselineRisks,
  saveBaselineReadiness,
  saveBaselineStatus,
  initializeBaseline,
  updateBaselineFromComparison,
  lockBaseline,
  unlockBaseline,
  getBaselineRunReference,
  discoverHistoricalRuns,
  getPreviousRun,
} from "./baseline.js";

// Comparison
export {
  loadFindings,
  loadRisks,
  loadReadiness,
  compareFindings,
  compareRisks,
  compareReadiness,
  analyzeRiskTrends,
  generateHistoricalReport,
} from "./comparison.js";

// Regression Detection
export {
  DEFAULT_REGRESSION_CONFIG,
  detectRegressions,
  generateRegressionReport,
  isRegression,
  calculateRegressionRiskScore,
  getRegressionSummaryByRuleId,
  hasBlockingRegressions,
} from "./regression.js";