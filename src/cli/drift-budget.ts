import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { DriftBudgetArtifact, SpecDriftArtifact } from "../types/artifacts.js";
import type { EXIT, getOption } from "./exit-codes.js";
import { emitCliError, emitCliSummary } from "./output.js";

export interface DriftBudgetCliOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

interface SourceSpecDrift {
  path: string;
  hashSha256: string;
  artifact: SpecDriftArtifact;
}

const VALUE_OPTIONS = new Set(["--from", "--out", "--failed-budget", "--warning-budget", "--recurrence-budget", "--branch"]);
const FLAG_OPTIONS = new Set(["--release-branch", "--quiet"]);

function printHelp(): void {
  console.log(`code-to-gate drift-budget --from <history-dir|artifact-dir> [--out <file-or-dir>] [--failed-budget <n>] [--warning-budget <n>] [--recurrence-budget <n>] [--branch <name>] [--release-branch] [--quiet]`);
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
    return `unknown drift-budget option: ${arg}`;
  }
  return null;
}

function outputPath(fromDir: string, out: string | undefined): string {
  if (!out) return path.join(fromDir, "drift-budget.json");
  const absolute = path.resolve(process.cwd(), out);
  return absolute.endsWith(".json") ? absolute : path.join(absolute, "drift-budget.json");
}

function hashFile(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function readSpecDrift(filePath: string): SourceSpecDrift | null {
  try {
    const artifact = JSON.parse(readFileSync(filePath, "utf8")) as SpecDriftArtifact;
    if (artifact.artifact !== "spec-drift" || artifact.schema !== "spec-drift@v1") return null;
    return { path: filePath, hashSha256: hashFile(filePath), artifact };
  } catch {
    return null;
  }
}

function collectSpecDriftArtifacts(root: string): SourceSpecDrift[] {
  if (!existsSync(root)) throw new Error(`input directory not found: ${root}`);
  if (!statSync(root).isDirectory()) throw new Error(`input path is not a directory: ${root}`);

  const direct = path.join(root, "spec-drift.json");
  if (existsSync(direct)) {
    const parsed = readSpecDrift(direct);
    return parsed ? [parsed] : [];
  }

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readSpecDrift(path.join(root, entry.name, "spec-drift.json")))
    .filter((entry): entry is SourceSpecDrift => entry !== null)
    .sort((left, right) => left.artifact.generated_at.localeCompare(right.artifact.generated_at));
}

function numberOption(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`budget value must be a non-negative integer: ${value}`);
  return parsed;
}

function relative(filePath: string): string {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/") || ".";
}

