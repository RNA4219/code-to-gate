/**
 * Baseline artifact management for historical comparison
 *
 * Provides functionality to:
 * - Load baseline artifacts from a designated directory
 * - Update baseline when thresholds are met
 * - Lock baseline to a specific run
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  BaselineConfig,
  BaselineStatus,
  RunReference,
  HistoricalSummaryReport,
} from "./types.js";
import {
  FindingsArtifact,
  RiskRegisterArtifact,
  ReleaseReadinessArtifact,
  CTG_VERSION,
} from "../types/artifacts.js";

/**
 * Default baseline directory name
 */
export const DEFAULT_BASELINE_DIR = ".qh-baseline";

/**
 * Baseline artifact file names
 */
const BASELINE_FILES = {
  findings: "baseline-findings.json",
  risks: "baseline-risk-register.yaml",
  readiness: "baseline-release-readiness.json",
  status: "baseline-status.json",
};

/**
 * Load baseline findings artifact
 */
export function loadBaselineFindings(baselineDir: string): FindingsArtifact | null {
  const findingsPath = path.join(baselineDir, BASELINE_FILES.findings);

  if (!existsSync(findingsPath)) {
    return null;
  }

  try {
    const content = readFileSync(findingsPath, "utf8");
    return JSON.parse(content) as FindingsArtifact;
  } catch (e) {
    console.error(`[baseline] Failed to load baseline findings from ${findingsPath}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * Load baseline risk register artifact
 */
export function loadBaselineRisks(baselineDir: string): RiskRegisterArtifact | null {
  const risksPath = path.join(baselineDir, BASELINE_FILES.risks);

  if (!existsSync(risksPath)) {
    return null;
  }

  try {
    const content = readFileSync(risksPath, "utf8");
    // Parse YAML - simplified, assumes JSON-like YAML
    const parsed = parseYamlLike(content);
    return parsed as RiskRegisterArtifact;
  } catch (e) {
    console.error(`[baseline] Failed to load baseline risks from ${risksPath}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * Load baseline release readiness artifact
 */
export function loadBaselineReadiness(baselineDir: string): ReleaseReadinessArtifact | null {
  const readinessPath = path.join(baselineDir, BASELINE_FILES.readiness);

  if (!existsSync(readinessPath)) {
    return null;
  }

  try {
    const content = readFileSync(readinessPath, "utf8");
    return JSON.parse(content) as ReleaseReadinessArtifact;
  } catch (e) {
    console.error(`[baseline] Failed to load baseline readiness from ${readinessPath}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * Load baseline status
 */
export function loadBaselineStatus(baselineDir: string): BaselineStatus | null {
  const statusPath = path.join(baselineDir, BASELINE_FILES.status);

  if (!existsSync(statusPath)) {
    return null;
  }

  try {
    const content = readFileSync(statusPath, "utf8");
    return JSON.parse(content) as BaselineStatus;
  } catch (e) {
    console.error(`[baseline] Failed to load baseline status from ${statusPath}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * Save baseline findings artifact
 */
export function saveBaselineFindings(baselineDir: string, findings: FindingsArtifact): void {
  ensureBaselineDir(baselineDir);
  const findingsPath = path.join(baselineDir, BASELINE_FILES.findings);
  writeFileSync(findingsPath, JSON.stringify(findings, null, 2) + "\n", "utf8");
}

/**
 * Save baseline risk register artifact
 */
export function saveBaselineRisks(baselineDir: string, risks: RiskRegisterArtifact): void {
  ensureBaselineDir(baselineDir);
  const risksPath = path.join(baselineDir, BASELINE_FILES.risks);
  writeFileSync(risksPath, JSON.stringify(risks, null, 2) + "\n", "utf8");
}

/**
 * Save baseline release readiness artifact
 */
export function saveBaselineReadiness(baselineDir: string, readiness: ReleaseReadinessArtifact): void {
  ensureBaselineDir(baselineDir);
  const readinessPath = path.join(baselineDir, BASELINE_FILES.readiness);
  writeFileSync(readinessPath, JSON.stringify(readiness, null, 2) + "\n", "utf8");
}

/**
 * Save baseline status
 */
export function saveBaselineStatus(baselineDir: string, status: BaselineStatus): void {
  ensureBaselineDir(baselineDir);
  const statusPath = path.join(baselineDir, BASELINE_FILES.status);
  writeFileSync(statusPath, JSON.stringify(status, null, 2) + "\n", "utf8");
}

/**
 * Initialize baseline directory
 */
export function initializeBaseline(baselineDir: string, run: RunReference): BaselineStatus {
  ensureBaselineDir(baselineDir);

  const status: BaselineStatus = {
    baselineDir,
    baselineRunId: run.run_id,
    baselineGeneratedAt: run.generated_at,
    comparisonsCount: 0,
    locked: false,
  };

  saveBaselineStatus(baselineDir, status);
  return status;
}

/**
 * Update baseline from a historical comparison report
 * Only updates if improvement exceeds threshold or auto-update is enabled
 */
export function updateBaselineFromComparison(
  baselineDir: string,
  comparison: HistoricalSummaryReport,
  config: BaselineConfig
): boolean {
  const status = loadBaselineStatus(baselineDir);

  if (status?.locked && status.lockToRun) {
    return false; // Baseline is locked
  }

  // Check update threshold
  const trendScore = comparison.riskTrends.trendScore;
  const threshold = config.updateThreshold ?? 0.1;

  if (trendScore < threshold) {
    return false; // Not enough improvement to update baseline
  }

  // Load current artifacts and save as baseline
  const currentFindings = loadFindingsFromDir(comparison.currentRun.artifact_dir);
  if (currentFindings) {
    saveBaselineFindings(baselineDir, currentFindings);
  }

  const currentRisks = loadRisksFromDir(comparison.currentRun.artifact_dir);
  if (currentRisks) {
    saveBaselineRisks(baselineDir, currentRisks);
  }

  const currentReadiness = loadReadinessFromDir(comparison.currentRun.artifact_dir);
  if (currentReadiness) {
    saveBaselineReadiness(baselineDir, currentReadiness);
  }

  // Update status
  const newStatus: BaselineStatus = {
    baselineDir,
    baselineRunId: comparison.currentRun.run_id,
    baselineGeneratedAt: comparison.currentRun.generated_at,
    lastComparisonAt: comparison.generated_at,
    comparisonsCount: (status?.comparisonsCount ?? 0) + 1,
    locked: config.lockToRun !== undefined,
  };

  saveBaselineStatus(baselineDir, newStatus);
  return true;
}

/**
 * Lock baseline to a specific run
 */
export function lockBaseline(baselineDir: string, runId?: string): boolean {
  const status = loadBaselineStatus(baselineDir);

  if (!status) {
    return false;
  }

  status.locked = true;
  if (runId) {
    status.baselineRunId = runId;
  }

  saveBaselineStatus(baselineDir, status);
  return true;
}

/**
 * Unlock baseline
 */
export function unlockBaseline(baselineDir: string): boolean {
  const status = loadBaselineStatus(baselineDir);

  if (!status) {
    return false;
  }

  status.locked = false;
  saveBaselineStatus(baselineDir, status);
  return true;
}

/**
 * Get run reference from baseline
 */
export function getBaselineRunReference(baselineDir: string): RunReference | null {
  const status = loadBaselineStatus(baselineDir);

  if (!status) {
    return null;
  }

  return {
    run_id: status.baselineRunId,
    generated_at: status.baselineGeneratedAt,
    artifact_dir: baselineDir,
  };
}

/**
 * Discover historical runs in a directory
 * Returns list of run directories sorted by generated_at (most recent first)
 */
export function discoverHistoricalRuns(historyDir: string): RunReference[] {
  if (!existsSync(historyDir)) {
    return [];
  }

  const runs: RunReference[] = [];
  const entries = readdirSync(historyDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const runDir = path.join(historyDir, entry.name);
    const findingsPath = path.join(runDir, "findings.json");

    if (!existsSync(findingsPath)) continue;

    try {
      const findings = JSON.parse(readFileSync(findingsPath, "utf8")) as FindingsArtifact;
      runs.push({
        run_id: findings.run_id,
        generated_at: findings.generated_at,
        artifact_dir: runDir,
        repo_revision: findings.repo.revision,
        branch: findings.repo.branch,
      });
    } catch (e) {
      // Skip invalid runs
      console.error(`[baseline] Failed to parse findings from ${findingsPath}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Sort by generated_at (most recent first)
  runs.sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime());

  return runs;
}

/**
 * Get most recent historical run before a given timestamp
 */
export function getPreviousRun(historyDir: string, currentTimestamp: string): RunReference | null {
  const runs = discoverHistoricalRuns(historyDir);
  const currentTime = new Date(currentTimestamp).getTime();

  for (const run of runs) {
    const runTime = new Date(run.generated_at).getTime();
    if (runTime < currentTime) {
      return run;
    }
  }

  return null;
}

// === Helper Functions ===

function ensureBaselineDir(baselineDir: string): void {
  if (!existsSync(baselineDir)) {
    mkdirSync(baselineDir, { recursive: true });
  }
}

function loadFindingsFromDir(dir: string): FindingsArtifact | null {
  const findingsPath = path.join(dir, "findings.json");
  if (!existsSync(findingsPath)) return null;

  try {
    return JSON.parse(readFileSync(findingsPath, "utf8")) as FindingsArtifact;
  } catch (e) {
    console.error(`[baseline] Failed to load findings from ${findingsPath}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

function loadRisksFromDir(dir: string): RiskRegisterArtifact | null {
  const risksPath = path.join(dir, "risk-register.yaml");
  if (!existsSync(risksPath)) return null;

  try {
    return parseYamlLike(readFileSync(risksPath, "utf8")) as RiskRegisterArtifact;
  } catch (e) {
    console.error(`[baseline] Failed to load risks from ${risksPath}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

function loadReadinessFromDir(dir: string): ReleaseReadinessArtifact | null {
  const readinessPath = path.join(dir, "release-readiness.json");
  if (!existsSync(readinessPath)) return null;

  try {
    return JSON.parse(readFileSync(readinessPath, "utf8")) as ReleaseReadinessArtifact;
  } catch (e) {
    console.error(`[baseline] Failed to load readiness from ${readinessPath}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * Simple YAML-like parser for JSON-formatted YAML
 * Handles basic YAML with JSON-compatible structure
 */
function parseYamlLike(content: string): unknown {
  // Remove YAML document markers
  let cleaned = content.replace(/^---\s*\n/, "").replace(/\n---\s*$/, "");

  // Try JSON parse first (many YAML files are JSON-compatible)
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall back to basic YAML parsing
    // This is a simplified implementation
    const lines = cleaned.split("\n");
    const result: Record<string, unknown> = {};
    let currentKey = "";
    let currentArray: unknown[] | null = null;

    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (trimmed === "" || trimmed.startsWith("#")) continue;

      // Key: value
      const colonMatch = trimmed.match(/^(\w+):\s*(.*)$/);
      if (colonMatch) {
        currentKey = colonMatch[1];
        const value = colonMatch[2].trim();

        if (value === "") {
          // Empty value, might be array or nested object
          currentArray = null;
        } else if (value.startsWith("[") || value.startsWith("{")) {
          // JSON-like value
          try {
            result[currentKey] = JSON.parse(value);
          } catch {
            result[currentKey] = value;
          }
        } else if (value.startsWith('"') && value.endsWith('"')) {
          // Quoted string
          result[currentKey] = value.slice(1, -1);
        } else if (value === "null" || value === "true" || value === "false") {
          // Boolean/null
          result[currentKey] = value === "null" ? null : value === "true";
        } else if (!isNaN(Number(value))) {
          // Number
          result[currentKey] = Number(value);
        } else {
          result[currentKey] = value;
        }
      }
    }

    return result;
  }
}