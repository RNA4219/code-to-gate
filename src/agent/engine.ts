import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalDigest, sha256 } from "./canonical.js";
import { AGENT_ACTIONS, getAgentAction, validateActionInput } from "./registry.js";
import {
  AGENT_PROTOCOL,
  type AgentActionDefinition,
  type AgentExecutionPolicy,
  type AgentRequest,
  type AgentResponse,
  type AgentRuntimeOptions,
  type AgentStatus,
  type ArtifactReference,
  type NextAction,
  type RunManifest,
} from "./types.js";

const RETRYABLE_CODES = new Set([3, 4, 5, 6, 10]);
const SCHEMA_FILES: Record<string, string> = {
  "ctg-agent-capabilities@v1": "agent/capabilities.schema.json",
  "ctg-agent-request@v1": "agent/request.schema.json",
  "ctg-resume-request@v1": "agent/resume-request.schema.json",
  "ctg-run-manifest@v1": "agent/run-manifest.schema.json",
  "ctg-agent-response@v1": "agent/response.schema.json",
  "ctg-agent-query@v1": "agent/query.schema.json",
  "ctg-diagnostic@v1": "agent/diagnostic.schema.json",
  "ctg-release-manifest@v1": "agent/release-manifest.schema.json",
  "ctg-agent/scan-input@v1": "agent/scan-input.schema.json",
  "ctg-agent/analyze-input@v1": "agent/analyze-input.schema.json",
  "ctg-agent/readiness-input@v1": "agent/readiness-input.schema.json",
  "ctg-agent/query-input@v1": "agent/query-input.schema.json",
  "ctg-agent/doctor-input@v1": "agent/doctor-input.schema.json",
  "ctg-agent/release-pack-input@v1": "agent/release-pack-input.schema.json",
  "ctg-agent/action-result@v1": "agent/action-result.schema.json",
  "ctg-agent-determinism@v1": "agent/determinism.schema.json",
  "evidence-query@v1": "evidence-query.schema.json",
  "doctor@v1": "doctor.schema.json",
  "release-pack@v1": "release-pack.schema.json",
};

function schemaRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../schemas");
}

