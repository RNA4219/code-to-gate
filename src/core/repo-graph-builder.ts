/**
 * Repo Graph Builder - Core module for building normalized repository graphs
 *
 * Refactored to accept parser registry via options (composition root pattern).
 * No direct imports from adapter modules - parsers injected via ParserRegistry.
 *
 * Layer rules:
 * - core: Uses ParserRegistry interface (no adapter imports)
 * - adapters: Implements parser registry with adapter registrations
 * - cli: Injects DefaultParserRegistry (composition root)
 */

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { NormalizedRepoGraph, RepoFile, RepoModule, RepoRef } from "../types/artifacts.js";
import { CTG_VERSION } from "../types/artifacts.js";
import type { ParserRegistry, ParserAdapterResult } from "../types/contracts.js";
import { detectLanguage, detectRole, entrypointKind, isEntrypoint, isGeneratedVendoredOrMinifiedPath, walkDir } from "./file-utils.js";
import { sha256, toPosix } from "./path-utils.js";

/**
 * Options for buildGraph function
 */
export interface BuildGraphOptions {
  /** Parser registry with registered adapters (injected by CLI) */
  parserRegistry?: ParserRegistry;
  /** Explicitly request tree-sitter parsing (deprecated - registry handles this) */
  useTreeSitter?: boolean;
}

// Parse cache for incremental processing
const parseCache = new Map<string, ParserAdapterResult>();
const graphCache = new Map<string, NormalizedRepoGraph>();

