import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { sha256, toPosix } from "../core/path-utils.js";
import { detectLanguage, detectRole, walkDir, ensureDir, writeJson } from "../core/file-utils.js";
import { EXIT, getOption, VERSION, parseCacheMode, parseParallelWorkers, isVerbose } from "./exit-codes.js";
import { parseTypeScriptFile, type SymbolNode, type GraphRelation, type EvidenceRef } from "../adapters/ts-adapter.js";
import { parseJavaScriptFile } from "../adapters/js-adapter.js";
import { CacheManager, type CacheMode, LARGE_REPO_THRESHOLD } from "../cache/index.js";
import { FileProcessor, type ProcessingProgressEvent } from "../parallel/index.js";
import { CTG_VERSION_V1ALPHA1 } from "../types/artifacts.js";

const CTG_VERSION = CTG_VERSION_V1ALPHA1;

/**
 * Threshold for large repo processing
 */
const SCAN_LARGE_REPO_THRESHOLD = LARGE_REPO_THRESHOLD;

interface ScanOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

interface RepoFile {
  id: string;
  path: string;
  language: "ts" | "tsx" | "js" | "jsx" | "py" | "unknown";
  role: "source" | "test" | "config" | "fixture" | "docs" | "generated" | "unknown";
  hash: string;
  sizeBytes: number;
  lineCount: number;
  moduleId?: string;
  parser: {
    status: "parsed" | "text_fallback" | "skipped" | "failed";
    adapter?: string;
    errorCode?: string;
  };
}

interface EntrypointNode {
  id: string;
  path: string;
  kind: string;
}

interface TestNode {
  id: string;
  path: string;
  framework: string;
}

interface ConfigNode {
  id: string;
  path: string;
}

interface GraphDiagnostic {
  id: string;
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  evidence?: EvidenceRef[];
}

interface NormalizedRepoGraph {
  version: string;
  generated_at: string;
  run_id: string;
  repo: {
    root: string;
    revision?: string;
    branch?: string;
    dirty?: boolean;
  };
  tool: {
    name: string;
    version: string;
    plugin_versions: Array<{ name: string; version: string; visibility: "public" | "private" }>;
  };
  artifact: "normalized-repo-graph";
  schema: "normalized-repo-graph@v1";
  files: RepoFile[];
  modules: unknown[];
  symbols: SymbolNode[];
  relations: GraphRelation[];
  tests: TestNode[];
  configs: ConfigNode[];
  entrypoints: EntrypointNode[];
  diagnostics: GraphDiagnostic[];
  stats: { partial: boolean };
}

type AdapterParseResult = ReturnType<typeof parseTypeScriptFile>;

const parseCache = new Map<string, AdapterParseResult>();
const graphCache = new Map<string, NormalizedRepoGraph>();

function isEntrypoint(rel: string, body: string): boolean {
  return rel.includes("/api/") || rel.includes("/routes/") || /app\.use|createOrderRoute|adminRoutes|accountRoutes|publicRoutes/.test(body);
}

function entrypointKind(rel: string): string {
  if (rel.includes("admin")) return "admin-route";
  if (rel.includes("order")) return "checkout-route";
  return "route";
}