function schemaPath(file: string): string {
  const candidates = [path.resolve(process.cwd(), "schemas", file), path.resolve(schemaRoot(), file)];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function schemaDigest(file: string): string | undefined {
  const target = schemaPath(file);
  return existsSync(target) ? sha256(readFileSync(target)) : undefined;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function printResponse(response: AgentResponse): void {
  process.stdout.write(`${json(response)}\n`);
}

function symbolFor(code: number, runtime: AgentRuntimeOptions): string {
  const entry = Object.entries(runtime.EXIT).find(([, value]) => value === code);
  return entry?.[0] ?? "UNKNOWN";
}

function retryable(code: number): boolean {
  return RETRYABLE_CODES.has(code) || code === 14 || code === 13;
}

function responseBase(runtime: AgentRuntimeOptions, requestId?: string): Pick<AgentResponse, "schema" | "protocol" | "tool" | "request_id"> {
  return { schema: "ctg-agent-response@v1", protocol: AGENT_PROTOCOL, tool: { name: "code-to-gate", version: runtime.VERSION }, request_id: requestId };
}

function errorResponse(runtime: AgentRuntimeOptions, code: number, reason: string, requestId?: string, status: AgentStatus = "failed"): AgentResponse {
  return {
    ...responseBase(runtime, requestId),
    status,
    exit: { code, symbol: symbolFor(code, runtime), retryable: retryable(code), reason_code: reason },
  };
}

function parseValueOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function readRequest(args: string[]): Record<string, unknown> {
  const file = parseValueOption(args, "--request");
  if (file === undefined) throw new Error("--request is required");
  const text = file === "-" ? readFileSync(0, "utf8") : readFileSync(path.resolve(process.cwd(), file), "utf8");
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("request must be a JSON object");
  return parsed as Record<string, unknown>;
}

function validateRequest(value: Record<string, unknown>): AgentRequest {
  if (value.schema !== "ctg-agent-request@v1" && value.schema !== "ctg-resume-request@v1") throw new Error("request.schema must be ctg-agent-request@v1 or ctg-resume-request@v1");
  const allowed = new Set(["schema", "request_id", "accept", "action", "input", "execution", "resume_from"]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`unknown request field(s): ${unknown.join(", ")}`);
  if (typeof value.request_id !== "string" || !/^[A-Za-z0-9._:-]{1,160}$/.test(value.request_id)) throw new Error("request.request_id must be a stable token");
  if (typeof value.action !== "string" || value.action.length === 0) throw new Error("request.action must be a non-empty string");
  if (!value.input || typeof value.input !== "object" || Array.isArray(value.input)) throw new Error("request.input must be an object");
  return value as unknown as AgentRequest;
}

function negotiate(request: AgentRequest): { protocol: string; schema_majors: Record<string, number> } | null {
  const protocols = request.accept?.protocols ?? [AGENT_PROTOCOL];
  if (!protocols.includes(AGENT_PROTOCOL)) return null;
  const accepted = request.accept?.schema_majors ?? {};
  const availableSchemas = new Set(Object.keys(SCHEMA_FILES));
  for (const [schema, majors] of Object.entries(accepted)) {
    if (!availableSchemas.has(schema) || majors.length === 0 || !majors.includes(1)) return null;
  }
  const availableCapabilities = new Set(["agent.protocol", ...AGENT_ACTIONS.map((action) => action.id), ...AGENT_ACTIONS.flatMap((action) => action.required_capabilities)]);
  if ((request.accept?.required_capabilities ?? []).some((capability) => !availableCapabilities.has(capability))) return null;
  return { protocol: AGENT_PROTOCOL, schema_majors: Object.fromEntries(Object.keys(accepted).map((key) => [key, 1])) };
}
function normalizeExecution(action: AgentActionDefinition, policy: AgentExecutionPolicy | undefined): RunManifest["resolved_execution"] {
  const timeout_ms = Math.min(Math.max(1_000, policy?.timeout_ms ?? action.default_timeout_ms), action.max_timeout_ms);
  const total_timeout_ms = Math.min(Math.max(timeout_ms, policy?.total_timeout_ms ?? timeout_ms), action.max_timeout_ms * 4);
  const max_attempts = Math.min(Math.max(1, policy?.retry?.max_attempts ?? 1), 5);
  const backoff_ms = Math.min(Math.max(0, policy?.retry?.backoff_ms ?? 250), 30_000);
  const max_backoff_ms = Math.min(Math.max(backoff_ms, policy?.retry?.max_backoff_ms ?? 5_000), 60_000);
  return {
    timeout_ms,
    total_timeout_ms,
    retry: { max_attempts, backoff_ms, max_backoff_ms, retry_on: policy?.retry?.retry_on ?? ["SCAN_FAILED", "LLM_FAILED", "POLICY_FAILED", "PLUGIN_FAILED", "INTERNAL_ERROR"] },
    partial: policy?.partial ?? "allow",
  };
}

function runRoot(request: AgentRequest): string {
  const input = request.input;
  const configured = typeof input.out === "string" ? input.out : typeof input.from === "string" ? input.from : ".qh";
  void configured;
  return path.resolve(process.cwd(), ".qh");
}

function writeAtomic(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temp, file);
}

function manifestFile(runRootDir: string, runId: string): string {
  return path.join(runRootDir, "runs", runId, "run-manifest.json");
}

function safeRunId(runId: string): boolean {
  return /^[a-f0-9]{24,64}$/.test(runId);
}

function fileRef(file: string, schema?: string): ArtifactReference {
  const normalized = path.relative(process.cwd(), file).split(path.sep).join("/");
  return { ref: `ctg://file/${normalized}`, sha256: sha256(readFileSync(file)), schema, media_type: "application/json", byte_length: statSync(file).size };
}

function collectArtifacts(root: string): ArtifactReference[] {
  if (!existsSync(root) || !statSync(root).isDirectory()) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => fileRef(path.join(root, entry.name)));
}

