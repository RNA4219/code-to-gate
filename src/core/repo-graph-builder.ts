import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import { parseJavaScriptFile } from "../adapters/js-adapter.js";
import { parsePythonFile } from "../adapters/py-adapter.js";
import { parseRubyFile } from "../adapters/rb-adapter.js";
import { parseRegexLanguageFile, type RegexLanguage } from "../adapters/regex-language-adapter.js";
import { parseTypeScriptFile, type ParseResult } from "../adapters/ts-adapter.js";
// Tree-sitter adapters
import {
  initPythonParser,
  parsePythonTreeSitter,
  parsePythonFileSync,
  isTreeSitterAvailable as isPythonTreeSitterAvailable,
} from "../adapters/py-tree-sitter-adapter.js";
import {
  initRubyParser,
  parseRubyTreeSitter,
  parseRubyFileSync,
  isRubyTreeSitterAvailable as isRubyTreeSitterAvailable,
} from "../adapters/rb-tree-sitter-adapter.js";
import {
  initGoParser,
  parseGoTreeSitter,
  parseGoFileSync,
  isGoTreeSitterAvailable,
} from "../adapters/go-tree-sitter-adapter.js";
import {
  initRustParser,
  parseRustTreeSitter,
  parseRustFileSync,
  isRustTreeSitterAvailable,
} from "../adapters/rs-tree-sitter-adapter.js";
import type { NormalizedRepoGraph, RepoFile } from "../types/artifacts.js";
import { CTG_VERSION } from "../types/artifacts.js";
import { detectLanguage, detectRole, entrypointKind, isEntrypoint, walkDir } from "./file-utils.js";
import { sha256, toPosix } from "./path-utils.js";

type AdapterParseResult = ParseResult;

const parseCache = new Map<string, AdapterParseResult>();
const graphCache = new Map<string, NormalizedRepoGraph>();

// Tree-sitter initialization state
let treeSitterInitialized = false;

export async function initTreeSitterParsers(): Promise<void> {
  if (treeSitterInitialized) return;

  try {
    await initPythonParser();
    await initRubyParser();
    await initGoParser();
    await initRustParser();
    treeSitterInitialized = true;
  } catch (error) {
    console.warn("Tree-sitter initialization failed:", error);
  }
}

export function isTreeSitterReady(): boolean {
  return treeSitterInitialized;
}

export function createEmptyRepoGraph(repoRoot: string, toolVersion: string): NormalizedRepoGraph {
  const now = new Date().toISOString();
  const relativeRoot = toPosix(path.relative(process.cwd(), repoRoot) || ".");
  const runId = `ctg-${now.replace(/[-:.TZ]/g, "").slice(0, 12)}`;

  return {
    version: CTG_VERSION,
    generated_at: now,
    run_id: runId,
    repo: { root: relativeRoot },
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
  return /\.(ts|tsx|js|jsx|py|rb|go|rs|java|php|mjs|cjs|json|yaml|yml|md|txt)$/.test(filePath) && !filePath.endsWith(".d.ts");
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

function getCachedParseResult(
  language: RepoFile["language"],
  file: string,
  repoRoot: string,
  fileId: string,
  bodyHash: string,
  useTreeSitter: boolean = false
): AdapterParseResult | undefined {
  if (!["ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "java", "php"].includes(language)) {
    return undefined;
  }

  const cacheKey = `${language}:${file}:${bodyHash}:${useTreeSitter}:${treeSitterInitialized}`;
  const cached = parseCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Try tree-sitter first if available (automatic when initialized)
  // This enables tree-sitter for py/rb/go/rs even without --tree-sitter flag
  if (treeSitterInitialized && ["py", "rb", "go", "rs"].includes(language)) {
    const tsResult = tryTreeSitterParse(language, file, repoRoot, fileId);
    if (tsResult) {
      parseCache.set(cacheKey, tsResult);
      return tsResult;
    }
  }

  // Try tree-sitter if explicitly requested
  if (useTreeSitter) {
    const tsResult = tryTreeSitterParse(language, file, repoRoot, fileId);
    if (tsResult) {
      parseCache.set(cacheKey, tsResult);
      return tsResult;
    }
  }

  // Fallback to regex/standard parsers
  const result =
    language === "ts" || language === "tsx"
      ? parseTypeScriptFile(file, repoRoot, fileId)
      : language === "js" || language === "jsx"
        ? parseJavaScriptFile(file, repoRoot, fileId)
        : language === "py"
          ? parsePythonFile(file, repoRoot, fileId)
          : language === "rb"
            ? parseRubyFile(file, repoRoot, fileId)
            : parseRegexLanguageFile(file, repoRoot, fileId, language as RegexLanguage);

  parseCache.set(cacheKey, result);
  return result;
}

function tryTreeSitterParse(
  language: string,
  file: string,
  repoRoot: string,
  fileId: string
): AdapterParseResult | undefined {
  const body = readFileSync(file, "utf8");
  const relPath = toPosix(path.relative(repoRoot, file));

  if (language === "py" && isPythonTreeSitterAvailable()) {
    return parsePythonFileSync(body, relPath);
  }
  if (language === "rb" && isRubyTreeSitterAvailable()) {
    return parseRubyFileSync(body, relPath);
  }
  if (language === "go" && isGoTreeSitterAvailable()) {
    return parseGoFileSync(body, relPath);
  }
  if (language === "rs" && isRustTreeSitterAvailable()) {
    return parseRustFileSync(body, relPath);
  }

  return undefined;
}

export function buildGraph(repoRoot: string, toolVersion: string, useTreeSitter: boolean = false): NormalizedRepoGraph {
  const targetFiles = discoverGraphFiles(repoRoot);
  const shouldUseGraphCache = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  const graphCacheKey = shouldUseGraphCache
    ? `${repoRoot}:${targetFiles
        .map((file) => {
          const stat = statSync(file);
          return `${file}:${stat.size}:${stat.mtimeMs}`;
        })
        .join("|")}:${useTreeSitter}`
    : undefined;

  if (graphCacheKey) {
    const cachedGraph = graphCache.get(graphCacheKey);
    if (cachedGraph) {
      return structuredClone(cachedGraph);
    }
  }

  const graph = createEmptyRepoGraph(repoRoot, toolVersion);

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

    const result = getCachedParseResult(language, file, repoRoot, fileId, bodyHash, useTreeSitter);
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
      moduleId: `module:${rel}`,
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
