/**
 * Analyze command - generates findings, risk-register, analysis-report, and audit
 */

import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { sha256 } from "../core/path-utils.js";
import { ensureDir } from "../core/file-utils.js";
import { buildGraph } from "../core/repo-graph-builder.js";
import { EXIT, getOption, VERSION } from "./exit-codes.js";

import {
  EmitFormat,
  CTG_VERSION,
} from "../types/artifacts.js";
import {
  CtgPolicy,
  loadPolicyFile,
  SuppressionEntry,
} from "../config/policy-loader.js";
import { loadSuppressions, DEFAULT_SUPPRESSION_FILE } from "../suppression/suppression-loader.js";
import {
  evaluatePolicy,
  generateBlockingSummary,
  getExitCode,
  type ReadinessStatus,
} from "../config/policy-evaluator.js";

import {
  buildFindingsFromGraph,
  writeFindingsJson,
} from "../reporters/json-reporter.js";
import {
  buildRiskRegisterFromFindings,
  writeRiskRegisterYaml,
} from "../reporters/yaml-reporter.js";
import {
  writeAnalysisReportMd,
} from "../reporters/markdown-reporter.js";
import {
  buildAuditArtifact,
  writeAuditJson,
} from "../reporters/audit-writer.js";
import { applyLlmEnrichment } from "../reporters/llm-enrichment.js";
import { LlmProviderType, LlmConfig, LlmAnalysisRequest } from "../llm/types.js";
import { createProvider, createProviderWithFallback } from "../llm/providers/index.js";

interface AnalyzeOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

// Constants
const VALID_LLM_PROVIDERS: LlmProviderType[] = ["ollama", "llamacpp", "deterministic"];
const VALID_LLM_MODES = ["local-only", "allow-cloud"];

function parseEmitOption(value: string | undefined): EmitFormat[] {
  if (!value || value === "all") {
    return ["json", "yaml", "md", "mermaid"];
  }
  const formats = value.split(",").map((f) => f.trim() as EmitFormat);
  return formats.filter((f) => ["json", "yaml", "md", "mermaid", "all"].includes(f));
}

/**
 * Determine audit status from evaluation result
 */
function mapStatusToAuditStatus(status: ReadinessStatus): string {
  switch (status) {
    case "passed":
      return "passed";
    case "passed_with_risk":
      return "passed_with_risk";
    case "needs_review":
      return "needs_review";
    case "blocked_input":
      return "blocked_input";
    default:
      return "unknown";
  }
}