function nextActions(action: string, request: AgentRequest, status: AgentStatus): NextAction[] {
  if (status !== "succeeded" && status !== "partial") return [];
  const input = request.input;
  const out = typeof input.out === "string" ? input.out : ".qh";
  const repo = typeof input.repo === "string" ? input.repo : ".";
  const actions: Array<{ action: string; reason: string; input: Record<string, unknown>; expected: string[] }> = [];
  if (action === "scan") actions.push({ action: "analyze", reason: "SCAN_COMPLETE", input: { repo, out }, expected: ["findings@v1", "repo-graph@v1"] });
  else if (action === "analyze") actions.push({ action: "readiness", reason: "ANALYSIS_COMPLETE", input: { repo, policy: typeof input.policy === "string" ? input.policy : ".ctg/policy.yaml", from: out, out }, expected: ["release-readiness@v1"] });
  else if (action === "readiness") actions.push({ action: "release-pack", reason: "READINESS_EVALUATED", input: { from: out, out }, expected: ["release-pack@v1"] });
  else actions.push({ action: "query", reason: "INSPECT_ARTIFACTS", input: { expression: "artifact where schema = findings@v1", from: out, out }, expected: ["evidence-query@v1"] });
  return actions.map((entry, index) => ({
    id: `${request.request_id}:next:${index + 1}`,
    action: entry.action,
    reason_code: entry.reason,
    priority: index + 1,
    required: false,
    preconditions: { status: ["succeeded", "partial"] },
    request: { schema: "ctg-agent-request@v1", request_id: `${request.request_id}:${entry.action}`, action: entry.action, input: entry.input },
    expected_outputs: entry.expected,
  }));
}

interface InvocationResult { code: number; stdout: string; stderr: string; timedOut: boolean; }

function cliEntrypoint(): string {
  const candidates = [
    process.env.CTG_CLI_PATH,
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../cli.js"),
    path.resolve(process.cwd(), "dist", "cli.js"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("CLI entrypoint not found");
  return found;
}

function terminateProcessTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    return new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
      killer.once("close", () => resolve());
      killer.once("error", () => resolve());
    });
  }
  try { process.kill(-pid, "SIGTERM"); } catch { try { process.kill(pid, "SIGTERM"); } catch { /* already exited */ } }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch { /* already exited */ } }
      resolve();
    }, 250);
    timer.unref();
  });
}

async function invoke(action: AgentActionDefinition, request: AgentRequest, runtime: AgentRuntimeOptions, timeoutMs: number): Promise<InvocationResult> {
  const args = action.build_args(request.input);
  const child = spawn(process.execPath, [cliEntrypoint(), action.id, ...args], { cwd: process.cwd(), env: process.env, shell: false, detached: process.platform !== "win32", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer | string) => { stdout += chunk.toString(); });
  child.stderr?.on("data", (chunk: Buffer | string) => { stderr += chunk.toString(); });
  const completion = new Promise<InvocationResult>((resolve) => {
    child.once("error", (error) => resolve({ code: runtime.EXIT.INTERNAL_ERROR, stdout: `${stdout}${error instanceof Error ? error.message : String(error)}`, stderr, timedOut: false }));
    child.once("close", (code) => resolve({ code: code ?? runtime.EXIT.INTERNAL_ERROR, stdout, stderr, timedOut: false }));
  });
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<InvocationResult>((resolve) => {
    timer = setTimeout(async () => {
      if (child.pid) await terminateProcessTree(child.pid);
      const finished = await completion;
      resolve({ ...finished, code: runtime.EXIT.EXECUTION_TIMEOUT, timedOut: true });
    }, timeoutMs);
    timer.unref();
  });
  const result = await Promise.race([completion, timeout]);
  if (timer) clearTimeout(timer);
  return result;
}
function readIndex(root: string): Record<string, { run_id: string; fingerprint: string }> {
  const file = path.join(root, "runs", "index.json");
  if (!existsSync(file)) return {};
  try { return JSON.parse(readFileSync(file, "utf8")) as Record<string, { run_id: string; fingerprint: string }>; } catch { return {}; }
}

function writeAttemptText(runDir: string, attempt: number, name: string, value: string): ArtifactReference | undefined {
  if (!value) return undefined;
  const file = path.join(runDir, `attempt-${attempt}.${name}.log`);
  writeFileSync(file, value, "utf8");
  return fileRef(file);
}

