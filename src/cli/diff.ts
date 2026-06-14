/**
 * Diff command - PR / changed files analysis
 *
 * Analyzes the difference between base and head refs,
 * generates blast radius and findings for changed files.
 */

// SAFETY: Git operations delegated to GitDiffAccess for spawnSync-based safe execution
import { GitDiffAccess } from "../adapters/git-diff-access.js";
import { GitFileAccessAdapter, DB_ANALYSIS_LIMITS } from "../adapters/git-file-access-adapter.js";
import { toPosix } from "../core/path-utils.js";
import {
  detectLanguage,
  detectRole,
  walkDir,
  ensureDir,
  isDatabaseFile,
} from "../core/file-utils.js";
import {
  analyzeDatabaseAssetsAtRef,
  diffDatabaseAssets,
} from "../core/database-analyzer.js";
import type { DatabaseAssetsDiff } from "../core/database-analyzer.js";
import { EXIT, getOption, VERSION } from "./exit-codes.js";
import { CORE_RULES, DATABASE_RULES } from "../rules/index.js";
import type { RulePlugin } from "../rules/index.js";
import type { DiffAccessResult } from "../types/diff-contracts.js";

import {
  NormalizedRepoGraph,
  FindingsArtifact,
  Finding,
  RepoFile,
  CTG_VERSION,
  ToolRef,
} from "../types/artifacts.js";
import {
  evaluateRules,
} from "../application/rule-evaluator.js";
import {
  writeFindingsJson,
} from "../reporters/json-reporter.js";
import {
  buildAuditArtifact,
  writeAuditJson,
} from "../reporters/audit-writer.js";

// Application context and adapters
import { createApplicationContext } from "../application/context.js";
import {
  nodeFileAccess,
  nodeHashService,
  nodeClockService,
  nodePathService,
} from "../adapters/node-services.js";
import type { FileAccess } from "../types/contracts.js";

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
  tool: ToolRef;
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
 * Parse git diff numstat output
 */
/**
 * Parse hunk info from GitDiffAccess DiffHunk result
 */
function parseHunksFromResult(hunks: Array<{ oldStart: number; oldLines: number; newStart: number; newLines: number; lines: Array<{ type: string; content: string }> }>): Array<{ startLine: number; endLine: number }> {
  return hunks.map(hunk => ({
    startLine: hunk.newStart,
    endLine: hunk.newStart + hunk.newLines - 1,
  }));
}

/**
 * Get changed files between base and head refs using git
 * Returns structured result with explicit failure modes (no fallback)
 */
