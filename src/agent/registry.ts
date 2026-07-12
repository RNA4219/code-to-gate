import { analyzeCommand } from "../cli/analyze.js";
import { doctorCommand } from "../cli/doctor.js";
import { queryCommand } from "../cli/query.js";
import { readinessCommand } from "../cli/readiness.js";
import { releasePackCommand } from "../cli/release-pack.js";
import { scanCommand } from "../cli/scan.js";
import type { AgentActionDefinition, AgentRuntimeOptions } from "./types.js";

type Command = (args: string[], options: AgentRuntimeOptions) => Promise<number>;

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`input.${key} must be a non-empty string`);
  return value;
}

function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error(`input.${key} must be a non-empty string`);
  return value;
}

function optionalBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`input.${key} must be boolean`);
  return value;
}

function addOption(args: string[], flag: string, value: string | boolean | undefined): void {
  if (value === undefined) return;
  args.push(flag);
  if (typeof value === "string") args.push(value);
}

function command(id: string, description: string, input_schema: string, output_schema: string, _executor: Command, build_args: (input: Record<string, unknown>) => string[], options: Partial<AgentActionDefinition> = {}): AgentActionDefinition {
  return {
    id,
    description,
    input_schema,
    output_schema,
    side_effects: options.side_effects ?? ["writes-artifacts"],
    idempotent: options.idempotent ?? true,
    supports: options.supports ?? { timeout: true, retry: true, resume: false, partial: true },
    default_timeout_ms: options.default_timeout_ms ?? 300_000,
    max_timeout_ms: options.max_timeout_ms ?? 1_800_000,
    required_capabilities: options.required_capabilities ?? [],
    build_args,
  };
}

function executor(id: string): Command { const value = executors.get(id); if (!value) throw new Error(`missing executor: ${id}`); return value; }

const executors = new Map<string, Command>([
  ["scan", scanCommand as unknown as Command],
  ["analyze", analyzeCommand as unknown as Command],
  ["readiness", readinessCommand as unknown as Command],
  ["query", queryCommand as unknown as Command],
  ["doctor", doctorCommand as unknown as Command],
  ["release-pack", releasePackCommand as unknown as Command],
]);

export const AGENT_ACTIONS: AgentActionDefinition[] = [
  command("scan", "Scan repository signals into evidence artifacts", "ctg-agent/scan-input@v1", "ctg-agent/action-result@v1", executor("scan"), (input) => {
    const args = [requiredString(input, "repo")];
    addOption(args, "--out", optionalString(input, "out") ?? ".qh");
    if (optionalBoolean(input, "database_analysis")) args.push("--database-analysis");
    return args;
  }),
  command("analyze", "Analyze a repository and emit evidence artifacts", "ctg-agent/analyze-input@v1", "ctg-agent/action-result@v1", executor("analyze"), (input) => {
    const args = [requiredString(input, "repo")];
    addOption(args, "--out", optionalString(input, "out") ?? ".qh");
    addOption(args, "--emit", optionalString(input, "emit"));
    addOption(args, "--policy", optionalString(input, "policy"));
    addOption(args, "--llm-mode", optionalString(input, "llm_mode"));
    addOption(args, "--llm-provider", optionalString(input, "llm_provider"));
    if (optionalBoolean(input, "require_llm")) args.push("--require-llm");
    if (optionalBoolean(input, "database_analysis")) args.push("--database-analysis");
    return args;
  }),
  command("readiness", "Evaluate release readiness from evidence", "ctg-agent/readiness-input@v1", "ctg-agent/action-result@v1", executor("readiness"), (input) => {
    const args = [requiredString(input, "repo"), "--policy", requiredString(input, "policy")];
    addOption(args, "--from", optionalString(input, "from"));
    addOption(args, "--out", optionalString(input, "out") ?? ".qh");
    addOption(args, "--baseline", optionalString(input, "baseline"));
    addOption(args, "--manual-evidence", optionalString(input, "manual_evidence"));
    return args;
  }),
  command("query", "Query evidence with compact references", "ctg-agent/query-input@v1", "evidence-query@v1", executor("query"), (input) => {
    const args = [requiredString(input, "expression"), "--from", requiredString(input, "from")];
    addOption(args, "--out", optionalString(input, "out"));
    addOption(args, "--redaction-profile", optionalString(input, "redaction_profile"));
    args.push("--quiet");
    return args;
  }, { side_effects: ["writes-query-artifact"], supports: { timeout: true, retry: true, resume: false, partial: false } }),
  command("doctor", "Inspect runtime and optional capability availability", "ctg-agent/doctor-input@v1", "doctor@v1", executor("doctor"), (input) => {
    const args: string[] = [];
    addOption(args, "--out", optionalString(input, "out"));
    addOption(args, "--from", optionalString(input, "from"));
    if (optionalBoolean(input, "require_docker")) args.push("--require-docker");
    args.push("--quiet");
    return args;
  }, { side_effects: ["writes-doctor-artifact"], supports: { timeout: true, retry: true, resume: false, partial: false } }),
  command("release-pack", "Build a release evidence pack", "ctg-agent/release-pack-input@v1", "release-pack@v1", executor("release-pack"), (input) => {
    const args: string[] = [];
    addOption(args, "--from", optionalString(input, "from"));
    addOption(args, "--out", optionalString(input, "out") ?? ".qh");
    addOption(args, "--ci-url", optionalString(input, "ci_url"));
    if (optionalBoolean(input, "include_optional")) args.push("--include-optional");
    if (optionalBoolean(input, "allow_partial")) args.push("--allow-partial");
    args.push("--quiet");
    return args;
  }, { supports: { timeout: true, retry: true, resume: true, partial: true } }),
];

export function getAgentAction(id: string): AgentActionDefinition | undefined {
  return AGENT_ACTIONS.find((action) => action.id === id);
}

export function getAgentCommand(id: string): Command | undefined {
  return executors.get(id);
}

export function validateActionInput(action: AgentActionDefinition, input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be a JSON object");
  const record = input as Record<string, unknown>;
  const allowed: Record<string, string[]> = {
    scan: ["repo", "out", "database_analysis"],
    analyze: ["repo", "out", "emit", "policy", "llm_mode", "llm_provider", "require_llm", "database_analysis"],
    readiness: ["repo", "policy", "from", "out", "baseline", "manual_evidence"],
    query: ["expression", "from", "out", "redaction_profile"],
    doctor: ["out", "from", "require_docker"],
    "release-pack": ["from", "out", "ci_url", "include_optional", "allow_partial"],
  };
  const unknown = Object.keys(record).filter((key) => !allowed[action.id]?.includes(key));
  if (unknown.length > 0) throw new Error(`unknown input field(s): ${unknown.join(", ")}`);
  action.build_args(record);
  return record;
}