async function runRequest(request: AgentRequest, runtime: AgentRuntimeOptions, parentRunId?: string): Promise<{ response: AgentResponse; code: number }> {
  const action = getAgentAction(request.action);
  if (!action) {
    const response = errorResponse(runtime, runtime.EXIT.USAGE_ERROR, "UNKNOWN_ACTION", request.request_id);
    return { response, code: response.exit.code };
  }
  const negotiated = negotiate(request);
  if (!negotiated) {
    const response = errorResponse(runtime, runtime.EXIT.PROTOCOL_UNSUPPORTED, "PROTOCOL_UNSUPPORTED", request.request_id);
    return { response, code: response.exit.code };
  }
  let input: Record<string, unknown>;
  try { input = validateActionInput(action, request.input); } catch (error) {
    const response = errorResponse(runtime, runtime.EXIT.SCHEMA_FAILED, "INVALID_ACTION_INPUT", request.request_id);
    response.summary = { message: error instanceof Error ? error.message : String(error) };
    return { response, code: response.exit.code };
  }
  const effectiveRequest = { ...request, input };
  const inputDigest = canonicalDigest({ action: request.action, input });
  if (parentRunId) {
    const parent = findManifest(parentRunId);
    if (!action.supports.resume || !parent || parent.manifest.action !== action.id || parent.manifest.input_digest !== inputDigest) {
      const response = errorResponse(runtime, runtime.EXIT.RESUME_CONFLICT, "RESUME_CHECKPOINT_MISMATCH", request.request_id);
      return { response, code: response.exit.code };
    }
  }
  const fingerprint = canonicalDigest({ protocol: AGENT_PROTOCOL, tool: runtime.VERSION, request_id: request.request_id, action: request.action, input, execution: request.execution, parent_run_id: parentRunId });
  const root = runRoot(effectiveRequest);
  const artifactRoot = path.resolve(process.cwd(), typeof input.out === "string" ? input.out : typeof input.from === "string" ? input.from : ".qh");
  const index = readIndex(root);
  const existing = index[request.request_id];
  if (existing && existing.fingerprint !== fingerprint) {
    const response = errorResponse(runtime, runtime.EXIT.RESUME_CONFLICT, "REQUEST_FINGERPRINT_CHANGED", request.request_id);
    return { response, code: response.exit.code };
  }
  if (existing && existing.fingerprint === fingerprint) {
    const existingManifestPath = manifestFile(root, existing.run_id);
    if (existsSync(existingManifestPath)) {
      const manifest = JSON.parse(readFileSync(existingManifestPath, "utf8")) as RunManifest;
      if (["succeeded", "partial", "failed", "timed_out", "cancelled"].includes(manifest.status)) {
        const response: AgentResponse = { ...responseBase(runtime, request.request_id), status: "reused", exit: { code: manifest.status === "succeeded" ? 0 : manifest.status === "partial" ? runtime.EXIT.PARTIAL_SUCCESS : manifest.final_exit_code ?? manifest.attempts.at(-1)?.exit_code ?? runtime.EXIT.INTERNAL_ERROR, symbol: symbolFor(manifest.final_exit_code ?? manifest.attempts.at(-1)?.exit_code ?? 0, runtime), retryable: false, reason_code: "IDEMPOTENT_REUSE" }, run: { run_id: manifest.run_id, manifest_ref: existingManifestPath, delivery: "reused" }, summary: manifest.summary, next_actions: manifest.next_actions };
        return { response, code: response.exit.code };
      }
    }
  }
  const runId = canonicalDigest({ fingerprint, parent_run_id: parentRunId }).slice(0, 32);
  const runDir = path.join(root, "runs", runId);
  const lock = path.join(runDir, ".lock");
  mkdirSync(runDir, { recursive: true });
  try { mkdirSync(lock); } catch {
    const response = errorResponse(runtime, runtime.EXIT.RUN_BUSY, "RUN_BUSY", request.request_id, "running");
    return { response, code: response.exit.code };
  }
  const execution = normalizeExecution(action, request.execution);
  const startedAt = new Date().toISOString();
  const manifest: RunManifest = { schema: "ctg-run-manifest@v1", protocol: AGENT_PROTOCOL, tool: { name: "code-to-gate", version: runtime.VERSION }, run_id: runId, request_id: request.request_id, fingerprint, input_digest: inputDigest, action: action.id, status: "running", created_at: startedAt, updated_at: startedAt, parent_run_id: parentRunId, negotiated, resolved_execution: execution, attempts: [], completeness: "complete", summary: {}, artifacts: [], next_actions: [] };
  index[request.request_id] = { run_id: runId, fingerprint };
  writeAtomic(path.join(root, "runs", "index.json"), index);
  writeAtomic(manifestFile(root, runId), manifest);
  let finalCode = runtime.EXIT.INTERNAL_ERROR;
  let reason = "INTERNAL_ERROR";
  const overallStart = Date.now();
  try {
    for (let attempt = 1; attempt <= execution.retry.max_attempts; attempt += 1) {
      const attemptStart = new Date().toISOString();
      const result = await invoke(action, effectiveRequest, runtime, Math.min(execution.timeout_ms, Math.max(1, execution.total_timeout_ms - (Date.now() - overallStart))));
      const attemptRecord = { attempt, status: result.timedOut ? "timed_out" as AgentStatus : result.code === 0 ? "succeeded" as AgentStatus : result.code === runtime.EXIT.PARTIAL_SUCCESS ? "partial" as AgentStatus : "failed" as AgentStatus, started_at: attemptStart, finished_at: new Date().toISOString(), exit_code: result.code, reason_code: result.timedOut ? "EXECUTION_TIMEOUT" : result.code === 0 ? "OK" : symbolFor(result.code, runtime), stdout_ref: writeAttemptText(runDir, attempt, "stdout", result.stdout), stderr_ref: writeAttemptText(runDir, attempt, "stderr", result.stderr) };
      manifest.attempts.push(attemptRecord);
      finalCode = result.code;
      reason = result.timedOut ? "EXECUTION_TIMEOUT" : result.code === 0 ? "OK" : symbolFor(result.code, runtime);
      writeAtomic(manifestFile(root, runId), manifest);
      if (result.code === 0 || result.code === runtime.EXIT.PARTIAL_SUCCESS) break;
      if (!retryable(result.code) || attempt >= execution.retry.max_attempts || Date.now() - overallStart >= execution.total_timeout_ms) break;
      const delay = Math.min(execution.retry.max_backoff_ms, execution.retry.backoff_ms * 2 ** (attempt - 1));
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    }
    if (finalCode === runtime.EXIT.EXECUTION_TIMEOUT && manifest.attempts.length > 1) { finalCode = runtime.EXIT.RETRY_EXHAUSTED; manifest.status = "failed"; reason = "RETRY_EXHAUSTED"; }
    else if (finalCode === runtime.EXIT.EXECUTION_TIMEOUT) { manifest.status = "timed_out"; reason = "EXECUTION_TIMEOUT"; }
    else if (finalCode === 0) manifest.status = "succeeded";
    else if (finalCode === runtime.EXIT.PARTIAL_SUCCESS) { manifest.status = "partial"; manifest.completeness = "partial"; }
    else if (manifest.attempts.length > 1 && RETRYABLE_CODES.has(finalCode)) { finalCode = runtime.EXIT.RETRY_EXHAUSTED; reason = "RETRY_EXHAUSTED"; manifest.status = "failed"; }
    else manifest.status = "failed";
    manifest.final_exit_code = finalCode;
    manifest.reason_code = reason;
    manifest.artifacts = collectArtifacts(artifactRoot);
    manifest.summary = { action: action.id, status: manifest.status, attempts: manifest.attempts.length, artifact_count: manifest.artifacts.length, fingerprint };
    manifest.next_actions = nextActions(action.id, effectiveRequest, manifest.status);
    manifest.updated_at = new Date().toISOString();
    manifest.deterministic_digest = canonicalDigest({ schema: manifest.schema, protocol: manifest.protocol, tool: manifest.tool, run_id: manifest.run_id, request_id: manifest.request_id, fingerprint: manifest.fingerprint, input_digest: manifest.input_digest, action: manifest.action, status: manifest.status, completeness: manifest.completeness, final_exit_code: manifest.final_exit_code, reason_code: manifest.reason_code, summary: manifest.summary, artifacts: manifest.artifacts, next_actions: manifest.next_actions });
    writeAtomic(manifestFile(root, runId), manifest);
  } catch (error) {
    manifest.status = "failed";
    manifest.updated_at = new Date().toISOString();
    manifest.summary = { message: error instanceof Error ? error.message : String(error) };
    manifest.attempts.push({ attempt: manifest.attempts.length + 1, status: "failed", started_at: manifest.updated_at, finished_at: manifest.updated_at, exit_code: runtime.EXIT.INTERNAL_ERROR, reason_code: "INTERNAL_ERROR" });
    writeAtomic(manifestFile(root, runId), manifest);
    finalCode = runtime.EXIT.INTERNAL_ERROR;
    reason = "INTERNAL_ERROR";
    manifest.final_exit_code = finalCode;
    manifest.reason_code = reason;
  } finally {
    if (existsSync(lock)) rmSync(lock, { recursive: true, force: true });
  }
  const response: AgentResponse = { ...responseBase(runtime, request.request_id), status: manifest.status, exit: { code: finalCode, symbol: symbolFor(finalCode, runtime), retryable: retryable(finalCode), reason_code: reason }, run: { run_id: runId, manifest_ref: manifestFile(root, runId), delivery: "created" }, summary: manifest.summary, next_actions: manifest.next_actions };
  return { response, code: finalCode };
}

