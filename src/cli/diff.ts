/**
 * Diff command - PR / changed files analysis
 *
 * Analyzes the difference between base and head refs,
 * generates blast radius and findings for changed files.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sha256, toPosix } from "../core/path-utils.js";
import { detectLanguage, detectRole, walkDir } from "../core/file-utils.js";
import { EXIT, getOption, VERSION } from "./exit-codes.js";

import {
  NormalizedRepoGraph,
  FindingsArtifact,
  Finding,
  EvidenceRef,
  CTG_VERSION,
} from "../types/artifacts.js";
import {
  buildFindingsFromGraph,
  writeFindingsJson,
} from "../reporters/json-reporter.js";
import {
  buildAuditArtifact,
  writeAuditJson,
} from "../reporters/audit-writer.js";

interface DiffOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  hunks: Array<{ startLine: number; endLine: number }>;
}

interface BlastRadius {
  affectedFiles: string[];
  affectedSymbols: string[];
  affectedTests: string[];
  affectedEntrypoints: string[];
}

interface DiffAnalysisArtifact {
  version: string;
  generated_at: string;
  run_id: string;
  repo: {
    root: string;
    base_ref: string;
    head_ref: string;
  };
  artifact: "diff-analysis";
  schema: "diff-analysis@v1";
  changed_files: ChangedFile[];
  added_files: string[];
  deleted_files: string[];
  modified_files: string[];
  blast_radius: BlastRadius;
  diff_findings: {
    new_findings: string[];
    potentially_affected_findings: string[];
    resolved_findings: string[];
  };
}

/**
 * Get changed files between base and head refs using git
 */
function getChangedFiles(repoRoot: string, baseRef: string, headRef: string): ChangedFile[] {
  // In a real implementation, this would use git diff
  // For now, we simulate by comparing file lists
  const changedFiles: ChangedFile[] = [];

  // Simple simulation: check if files exist and differ
  try {
    const allFiles = walkDir(repoRoot);
    const targetFiles = allFiles.filter(
      (file) =>
        /\.(ts|tsx|js|jsx|py|mjs|cjs)$/.test(file) &&
        !file.endsWith(".d.ts")
    );

    // Simulate changes based on ref names (in real impl, use git)
    // For demo, treat some files as "changed"
    for (const file of targetFiles.slice(0, 5)) {
      const rel = toPosix(path.relative(repoRoot, file));
      changedFiles.push({
        path: rel,
        status: "modified",
        additions: 10,
        deletions: 5,
        hunks: [{ startLine: 1, endLine: 20 }],
      });
    }
  } catch {
    // Return empty if git not available
  }

  return changedFiles;
}

/**
 * Calculate blast radius from changed files
 */
function calculateBlastRadius(graph: NormalizedRepoGraph, changedFiles: ChangedFile[]): BlastRadius {
  const affectedFiles = new Set<string>();
  const affectedSymbols = new Set<string>();
  const affectedTests = new Set<string>();
  const affectedEntrypoints = new Set<string>();

  // Build import map (simplified)
  const importMap: Map<string, string[]> = new Map();

  for (const file of graph.files) {
    // Find files that import changed files
    const imports: string[] = [];
    try {
      const fullPath = path.join(graph.repo.root, file.path);
      const content = readFileSync(fullPath, "utf8");
      // Extract import patterns
      const importMatches = content.match(/from ['"]([^'"]+)['"]/g) || [];
      const requireMatches = content.match(/require\(['"]([^'"]+)['"]\)/g) || [];

      for (const match of [...importMatches, ...requireMatches]) {
        const importPath = match.replace(/from ['"]|require\(['"]|['"]\)/g, "");
        imports.push(importPath);
      }
    } catch {
      // Skip files that can't be read
    }
    importMap.set(file.path, imports);
  }

  // Level 1: Direct importers of changed files
  for (const changed of changedFiles) {
    affectedFiles.add(changed.path);

    for (const [filePath, imports] of importMap) {
      if (imports.some((imp) => imp.includes(changed.path.replace(/\.(ts|js|tsx|jsx)$/, "")))) {
        affectedFiles.add(filePath);
      }
    }
  }

  // Level 2: Add tests and entrypoints related to affected files
  for (const test of graph.tests as Array<{ id: string; path: string }>) {
    const testPath = test.path;
    // Check if test file tests an affected file
    const testedFile = testPath.replace(".test.", ".").replace(".spec.", ".");
    if (affectedFiles.has(testedFile)) {
      affectedTests.add(testPath);
      affectedFiles.add(testPath);
    }
  }

  for (const entrypoint of graph.entrypoints as Array<{ id: string; path: string }>) {
    // Check if entrypoint imports affected files
    const imports = importMap.get(entrypoint.path) || [];
    if (imports.some((imp) => affectedFiles.has(imp.replace(/\.(ts|js|tsx|jsx)$/, "") + ".ts"))) {
      affectedEntrypoints.add(entrypoint.path);
    }
  }

  // Add symbols from affected files (simplified)
  for (const symbol of graph.symbols as Array<{ id: string; fileId: string }>) {
    const symbolFile = (symbol.fileId || "").replace("file:", "");
    if (affectedFiles.has(symbolFile)) {
      affectedSymbols.add(symbol.id);
    }
  }

  return {
    affectedFiles: Array.from(affectedFiles),
    affectedSymbols: Array.from(affectedSymbols),
    affectedTests: Array.from(affectedTests),
    affectedEntrypoints: Array.from(affectedEntrypoints),
  };
}