function getCachedParseResult(
  language: RepoFile["language"],
  file: string,
  repoRoot: string,
  fileId: string,
  bodyHash: string
): AdapterParseResult | undefined {
  if (language !== "ts" && language !== "tsx" && language !== "js" && language !== "jsx") {
    return undefined;
  }

  const cacheKey = `${language}:${file}:${bodyHash}`;
  const cached = parseCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result =
    language === "ts" || language === "tsx"
      ? parseTypeScriptFile(file, repoRoot, fileId)
      : parseJavaScriptFile(file, repoRoot, fileId);

  parseCache.set(cacheKey, result);
  return result;
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
      /\.(ts|tsx|js|jsx|py|mjs|cjs|json|yaml|yml|md|txt)$/.test(file) &&
      !file.endsWith(".d.ts") // Exclude TypeScript declaration files
  );

  const shouldUseGraphCache = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  const graphCacheKey = shouldUseGraphCache
    ? `${repoRoot}:${targetFiles
        .map((file) => {
          const stat = statSync(file);
          return `${file}:${stat.size}:${stat.mtimeMs}`;
        })
        .join("|")}`
    : undefined;

  if (graphCacheKey) {
    const cachedGraph = graphCache.get(graphCacheKey);
    if (cachedGraph) {
      return structuredClone(cachedGraph);
    }
  }

  const hasErrors = false;

  for (const file of targetFiles) {
    const rel = toPosix(path.relative(repoRoot, file));
    const body = readFileSync(file, "utf8");
    const bodyHash = sha256(body);
    const language = detectLanguage(file);
    const role = detectRole(rel);
    const fileId = `file:${rel}`;

    // Default parser status
    let parserStatus: "parsed" | "text_fallback" | "skipped" | "failed" = "skipped";
    let parserAdapter = "ctg-text-v0";
    let errorCode: string | undefined;

    // Parse with appropriate adapter
    if (language === "ts" || language === "tsx") {
      const result = getCachedParseResult(language, file, repoRoot, fileId, bodyHash);
      if (!result) continue;

      // Add symbols from parse result
      for (const symbol of result.symbols) {
        graph.symbols.push(symbol);
      }

      // Add relations from parse result
      for (const relation of result.relations) {
        graph.relations.push(relation);
      }

      // Add diagnostics from parse result
      for (const diagnostic of result.diagnostics) {
        graph.diagnostics.push(diagnostic);
      }

      parserStatus = result.parserStatus;
      parserAdapter = result.parserAdapter;
      if (result.parserStatus === "failed") {
        errorCode = "PARSER_FAILED";
        graph.stats.partial = true;
      }
    } else if (language === "js" || language === "jsx") {
      const result = getCachedParseResult(language, file, repoRoot, fileId, bodyHash);
      if (!result) continue;

      // Add symbols from parse result
      for (const symbol of result.symbols) {
        graph.symbols.push(symbol);
      }

      // Add relations from parse result
      for (const relation of result.relations) {
        graph.relations.push(relation);
      }

      // Add diagnostics from parse result
      for (const diagnostic of result.diagnostics) {
        graph.diagnostics.push(diagnostic);
      }

      parserStatus = result.parserStatus;
      parserAdapter = result.parserAdapter;
      if (result.parserStatus === "failed") {
        errorCode = "PARSER_FAILED";
        graph.stats.partial = true;
      }
    }

    graph.files.push({
      id: fileId,
      path: rel,
      language,
      role,
      hash: bodyHash,
      sizeBytes: Buffer.byteLength(body),
      lineCount: body.split(/\r?\n/).length,
      moduleId: `module:${rel}`,
      parser: {
        status: parserStatus,
        adapter: parserAdapter,
        errorCode,
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

    // Detect entrypoints
    if (isEntrypoint(rel, body)) {
      graph.entrypoints.push({
        id: `entrypoint:${rel}`,
        path: rel,
        kind: entrypointKind(rel),
      });
    }
  }

  // Add diagnostic if partial
  if (graph.stats.partial) {
    graph.diagnostics.push({
      id: `diag:${runId}:partial-graph`,
      severity: "warning",
      code: "PARTIAL_GRAPH",
      message: "Some files failed to parse, resulting in a partial graph",
    });
  }

  if (graphCacheKey) {
    graphCache.set(graphCacheKey, structuredClone(graph));
  }

  return graph;
}

/**
 * Build graph with cache support for incremental scanning
 * Uses streaming processing for large repos (5000+ files)
 */
function buildGraphWithCache(
  repoRoot: string,
  cacheManager: CacheManager,
  parallelWorkers: number,
  verbose: boolean
): NormalizedRepoGraph {
  const startTime = Date.now();
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
  const walkStart = Date.now();
  const allFiles = walkDir(repoRoot);

  // Filter for target file types
  const targetFiles = allFiles.filter(
    (file) =>
      /\.(ts|tsx|js|jsx|py|mjs|cjs|json|yaml|yml|md|txt)$/.test(file) &&
      !file.endsWith(".d.ts")
  );

  const isLargeRepo = targetFiles.length >= SCAN_LARGE_REPO_THRESHOLD;

  if (verbose) {
    console.log(JSON.stringify({
      phase: "file-discovery",
      totalFiles: targetFiles.length,
      isLargeRepo,
      timeMs: Date.now() - walkStart,
    }));
  }

  // Validate cache (with streaming for large repos)
  const cacheStart = Date.now();
  const cacheResult = cacheManager.validateCache(targetFiles);

  if (verbose) {
    console.log(JSON.stringify({
      phase: "cache-validation",
      changedFiles: cacheResult.changedFiles.length,
      unchangedFiles: cacheResult.unchangedFiles.length,
      needsFullScan: cacheResult.needsFullScan,
      isLargeRepo,
      timeMs: Date.now() - cacheStart,
    }));
  }

  // Create processor with appropriate settings for repo size
  const processor = new FileProcessor({
    repoRoot,
    maxWorkers: parallelWorkers,
    batchSize: isLargeRepo ? Math.min(200, Math.ceil(targetFiles.length / parallelWorkers / 2)) : 50,
    chunkSize: isLargeRepo ? 500 : undefined,
    useWorkers: targetFiles.length > 100 && parallelWorkers > 1,
    streamingMode: isLargeRepo,
    verbose,
    lazySymbols: isLargeRepo,
  });

  const parseStart = Date.now();
  // If cache hit rate is 100% (no changed files), still process all files to build graph
  const filesToProcess = (cacheResult.needsFullScan || cacheResult.changedFiles.length === 0)
    ? targetFiles
    : cacheResult.changedFiles;

  // Progress callback for large repos
  const onProgress = (progress: ProcessingProgressEvent) => {
    if (verbose && isLargeRepo) {
      console.log(JSON.stringify({
        phase: progress.phase,
        processedFiles: progress.processedFiles,
        totalFiles: progress.totalFiles,
        batchNumber: progress.batchNumber,
        totalBatches: progress.totalBatches,
        elapsedMs: progress.elapsedMs,
        filesPerSecond: Math.round(progress.filesPerSecond),
      }));
    }
  };

  // Graph builder callback for streaming processing
  const graphBuilder = (results: ReturnType<typeof processor.processFile>[]) => {
    for (const result of results) {
      graph.files.push(result.file);

      if (result.parseResult) {
        for (const symbol of result.parseResult.symbols) {
          graph.symbols.push(symbol);
        }
        for (const relation of result.parseResult.relations) {
          graph.relations.push(relation);
        }
        for (const diagnostic of result.parseResult.diagnostics) {
          graph.diagnostics.push(diagnostic);
        }

        if (result.parseResult.parserStatus === "failed") {
          graph.stats.partial = true;
        }
      }

      // Update cache for this file
      if (cacheManager.isEnabled()) {
        cacheManager.getFileHash(path.join(repoRoot, result.file.path));
      }

      // Add to configs/tests
      if (result.file.role === "config") {
        graph.configs.push({ id: `config:${result.file.path}`, path: result.file.path });
      }
      if (result.file.role === "test") {
        graph.tests.push({
          id: `test:${result.file.path}`,
          path: result.file.path,
          framework: result.file.path.endsWith(".py") ? "pytest" : result.file.path.endsWith(".js") ? "node:test" : "vitest",
        });
      }
    }
  };

  // For large repos, use streaming processing
  if (isLargeRepo) {
    // Use streaming mode with memory-efficient processing
    // Note: We need to handle this synchronously for the current scan architecture
    // but we'll use batch processing for memory efficiency
    const batchSize = Math.min(200, Math.ceil(filesToProcess.length / parallelWorkers / 2));
    const totalBatches = Math.ceil(filesToProcess.length / batchSize);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, filesToProcess.length);
      const batchFiles = filesToProcess.slice(batchStart, batchEnd);

      // Process batch
      for (const file of batchFiles) {
        const result = processor.processFile(file);
        graphBuilder([result]);

        // Check for entrypoints (only for source files)
        if (result.file.role === "source") {
          try {
            const content = readFileSync(file, "utf8");
            if (isEntrypoint(result.file.path, content)) {
              graph.entrypoints.push({
                id: `entrypoint:${result.file.path}`,
                path: result.file.path,
                kind: entrypointKind(result.file.path),
              });
            }
          } catch {
            // Skip if file cannot be read
          }
        }
      }

      // Emit batch progress
      if (verbose) {
        console.log(JSON.stringify({
          phase: "batch-processing",
          batchNumber: batchIndex + 1,
          totalBatches,
          processedFiles: batchEnd,
          totalFiles: filesToProcess.length,
          elapsedMs: Date.now() - parseStart,
        }));
      }

      // Periodically clear lazy symbol cache for memory efficiency
      if (batchIndex % 5 === 0) {
        processor.clearLazySymbolCache();
      }
    }
  } else {
    // Standard processing for smaller repos
    for (const file of filesToProcess) {
      const result = processor.processFile(file);
      graphBuilder([result]);

      // Check for entrypoints
      const content = readFileSync(file, "utf8");
      if (isEntrypoint(result.file.path, content)) {
        graph.entrypoints.push({
          id: `entrypoint:${result.file.path}`,
          path: result.file.path,
          kind: entrypointKind(result.file.path),
        });
      }
    }
  }

  processor.terminate();

  if (verbose) {
    console.log(JSON.stringify({
      phase: "file-parsing",
      filesProcessed: filesToProcess.length,
      isLargeRepo,
      timeMs: Date.now() - parseStart,
    }));
  }

  // Add diagnostic if partial
  if (graph.stats.partial) {
    graph.diagnostics.push({
      id: `diag:${runId}:partial-graph`,
      severity: "warning",
      code: "PARTIAL_GRAPH",
      message: "Some files failed to parse, resulting in a partial graph",
    });
  }

  const totalTime = Date.now() - startTime;

  if (verbose) {
    const cacheStats = cacheManager.getStats();
    console.log(JSON.stringify({
      phase: "complete",
      totalTimeMs: totalTime,
      isLargeRepo,
      fileCount: graph.files.length,
      symbolCount: graph.symbols.length,
      relationCount: graph.relations.length,
      cacheStats: {
        hitRate: cacheStats.fileHash.hitRate,
        filesCached: cacheStats.overall.filesCached,
        filesChanged: cacheStats.overall.filesChanged,
      },
    }));
  }

  return graph;
}