export async function analyzeCommand(args: string[], options: AnalyzeOptions): Promise<number> {
  const repoArg = args[0];
  const outDir = options.getOption(args, "--out") ?? ".qh";
  const emitValue = options.getOption(args, "--emit");
  const policyPath = options.getOption(args, "--policy");
  const suppressPath = options.getOption(args, "--suppress");
  const llmProvider = options.getOption(args, "--llm-provider");
  const llmMode = options.getOption(args, "--llm-mode") ?? "local-only";
  const llmModel = options.getOption(args, "--llm-model");
  const llmPort = options.getOption(args, "--llm-port");
  const requireLlm = args.includes("--require-llm");

  // Validate LLM options
  if (llmProvider && !VALID_LLM_PROVIDERS.includes(llmProvider as LlmProviderType)) {
    console.error(`Invalid LLM provider: ${llmProvider}`);
    console.error(`Valid providers: ${VALID_LLM_PROVIDERS.join(", ")}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!VALID_LLM_MODES.includes(llmMode)) {
    console.error(`Invalid LLM mode: ${llmMode}`);
    console.error(`Valid modes: ${VALID_LLM_MODES.join(", ")}`);
    return options.EXIT.USAGE_ERROR;
  }

  // Validate repo argument
  if (!repoArg) {
    console.error("usage: code-to-gate analyze <repo> [--emit all] --out <dir> [--policy <file>] [--llm-provider <provider>]");
    return options.EXIT.USAGE_ERROR;
  }

  const cwd = process.cwd();
  const repoRoot = path.resolve(cwd, repoArg);

  if (!existsSync(repoRoot)) {
    console.error(`repo does not exist: ${repoArg}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!statSync(repoRoot).isDirectory()) {
    console.error(`repo is not a directory: ${repoArg}`);
    return options.EXIT.USAGE_ERROR;
  }

  const emitFormats = parseEmitOption(emitValue);
  const absoluteOutDir = path.resolve(cwd, outDir);

  try {
    // Build repo graph
    const graph = buildGraph(repoRoot, VERSION);

    if (graph.files.length === 0) {
      console.error(`repo contains no target files: ${repoArg}`);
      return options.EXIT.SCAN_FAILED;
    }

    // Load policy if specified
    let policy: CtgPolicy | undefined;
    if (policyPath) {
      const loaded = loadPolicyFile(policyPath, cwd);
      if (loaded.errors.length > 0) {
        for (const error of loaded.errors) {
          console.error(`Policy error: ${error}`);
        }
        // Return POLICY_FAILED if policy is missing or has no valid policyId
        if (!loaded.policy.policyId || loaded.errors.some(e => e.includes("not found"))) {
          return options.EXIT.POLICY_FAILED;
        }
        // Otherwise continue with graceful partial (policy loaded with warnings)
      }
      policy = loaded.policy;
    }

    // Load suppressions if specified
    let suppressions: SuppressionEntry[] = [];
    const suppressionFile = loadSuppressions(suppressPath, repoRoot);
    if (suppressionFile) {
      // Convert from Suppression (rule_id) to SuppressionEntry (ruleId)
      suppressions = suppressionFile.suppressions.map(s => ({
        ruleId: s.rule_id,
        path: s.path,
        reason: s.reason,
        expiry: s.expiry,
        author: s.author,
      }));
    }

    ensureDir(absoluteOutDir);

    // LLM Integration
    let llmUsed = false;
    let llmProviderName = "none";
    let llmAnalysisResult: string | undefined;

    if (llmProvider || requireLlm) {
      const providerType = llmProvider as LlmProviderType | undefined;
      const llmConfig: LlmConfig = {
        provider: providerType ?? "deterministic",
        model: llmModel,
        baseUrl: llmPort ? `http://127.0.0.1:${llmPort}` : undefined,
      };

      try {
        // When --require-llm is set, don't use fallback - directly create the requested provider
        const provider = requireLlm ? createProvider(llmConfig) : await createProviderWithFallback(llmConfig);
        llmProviderName = provider.type;

        const healthResult = await provider.healthCheck();

        // For --require-llm: fail if provider is not healthy (except deterministic which always succeeds)
        if (!healthResult.healthy && requireLlm && providerType !== "deterministic") {
          console.error(`LLM provider '${providerType}' is not healthy: ${healthResult.error}`);
          console.error("Use --llm-provider deterministic for fallback analysis");
          return options.EXIT.LLM_FAILED;
        }

        if (healthResult.healthy || provider.type === "deterministic") {
          llmUsed = true;

          const codeSummary = graph.files
            .filter(f => f.role === "source")
            .slice(0, 10)
            .map(f => `File: ${f.path} (${f.language}, ${f.lineCount} lines)`)
            .join("\n");

          const analysisRequest: LlmAnalysisRequest = {
            systemPrompt: `You are a code quality analyst for code-to-gate.
Analyze the provided code for security vulnerabilities, maintainability issues, and release risks.
Focus on: auth, payment, validation, data handling, configuration, and testing concerns.
Provide concise, actionable findings.`,
            userPrompt: `Analyze this repository structure:\n\n${codeSummary}\n\nIdentify potential quality risks and security concerns.`,
            maxTokens: 2048,
            temperature: 0.1,
          };

          llmAnalysisResult = (await provider.analyze(analysisRequest)).content;
        }
      } catch (llmError) {
        if (requireLlm) {
          console.error(`LLM analysis failed: ${llmError instanceof Error ? llmError.message : String(llmError)}`);
          return options.EXIT.LLM_FAILED;
        }
        console.error(`Warning: LLM unavailable, using deterministic analysis`);
        llmProviderName = "deterministic";
        llmUsed = true;
      }
    }

    // Generate findings
    const findings = applyLlmEnrichment(
      buildFindingsFromGraph(graph, graph.run_id, graph.repo.root, policy?.policyId),
      llmAnalysisResult,
      llmProviderName
    );

    // Evaluate policy using shared evaluator (unified with readiness)
    const evalResult = policy ? evaluatePolicy(findings.findings, policy, suppressions) : undefined;
    const readinessStatus = evalResult?.status ?? "passed";
    const finalExitCode = evalResult ? getExitCode(readinessStatus) : options.EXIT.OK;

    // Remove suppressed findings from reported findings
    const suppressedIds = evalResult?.suppressedFindings.map(f => f.id) ?? [];
    const reportedFindings = {
      ...findings,
      findings: findings.findings.filter(f => !suppressedIds.includes(f.id)),
    };

    // Generate risk register
    const riskRegister = buildRiskRegisterFromFindings(reportedFindings, policy?.policyId);

    // Track generated artifacts
    const generated: string[] = [];

    // Emit artifacts
    if (emitFormats.includes("json")) {
      const findingsPath = writeFindingsJson(absoluteOutDir, reportedFindings);
      generated.push(findingsPath);
    }

    if (emitFormats.includes("yaml")) {
      const riskPath = writeRiskRegisterYaml(absoluteOutDir, riskRegister);
      generated.push(riskPath);
    }

    if (emitFormats.includes("md")) {
      const reportPath = writeAnalysisReportMd(absoluteOutDir, reportedFindings, riskRegister, graph.repo.root);
      generated.push(reportPath);
    }

    // Generate audit summary message
    let auditSummary: string;
    if (readinessStatus === "blocked_input" && evalResult) {
      auditSummary = generateBlockingSummary(evalResult.failedConditions, evalResult.blockedFindings);
    } else if (readinessStatus === "passed_with_risk") {
      auditSummary = "Analysis complete with identified risks";
    } else if (llmUsed) {
      auditSummary = `Analysis complete using ${llmProviderName} LLM`;
    } else {
      auditSummary = "Analysis complete";
    }

    // Generate audit.json with correct exit code and status
    const audit = buildAuditArtifact(
      graph,
      findings,
      policy,
      finalExitCode,
      mapStatusToAuditStatus(readinessStatus),
      auditSummary
    );

    // Add LLM info to audit
    if (llmUsed) {
      audit.llm = {
        provider: llmProviderName,
        model: llmModel ?? "default",
        prompt_version: "v1",
        request_hash: sha256("analysis-request"),
        response_hash: llmAnalysisResult ? sha256(llmAnalysisResult) : "",
        redaction_enabled: true,
      };
    }

    const auditPath = writeAuditJson(absoluteOutDir, audit);
    generated.push(auditPath);

    // Output summary
    console.log(
      JSON.stringify({
        tool: "code-to-gate",
        command: "analyze",
        run_id: graph.run_id,
        llm: llmUsed ? {
          provider: llmProviderName,
          model: llmModel ?? "default",
          available: true,
        } : {
          provider: "none",
          available: false,
        },
        artifacts: generated.map((p) => path.relative(cwd, p)),
        summary: {
          findings: reportedFindings.findings.length,
          risks: riskRegister.risks.length,
          critical: reportedFindings.findings.filter((f) => f.severity === "critical").length,
          high: reportedFindings.findings.filter((f) => f.severity === "high").length,
          medium: reportedFindings.findings.filter((f) => f.severity === "medium").length,
          low: reportedFindings.findings.filter((f) => f.severity === "low").length,
          suppressed: suppressedIds.length,
        },
      })
    );

    return finalExitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.SCAN_FAILED;
  }
}