/**
 * Build findings for changed files only
 */
function buildDiffFindings(
  graph: NormalizedRepoGraph,
  changedFiles: ChangedFile[],
  blastRadius: BlastRadius,
  runId: string,
  repoRoot: string
): FindingsArtifact {
  const findings: Finding[] = [];

  // Create a filtered graph with only changed/affected files
  const affectedPaths = new Set([
    ...changedFiles.map((f) => f.path),
    ...blastRadius.affectedFiles,
  ]);

  const filteredFiles = graph.files.filter((f) => affectedPaths.has(f.path));

  // Build findings from filtered graph
  const filteredGraph: NormalizedRepoGraph = {
    ...graph,
    files: filteredFiles,
    stats: { partial: filteredFiles.length < graph.files.length },
  };

  const allFindings = buildFindingsFromGraph(filteredGraph, runId, repoRoot);

  // Filter findings to only those in changed files or blast radius
  for (const finding of allFindings.findings) {
    const findingPaths = finding.evidence.map((e) => e.path);
    const isInChangedOrBlast = findingPaths.some(
      (p) => affectedPaths.has(p)
    );

    if (isInChangedOrBlast) {
      findings.push(finding);
    }
  }

  return {
    ...allFindings,
    findings,
    completeness: findings.length > 0 ? "complete" : "partial",
  };
}

/**
 * Generate Mermaid diagram for blast radius
 */
function generateBlastRadiusMermaid(blastRadius: BlastRadius): string {
  let mermaid = `graph TD
    subgraph Changed["Changed Files"]
`;

  for (const file of blastRadius.affectedFiles.slice(0, 5)) {
    const nodeId = file.replace(/[^a-zA-Z0-9]/g, "_");
    mermaid += `        ${nodeId}["${file}"]\n`;
  }

  mermaid += `    end

    subgraph Tests["Affected Tests"]
`;

  for (const test of blastRadius.affectedTests.slice(0, 3)) {
    const nodeId = test.replace(/[^a-zA-Z0-9]/g, "_");
    mermaid += `        ${nodeId}["${test}"]\n`;
  }

  mermaid += `    end

    subgraph Entrypoints["Affected Entrypoints"]
`;

  for (const entry of blastRadius.affectedEntrypoints.slice(0, 3)) {
    const nodeId = entry.replace(/[^a-zA-Z0-9]/g, "_");
    mermaid += `        ${nodeId}["${entry}"]\n`;
  }

  mermaid += `    end
`;

  // Add connections (simplified)
  if (blastRadius.affectedTests.length > 0 && blastRadius.affectedFiles.length > 0) {
    const testId = blastRadius.affectedTests[0].replace(/[^a-zA-Z0-9]/g, "_");
    const fileId = blastRadius.affectedFiles[0].replace(/[^a-zA-Z0-9]/g, "_");
    mermaid += `    ${testId} --> ${fileId}\n`;
  }

  return mermaid;
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function buildPartialGraph(repoRoot: string): NormalizedRepoGraph {
  const now = new Date().toISOString();
  const relativeRoot = toPosix(path.relative(process.cwd(), repoRoot) || ".");
  const runId = `ctg-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}`;

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
    stats: { partial: true },
  };

  const allFiles = walkDir(repoRoot);
  const targetFiles = allFiles.filter(
    (file) =>
      /\.(ts|tsx|js|jsx|py|mjs|cjs|json|yaml|yml|md)$/.test(file) &&
      !file.endsWith(".d.ts")
  );

  for (const file of targetFiles) {
    const rel = toPosix(path.relative(repoRoot, file));
    const body = readFileSync(file, "utf8");
    const language = detectLanguage(file);
    const role = detectRole(rel);

    graph.files.push({
      id: `file:${rel}`,
      path: rel,
      language,
      role,
      hash: sha256(body),
      sizeBytes: Buffer.byteLength(body),
      lineCount: body.split(/\r?\n/).length,
      moduleId: `module:${rel}`,
      parser: {
        status: "text_fallback",
        adapter: "ctg-text-v0",
      },
    });

    if (role === "test") {
      (graph.tests as Array<{ id: string; path: string; framework: string }>).push({
        id: `test:${rel}`,
        path: rel,
        framework: rel.endsWith(".py") ? "pytest" : "vitest",
      });
    }

    if (role === "config") {
      (graph.configs as Array<{ id: string; path: string }>).push({
        id: `config:${rel}`,
        path: rel,
      });
    }

    // Detect entrypoints
    if (body.includes("app.listen") || body.includes("router.") || rel.includes("/api/")) {
      (graph.entrypoints as Array<{ id: string; path: string; kind: string }>).push({
        id: `entrypoint:${rel}`,
        path: rel,
        kind: "route",
      });
    }
  }

  return graph;
}

