/**
 * Historical comparison types for code-to-gate
 * Supports comparing artifacts between runs and tracking risk trends
 */

import {
  Finding,
  Severity,
  FindingCategory,
  RiskSeed,
  ArtifactHeader,
  ReadinessStatus,
} from "../types/artifacts.js";

// === Historical Run Reference ===

export interface RunReference {
  run_id: string;
  generated_at: string;
  artifact_dir: string;
  repo_revision?: string;
  branch?: string;
}

// === Finding Comparison ===

export type FindingChangeStatus = "new" | "resolved" | "unchanged" | "modified";

export interface FindingComparison {
  findingId: string;
  ruleId: string;
  status: FindingChangeStatus;
  currentFinding?: Finding;
  previousFinding?: Finding;
  path: string;
  severity: Severity;
  category: FindingCategory;
  matchedOn: "ruleId_path" | "ruleId_symbol" | "fuzzy_match" | "manual";
  regression?: boolean;
}

export interface FindingsComparisonResult {
  new: FindingComparison[];
  resolved: FindingComparison[];
  unchanged: FindingComparison[];
  modified: FindingComparison[];
  regressions: FindingComparison[];
  summary: {
    totalCurrent: number;
    totalPrevious: number;
    newCount: number;
    resolvedCount: number;
    unchangedCount: number;
    modifiedCount: number;
    regressionCount: number;
    bySeverity: Record<Severity, { new: number; resolved: number; unchanged: number }>;
    byCategory: Record<FindingCategory, { new: number; resolved: number; unchanged: number }>;
  };
}

// === Risk Comparison ===

export type RiskChangeStatus = "new" | "resolved" | "unchanged" | "evolved";

export interface RiskComparison {
  riskId: string;
  title: string;
  status: RiskChangeStatus;
  currentRisk?: RiskSeed;
  previousRisk?: RiskSeed;
  severity: Severity;
  likelihood: "low" | "medium" | "high" | "unknown";
  matchedOn: "title_similarity" | "source_findings" | "manual";
}

export interface RisksComparisonResult {
  new: RiskComparison[];
  resolved: RiskComparison[];
  unchanged: RiskComparison[];
  evolved: RiskComparison[];
  summary: {
    totalCurrent: number;
    totalPrevious: number;
    newCount: number;
    resolvedCount: number;
    unchangedCount: number;
    evolvedCount: number;
  };
}

// === Historical Summary Report ===

export interface HistoricalSummaryReport extends ArtifactHeader {
  artifact: "historical-comparison";
  schema: "historical-comparison@v1";
  completeness: "complete" | "partial";
  currentRun: RunReference;
  previousRun: RunReference;
  findingsComparison: FindingsComparisonResult;
  risksComparison?: RisksComparisonResult;
  readinessComparison?: ReadinessComparisonResult;
  riskTrends: RiskTrendAnalysis;
  recommendations: string[];
  generated_by: "ctg-historical-v1";
}

// === Readiness Comparison ===

export interface ReadinessComparisonResult {
  currentStatus: ReadinessStatus;
  previousStatus: ReadinessStatus;
  statusChanged: boolean;
  statusImproved: boolean;
  statusDegraded: boolean;
  metricsComparison: {
    criticalFindings: { current: number; previous: number; change: number };
    highFindings: { current: number; previous: number; change: number };
    mediumFindings: { current: number; previous: number; change: number };
    lowFindings: { current: number; previous: number; change: number };
    riskCount: { current: number; previous: number; change: number };
    testSeedCount: { current: number; previous: number; change: number };
  };
}

// === Risk Trends ===

export interface RiskTrendPoint {
  run_id: string;
  generated_at: string;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  totalFindings: number;
  riskCount: number;
  readinessStatus: ReadinessStatus;
}

export interface RiskTrendAnalysis {
  trendDirection: "improving" | "stable" | "degrading" | "unknown";
  trendScore: number; // -1 to 1, negative = degrading, positive = improving
  criticalTrend: "increasing" | "stable" | "decreasing";
  highTrend: "increasing" | "stable" | "decreasing";
  riskScoreChange: number;
  periodDays?: number;
  historyPoints?: RiskTrendPoint[];
}

// === Regression Detection ===

export interface RegressionConfig {
  detectRegressions: boolean;
  regressionRules?: string[]; // Rules to specifically check for regressions
  severityThreshold?: Severity; // Minimum severity to consider as regression
  pathMatchRequired?: boolean; // Require same path for regression detection
  allowResolvedThenReintroduced?: boolean; // Allow findings that were resolved then reintroduced
}

export interface RegressionReport {
  regressions: FindingComparison[];
  potentialRegressions: FindingComparison[];
  reintroducedFindings: FindingComparison[];
  summary: {
    regressionCount: number;
    potentialRegressionCount: number;
    reintroducedCount: number;
    byRuleId: Record<string, number>;
  };
  recommendations: string[];
}

// === Baseline Management ===

export interface BaselineConfig {
  baselineDir: string;
  autoUpdate: boolean;
  updateThreshold?: number; // Only update baseline if improvement exceeds threshold
  lockToRun?: string; // Lock baseline to a specific run_id
}

export interface BaselineStatus {
  baselineDir: string;
  baselineRunId: string;
  baselineGeneratedAt: string;
  lastComparisonAt?: string;
  comparisonsCount: number;
  locked: boolean;
  lockToRun?: string; // Run ID the baseline is locked to
}

// === Historical Options ===

export interface HistoricalOptions {
  currentDir: string;
  previousDir: string;
  outFile?: string;
  regressionConfig?: RegressionConfig;
  baselineConfig?: BaselineConfig;
  includeRisks?: boolean;
  includeReadiness?: boolean;
  includeTrendHistory?: boolean;
  trendHistoryDir?: string; // Directory containing historical runs for trend analysis
}