export function scanCommand(args: string[], options: ScanOptions): number {
  const repoArg = args[0];
  const outDir = options.getOption(args, "--out") ?? ".qh";
  const cacheModeValue = options.getOption(args, "--cache");
  const parallelValue = options.getOption(args, "--parallel");
  const verbose = isVerbose(args);

  if (!repoArg) {
    console.error("usage: code-to-gate scan <repo> --out <dir> [--cache <mode>] [--parallel <n>] [--verbose]");
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

  // Parse options
  const cacheMode = parseCacheMode(cacheModeValue);
  const parallelWorkers = parseParallelWorkers(parallelValue);

  const absoluteOutDir = path.resolve(cwd, outDir);
  ensureDir(absoluteOutDir);

  // Create cache manager
  const cacheDir = path.join(absoluteOutDir, ".cache");
  const cacheManager = new CacheManager(repoRoot, {
    enabled: cacheMode !== "disabled",
    cacheDir,
    forceRescan: cacheMode === "force",
    computeBlastRadius: true,
  });

  // Initialize cache
  cacheManager.initialize();

  try {
    // Build graph with cache support
    const graph = buildGraphWithCache(repoRoot, cacheManager, parallelWorkers, verbose);

    writeJson(path.join(absoluteOutDir, "repo-graph.json"), graph);

    // Save cache
    if (cacheManager.isEnabled()) {
      cacheManager.save();
    }

    const artifactPath = path.join(outDir, "repo-graph.json");
    const output: Record<string, unknown> = {
      tool: "code-to-gate",
      command: "scan",
      artifact: artifactPath,
      fileCount: graph.files.length,
      symbolCount: graph.symbols.length,
      relationCount: graph.relations.length,
    };

    if (cacheManager.isEnabled()) {
      output.cacheMode = cacheMode;
      output.cacheStats = cacheManager.getStats();
    }

    console.log(JSON.stringify(output));

    // Exit code 0 if files found, 3 (SCAN_FAILED) if empty
    return graph.files.length > 0 ? options.EXIT.OK : options.EXIT.SCAN_FAILED;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.SCAN_FAILED;
  }
}
