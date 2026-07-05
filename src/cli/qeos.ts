import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { QeosAcceptanceMatrixArtifact, QeosAcceptanceMatrixEntry } from "../types/artifacts.js";
import type { EXIT, getOption } from "./exit-codes.js";
import { emitCliError, emitCliSummary } from "./output.js";

export interface QeosCliOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

const VALUE_OPTIONS = new Set(["--from", "--out"]);
const FLAG_OPTIONS = new Set(["--quiet"]);

function printQeosHelp(): void {
  console.log(`code-to-gate qeos <command>

Commands:
  matrix --from <repo-or-artifact-dir> [--out <file-or-dir>] [--quiet]

Examples:
  code-to-gate qeos matrix --from . --out .qh`);
}

function validateOptions(args: string[]): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (VALUE_OPTIONS.has(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) return `${arg} requires a value`;
      index += 1;
      continue;
    }
    if (FLAG_OPTIONS.has(arg) || arg === "--help" || arg === "-h") continue;
    if (arg.startsWith("--")) return `unknown qeos option: ${arg}`;
    return `unexpected qeos argument: ${arg}`;
  }
  return null;
}

function outputPath(root: string, out: string | undefined): string {
  if (!out) return path.join(root, ".qh", "qeos-acceptance-matrix.json");
  const absolute = path.resolve(process.cwd(), out);
  return absolute.endsWith(".json") ? absolute : path.join(absolute, "qeos-acceptance-matrix.json");
}