export function createDriftBudget(input: {
  fromDir: string;
  version: string;
  failedBudget: number;
  warningBudget: number;
  recurrenceBudget: number;
  branch?: string;
  releaseBranch: boolean;
  now?: Date;
}): DriftBudgetArtifact {
  const sources = collectSpecDriftArtifacts(input.fromDir);
  if (sources.length === 0) throw new Error(`spec-drift.json not found in ${input.fromDir}`);
  const current = sources[sources.length - 1];
  const checkOccurrences = new Map<string, { statuses: Set<"fail" | "warning">; sourceArtifacts: string[] }>();
  for (const source of sources) {
    for (const check of source.artifact.checks) {
      if (check.status !== "fail" && check.status !== "warning") continue;
      const entry = checkOccurrences.get(check.id) ?? { statuses: new Set<"fail" | "warning">(), sourceArtifacts: [] };
      entry.statuses.add(check.status);
      entry.sourceArtifacts.push(relative(source.path));
      checkOccurrences.set(check.id, entry);
    }
  }
  const recurringChecks = [...checkOccurrences.entries()]
    .filter(([, value]) => value.sourceArtifacts.length > 1)
    .map(([id, value]) => ({
      id,
      occurrences: value.sourceArtifacts.length,
      statuses: [...value.statuses].sort(),
      sourceArtifacts: value.sourceArtifacts,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const exceeded: DriftBudgetArtifact["exceeded"] = [];
  const currentSummary = current.artifact.summary;
  if (currentSummary.failed > input.failedBudget) {
    exceeded.push({
      metric: "failed",
      actual: currentSummary.failed,
      budget: input.failedBudget,
      severity: input.releaseBranch ? "critical" : "high",
      sourceIds: current.artifact.checks.filter((check) => check.status === "fail").map((check) => check.id),
    });
  }
  if (currentSummary.warnings > input.warningBudget) {
    exceeded.push({
      metric: "warnings",
      actual: currentSummary.warnings,
      budget: input.warningBudget,
      severity: input.releaseBranch ? "high" : "medium",
      sourceIds: current.artifact.checks.filter((check) => check.status === "warning").map((check) => check.id),
    });
  }
  if (recurringChecks.length > input.recurrenceBudget) {
    exceeded.push({
      metric: "recurringChecks",
      actual: recurringChecks.length,
      budget: input.recurrenceBudget,
      severity: input.releaseBranch ? "high" : "medium",
      sourceIds: recurringChecks.map((check) => check.id),
    });
  }

  const generatedAt = (input.now ?? new Date()).toISOString();
  const status = exceeded.length > 0 ? "exceeded" : "within_budget";
  return {
    version: "ctg/v1",
    generated_at: generatedAt,
    run_id: `drift-budget-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    repo: current.artifact.repo,
    tool: { name: "code-to-gate", version: input.version, plugin_versions: [] },
    artifact: "drift-budget",
    schema: "drift-budget@v1",
    completeness: "complete",
    status,
    current: {
      sourceArtifact: relative(current.path),
      failed: currentSummary.failed,
      warnings: currentSummary.warnings,
      findings: currentSummary.findings,
    },
    recurrence: { recurringChecks, count: recurringChecks.length },
    budget: {
      failed: input.failedBudget,
      warnings: input.warningBudget,
      recurringChecks: input.recurrenceBudget,
    },
    branchPolicy: {
      branch: input.branch,
      releaseBranch: input.releaseBranch,
      blockOnExceeded: input.releaseBranch,
    },
    exceeded,
    sourceArtifacts: sources.map((source) => ({
      path: relative(source.path),
      hashSha256: source.hashSha256,
      generatedAt: source.artifact.generated_at,
    })),
    summary: {
      status,
      failed: currentSummary.failed,
      warnings: currentSummary.warnings,
      recurringChecks: recurringChecks.length,
      exceeded: exceeded.length,
    },
    generated_by: "ctg-drift-budget-v1",
  };
}

export async function driftBudgetCommand(args: string[], options: DriftBudgetCliOptions): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return options.EXIT.OK;
  }
  const argError = validateArgs(args);
  if (argError) {
    emitCliError(argError, { code: "USAGE_ERROR", command: "drift-budget", exitCode: options.EXIT.USAGE_ERROR });
    return options.EXIT.USAGE_ERROR;
  }

  try {
    const fromDir = path.resolve(process.cwd(), options.getOption(args, "--from") ?? ".qh");
    const artifact = createDriftBudget({
      fromDir,
      version: options.VERSION,
      failedBudget: numberOption(options.getOption(args, "--failed-budget"), 0),
      warningBudget: numberOption(options.getOption(args, "--warning-budget"), 0),
      recurrenceBudget: numberOption(options.getOption(args, "--recurrence-budget"), 0),
      branch: options.getOption(args, "--branch"),
      releaseBranch: args.includes("--release-branch"),
    });
    const targetPath = outputPath(fromDir, options.getOption(args, "--out"));
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
    const exitCode = artifact.status === "exceeded" && artifact.branchPolicy.blockOnExceeded
      ? options.EXIT.READINESS_NOT_CLEAR
      : options.EXIT.OK;
    emitCliSummary(args, {
      schema: "ctg.cli.summary@v1",
      tool: { name: "code-to-gate", version: options.VERSION },
      command: "drift-budget",
      status: artifact.status,
      exit_code: exitCode,
      output: targetPath,
      summary: artifact.summary,
    });
    return exitCode;
  } catch (error) {
    emitCliError(error instanceof Error ? error.message : String(error), {
      code: "DRIFT_BUDGET_FAILED",
      command: "drift-budget",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }
}