function runGit(repoRoot: string, args: string[]): string | undefined {
  const result = spawnSync("git", ["-c", `safe.directory=${toPosix(repoRoot)}`, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    return undefined;
  }
  return result.stdout.trim();
}

function readRepoRef(repoRoot: string): RepoRef {
  const relativeRoot = toPosix(path.relative(process.cwd(), repoRoot) || ".");
  const repo: RepoRef = { root: relativeRoot };

  if (runGit(repoRoot, ["rev-parse", "--is-inside-work-tree"]) !== "true") {
    return repo;
  }

  const revision = runGit(repoRoot, ["rev-parse", "--short=12", "HEAD"]);
  if (revision) {
    repo.revision = revision;
  }

  const branch = runGit(repoRoot, ["branch", "--show-current"]);
  if (branch) {
    repo.branch = branch;
  }

  const status = runGit(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  repo.dirty = status !== undefined ? status.length > 0 : undefined;
  return repo;
}

function detectPackageManager(repoRoot: string): RepoModule["packageManager"] {
  const lockfiles: Array<[string, RepoModule["packageManager"]]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ];

  for (const [lockfile, manager] of lockfiles) {
    try {
      statSync(path.join(repoRoot, lockfile));
      return manager;
    } catch {
      // Keep probing other package managers.
    }
  }

  return "unknown";
}

function collectWorkspaceModules(repoRoot: string): RepoModule[] {
  const packageManager = detectPackageManager(repoRoot);
  return walkDir(repoRoot)
    .filter((file) => path.basename(file) === "package.json")
    .flatMap((packageFile): RepoModule[] => {
      try {
        const packageJson = JSON.parse(readFileSync(packageFile, "utf8")) as {
          name?: string;
          version?: string;
          dependencies?: Record<string, unknown>;
          devDependencies?: Record<string, unknown>;
          workspaces?: unknown;
        };
        const modulePath = toPosix(path.relative(repoRoot, path.dirname(packageFile)) || ".");
        return [{
          id: `module:${modulePath}`,
          path: modulePath,
          name: packageJson.name,
          version: packageJson.version,
          packageManager,
          workspace: modulePath === "." ? Array.isArray(packageJson.workspaces) || Boolean(packageJson.workspaces) : true,
          dependencies: [
            ...Object.keys(packageJson.dependencies ?? {}),
            ...Object.keys(packageJson.devDependencies ?? {}),
          ].sort(),
        }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function moduleIdForFile(modules: RepoModule[], relPath: string): string | undefined {
  const owner = modules
    .filter((module) => module.path === "." || relPath === module.path || relPath.startsWith(`${module.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return owner?.id;
}

export function createEmptyRepoGraph(repoRoot: string, toolVersion: string): NormalizedRepoGraph {
  const now = new Date().toISOString();
  const repo = readRepoRef(repoRoot);
  const commitSha = process.env.GITHUB_SHA?.slice(0, 7) || "local";
  const runId = `ctg-${now.replace(/[-:.TZ]/g, "").slice(0, 12)}-${commitSha}`;

  return {
    version: CTG_VERSION,
    generated_at: now,
    run_id: runId,
    repo,
    tool: { name: "code-to-gate", version: toolVersion, plugin_versions: [] },
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
}

export function isGraphTargetFile(filePath: string): boolean {
  return /\.(ts|tsx|js|jsx|py|rb|go|rs|java|php|cs|cpp|cc|cxx|hpp|hxx|mjs|cjs|json|yaml|yml|md|txt)$/.test(filePath) && !isGeneratedVendoredOrMinifiedPath(filePath);
}

export function discoverGraphFiles(repoRoot: string): string[] {
  return walkDir(repoRoot).filter(isGraphTargetFile);
}

export function addPartialGraphDiagnostic(graph: NormalizedRepoGraph): void {
  if (!graph.stats.partial) {
    return;
  }

  graph.diagnostics.push({
    id: `diag:${graph.run_id}:partial-graph`,
    severity: "warning",
    code: "PARTIAL_GRAPH",
    message: "Some files failed to parse, resulting in a partial graph",
  });
}

export function addGraphClassifications(graph: NormalizedRepoGraph, file: RepoFile, body?: string): void {
  if (file.role === "config") {
    graph.configs.push({ id: `config:${file.path}`, path: file.path });
  }

  if (file.role === "test") {
    graph.tests.push({
      id: `test:${file.path}`,
      path: file.path,
      framework: file.path.endsWith(".py")
        ? "pytest"
        : file.path.endsWith(".rb")
          ? file.path.includes("spec") ? "rspec" : "minitest"
          : file.path.endsWith(".go")
            ? "go test"
            : file.path.endsWith(".rs")
              ? "cargo test"
              : file.path.endsWith(".java")
                ? "junit"
                : file.path.endsWith(".php")
                  ? "phpunit"
                  : file.path.endsWith(".cs")
                    ? "xunit"
                    : /\.(cpp|cc|cxx)$/.test(file.path)
                      ? "gtest"
                  : file.path.endsWith(".js") ? "node:test" : "vitest",
    });
  }

  if (body !== undefined) {
    addGraphEntrypoint(graph, file.path, body);
  }
}

export function addGraphEntrypoint(graph: NormalizedRepoGraph, relPath: string, body: string): void {
  if (isEntrypoint(relPath, body)) {
    graph.entrypoints.push({
      id: `entrypoint:${relPath}`,
      path: relPath,
      kind: entrypointKind(relPath),
    });
  }
}

/**
 * Get cached parse result using registry
 * Returns undefined if no parser available for language
 */
function getCachedParseResult(
  registry: ParserRegistry | undefined,
  language: RepoFile["language"],
  file: string,
  repoRoot: string,
  fileId: string,
  bodyHash: string,
  body: string
): ParserAdapterResult | undefined {
  // Skip parsing for non-code files
  if (!["ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "java", "php", "cs", "cpp"].includes(language)) {
    return undefined;
  }

  // Without registry, no parsing available
  if (!registry) {
    return undefined;
  }

  // Check if parser available for this language
  if (!registry.hasParser(language)) {
    return undefined;
  }

  // Build cache key
  const treeSitterReady = registry.isTreeSitterReady();
  const cacheKey = `${language}:${file}:${bodyHash}:${treeSitterReady}`;
  const cached = parseCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Get parser from registry and parse
  const repoFile: RepoFile = {
    id: fileId,
    path: toPosix(path.relative(repoRoot, file)),
    language,
    role: "source", // temporary for parser lookup
    hash: bodyHash,
    sizeBytes: Buffer.byteLength(body),
    lineCount: body.split(/\r?\n/).length,
    parser: { status: "skipped" },
  };

  const parser = registry.getParser(repoFile);
  if (!parser || !parser.isAvailable()) {
    return undefined;
  }

  const result = parser.parse(body, file, repoRoot, fileId);
  parseCache.set(cacheKey, result);
  return result;
}

/**
 * Build normalized repo graph from repository root
 *
 * @param repoRoot - Absolute path to repository root
 * @param toolVersion - Version string for tool metadata
 * @param options - Build options including parser registry
 * @returns Normalized repo graph with files, symbols, relations, diagnostics
 */
export function buildGraph(
  repoRoot: string,
  toolVersion: string,
  options?: BuildGraphOptions
): NormalizedRepoGraph {
  // For backward compatibility, support useTreeSitter boolean parameter
  const normalizedOptions: BuildGraphOptions = typeof options === "boolean"
    ? { useTreeSitter: options }
    : options ?? {};

  const targetFiles = discoverGraphFiles(repoRoot);
  const shouldUseGraphCache = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  const graphCacheKey = shouldUseGraphCache
    ? `${repoRoot}:${targetFiles
        .map((file) => {
          const stat = statSync(file);
          return `${file}:${stat.size}:${stat.mtimeMs}`;
        })
        .join("|")}:${normalizedOptions.useTreeSitter}`
    : undefined;

  if (graphCacheKey) {
    const cachedGraph = graphCache.get(graphCacheKey);
    if (cachedGraph) {
      return structuredClone(cachedGraph);
    }
  }

  const graph = createEmptyRepoGraph(repoRoot, toolVersion);
  graph.modules = collectWorkspaceModules(repoRoot);

  for (const file of targetFiles) {
    const rel = toPosix(path.relative(repoRoot, file));
    const body = readFileSync(file, "utf8");
    const bodyHash = sha256(body);
    const language = detectLanguage(file);
    const role = detectRole(rel);
    const fileId = `file:${rel}`;

    let parserStatus: RepoFile["parser"]["status"] = "skipped";
    let parserAdapter = "ctg-text-v0";
    let errorCode: string | undefined;

    const result = getCachedParseResult(
      normalizedOptions.parserRegistry,
      language,
      file,
      repoRoot,
      fileId,
      bodyHash,
      body
    );

    if (result) {
      graph.symbols.push(...result.symbols);
      graph.relations.push(...result.relations);
      graph.diagnostics.push(...result.diagnostics);

      parserStatus = result.parserStatus;
      parserAdapter = result.parserAdapter;
      if (result.parserStatus === "failed") {
        errorCode = "PARSER_FAILED";
        graph.stats.partial = true;
      }
    }

    const repoFile: RepoFile = {
      id: fileId,
      path: rel,
      language,
      role,
      hash: bodyHash,
      sizeBytes: Buffer.byteLength(body),
      lineCount: body.split(/\r?\n/).length,
      moduleId: moduleIdForFile(graph.modules, rel),
      parser: {
        status: parserStatus,
        adapter: parserAdapter,
        errorCode,
      },
    };

    graph.files.push(repoFile);
    addGraphClassifications(graph, repoFile, body);
  }

  addPartialGraphDiagnostic(graph);

  if (graphCacheKey) {
    graphCache.set(graphCacheKey, structuredClone(graph));
  }

  return graph;
}

/**
 * Clear parse cache (for testing)
 */
export function clearParseCache(): void {
  parseCache.clear();
}

/**
 * Clear graph cache (for testing)
 */
export function clearGraphCache(): void {
  graphCache.clear();
}