function capabilityData(profile: string, runtime: AgentRuntimeOptions): Record<string, unknown> {
  const schemas = Object.entries(SCHEMA_FILES).map(([id, file]) => {
    const digest = schemaDigest(file);
    const entry: Record<string, unknown> = { id, version: 1, digest_sha256: digest, ref: `schemas/${file}` };
    if (profile === "full" && digest) entry.schema = JSON.parse(readFileSync(schemaPath(file), "utf8"));
    return entry;
  });
  return { schema: "ctg-agent-capabilities@v1", protocol: AGENT_PROTOCOL, protocols: [AGENT_PROTOCOL], tool: { name: "code-to-gate", version: runtime.VERSION }, operations: AGENT_ACTIONS.map((action) => ({ id: action.id, description: action.description, input_schema: action.input_schema, output_schema: action.output_schema, side_effects: action.side_effects, idempotent: action.idempotent, supports: action.supports, limits: { default_timeout_ms: action.default_timeout_ms, max_timeout_ms: action.max_timeout_ms }, required_capabilities: action.required_capabilities, available: true })), schemas };
}

function findManifest(run: string): { manifest: RunManifest; file: string } | null {
  const root = path.resolve(process.cwd(), ".qh");
  let runId = run;
  if (!safeRunId(run)) {
    const index = readIndex(root);
    runId = index[run]?.run_id ?? "";
  }
  if (!safeRunId(runId)) return null;
  const file = manifestFile(root, runId);
  return existsSync(file) ? { manifest: JSON.parse(readFileSync(file, "utf8")) as RunManifest, file } : null;
}

