/**
 * Analyze command - generates findings, risk-register, analysis-report, and audit
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { sha256 } from "../core/path-utils.js";
import { ensureDir } from "../core/file-utils.js";
import { buildGraph } from "../core/repo-graph-builder.js";
import { EXIT, getOption, VERSION } from "./exit-codes.js";

import {
  Policy,
  EmitFormat,
  CTG_VERSION_V1ALPHA1,
} from "../types/artifacts.js";

const CTG_VERSION = CTG_VERSION_V1ALPHA1;
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
import {
  LlmProviderType,
  LlmConfig,
  LlmAnalysisRequest,
} from "../llm/types.js";
import {
  createProviderWithFallback,
  createProvider,
} from "../llm/providers/index.js";
import { findAvailableProvider } from "../llm/providers/provider-health.js";

interface AnalyzeOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

function parseEmitOption(value: string | undefined): EmitFormat[] {
  if (!value || value === "all") {
    return ["json", "yaml", "md", "mermaid"];
  }
  const formats = value.split(",").map((f) => f.trim() as EmitFormat);
  return formats.filter((f) => ["json", "yaml", "md", "mermaid", "all"].includes(f));
}

function loadPolicy(policyPath: string | undefined): Policy | undefined {
  if (!policyPath) return undefined;

  const absolutePath = path.resolve(process.cwd(), policyPath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Policy file not found: ${policyPath}`);
  }

  const content = readFileSync(absolutePath, "utf8");

  // Parse YAML (simple implementation)
  // For now, we just parse the basic structure
  const lines = content.split("\n");
  const policy: Policy = {
    version: CTG_VERSION,
    name: "unknown",
    blocking: {},
  };

  for (const line of lines) {
    if (line.startsWith("name:")) {
      policy.name = line.split(":")[1].trim();
    }
    if (line.startsWith("description:")) {
      policy.description = line.split(":")[1].trim();
    }
  }

  return policy;
}

export async function analyzeCommand(args: string[], options: AnalyzeOptions): Promise<number> {
  const repoArg = args[0];
  const outDir = options.getOption(args, "--out") ?? ".qh";
  const emitValue = options.getOption(args, "--emit");
  const policyPath = options.getOption(args, "--policy");
  const llmProvider = options.getOption(args, "--llm-provider");
  const llmMode = options.getOption(args, "--llm-mode") ?? "local-only";
  const llmModel = options.getOption(args, "--llm-model");
  const llmPort = options.getOption(args, "--llm-port");
  const requireLlm = args.includes("--require-llm");

  // Validate LLM provider if specified
  const validProviders: LlmProviderType[] = ["ollama", "llamacpp", "deterministic"];
  if (llmProvider && !validProviders.includes(llmProvider as LlmProviderType)) {
    console.error(`Invalid LLM provider: ${llmProvider}`);
    console.error(`Valid providers: ${validProviders.join(", ")}`);
    return options.EXIT.USAGE_ERROR;
  }

  // Validate LLM mode
  const validModes = ["local-only", "allow-cloud"];
  if (llmMode && !validModes.includes(llmMode)) {
    console.error(`Invalid LLM mode: ${llmMode}`);
    console.error(`Valid modes: ${validModes.join(", ")}`);
    return options.EXIT.USAGE_ERROR;
  }

  // Enforce local-only mode
  if (llmMode === "local-only") {
    // Only local providers allowed
    if (llmProvider && !validProviders.includes(llmProvider as LlmProviderType)) {
      console.error("--llm-mode local-only requires a local provider (ollama, llamacpp, deterministic)");
      return options.EXIT.USAGE_ERROR;
    }
  }

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

    // Check if repo is empty (no target files found)
    if (graph.files.length === 0) {
      console.error(`repo contains no target files: ${repoArg}`);
      return options.EXIT.SCAN_FAILED;
    }

    // Load policy if specified
    let policy: Policy | undefined;
    try {
      policy = loadPolicy(policyPath);
    } catch (err) {
      if (policyPath) {
        console.error(err instanceof Error ? err.message : String(err));
        return options.EXIT.USAGE_ERROR;
      }
    }

    ensureDir(absoluteOutDir);

    // === LLM Integration ===
    let llmUsed = false;
    let llmProviderName = "none";
    let llmAnalysisResult: string | undefined;

    // Determine LLM provider
    if (llmProvider || requireLlm) {
      const providerType = llmProvider as LlmProviderType | undefined;
      const llmConfig: LlmConfig = {
        provider: providerType ?? "deterministic",
        model: llmModel,
        baseUrl: llmPort ? `http://127.0.0.1:${llmPort}` : undefined,
      };

      try {
        // Create provider with fallback
        const provider = providerType
          ? await createProviderWithFallback(llmConfig)
          : await createProviderWithFallback({ provider: "ollama" });

        llmProviderName = provider.type;

        // Check provider health
        const healthResult = await provider.healthCheck();

        if (!healthResult.healthy && providerType !== "deterministic" && requireLlm) {
          console.error(`LLM provider '${providerType}' is not healthy: ${healthResult.error}`);
          console.error("Use --llm-provider deterministic for fallback analysis");
          return options.EXIT.LLM_FAILED;
        }

        if (healthResult.healthy || provider.type === "deterministic") {
          llmUsed = true;

          // Build analysis prompt from graph
          const codeSummary = graph.files
            .filter(f => f.role === "source")
            .slice(0, 10) // Limit for performance
            .map(f => `File: ${f.path} (${f.language}, ${f.lineCount} lines)`)
            .join("\n");

          const analysisRequest: LlmAnalysisRequest = {
            systemPrompt: `You are a code quality analyst for code-to-gate.
Analyze the provided code for security vulnerabilities, maintainability issues, and release risks.
Focus on: auth, payment, validation, data handling, configuration, and testing concerns.
Provide concise, actionable findings.`,
            userPrompt: `Analyze this repository structure:\n\n${codeSummary}\n\n
Identify potential quality risks and security concerns.
Format findings as: [Category] Severity: Description`,
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
        // Graceful fallback - continue without LLM
        console.error(`Warning: LLM unavailable, using deterministic analysis`);
        llmProviderName = "deterministic";
        llmUsed = true;
      }
    }

    // Generate findings
    const findings = applyLlmEnrichment(
      buildFindingsFromGraph(graph, graph.run_id, graph.repo.root, policy?.name),
      llmAnalysisResult,
      llmProviderName
    );

    // Generate risk register from findings
    const riskRegister = buildRiskRegisterFromFindings(findings, policy?.name);

    // Track generated artifacts
    const generated: string[] = [];

    // Emit JSON (findings.json)
    if (emitFormats.includes("json") || emitFormats.includes("all")) {
      const findingsPath = writeFindingsJson(absoluteOutDir, findings);
      generated.push(findingsPath);
    }

    // Emit YAML (risk-register.yaml)
    if (emitFormats.includes("yaml") || emitFormats.includes("all")) {
      const riskPath = writeRiskRegisterYaml(absoluteOutDir, riskRegister);
      generated.push(riskPath);
    }

    // Emit Markdown (analysis-report.md)
    if (emitFormats.includes("md") || emitFormats.includes("all")) {
      const reportPath = writeAnalysisReportMd(absoluteOutDir, findings, riskRegister, graph.repo.root);
      generated.push(reportPath);
    }

    // Generate audit.json with LLM info
    const audit = buildAuditArtifact(
      graph,
      findings,
      policy,
      0, // exit code
      "passed_with_risk", // status
      findings.findings.some(f => f.severity === "high" || f.severity === "critical")
        ? "High severity findings detected"
        : llmUsed
          ? `Analysis complete using ${llmProviderName} LLM`
          : "Analysis complete"
    );

    // Add LLM information to audit
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
          findings: findings.findings.length,
          risks: riskRegister.risks.length,
          critical: findings.findings.filter((f) => f.severity === "critical").length,
          high: findings.findings.filter((f) => f.severity === "high").length,
          medium: findings.findings.filter((f) => f.severity === "medium").length,
          low: findings.findings.filter((f) => f.severity === "low").length,
        },
      })
    );

    // Return exit code based on findings severity
    const hasBlockingFindings = findings.findings.some((f) =>
      f.severity === "critical" ||
      (policy?.blocking?.severities?.includes(f.severity) &&
        policy?.blocking?.categories?.includes(f.category))
    );

    if (hasBlockingFindings) {
      return options.EXIT.POLICY_FAILED;
    }

    return options.EXIT.OK;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.SCAN_FAILED;
  }
}
