import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  BaselineDebtLedgerArtifact,
  BaselineDebtLedgerItem,
  ReleaseReadinessArtifact,
} from "../types/artifacts.js";
import type { EXIT, getOption } from "./exit-codes.js";
import { emitCliError, emitCliSummary } from "./output.js";

export interface BaselineLedgerCliOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

const VALUE_OPTIONS = new Set([
  "--from",
  "--out",
  "--owner",
  "--approver",
  "--approval-reason",
  "--refresh-reason",
  "--estimated-effort",
  "--prevention-note",
]);
const FLAG_OPTIONS = new Set(["--quiet"]);

function printHelp(): void {
  console.log(`code-to-gate baseline-ledger --from <artifact-dir> [--out <file-or-dir>] [--owner <owner>] [--approver <approver>] [--approval-reason <text>] [--refresh-reason <text>] [--estimated-effort <text>] [--prevention-note <text>] [--quiet]

Generates baseline-debt-ledger.json from release-readiness.baseline while preserving existing readiness consumers.`);
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
    return `unknown baseline-ledger option: ${arg}`;
  }
  return null;
}

function readOptionalJson<T>(fromDir: string, fileName: string): T | null {
  const filePath = path.join(fromDir, fileName);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function outputPath(fromDir: string, out: string | undefined): string {
  if (!out) return path.join(fromDir, "baseline-debt-ledger.json");
  const absolute = path.resolve(process.cwd(), out);
  return absolute.endsWith(".json") ? absolute : path.join(absolute, "baseline-debt-ledger.json");
}

function dateOnly(value: string | undefined, now: Date): string {
  if (value && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const fallback = new Date(now);
  fallback.setUTCDate(fallback.getUTCDate() + 30);
  return fallback.toISOString().slice(0, 10);
}

function isExpired(expiresAt: string, explicit: boolean | undefined, now: Date): boolean {
  if (explicit !== undefined) return explicit;
  return expiresAt < now.toISOString().slice(0, 10);
}

function optionOrDefault(args: string[], options: BaselineLedgerCliOptions, name: string, fallback: string): string {
  const value = options.getOption(args, name);
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

export function createBaselineDebtLedger(input: {
  fromDir: string;
  version: string;
  args?: string[];
  options?: BaselineLedgerCliOptions;
  now?: Date;
}): BaselineDebtLedgerArtifact {
  const now = input.now ?? new Date();
  const args = input.args ?? [];
  const readiness = readOptionalJson<ReleaseReadinessArtifact>(input.fromDir, "release-readiness.json");
  const baseline = readiness?.baseline;
  const items: BaselineDebtLedgerItem[] = [];

  if (baseline) {
    const expiresAt = dateOnly(baseline.expiresAt, now);
    const expired = isExpired(expiresAt, baseline.expired, now);
    const owner = input.options
      ? optionOrDefault(args, input.options, "--owner", baseline.owner ?? "unassigned")
      : baseline.owner ?? "unassigned";
    const sourceIds = [...new Set([...baseline.gatedFindingIds, ...baseline.resolvedFindingIds])];
    const knownDebt = baseline.unchangedFindings + baseline.newFindings + baseline.worsenedFindings;
    items.push({
      id: "baseline-debt-001",
      owner,
      expiresAt,
      expired,
      approver: input.options
        ? optionOrDefault(args, input.options, "--approver", "unspecified")
        : "unspecified",
      approvalReason: input.options
        ? optionOrDefault(args, input.options, "--approval-reason", "Baseline ratchet accepted existing findings as known release debt.")
        : "Baseline ratchet accepted existing findings as known release debt.",
      refreshReason: input.options
        ? optionOrDefault(args, input.options, "--refresh-reason", expired ? "Baseline debt is expired and must be refreshed or resolved." : "Baseline ledger generated from release-readiness baseline.")
        : expired ? "Baseline debt is expired and must be refreshed or resolved." : "Baseline ledger generated from release-readiness baseline.",
      estimatedEffort: input.options
        ? optionOrDefault(args, input.options, "--estimated-effort", `${knownDebt} finding(s)`)
        : `${knownDebt} finding(s)`,
      preventionNote: input.options
        ? optionOrDefault(args, input.options, "--prevention-note", "Add regression coverage and retire baseline entries as findings are resolved.")
        : "Add regression coverage and retire baseline entries as findings are resolved.",
      sourceArtifact: "release-readiness.json",
      sourceIds,
      baselineSource: baseline.source,
    });
  }

  const generatedAt = now.toISOString();
  const expiredItems = items.filter((item) => item.expired).length;
  const artifact: BaselineDebtLedgerArtifact = {
    version: "ctg/v1",
    generated_at: generatedAt,
    run_id: `baseline-debt-ledger-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    repo: { root: readiness?.repo.root ?? process.cwd() },
    tool: { name: "code-to-gate", version: input.version, plugin_versions: [] },
    artifact: "baseline-debt-ledger",
    schema: "baseline-debt-ledger@v1",
    completeness: baseline ? "complete" : "partial",
    status: expiredItems > 0 ? "expired" : items.length > 0 ? "active" : "empty",
    items,
    summary: {
      items: items.length,
      active: items.filter((item) => !item.expired).length,
      expired: expiredItems,
      unowned: items.filter((item) => item.owner === "unassigned").length,
    },
    generated_by: "ctg-baseline-ledger-v1",
  };
  return artifact;
}

export async function baselineLedgerCommand(args: string[], options: BaselineLedgerCliOptions): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return options.EXIT.OK;
  }
  const argError = validateArgs(args);
  if (argError) {
    emitCliError(argError, { code: "USAGE_ERROR", command: "baseline-ledger", exitCode: options.EXIT.USAGE_ERROR });
    return options.EXIT.USAGE_ERROR;
  }

  try {
    const fromDir = path.resolve(process.cwd(), options.getOption(args, "--from") ?? ".qh");
    if (!existsSync(fromDir) || !statSync(fromDir).isDirectory()) {
      throw new Error(`artifact directory not found: ${fromDir}`);
    }
    const artifact = createBaselineDebtLedger({ fromDir, version: options.VERSION, args, options });
    const targetPath = outputPath(fromDir, options.getOption(args, "--out"));
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
    emitCliSummary(args, {
      schema: "ctg.cli.summary@v1",
      tool: { name: "code-to-gate", version: options.VERSION },
      command: "baseline-ledger",
      status: artifact.status,
      exit_code: options.EXIT.OK,
      output: targetPath,
      summary: artifact.summary,
    });
    return options.EXIT.OK;
  } catch (error) {
    emitCliError(error instanceof Error ? error.message : String(error), {
      code: "BASELINE_LEDGER_FAILED",
      command: "baseline-ledger",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }
}