async function handleStatus(args: string[], runtime: AgentRuntimeOptions): Promise<number> {
  const run = parseValueOption(args, "--run");
  if (!run) { const response = errorResponse(runtime, runtime.EXIT.USAGE_ERROR, "RUN_REQUIRED"); printResponse(response); return response.exit.code; }
  const found = findManifest(run);
  if (!found) { const response = errorResponse(runtime, runtime.EXIT.SCHEMA_FAILED, "RUN_NOT_FOUND"); printResponse(response); return response.exit.code; }
  const finalCode = found.manifest.final_exit_code ?? found.manifest.attempts.at(-1)?.exit_code ?? 0;
  const response: AgentResponse = { ...responseBase(runtime), status: found.manifest.status, exit: { code: finalCode, symbol: symbolFor(finalCode, runtime), retryable: retryable(finalCode), reason_code: found.manifest.reason_code }, run: { run_id: found.manifest.run_id, manifest_ref: found.file }, summary: found.manifest.summary, next_actions: found.manifest.next_actions };
  printResponse(response); return response.exit.code;
}

async function handleQuery(args: string[], runtime: AgentRuntimeOptions): Promise<number> {
  let value: Record<string, unknown>;
  try { value = readRequest(args); } catch (error) { const response = errorResponse(runtime, runtime.EXIT.USAGE_ERROR, "INVALID_QUERY_REQUEST"); response.summary = { message: error instanceof Error ? error.message : String(error) }; printResponse(response); return response.exit.code; }
  const allowed = new Set(["schema", "request_id", "run_id", "run", "view", "limit", "max_bytes"]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) { const response = errorResponse(runtime, runtime.EXIT.SCHEMA_FAILED, "INVALID_QUERY_FIELD", typeof value.request_id === "string" ? value.request_id : undefined); printResponse(response); return response.exit.code; }
  if (value.schema !== "ctg-agent-query@v1") { const response = errorResponse(runtime, runtime.EXIT.USAGE_ERROR, "INVALID_QUERY_SCHEMA", typeof value.request_id === "string" ? value.request_id : undefined); printResponse(response); return response.exit.code; }
  const runId = typeof value.run_id === "string" ? value.run_id : typeof value.run === "string" ? value.run : undefined;
  const found = runId ? findManifest(runId) : null;
  if (!found) { const response = errorResponse(runtime, runtime.EXIT.SCHEMA_FAILED, "RUN_NOT_FOUND", typeof value.request_id === "string" ? value.request_id : undefined); printResponse(response); return response.exit.code; }
  const view = typeof value.view === "string" ? value.view : "summary";
  const limit = Math.min(Math.max(typeof value.limit === "number" ? value.limit : 20, 1), 100);
  const manifest = found.manifest;
  let data: unknown = manifest.summary;
  if (view === "actions") data = manifest.next_actions.slice(0, limit);
  else if (view === "artifacts" || view === "evidence") data = manifest.artifacts.slice(0, limit);
  else if (view === "diagnostics") data = manifest.attempts.map((attempt) => ({ attempt: attempt.attempt, status: attempt.status, exit_code: attempt.exit_code, reason_code: attempt.reason_code, stderr_ref: attempt.stderr_ref }));
  let truncated = false;
  const maxBytes = typeof value.max_bytes === "number" ? Math.max(256, Math.min(value.max_bytes, 1_000_000)) : undefined;
  if (maxBytes && Array.isArray(data)) { let list = data as unknown[]; while (list.length > 0 && JSON.stringify(list).length > maxBytes) { list = list.slice(0, -1); truncated = true; } data = list; }
  const finalCode = manifest.final_exit_code ?? manifest.attempts.at(-1)?.exit_code ?? 0;
  const response: AgentResponse = { ...responseBase(runtime, typeof value.request_id === "string" ? value.request_id : undefined), status: manifest.status, exit: { code: manifest.status === "partial" ? runtime.EXIT.PARTIAL_SUCCESS : finalCode, symbol: symbolFor(finalCode, runtime), retryable: retryable(finalCode), reason_code: manifest.reason_code }, run: { run_id: manifest.run_id, manifest_ref: found.file }, data, summary: { view, count: Array.isArray(data) ? data.length : 1, truncated, deterministic_digest: manifest.deterministic_digest } };
  printResponse(response); return response.exit.code;
}

