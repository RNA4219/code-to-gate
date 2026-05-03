import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ensureDir, writeJson } from "../core/file-utils.js";
import {
  addGraphEntrypoint,
  addGraphClassifications,
  addPartialGraphDiagnostic,
  createEmptyRepoGraph,
  discoverGraphFiles,
} from "../core/repo-graph-builder.js";
import { EXIT, getOption, VERSION, parseCacheMode, parseParallelWorkers, isVerbose } from "./exit-codes.js";
import { CacheManager, type CacheMode, LARGE_REPO_THRESHOLD } from "../cache/index.js";
import { FileProcessor, type ProcessingProgressEvent } from "../parallel/index.js";
import type { NormalizedRepoGraph } from "../types/artifacts.js";
import { initPythonParser, isTreeSitterAvailable } from "../adapters/py-tree-sitter-adapter.js";
import { initRubyParser, isRubyTreeSitterAvailable } from "../adapters/rb-tree-sitter-adapter.js";

/**
 * Threshold for large repo processing
 */
const SCAN_LARGE_REPO_THRESHOLD = LARGE_REPO_THRESHOLD;

interface ScanOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

/**
 * Build graph with cache support for incremental scanning
 * Uses streaming processing for large repos (5000+ files)
 */
function buildGraphWithCache(
  repoRoot: string,
  cacheManager: CacheManager,
  parallelWorkers: number,
  verbose: boolean,
  useTreeSitter: boolean = false,
  treeSitterAvailable: boolean = false
): NormalizedRepoGraph {
  const startTime = Date.now();
  const graph = createEmptyRepoGraph(repoRoot, VERSION);

  // Walk the directory to find all files
  const walkStart = Date.now();
  const targetFiles = discoverGraphFiles(repoRoot);

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
    useTreeSitter,
    treeSitterAvailable,
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

      addGraphClassifications(graph, result.file);
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
            addGraphEntrypoint(graph, result.file.path, content);
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
      addGraphEntrypoint(graph, result.file.path, content);
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
  addPartialGraphDiagnostic(graph);

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

export async function scanCommand(args: string[], options: ScanOptions): Promise<number> {
  const repoArg = args[0];
  const outDir = options.getOption(args, "--out") ?? ".qh";
  const cacheModeValue = options.getOption(args, "--cache");
  const parallelValue = options.getOption(args, "--parallel");
  const useTreeSitter = args.includes("--tree-sitter");
  const verbose = isVerbose(args);

  if (!repoArg) {
    console.error("usage: code-to-gate scan <repo> --out <dir> [--cache <mode>] [--parallel <n>] [--tree-sitter] [--verbose]");
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

  // Initialize tree-sitter parsers if requested
  let treeSitterAvailable = false;
  if (useTreeSitter) {
    const [pyAvailable, rbAvailable] = await Promise.all([
      initPythonParser(),
      initRubyParser(),
    ]);
    treeSitterAvailable = pyAvailable || rbAvailable;

    if (verbose) {
      console.log(JSON.stringify({
        phase: "tree-sitter-init",
        python: pyAvailable,
        ruby: rbAvailable,
        available: treeSitterAvailable,
      }));
    }
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
    const graph = buildGraphWithCache(repoRoot, cacheManager, parallelWorkers, verbose, useTreeSitter, treeSitterAvailable);

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