function readText(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function extractRequirements(requirementsText: string): QeosAcceptanceMatrixEntry[] {
  return requirementsText
    .split(/\r?\n/)
    .map((line) => line.match(/^\|\s*(QEOS-\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({
      qeosId: match[1],
      title: match[2].trim(),
      priority: match[3].trim(),
      requirement: match[4].trim(),
      specAcceptance: [],
      schemas: [],
      cli: [],
      testCommands: [],
      ciGates: [],
      status: "needs_evidence",
      evidenceLinks: ["docs/quality-evidence-os-requirements.md"],
    }));
}

function applyTaskSeeds(entries: QeosAcceptanceMatrixEntry[], orchestrationText: string): void {
  const sections = orchestrationText
    .split(/^## Task Seed /m)
    .slice(1);
  for (const section of sections) {
    const idMatch = section.match(/\b(QEOS-[A-Z0-9-]+)\b/);
    const objectiveMatch = section.match(/Objective:\s*(.+)/);
    const statusMatch = section.match(/Status:\s*(\w+)/);
    const commandsBlock = section.match(/Commands:\s*\n([\s\S]*?)(?=\n## Task Seed |\s*$)/);
    const requirementsBlock = section.match(/Requirements:\s*\n([\s\S]*?)(?=\nCommands:|\s*$)/);
    const qid = mapTaskSeedId(idMatch?.[1]);
    if (!qid) continue;
    const entry = entries.find((candidate) => candidate.qeosId === qid);
    if (!entry) continue;
    if (objectiveMatch && entry.specAcceptance.length === 0) {
      entry.specAcceptance.push(objectiveMatch[1].trim());
    }
    if (requirementsBlock) {
      for (const line of requirementsBlock[1].split(/\r?\n/)) {
        const item = line.match(/^-\s+(.+)/);
        if (item) entry.specAcceptance.push(item[1].trim());
      }
    }
    if (commandsBlock) {
      for (const line of commandsBlock[1].split(/\r?\n/)) {
        const command = line.match(/^-\s+`?([^`]+?)`?\s*$/);
        if (command) entry.testCommands.push(command[1].trim());
      }
    }
    const status = statusMatch?.[1] ?? "planned";
    entry.status = status === "done" ? "done" : status === "in_progress" ? "in_progress" : "planned";
    entry.evidenceLinks.push("orchestration/quality-evidence-os-implementation.md");
  }
}

function mapTaskSeedId(seedId: string | undefined): string | null {
  if (!seedId) return null;
  const mapping: Record<string, string> = {
    "QEOS-P2-11": "QEOS-031",
    "QEOS-P1-12": "QEOS-032",
    "QEOS-P1-13": "QEOS-033",
    "QEOS-P2-14": "QEOS-034",
    "QEOS-P1-15": "QEOS-035",
    "QEOS-P1-16": "QEOS-036",
    "QEOS-P2-17": "QEOS-037",
    "QEOS-P2-18": "QEOS-038",
    "QEOS-P1-19": "QEOS-039",
    "QEOS-P2-20": "QEOS-040",
    "QEOS-P1-21": "QEOS-041",
    "QEOS-P0-22": "QEOS-042",
  };
  return mapping[seedId] ?? null;
}

function inferSurfaces(entries: QeosAcceptanceMatrixEntry[], repoRoot: string): void {
  const schemaDir = path.join(repoRoot, "schemas");
  const cliText = readText(path.join(repoRoot, "src", "cli.ts"));
  for (const entry of entries) {
    const schemaCandidates = schemaCandidatesFor(entry.qeosId, entry.title);
    entry.schemas = schemaCandidates
      .filter((candidate, index, all) => all.indexOf(candidate) === index)
      .filter((candidate) => existsSync(path.join(schemaDir, candidate)));
    const cliCandidates = cliCandidatesFor(entry.qeosId);
    entry.cli = cliCandidates.filter((candidate) => cliText.includes(`command === "${candidate}"`) || cliText.includes(`command === '${candidate}'`));
    if (entry.status === "done" && (entry.schemas.length === 0 || entry.testCommands.length === 0)) {
      entry.status = "needs_evidence";
    }
    entry.ciGates = entry.testCommands.filter((command) => command.includes("quality:spec-drift") || command.includes("vitest"));
  }
}

function cliCandidatesFor(qeosId: string): string[] {
  const explicit: Record<string, string[]> = {
    "QEOS-031": ["query"],
    "QEOS-032": ["query", "viewer", "pr-review", "release-pack"],
    "QEOS-033": ["explain-gate"],
    "QEOS-034": ["rule", "plugin-marketplace"],
    "QEOS-035": ["drift-budget", "pr-review"],
    "QEOS-036": ["export"],
    "QEOS-037": ["review-queue"],
    "QEOS-038": ["pack"],
    "QEOS-039": ["baseline-ledger", "readiness", "review-queue"],
    "QEOS-041": ["pr-review-publish"],
    "QEOS-042": ["qeos"],
  };
  return explicit[qeosId] ?? [];
}

function schemaCandidatesFor(qeosId: string, title: string): string[] {
  const explicit: Record<string, string[]> = {
    "QEOS-031": ["evidence-query.schema.json"],
    "QEOS-032": ["redaction-profile.schema.json"],
    "QEOS-033": ["gate-explainability.schema.json"],
    "QEOS-034": ["rule-quality-score.schema.json", "plugin-marketplace.schema.json"],
    "QEOS-035": ["drift-budget.schema.json", "pr-review.schema.json"],
    "QEOS-036": ["evidence-provenance-index.schema.json"],
    "QEOS-037": ["review-queue.schema.json"],
    "QEOS-038": ["quality-pack-golden-suite.schema.json", "quality-pack.schema.json"],
    "QEOS-039": ["baseline-debt-ledger.schema.json", "release-readiness.schema.json", "review-queue.schema.json"],
    "QEOS-041": ["github-app-health.schema.json"],
    "QEOS-042": ["qeos-acceptance-matrix.schema.json"],
  };
  if (explicit[qeosId]) return explicit[qeosId];
  const slug = title.toLowerCase().replace(/`/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [`${slug}.schema.json`, slug.replace(/^qeos-/, "") + ".schema.json"];
}

export async function qeosCommand(args: string[], options: QeosCliOptions): Promise<number> {
  const [command, ...rest] = args;
  if (!command || command === "--help" || command === "-h") {
    printQeosHelp();
    return options.EXIT.OK;
  }
  if (command !== "matrix") {
    emitCliError(`unknown qeos command: ${command}`, { code: "USAGE_ERROR", command: "qeos", exitCode: options.EXIT.USAGE_ERROR });
    return options.EXIT.USAGE_ERROR;
  }
  const argError = validateOptions(rest);
  if (argError) {
    emitCliError(argError, { code: "USAGE_ERROR", command: "qeos matrix", exitCode: options.EXIT.USAGE_ERROR });
    return options.EXIT.USAGE_ERROR;
  }
  try {
    const repoRoot = path.resolve(process.cwd(), options.getOption(rest, "--from") ?? ".");
    const requirementsText = readText(path.join(repoRoot, "docs", "quality-evidence-os-requirements.md"));
    const orchestrationText = readText(path.join(repoRoot, "orchestration", "quality-evidence-os-implementation.md"));
    if (!requirementsText || !orchestrationText) {
      throw new Error("qeos matrix requires docs/quality-evidence-os-requirements.md and orchestration/quality-evidence-os-implementation.md");
    }
    const entries = extractRequirements(requirementsText).filter((entry) => Number(entry.qeosId.slice(5)) >= 31);
    applyTaskSeeds(entries, orchestrationText);
    inferSurfaces(entries, repoRoot);
    const generatedAt = new Date().toISOString();
    const artifact: QeosAcceptanceMatrixArtifact = {
      version: "ctg/v1",
      generated_at: generatedAt,
      run_id: `qeos-acceptance-matrix-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
      repo: { root: repoRoot },
      tool: { name: "code-to-gate", version: options.VERSION, plugin_versions: [] },
      artifact: "qeos-acceptance-matrix",
      schema: "qeos-acceptance-matrix@v1",
      completeness: entries.some((entry) => entry.status === "needs_evidence") ? "partial" : "complete",
      entries,
      summary: {
        total: entries.length,
        done: entries.filter((entry) => entry.status === "done").length,
        planned: entries.filter((entry) => entry.status === "planned").length,
        inProgress: entries.filter((entry) => entry.status === "in_progress").length,
        needsEvidence: entries.filter((entry) => entry.status === "needs_evidence").length,
      },
      generated_by: "ctg-qeos-acceptance-matrix-v1",
    };
    const targetPath = outputPath(repoRoot, options.getOption(rest, "--out"));
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    emitCliSummary(rest, {
      schema: "ctg.cli.summary@v1",
      tool: { name: "code-to-gate", version: options.VERSION },
      command: "qeos matrix",
      status: "ok",
      exit_code: options.EXIT.OK,
      output: targetPath,
      summary: artifact.summary,
    });
    return options.EXIT.OK;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitCliError(message, { code: "QEOS_MATRIX_FAILED", command: "qeos matrix", exitCode: options.EXIT.USAGE_ERROR });
    return options.EXIT.USAGE_ERROR;
  }
}