export async function agentCommand(args: string[], runtime: AgentRuntimeOptions): Promise<number> {
  const subcommand = args[0];
  try {
    if (subcommand === "capabilities") {
      const profile = parseValueOption(args, "--profile") ?? "compact";
      if (profile !== "compact" && profile !== "full") throw new Error("--profile must be compact or full");
      const response: AgentResponse = { ...responseBase(runtime), status: "succeeded", exit: { code: 0, symbol: "OK", retryable: false }, data: capabilityData(profile, runtime) };
      printResponse(response); return 0;
    }
    if (subcommand === "status") return await handleStatus(args.slice(1), runtime);
    if (subcommand === "query") return await handleQuery(args.slice(1), runtime);
    if (subcommand === "run" || subcommand === "resume") {
      const raw = readRequest(args.slice(1));
      if (subcommand === "resume") raw.schema = "ctg-resume-request@v1";
      const request = validateRequest(raw);
      if (subcommand === "resume" && !request.resume_from) throw new Error("resume request requires resume_from");
      const result = await runRequest(request, runtime, request.resume_from);
      printResponse(result.response); return result.code;
    }
    const response = errorResponse(runtime, runtime.EXIT.USAGE_ERROR, "UNKNOWN_AGENT_COMMAND");
    printResponse(response); return response.exit.code;
  } catch (error) {
    const response = errorResponse(runtime, runtime.EXIT.USAGE_ERROR, "INVALID_AGENT_REQUEST");
    response.summary = { message: error instanceof Error ? error.message : String(error) };
    printResponse(response); return response.exit.code;
  }
}
