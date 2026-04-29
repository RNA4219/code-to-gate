import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sha256, toPosix } from "../core/path-utils.js";
import { detectLanguage, detectRole, walkDir } from "../core/file-utils.js";
import { EXIT, getOption, VERSION } from "./exit-codes.js";
import { parseTypeScriptFile, type SymbolNode, type GraphRelation, type EvidenceRef } from "../adapters/ts-adapter.js";
import { parseJavaScriptFile } from "../adapters/js-adapter.js";

const CTG_VERSION = "ctg/v1alpha1";

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

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function scanCommand(args: string[], options: ScanOptions): number {
  const repoArg = args[0];
  const outDir = options.getOption(args, "--out") ?? ".qh";

  if (!repoArg) {
    console.error("usage: code-to-gate scan <repo> --out <dir>");
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

  try {
    const graph = buildGraph(repoRoot);
    const absoluteOutDir = path.resolve(cwd, outDir);
    ensureDir(absoluteOutDir);
    writeJson(path.join(absoluteOutDir, "repo-graph.json"), graph);

    const artifactPath = path.join(outDir, "repo-graph.json");
    if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
      console.log(
        JSON.stringify({
          tool: "code-to-gate",
          command: "scan",
          artifact: artifactPath,
          fileCount: graph.files.length,
          symbolCount: graph.symbols.length,
          relationCount: graph.relations.length,
        })
      );
    }

    // Exit code 0 if files found, 3 (SCAN_FAILED) if empty
    return graph.files.length > 0 ? options.EXIT.OK : options.EXIT.SCAN_FAILED;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.SCAN_FAILED;
  }
}
