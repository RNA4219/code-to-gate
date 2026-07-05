import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  BaselineDebtLedgerArtifact,
  DriftBudgetArtifact,
  ReleaseReadinessArtifact,
  ReviewQueueArtifact,
  ReviewQueueItem,
  ReviewQueueItemType,
  TestPlanArtifact,
} from "../types/artifacts.js";
import type { EXIT, getOption } from "./exit-codes.js";
import { emitCliError, emitCliSummary } from "./output.js";

export interface ReviewQueueCliOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

type HistoricalWithSlo = {
  repo?: { root?: string };
  run_id?: string;
  qualitySlo?: {
    indicators?: Array<{ id: string; status: "pass" | "warn" | "fail"; summary: string }>;
  };
};

const VALUE_OPTIONS = new Set(["--from", "--out"]);
const FLAG_OPTIONS = new Set(["--quiet"]);

function printHelp(): void {
  console.log(`code-to-gate review-queue --from <artifact-dir> [--out <file-or-dir>] [--quiet]

Generates review-queue.json from historical SLO, baseline expiry, test-plan oracle gaps, and drift-budget recurrence.`);
}

function validateArgs(args: string[]): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (VALUE_OPTIONS.has(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) return `${arg} requires a value`;
      index += 1;
      continue;
    }
    if (FLAG_OPTIONS.has(arg) || arg === "--help" || arg === "-h") continue;
    return `unknown review-queue option: ${arg}`;
  }
  return null;
}

