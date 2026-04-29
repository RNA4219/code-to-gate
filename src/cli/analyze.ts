/**
 * Analyze command - generates findings, risk-register, analysis-report, and audit
 */

import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { sha256, toPosix } from "../core/path-utils.js";
import { detectLanguage, detectRole, walkDir } from "../core/file-utils.js";
import { EXIT, getOption, VERSION } from "./exit-codes.js";

import {
  NormalizedRepoGraph,
  Policy,
  EmitFormat,
  CTG_VERSION,
} from "../types/artifacts.js";
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

interface AnalyzeOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

function buildGraph(repoRoot: string): NormalizedRepoGraph {
  const now = new Date().toISOString();
  const relativeRoot = toPosix(path.relative(process.cwd(), repoRoot) || ".");
  const runId = `ctg-${now.replace(/[-:.TZ]/g, "").slice(0, 12)}`;

  const graph: NormalizedRepoGraph = {
    version: CTG_VERSION,
    generated_at: now,
    run_id: runId,
    repo: { root: relativeRoot },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
    artifact: "normalized-repo-graph",
    schema: "normalized-repo-graph@v1",
    files: [],
    modules: [],
    symbols: [],
    relations: [],
    tests: [],
    configs: [],
    entrypoints: [],
    diagnostics: [],
    stats: { partial: false },
  };

  // Walk the directory to find all files
  const allFiles = walkDir(repoRoot);

  // Filter for target file types
  const targetFiles = allFiles.filter(
    (file) =>
      /\.(ts|tsx|js|jsx|py|mjs|cjs|json|yaml|yml|md)$/.test(file) &&
      !file.endsWith(".d.ts") // Exclude TypeScript declaration files
  );

  for (const file of targetFiles) {
    const rel = toPosix(path.relative(repoRoot, file));
    const body = readFileSync(file, "utf8");
    const language = detectLanguage(file);
    const role = detectRole(rel);
    const fileId = `file:${rel}`;

    graph.files.push({
      id: fileId,
      path: rel,
      language,
      role,
      hash: sha256(body),
      sizeBytes: Buffer.byteLength(body),
      lineCount: body.split(/\r?\n/).length,
      moduleId: `module:${rel}`,
      parser: {
        status: ["ts", "tsx", "js", "jsx", "py"].includes(language) ? "text_fallback" : "skipped",
        adapter: "ctg-text-v0",
      },
    });

    // Add to configs if role is config
    if (role === "config") {
      graph.configs.push({ id: `config:${rel}`, path: rel });
    }

    // Add to tests if role is test
    if (role === "test") {
      graph.tests.push({
        id: `test:${rel}`,
        path: rel,
        framework: rel.endsWith(".py") ? "pytest" : rel.endsWith(".js") ? "node:test" : "vitest",
      });
    }
  }

  return graph;
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

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export async function analyzeCommand(args: string[], options: AnalyzeOptions): Promise<number> {
  const repoArg = args[0];
  const outDir = options.getOption(args, "--out") ?? ".qh";
  const emitValue = options.getOption(args, "--emit");
  const policyPath = options.getOption(args, "--policy");

  if (!repoArg) {
    console.error("usage: code-to-gate analyze <repo> [--emit all] --out <dir> [--policy <file>]");
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
    const graph = buildGraph(repoRoot);

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

    // Generate findings
    const findings = buildFindingsFromGraph(graph, graph.run_id, graph.repo.root, policy?.name);

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

    // Generate audit.json
    const audit = buildAuditArtifact(
      graph,
      findings,
      policy,
      0, // exit code
      "passed_with_risk", // status
      findings.findings.some(f => f.severity === "high" || f.severity === "critical")
        ? "High severity findings detected"
        : "Analysis complete"
    );
    const auditPath = writeAuditJson(absoluteOutDir, audit);
    generated.push(auditPath);

    // Output summary
    console.log(
      JSON.stringify({
        tool: "code-to-gate",
        command: "analyze",
        run_id: graph.run_id,
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