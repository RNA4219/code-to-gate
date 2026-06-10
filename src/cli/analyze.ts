/**
 * Analyze command - generates findings, risk-register, analysis-report, and audit
 */

import { ensureDir } from "../core/file-utils.js";
import { buildGraph } from "../core/repo-graph-builder.js";
import type { ParserRegistry } from "../types/contracts.js";
import { createParserRegistry } from "../adapters/parser-registry.js";
import { EXIT, getOption, VERSION } from "./exit-codes.js";

import {
  EmitFormat,
  FindingsArtifact,
} from "../types/artifacts.js";
import {
  CtgPolicy,
  loadPolicyFile,
  loadSuppressionFile,
  detectBroadSuppressions,
  SuppressionEntry,
} from "../config/policy-loader.js";
import {
  evaluatePolicy,
  generateBlockingSummary,
  getExitCode,
  type ReadinessStatus,
} from "../config/policy-evaluator.js";

import {
  evaluateRules,
} from "../application/rule-evaluator.js";
import {
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
import {
  buildTestSeedsFromFindings,
  writeTestSeedsJson,
} from "../reporters/test-seed-generator.js";
import {
  buildInvariantsFromFindings,
  writeInvariantsJson,
} from "../reporters/invariant-generator.js";
import {
  generateSelfAnalysisDebtArtifact,
  writeSelfAnalysisDebtJson,
} from "../reporters/self-analysis-debt-reporter.js";
import {
  generateRawFindingsArtifact,
  writeRawFindingsJson,
} from "../reporters/raw-findings-reporter.js";
import {
  classifySuppressedFindings,
  countSuppressedByClass,
} from "../self-analysis/suppression-summary.js";
import { applyLlmEnrichment } from "../reporters/llm-enrichment.js";
import { LlmProviderType, LlmConfig, LlmAnalysisRequest } from "../llm/types.js";
import { createProvider, createProviderWithFallback } from "../llm/providers/index.js";
import { validateLocalhostUrl, ALLOWED_LOCALHOST_LABEL } from "../llm/providers/provider-health.js";

// Application context and adapters
import { createApplicationContext } from "../application/context.js";
import {
  nodeFileAccess,
  nodeHashService,
  nodeClockService,
  nodePathService,
} from "../adapters/node-services.js";

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

export function resolveSuppressionPath(
  suppressPath: string | undefined,
  policySuppressionPath: string | undefined,
  cwd: string,
  repoRoot: string
): string {
  const suppressionPath = suppressPath ?? policySuppressionPath ?? ".ctg/suppressions.yaml";
  const suppressionBaseDir = suppressPath ? cwd : repoRoot;
  return nodePathService.resolve(suppressionBaseDir, suppressionPath);
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
  const llmBaseUrl = options.getOption(args, "--llm-base-url");
  const requireLlm = args.includes("--require-llm");
  const fromImports = args.includes("--from-imports");
  const useTreeSitter = args.includes("--tree-sitter");

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

  if (llmBaseUrl && !validateLocalhostUrl(llmBaseUrl)) {
    console.error(`Invalid LLM base URL: ${llmBaseUrl}`);
    console.error(`Local LLM providers only allow localhost URLs: ${ALLOWED_LOCALHOST_LABEL}`);
    return options.EXIT.USAGE_ERROR;
  }

  // Validate repo argument
  if (!repoArg) {
    console.error("usage: code-to-gate analyze <repo> [--emit all] --out <dir> [--policy <file>] [--llm-provider <provider>] [--llm-base-url <url>] [--from-imports] [--tree-sitter]");
    return options.EXIT.USAGE_ERROR;
  }

  const cwd = process.cwd();
  const repoRoot = nodePathService.resolve(cwd, repoArg);

  // Create application context with injected services (Composition Root)
  const applicationContext = createApplicationContext(
    {
      fileAccess: nodeFileAccess,
      hashService: nodeHashService,
      clockService: nodeClockService,
      pathService: nodePathService,
    },
    new Map(), // parsers now handled via buildGraph options
    VERSION,
    false // tree-sitter readiness handled by parser registry
  );

  if (!nodeFileAccess.exists(repoRoot)) {
    console.error(`repo does not exist: ${repoArg}`);
    return options.EXIT.USAGE_ERROR;
  }

  const repoStats = nodeFileAccess.stat(repoRoot);
  if (!repoStats || !repoStats.isDirectory) {
    console.error(`repo is not a directory: ${repoArg}`);
    return options.EXIT.USAGE_ERROR;
  }

  const emitFormats = parseEmitOption(emitValue);
  const absoluteOutDir = nodePathService.resolve(cwd, outDir);

  // Create parser registry with composition root pattern
  // CLI injects initialized registry into buildGraph
  let parserRegistry: ParserRegistry;
  try {
    parserRegistry = await createParserRegistry(useTreeSitter);
  } catch {
    // Fall back to empty registry (will use text-only parsing)
    parserRegistry = { getParser: () => null, hasParser: () => false, getRegisteredLanguages: () => [], isTreeSitterReady: () => false };
  }

  try {
    // Build repo graph with injected parser registry
    const graph = buildGraph(repoRoot, VERSION, { parserRegistry, useTreeSitter });

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

    // Load suppressions if specified.
    // CLI-provided paths are relative to cwd; policy/default paths are relative to repoRoot.
    const absoluteSuppressionPath = resolveSuppressionPath(
      suppressPath,
      policy?.suppression?.file,
      cwd,
      repoRoot
    );
    const suppressions: SuppressionEntry[] = loadSuppressionFile(absoluteSuppressionPath, cwd).suppressions;

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
        baseUrl: llmBaseUrl ?? (llmPort ? `http://127.0.0.1:${llmPort}` : undefined),
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

    // Generate findings using application-layer evaluator with injected context
    const findings = applyLlmEnrichment(
      evaluateRules(graph, applicationContext, policy?.policyId),
      llmAnalysisResult,
      llmProviderName
    );

    // Load imported findings if --from-imports is specified (P1-04)
    if (fromImports) {
      const importsDir = nodePathService.join(absoluteOutDir, "imports");
      if (nodeFileAccess.exists(importsDir)) {
        const importFiles = ["eslint-findings.json", "semgrep-findings.json", "tsc-findings.json", "coverage-findings.json", "test-findings.json"];
        for (const importFile of importFiles) {
          const importPath = nodePathService.join(importsDir, importFile);
          if (nodeFileAccess.exists(importPath)) {
            const importedContent = nodeFileAccess.readFile(importPath);
            if (importedContent) {
              try {
                const importedData = JSON.parse(importedContent) as FindingsArtifact;
                findings.findings.push(...importedData.findings);
              } catch {
                console.error(`Warning: Failed to load import file: ${importFile}`);
              }
            }
          }
        }
      }
    }

    // Track generated artifacts
    const generated: string[] = [];

    // Generate raw-findings.json (all findings before suppression)
    // This is emitted for self-analysis transparency and debt tracking
    // Always emit when json format is requested (companion artifact)
    if (emitFormats.includes("json")) {
      const rawFindingsArtifact = generateRawFindingsArtifact(
        findings,
        graph.repo.root,
        graph.run_id,
        VERSION,
        policy?.policyId
      );
      const rawFindingsPath = writeRawFindingsJson(absoluteOutDir, rawFindingsArtifact);
      generated.push(rawFindingsPath);
    }

    // Evaluate policy using shared evaluator (unified with readiness)
    const evalResult = policy ? evaluatePolicy(findings.findings, policy, suppressions) : undefined;
    const readinessStatus = evalResult?.status ?? "passed";
    const finalExitCode = evalResult ? getExitCode(readinessStatus) : options.EXIT.OK;

    // Remove suppressed findings from reported findings
    const suppressionOnlyFindings = classifySuppressedFindings(suppressions, findings.findings).map(
      (item) => item.finding
    );
    const suppressedFindings = evalResult?.suppressedFindings ?? suppressionOnlyFindings;
    const suppressedIds = suppressedFindings.map(f => f.id);
    const reportedFindings = {
      ...findings,
      findings: findings.findings.filter(f => !suppressedIds.includes(f.id)),
    };
    const broadSuppressions = detectBroadSuppressions(suppressions);
    const acceptedExceptionsByClass = countSuppressedByClass(
      suppressions,
      suppressedFindings
    );

    // Generate risk register
    const riskRegister = buildRiskRegisterFromFindings(reportedFindings, policy?.policyId);

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
      const reportPath = writeAnalysisReportMd(
        absoluteOutDir,
        findings,
        riskRegister,
        graph.repo.root,
        {
          effectiveFindings: reportedFindings.findings,
          suppressedFindings,
          broadSuppressions,
          acceptedExceptionsByClass,
        }
      );
      generated.push(reportPath);
    }

    // Generate test-seeds.json (P1-01)
    const testSeeds = buildTestSeedsFromFindings(reportedFindings, graph.run_id, graph.repo.root, policy?.policyId);
    const testSeedsPath = writeTestSeedsJson(absoluteOutDir, testSeeds);
    generated.push(testSeedsPath);

    // Generate invariants.json (P1-01)
    const invariants = buildInvariantsFromFindings(reportedFindings, graph.run_id, graph.repo.root, policy?.policyId);
    const invariantsPath = writeInvariantsJson(absoluteOutDir, invariants);
    generated.push(invariantsPath);

    // Generate self-analysis-debt.json only when policy is provided
    // When no policy, readiness command will generate authoritative debt artifact
    if (policy && suppressions.length > 0) {
      const selfAnalysisDebt = generateSelfAnalysisDebtArtifact(
        findings,
        suppressions,
        suppressedFindings,
        graph.repo.root,
        graph.run_id,
        VERSION
      );
      const selfAnalysisDebtPath = writeSelfAnalysisDebtJson(absoluteOutDir, selfAnalysisDebt);
      generated.push(selfAnalysisDebtPath);
    }

    // Generate repo-graph.json (P1-02)
    const repoGraphPath = nodePathService.join(absoluteOutDir, "repo-graph.json");
    nodeFileAccess.writeFile(repoGraphPath, JSON.stringify(graph, null, 2) + "\n");
    generated.push(repoGraphPath);

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
      auditSummary,
      VERSION
    );

    // Add LLM info to audit
    if (llmUsed) {
      audit.llm = {
        provider: llmProviderName,
        model: llmModel ?? "default",
        prompt_version: "v1",
        request_hash: nodeHashService.sha256("analysis-request"),
        response_hash: llmAnalysisResult ? nodeHashService.sha256(llmAnalysisResult) : "",
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
        artifacts: generated.map((p) => nodePathService.relative(cwd, p)),
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