function readOptionalJson<T>(fromDir: string, fileName: string): T | null {
  const filePath = path.join(fromDir, fileName);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function outputPath(fromDir: string, out: string | undefined): string {
  if (!out) return path.join(fromDir, "review-queue.json");
  const absolute = path.resolve(process.cwd(), out);
  return absolute.endsWith(".json") ? absolute : path.join(absolute, "review-queue.json");
}

function dueDate(now: Date, days: number): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function item(input: Omit<ReviewQueueItem, "status">): ReviewQueueItem {
  return { ...input, status: "open" };
}

function byType(items: ReviewQueueItem[]): Record<ReviewQueueItemType, number> {
  return {
    slo_breach: items.filter((entry) => entry.type === "slo_breach").length,
    baseline_expiry: items.filter((entry) => entry.type === "baseline_expiry").length,
    manual_oracle_gap: items.filter((entry) => entry.type === "manual_oracle_gap").length,
    spec_drift_recurrence: items.filter((entry) => entry.type === "spec_drift_recurrence").length,
  };
}

export function createReviewQueue(input: { fromDir: string; version: string; now?: Date }): ReviewQueueArtifact {
  const now = input.now ?? new Date();
  const readiness = readOptionalJson<ReleaseReadinessArtifact>(input.fromDir, "release-readiness.json");
  const baselineLedger = readOptionalJson<BaselineDebtLedgerArtifact>(input.fromDir, "baseline-debt-ledger.json");
  const testPlan = readOptionalJson<TestPlanArtifact>(input.fromDir, "test-plan.json");
  const driftBudget = readOptionalJson<DriftBudgetArtifact>(input.fromDir, "drift-budget.json");
  const historical = readOptionalJson<HistoricalWithSlo>(input.fromDir, "historical-comparison.json");
  const items: ReviewQueueItem[] = [];

  for (const indicator of historical?.qualitySlo?.indicators ?? []) {
    if (indicator.status === "pass") continue;
    items.push(item({
      id: `slo-${indicator.id}`,
      type: "slo_breach",
      title: `Quality SLO ${indicator.status}: ${indicator.id}`,
      detail: indicator.summary,
      priority: indicator.status === "fail" ? "high" : "medium",
      owner: "quality",
      dueDate: dueDate(now, indicator.status === "fail" ? 3 : 7),
      sourceArtifact: "historical-comparison.json",
      sourceIds: [indicator.id],
    }));
  }

  const expiredLedgerItems = (baselineLedger?.items ?? []).filter((ledgerItem) => ledgerItem.expired);
  for (const ledgerItem of expiredLedgerItems) {
    items.push(item({
      id: `baseline-expired-${ledgerItem.id}`,
      type: "baseline_expiry",
      title: "Baseline debt is expired",
      detail: `${ledgerItem.refreshReason} Prevention: ${ledgerItem.preventionNote}`,
      priority: "high",
      owner: ledgerItem.owner,
      dueDate: dueDate(now, 3),
      sourceArtifact: "baseline-debt-ledger.json",
      sourceIds: [ledgerItem.id, ...ledgerItem.sourceIds],
    }));
  }

  if (expiredLedgerItems.length === 0 && readiness?.baseline?.expired) {
    items.push(item({
      id: "baseline-expired",
      type: "baseline_expiry",
      title: "Baseline debt is expired",
      detail: `Baseline expired at ${readiness.baseline.expiresAt ?? "unknown date"}.`,
      priority: "high",
      owner: readiness.baseline.owner,
      dueDate: dueDate(now, 3),
      sourceArtifact: "release-readiness.json",
      sourceIds: readiness.baseline.gatedFindingIds,
    }));
  }

  for (const gap of testPlan?.oracleGaps ?? []) {
    items.push(item({
      id: `oracle-gap-${gap.id}`,
      type: "manual_oracle_gap",
      title: gap.suggestedManualTest,
      detail: gap.reason,
      priority: "high",
      dueDate: dueDate(now, 7),
      sourceArtifact: "test-plan.json",
      sourceIds: [gap.id, gap.sourcePath],
    }));
  }

  for (const check of driftBudget?.recurrence.recurringChecks ?? []) {
    items.push(item({
      id: `spec-drift-recurrence-${check.id}`,
      type: "spec_drift_recurrence",
      title: `Recurring spec drift: ${check.id}`,
      detail: `${check.occurrences} occurrences across ${check.sourceArtifacts.length} source artifacts.`,
      priority: "medium",
      owner: "quality",
      dueDate: dueDate(now, 7),
      sourceArtifact: "drift-budget.json",
      sourceIds: [check.id],
    }));
  }

  const generatedAt = now.toISOString();
  const repoRoot = readiness?.repo.root ?? historical?.repo?.root ?? testPlan?.repo.root ?? driftBudget?.repo.root ?? process.cwd();
  return {
    version: "ctg/v1",
    generated_at: generatedAt,
    run_id: `review-queue-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    repo: { root: repoRoot },
    tool: { name: "code-to-gate", version: input.version, plugin_versions: [] },
    artifact: "review-queue",
    schema: "review-queue@v1",
    completeness: items.length > 0 ? "complete" : "partial",
    items,
    summary: {
      items: items.length,
      open: items.filter((entry) => entry.status === "open").length,
      dismissed: items.filter((entry) => entry.status === "dismissed").length,
      resolved: items.filter((entry) => entry.status === "resolved").length,
      critical: items.filter((entry) => entry.priority === "critical").length,
      high: items.filter((entry) => entry.priority === "high").length,
      byType: byType(items),
    },
    generated_by: "ctg-review-queue-v1",
  };
}

export async function reviewQueueCommand(args: string[], options: ReviewQueueCliOptions): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return options.EXIT.OK;
  }
  const argError = validateArgs(args);
  if (argError) {
    emitCliError(argError, { code: "USAGE_ERROR", command: "review-queue", exitCode: options.EXIT.USAGE_ERROR });
    return options.EXIT.USAGE_ERROR;
  }

  try {
    const fromDir = path.resolve(process.cwd(), options.getOption(args, "--from") ?? ".qh");
    if (!existsSync(fromDir) || !statSync(fromDir).isDirectory()) {
      throw new Error(`artifact directory not found: ${fromDir}`);
    }
    const artifact = createReviewQueue({ fromDir, version: options.VERSION });
    const targetPath = outputPath(fromDir, options.getOption(args, "--out"));
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
    emitCliSummary(args, {
      schema: "ctg.cli.summary@v1",
      tool: { name: "code-to-gate", version: options.VERSION },
      command: "review-queue",
      status: artifact.items.length > 0 ? "open" : "empty",
      exit_code: options.EXIT.OK,
      output: targetPath,
      summary: artifact.summary,
    });
    return options.EXIT.OK;
  } catch (error) {
    emitCliError(error instanceof Error ? error.message : String(error), {
      code: "REVIEW_QUEUE_FAILED",
      command: "review-queue",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }
}