function getChangedFilesResult(
  repoRoot: string,
  baseRef: string,
  headRef: string
): DiffAccessResult<ChangedFile[]> {
  const diffAccess = new GitDiffAccess(repoRoot);

  // Validate refs exist
  const baseResult = diffAccess.validateRefResult(baseRef);
  const headResult = diffAccess.validateRefResult(headRef);

  if (baseResult.status !== "success") {
    return {
      status: baseResult.status,
      message: baseResult.message ?? `Base ref '${baseRef}' validation failed`,
    };
  }

  if (headResult.status !== "success") {
    return {
      status: headResult.status,
      message: headResult.message ?? `Head ref '${headRef}' validation failed`,
    };
  }

  // Get changed files with stats using safe GitDiffAccess
  const statsResult = diffAccess.getChangedFilesWithStatsResult(baseRef, headRef);

  if (statsResult.status === "git_failure") {
    return {
      status: "git_failure",
      message: statsResult.message ?? "Git operation failed",
    };
  }

  if (statsResult.status === "ref_invalid") {
    return {
      status: "ref_invalid",
      message: statsResult.message ?? "Git refs are invalid",
    };
  }

  // limit_exceeded: return truncated list with status
  if (statsResult.status !== "success" && statsResult.status !== "limit_exceeded") {
    return {
      status: "git_failure",
      message: statsResult.message ?? `Unexpected status: ${statsResult.status}`,
    };
  }

  const filesWithStats = statsResult.value!;
  const changedFiles: ChangedFile[] = [];

  // Build changed files list with hunk info
  for (const fileStat of filesWithStats) {
    const posixPath = toPosix(fileStat.path);

    // Get hunk info for modified files using safe GitDiffAccess
    let hunks: Array<{ startLine: number; endLine: number }> = [];
    if (fileStat.status === "modified") {
      const diffResult = diffAccess.getFileDiffResult(baseRef, headRef, fileStat.path);
      if (diffResult.status === "success") {
        hunks = parseHunksFromResult(diffResult.value!);
      }
    }

    changedFiles.push({
      path: posixPath,
      status: fileStat.status,
      additions: fileStat.additions,
      deletions: fileStat.deletions,
      hunks,
    });
  }

  // Return result with limit_exceeded status if applicable
  return statsResult.status === "limit_exceeded"
    ? {
        status: "limit_exceeded",
        value: changedFiles,
        message: statsResult.message,
        limit: statsResult.limit,
      }
    : {
        status: "success",
        value: changedFiles,
      };
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
      const fullPath = nodePathService.join(graph.repo.root, file.path);
      const content = nodeFileAccess.readFile(fullPath) ?? "";
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
  repoRoot: string,
  toolVersion: string,
  rules: RulePlugin[] = CORE_RULES
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

  // Create application context (Composition Root)
  const applicationContext = createApplicationContext(
    {
      fileAccess: nodeFileAccess,
      hashService: nodeHashService,
      clockService: nodeClockService,
      pathService: nodePathService,
    },
    new Map(),
    toolVersion,
    false
  );

  const allFindings = evaluateRules(filteredGraph, applicationContext, undefined, rules);

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

function findingSignature(finding: Finding): string {
  const evidence = finding.evidence
    .map((item) => item.path)
    .sort()
    .join("|");
  return `${finding.ruleId}|${finding.title}|${evidence}`;
}

function buildDatabaseFindingsAtRef(
  repoRoot: string,
  gitRef: string,
  runId: string,
  toolVersion: string
): FindingsArtifact {
  // Use GitFileAccessAdapter for safe git operations
  // SPEC-29 Phase 3: Use DB_ANALYSIS_LIMITS to prevent SQL migration truncation at 500 files
  const gitFileAccess = new GitFileAccessAdapter(repoRoot, DB_ANALYSIS_LIMITS);
  const contents = new Map<string, string>();
  const files: RepoFile[] = [];

  // List all files at ref and filter to database files
  const allFiles = gitFileAccess.listFilesAtRef(gitRef);
  for (const filePath of allFiles) {
    if (!isDatabaseFile(filePath)) continue;
    const content = gitFileAccess.getFileContent(gitRef, filePath);
    if (content === null) continue;
    const normalizedPath = toPosix(filePath);
    contents.set(normalizedPath, content);
    files.push({
      id: `file:${normalizedPath}`,
      path: normalizedPath,
      language: detectLanguage(normalizedPath),
      role: "source",
      hash: nodeHashService.sha256(content),
      sizeBytes: Buffer.byteLength(content),
      lineCount: content.split(/\r?\n/).length,
      parser: { status: "skipped", adapter: "ctg-db-ref-v0" },
    });
  }

  const refFileAccess: FileAccess = {
    ...nodeFileAccess,
    readFile(filePath: string): string | null {
      const relativePath = toPosix(nodePathService.relative(repoRoot, filePath));
      return contents.get(relativePath) ?? null;
    },
  };
  const applicationContext = createApplicationContext(
    {
      fileAccess: refFileAccess,
      hashService: nodeHashService,
      clockService: nodeClockService,
      pathService: nodePathService,
    },
    new Map(),
    toolVersion,
    false
  );

  return evaluateRules(
    {
      files,
      run_id: runId,
      generated_at: nodeClockService.now(),
      repo: { root: repoRoot },
      stats: { partial: false },
    },
    applicationContext,
    undefined,
    DATABASE_RULES
  );
}

function mergeNewDatabaseFindings(
  coreFindings: FindingsArtifact,
  baseDatabaseFindings: FindingsArtifact,
  headDatabaseFindings: FindingsArtifact
): FindingsArtifact {
  const baseSignatures = new Set(baseDatabaseFindings.findings.map(findingSignature));
  const newDatabaseFindings = headDatabaseFindings.findings.filter(
    (finding) => !baseSignatures.has(findingSignature(finding))
  );
  return {
    ...coreFindings,
    findings: [...coreFindings.findings, ...newDatabaseFindings],
    completeness: coreFindings.completeness === "complete" || newDatabaseFindings.length > 0
      ? "complete"
      : "partial",
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

function buildPartialGraph(repoRoot: string): NormalizedRepoGraph {
  const now = new Date().toISOString();
  const relativeRoot = toPosix(nodePathService.relative(process.cwd(), repoRoot) || ".");
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
    const rel = toPosix(nodePathService.relative(repoRoot, file));
    const body = nodeFileAccess.readFile(file) ?? "";
    const language = detectLanguage(file);
    const role = detectRole(rel);

    graph.files.push({
      id: `file:${rel}`,
      path: rel,
      language,
      role,
      hash: nodeHashService.sha256(body),
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
  const useDatabaseAnalysis = args.includes("--database-analysis");

  if (!repoArg || !baseRef || !headRef) {
    console.error("usage: code-to-gate diff <repo> --base <ref> --head <ref> --out <dir> [--database-analysis]");
    return options.EXIT.USAGE_ERROR;
  }

  const cwd = process.cwd();
  const repoRoot = nodePathService.resolve(cwd, repoArg);

  if (!nodeFileAccess.exists(repoRoot)) {
    console.error(`repo does not exist: ${repoArg}`);
    return options.EXIT.USAGE_ERROR;
  }

  const repoStats = nodeFileAccess.stat(repoRoot);
  if (!repoStats || !repoStats.isDirectory) {
    console.error(`repo is not a directory: ${repoArg}`);
    return options.EXIT.USAGE_ERROR;
  }

  const absoluteOutDir = nodePathService.resolve(cwd, outDir);

  try {
    // Build partial graph for analysis
    const baseGraph = buildPartialGraph(repoRoot);
    const graph = baseGraph;

    // Get changed files between base and head (no fallback)
    const changedFilesResult = getChangedFilesResult(repoRoot, baseRef, headRef);

    // Handle Git failures explicitly
    if (changedFilesResult.status === "git_failure") {
      console.error(`Git operation failed: ${changedFilesResult.message}`);
      return options.EXIT.SCAN_FAILED;
    }

    if (changedFilesResult.status === "ref_invalid") {
      console.error(`Invalid Git ref: ${changedFilesResult.message}`);
      return options.EXIT.SCAN_FAILED;
    }

    if (changedFilesResult.status === "path_unsafe") {
      console.error(`Unsafe Git ref path detected: ${changedFilesResult.message}`);
      return options.EXIT.SCAN_FAILED;
    }

    // Handle limit exceeded as error - incomplete analysis is unacceptable
    if (changedFilesResult.status === "limit_exceeded") {
      console.error(
        `Error: Changed files limit exceeded (${changedFilesResult.limit?.actual ?? "?"}/${changedFilesResult.limit?.max ?? "?"}). Cannot proceed with incomplete analysis.`
      );
      return options.EXIT.SCAN_FAILED;
    }

    // After handling all error cases, changedFilesResult.status must be "success"
    const changedFiles: ChangedFile[] = changedFilesResult.value!;

    if (changedFiles.length === 0) {
      // Generate empty diff-analysis artifact even when no changes
      ensureDir(absoluteOutDir);

      const emptyDiffAnalysis: DiffAnalysisArtifact = {
        version: CTG_VERSION,
        generated_at: graph.generated_at,
        run_id: graph.run_id,
        repo: {
          root: graph.repo.root,
          base_ref: baseRef,
          head_ref: headRef,
        },
        tool: {
          name: "code-to-gate",
          version: VERSION,
          plugin_versions: [],
        },
        artifact: "diff-analysis",
        schema: "diff-analysis@v1",
        changed_files: [],
        added_files: [],
        deleted_files: [],
        modified_files: [],
        blast_radius: {
          affectedFiles: [],
          affectedSymbols: [],
          affectedTests: [],
          affectedEntrypoints: [],
        },
        diff_findings: {
          new_findings: [],
          potentially_affected_findings: [],
          resolved_findings: [],
        },
      };

      const diffAnalysisPath = nodePathService.join(absoluteOutDir, "diff-analysis.json");
      nodeFileAccess.writeFile(diffAnalysisPath, JSON.stringify(emptyDiffAnalysis, null, 2) + "\n");

      console.log(
        JSON.stringify({
          tool: "code-to-gate",
          command: "diff",
          status: "no_changes",
          run_id: graph.run_id,
          artifacts: [nodePathService.relative(cwd, diffAnalysisPath)],
          message: "No changes detected between base and head",
        })
      );
      return options.EXIT.OK;
    }

    // Calculate blast radius
    const blastRadius = calculateBlastRadius(graph, changedFiles);

    // Build diff findings
    const coreFindings = buildDiffFindings(graph, changedFiles, blastRadius, graph.run_id, graph.repo.root, VERSION, CORE_RULES);
    const findings = useDatabaseAnalysis
      ? mergeNewDatabaseFindings(
          coreFindings,
          buildDatabaseFindingsAtRef(repoRoot, baseRef, graph.run_id, VERSION),
          buildDatabaseFindingsAtRef(repoRoot, headRef, graph.run_id, VERSION)
        )
      : coreFindings;

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
      tool: {
        name: "code-to-gate",
        version: VERSION,
        plugin_versions: [],
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

    const diffAnalysisPath = nodePathService.join(absoluteOutDir, "diff-analysis.json");
    nodeFileAccess.writeFile(diffAnalysisPath, JSON.stringify(diffAnalysis, null, 2) + "\n");

    // Generate findings.json
    const findingsPath = writeFindingsJson(absoluteOutDir, findings);

    let databaseAssetsPath: string | undefined;
    let databaseAssetsBasePath: string | undefined;
    let databaseDiffPath: string | undefined;
    let dbDiff: DatabaseAssetsDiff | undefined;

    if (useDatabaseAnalysis) {
      // Create GitFileAccess adapter for database analysis at refs
      // SPEC-29 Phase 3: Use DB_ANALYSIS_LIMITS to prevent SQL migration truncation at 500 files
      const gitFileAccess = new GitFileAccessAdapter(repoRoot, DB_ANALYSIS_LIMITS);

      // Analyze database assets at base ref (SPEC-29: true base/head diff)
      const baseAssets = analyzeDatabaseAssetsAtRef({
        repoRoot,
        gitRef: baseRef,
        gitFileAccess,
        hashService: nodeHashService,
      });
      databaseAssetsBasePath = nodePathService.join(absoluteOutDir, "database-assets-base.json");
      nodeFileAccess.writeFile(databaseAssetsBasePath, JSON.stringify(baseAssets, null, 2) + "\n");

      // Analyze database assets at head ref
      const headAssets = analyzeDatabaseAssetsAtRef({
        repoRoot,
        gitRef: headRef,
        gitFileAccess,
        hashService: nodeHashService,
      });
      databaseAssetsPath = nodePathService.join(absoluteOutDir, "database-assets.json");
      nodeFileAccess.writeFile(databaseAssetsPath, JSON.stringify(headAssets, null, 2) + "\n");

      // Compute database assets diff (SPEC-29)
      dbDiff = diffDatabaseAssets(baseAssets, headAssets);
      databaseDiffPath = nodePathService.join(absoluteOutDir, "database-assets-diff.json");
      nodeFileAccess.writeFile(databaseDiffPath, JSON.stringify(dbDiff, null, 2) + "\n");

      // Update diff_analysis with database diff info
      if (dbDiff) {
        diffAnalysis.diff_findings.potentially_affected_findings = [
          ...dbDiff.removedRollbackPatterns.map(r => `rollback-removed:${r.migrationPath}`),
          ...dbDiff.removedTransactionSignals.map(r => `tx-signal-removed:${r.migrationPath}`),
        ];
        // Re-write diff-analysis.json with updated info
        nodeFileAccess.writeFile(diffAnalysisPath, JSON.stringify(diffAnalysis, null, 2) + "\n");
      }
    }

    // Generate blast-radius.mmd
    const mermaid = generateBlastRadiusMermaid(blastRadius);
    const mermaidPath = nodePathService.join(absoluteOutDir, "blast-radius.mmd");
    nodeFileAccess.writeFile(mermaidPath, mermaid);

    // Generate audit.json
    const audit = buildAuditArtifact(
      graph,
      findings,
      undefined,
      0,
      "passed_with_risk",
      findings.findings.length > 0
        ? `${findings.findings.length} findings in changed files`
        : "No findings in changed files",
      VERSION
    );
    const auditPath = writeAuditJson(absoluteOutDir, audit);

    // Output summary
    console.log(
      JSON.stringify({
        tool: "code-to-gate",
        command: "diff",
        run_id: graph.run_id,
        artifacts: [
          nodePathService.relative(cwd, diffAnalysisPath),
          nodePathService.relative(cwd, findingsPath),
          ...(databaseAssetsPath ? [nodePathService.relative(cwd, databaseAssetsPath)] : []),
          ...(databaseAssetsBasePath ? [nodePathService.relative(cwd, databaseAssetsBasePath)] : []),
          ...(databaseDiffPath ? [nodePathService.relative(cwd, databaseDiffPath)] : []),
          nodePathService.relative(cwd, mermaidPath),
          nodePathService.relative(cwd, auditPath),
        ],
        summary: {
          changed_files: changedFiles.length,
          blast_radius_files: blastRadius.affectedFiles.length,
          blast_radius_tests: blastRadius.affectedTests.length,
          blast_radius_entrypoints: blastRadius.affectedEntrypoints.length,
          findings: findings.findings.length,
          critical: findings.findings.filter((f) => f.severity === "critical").length,
          high: findings.findings.filter((f) => f.severity === "high").length,
          ...(dbDiff ? {
            db_added_migrations: dbDiff.addedMigrations.length,
            db_removed_rollback_patterns: dbDiff.removedRollbackPatterns.length,
            db_removed_tx_signals: dbDiff.removedTransactionSignals.length,
          } : {}),
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