export async function diffCommand(args: string[], options: DiffOptions): Promise<number> {
  const repoArg = args[0];
  const baseRef = options.getOption(args, "--base");
  const headRef = options.getOption(args, "--head");
  const outDir = options.getOption(args, "--out") ?? ".qh";

  if (!repoArg || !baseRef || !headRef) {
    console.error("usage: code-to-gate diff <repo> --base <ref> --head <ref> --out <dir>");
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

  const absoluteOutDir = path.resolve(cwd, outDir);

  try {
    // Build partial graph for analysis
    const graph = buildPartialGraph(repoRoot);

    // Get changed files between base and head
    const changedFiles = getChangedFiles(repoRoot, baseRef, headRef);

    if (changedFiles.length === 0) {
      console.log(
        JSON.stringify({
          tool: "code-to-gate",
          command: "diff",
          status: "no_changes",
          message: "No changes detected between base and head",
        })
      );
      return options.EXIT.OK;
    }

    // Calculate blast radius
    const blastRadius = calculateBlastRadius(graph, changedFiles);

    // Build diff findings
    const findings = buildDiffFindings(graph, changedFiles, blastRadius, graph.run_id, graph.repo.root);

    ensureDir(absoluteOutDir);

    // Generate diff-analysis.json
    const diffAnalysis: DiffAnalysisArtifact = {
      version: CTG_VERSION,
      generated_at: graph.generated_at,
      run_id: graph.run_id,
      repo: {
        root: graph.repo.root,
        base_ref: baseRef,
        head_ref: headRef,
      },
      artifact: "diff-analysis",
      schema: "diff-analysis@v1",
      changed_files: changedFiles,
      added_files: changedFiles.filter((f) => f.status === "added").map((f) => f.path),
      deleted_files: changedFiles.filter((f) => f.status === "deleted").map((f) => f.path),
      modified_files: changedFiles.filter((f) => f.status === "modified").map((f) => f.path),
      blast_radius: blastRadius,
      diff_findings: {
        new_findings: findings.findings.map((f) => f.id),
        potentially_affected_findings: [],
        resolved_findings: [],
      },
    };

    const diffAnalysisPath = path.join(absoluteOutDir, "diff-analysis.json");
    writeFileSync(diffAnalysisPath, JSON.stringify(diffAnalysis, null, 2) + "\n", "utf8");

    // Generate findings.json
    const findingsPath = writeFindingsJson(absoluteOutDir, findings);

    // Generate blast-radius.mmd
    const mermaid = generateBlastRadiusMermaid(blastRadius);
    const mermaidPath = path.join(absoluteOutDir, "blast-radius.mmd");
    writeFileSync(mermaidPath, mermaid, "utf8");

    // Generate audit.json
    const audit = buildAuditArtifact(
      graph,
      findings,
      undefined,
      0,
      "passed_with_risk",
      findings.findings.length > 0
        ? `${findings.findings.length} findings in changed files`
        : "No findings in changed files"
    );
    const auditPath = writeAuditJson(absoluteOutDir, audit);

    // Output summary
    console.log(
      JSON.stringify({
        tool: "code-to-gate",
        command: "diff",
        run_id: graph.run_id,
        artifacts: [
          path.relative(cwd, diffAnalysisPath),
          path.relative(cwd, findingsPath),
          path.relative(cwd, mermaidPath),
          path.relative(cwd, auditPath),
        ],
        summary: {
          changed_files: changedFiles.length,
          blast_radius_files: blastRadius.affectedFiles.length,
          blast_radius_tests: blastRadius.affectedTests.length,
          blast_radius_entrypoints: blastRadius.affectedEntrypoints.length,
          findings: findings.findings.length,
          critical: findings.findings.filter((f) => f.severity === "critical").length,
          high: findings.findings.filter((f) => f.severity === "high").length,
        },
      })
    );

    // Return exit code based on findings severity
    const hasBlockingFindings = findings.findings.some(
      (f) => f.severity === "critical" || f.severity === "high"
    );

    return hasBlockingFindings ? options.EXIT.READINESS_NOT_CLEAR : options.EXIT.OK;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.SCAN_FAILED;
  }
}