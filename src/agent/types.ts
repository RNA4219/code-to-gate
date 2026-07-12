import type { ExitCodes } from "../cli/exit-codes.js";

export const AGENT_PROTOCOL = "ctg-agent/1.0" as const;

export type AgentStatus =
  | "accepted"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "timed_out"
  | "cancelled";

export interface AgentExecutionPolicy {
  timeout_ms?: number;
  total_timeout_ms?: number;
  retry?: {
    max_attempts?: number;
    backoff_ms?: number;
    max_backoff_ms?: number;
    retry_on?: string[];
  };
  partial?: "allow" | "reject";
}

export interface AgentRequest {
  schema: "ctg-agent-request@v1" | "ctg-resume-request@v1";
  request_id: string;
  accept?: {
    protocols?: string[];
    schema_majors?: Record<string, number[]>;
    required_capabilities?: string[];
  };
  action: string;
  input: Record<string, unknown>;
  execution?: AgentExecutionPolicy;
  resume_from?: string;
}

export interface ArtifactReference {
  ref: string;
  sha256?: string;
  schema?: string;
  media_type?: string;
  byte_length?: number;
}

export interface NextAction {
  id: string;
  action: string;
  reason_code: string;
  priority: number;
  required: boolean;
  preconditions: Record<string, unknown>;
  request: {
    schema: "ctg-agent-request@v1";
    request_id: string;
    action: string;
    input: Record<string, unknown>;
  };
  expected_outputs: string[];
}

export interface AgentAttempt {
  attempt: number;
  status: AgentStatus;
  started_at: string;
  finished_at?: string;
  exit_code?: number;
  reason_code?: string;
  stdout_ref?: ArtifactReference;
  stderr_ref?: ArtifactReference;
}

export interface RunManifest {
  schema: "ctg-run-manifest@v1";
  protocol: string;
  tool: { name: "code-to-gate"; version: string };
  run_id: string;
  request_id: string;
  fingerprint: string;
  input_digest?: string;
  action: string;
  status: AgentStatus;
  created_at: string;
  updated_at: string;
  parent_run_id?: string;
  negotiated: { protocol: string; schema_majors: Record<string, number> };
  resolved_execution: Required<Pick<AgentExecutionPolicy, "timeout_ms" | "total_timeout_ms">> & {
    retry: Required<NonNullable<AgentExecutionPolicy["retry"]>>;
    partial: "allow" | "reject";
  };
  attempts: AgentAttempt[];
  completeness: "complete" | "partial";
  summary: Record<string, unknown>;
  artifacts: ArtifactReference[];
  next_actions: NextAction[];
  deterministic_digest?: string;
  final_exit_code?: number;
  reason_code?: string;
}

export interface AgentResponse {
  schema: "ctg-agent-response@v1";
  protocol: string;
  tool: { name: "code-to-gate"; version: string };
  request_id?: string;
  status: AgentStatus | "reused";
  exit: { code: number; symbol: string; retryable: boolean; reason_code?: string };
  run?: { run_id: string; manifest_ref: string; delivery?: "created" | "reused" };
  data?: unknown;
  summary?: Record<string, unknown>;
  next_actions?: NextAction[];
}

export interface AgentActionDefinition {
  id: string;
  description: string;
  input_schema: string;
  output_schema: string;
  side_effects: string[];
  idempotent: boolean;
  supports: { timeout: boolean; retry: boolean; resume: boolean; partial: boolean };
  default_timeout_ms: number;
  max_timeout_ms: number;
  required_capabilities: string[];
  build_args(input: Record<string, unknown>): string[];
}

export interface AgentRuntimeOptions {
  VERSION: string;
  EXIT: typeof import("../cli/exit-codes.js").EXIT;
  getOption: typeof import("../cli/exit-codes.js").getOption;
}

export type AgentExitSymbol = keyof typeof import("../cli/exit-codes.js").EXIT;
export type AgentExitCodes = ExitCodes;