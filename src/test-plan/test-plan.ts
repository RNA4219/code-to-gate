import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  NormalizedRepoGraph,
  RepoFile,
  TestPlanArtifact,
  TestPlanItem,
  TestPlanOracleGap,
  TestPlanLevel,
} from "../types/artifacts.js";

interface DiffChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
}

interface DiffAnalysisInput {
  generated_at?: string;
  run_id?: string;
  repo?: { root?: string; base_ref?: string; head_ref?: string };
  changed_files?: DiffChangedFile[];
  blast_radius?: {
    affectedFiles?: string[];
    affectedTests?: string[];
    affectedEntrypoints?: string[];
  };
}

export interface TestPlanOptions {
  version: string;
  fromDir?: string;
  out?: string;
  now?: Date;
}

export interface TestPlanResult {
  artifact: TestPlanArtifact;
  outputPath: string;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function artifactPath(fromDir: string, fileName: string): string {
  return path.resolve(process.cwd(), fromDir, fileName);
}

function loadRepoGraph(fromDir: string): NormalizedRepoGraph {
  const graphPath = artifactPath(fromDir, "repo-graph.json");
  if (!existsSync(graphPath)) {
    throw new Error(`repo-graph.json not found in artifact directory: ${fromDir}`);
  }
  return readJson<NormalizedRepoGraph>(graphPath);
}

function loadDiffAnalysis(fromDir: string): DiffAnalysisInput | null {
  const diffPath = artifactPath(fromDir, "diff-analysis.json");
  if (!existsSync(diffPath)) {
    return null;
  }
  return readJson<DiffAnalysisInput>(diffPath);
}

function outputPath(fromDir: string, out: string | undefined): string {
  if (!out) {
    return artifactPath(fromDir, "test-plan.json");
  }
  const absolute = path.resolve(process.cwd(), out);
  return out.endsWith(".json") ? absolute : path.join(absolute, "test-plan.json");
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function isTestFile(file: RepoFile): boolean {
  return (
    file.role === "test" ||
    /(^|\/)(__tests__|tests?)\//.test(file.path) ||
    /\.(test|spec)\.[^.]+$/.test(file.path)
  );
}

function isSourceLike(file: RepoFile): boolean {
  return file.role === "source" && ["ts", "tsx", "js", "jsx", "py", "go", "rb", "rs", "java", "php", "cs", "cpp"].includes(file.language);
}

function withoutExtension(filePath: string): string {
  return filePath.replace(/\.[^.]+$/, "");
}

function sourceKey(sourcePath: string): string {
  const noExt = withoutExtension(sourcePath);
  const base = path.posix.basename(noExt);
  return base === "index" ? path.posix.basename(path.posix.dirname(noExt)) : base;
}

function relatedTests(sourcePath: string, tests: RepoFile[]): RepoFile[] {
  const noExt = withoutExtension(sourcePath);
  const key = sourceKey(sourcePath).toLowerCase();
  const exactCandidates = new Set([
    `${noExt}.test.ts`,
    `${noExt}.spec.ts`,
    `${noExt}.test.tsx`,
    `${noExt}.spec.tsx`,
    `${noExt}.test.js`,
    `${noExt}.spec.js`,
    `${noExt}_test.py`,
    `${noExt}_test.go`,
  ]);

  return tests.filter((test) => {
    if (exactCandidates.has(test.path)) {
      return true;
    }
    const normalized = test.path.toLowerCase();
    return key.length > 2 && normalized.includes(key) && isTestFile(test);
  });
}

function inferLevel(testPath: string): TestPlanLevel {
  if (/e2e|playwright|cypress/.test(testPath)) return "e2e";
  if (/integration|integ/.test(testPath)) return "integration";
  if (/smoke/.test(testPath)) return "smoke";
  return "unit";
}

function inferCommand(testPath: string): string {
  if (testPath.endsWith(".py")) return `pytest ${testPath}`;
  if (testPath.endsWith(".go")) return "go test ./...";
  if (testPath.endsWith(".rb")) return `bundle exec ruby ${testPath}`;
  return `npm test -- ${testPath}`;
}

function createTestItem(
  index: number,
  testPath: string,
  sourcePaths: string[],
  reason: string,
  evidencePath: string
): TestPlanItem {
  return {
    id: `test-plan-${String(index).padStart(3, "0")}`,
    title: `Run ${testPath}`,
    target: testPath,
    level: inferLevel(testPath),
    priority: sourcePaths.length > 1 ? "high" : "medium",
    reason,
    sourcePaths: unique(sourcePaths),
    evidence: [{ path: evidencePath, detail: reason }],
    command: inferCommand(testPath),
  };
}

function createManualEntrypointItem(index: number, entrypointPath: string, sourcePaths: string[]): TestPlanItem {
  return {
    id: `test-plan-${String(index).padStart(3, "0")}`,
    title: `Manually smoke test ${entrypointPath}`,
    target: entrypointPath,
    level: "manual",
    priority: "high",
    reason: "Affected entrypoint has no deterministic test mapping in repo graph.",
    sourcePaths: unique(sourcePaths),
    evidence: [{ path: "diff-analysis.json", detail: "blast_radius.affectedEntrypoints" }],
  };
}

function createOracleGap(index: number, sourcePath: string): TestPlanOracleGap {
  const title = `Manual regression check for ${sourcePath}`;
  return {
    id: `oracle-gap-${String(index).padStart(3, "0")}`,
    sourcePath,
    reason: "No related automated test was found for this changed source file.",
    suggestedManualTest: `Define expected behavior for ${sourcePath} and add a focused regression or manual black-box check.`,
    manualTestDraft: {
      title,
      objective: `Verify the externally observable behavior affected by ${sourcePath}.`,
      steps: [
        "Open the user-facing workflow or API path that exercises the changed source file.",
        "Run the primary successful path with representative input.",
        "Run one boundary or negative input that could expose the changed behavior.",
        "Record the observed result and attach any relevant logs, screenshots, or response payloads.",
      ],
      expectedResult: "Behavior matches the documented requirement and no new error, data loss, or confusing user-facing state is observed.",
      priority: "high",
      sourcePath,
    },
    evidence: [{ path: "diff-analysis.json", detail: "changed file has no matching test path" }],
  };
}

function buildRecommendations(
  graph: NormalizedRepoGraph,
  diff: DiffAnalysisInput | null
): {
  changedFiles: string[];
  affectedFiles: string[];
  recommendedTests: TestPlanItem[];
  oracleGaps: TestPlanOracleGap[];
} {
  const changedFiles = unique((diff?.changed_files ?? []).map((file) => file.path));
  const changedDeleted = new Set((diff?.changed_files ?? []).filter((file) => file.status === "deleted").map((file) => file.path));
  const affectedFiles = unique([...(diff?.blast_radius?.affectedFiles ?? []), ...changedFiles]);
  const affectedTests = unique(diff?.blast_radius?.affectedTests ?? []);
  const tests = graph.files.filter(isTestFile);
  const fileByPath = new Map(graph.files.map((file) => [file.path, file]));
  const testSources = new Map<string, Set<string>>();
  const coveredSources = new Set<string>();

  for (const testPath of affectedTests) {
    testSources.set(testPath, new Set(changedFiles));
  }

  for (const sourcePath of affectedFiles) {
    if (changedDeleted.has(sourcePath)) continue;
    const file = fileByPath.get(sourcePath);
    if (file && isTestFile(file)) {
      const sources = testSources.get(file.path) ?? new Set<string>();
      sources.add(file.path);
      testSources.set(file.path, sources);
      coveredSources.add(file.path);
      continue;
    }
    if (file && !isSourceLike(file)) continue;

    for (const test of relatedTests(sourcePath, tests)) {
      const sources = testSources.get(test.path) ?? new Set<string>();
      sources.add(sourcePath);
      testSources.set(test.path, sources);
      coveredSources.add(sourcePath);
    }
  }

  const recommendedTests: TestPlanItem[] = [];
  let testIndex = 1;
  for (const [testPath, sources] of [...testSources.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    recommendedTests.push(createTestItem(
      testIndex++,
      testPath,
      [...sources],
      affectedTests.includes(testPath)
        ? "Test was listed in diff blast radius."
        : "Test path matched changed source path.",
      affectedTests.includes(testPath) ? "diff-analysis.json" : "repo-graph.json"
    ));
  }

  for (const entrypointPath of unique(diff?.blast_radius?.affectedEntrypoints ?? [])) {
    if (![...testSources.values()].some((sources) => sources.has(entrypointPath))) {
      recommendedTests.push(createManualEntrypointItem(testIndex++, entrypointPath, changedFiles));
    }
  }

  const oracleGaps: TestPlanOracleGap[] = [];
  let gapIndex = 1;
  for (const sourcePath of affectedFiles) {
    if (changedDeleted.has(sourcePath)) continue;
    const file = fileByPath.get(sourcePath);
    if (file && !isSourceLike(file)) continue;
    if (!coveredSources.has(sourcePath)) {
      oracleGaps.push(createOracleGap(gapIndex++, sourcePath));
    }
  }

  return { changedFiles, affectedFiles, recommendedTests, oracleGaps };
}

function statusFor(changedFiles: string[], oracleGaps: TestPlanOracleGap[]): TestPlanArtifact["status"] {
  if (changedFiles.length === 0) return "no_changes";
  if (oracleGaps.length > 0) return "needs_manual_oracle";
  return "ready";
}

export function createTestPlan(options: TestPlanOptions): TestPlanResult {
  const fromDir = options.fromDir ?? ".qh";
  const graph = loadRepoGraph(fromDir);
  const diff = loadDiffAnalysis(fromDir);
  const generatedAt = (options.now ?? new Date()).toISOString();
  const output = outputPath(fromDir, options.out);
  const plan = buildRecommendations(graph, diff);
  const status = statusFor(plan.changedFiles, plan.oracleGaps);

  return {
    outputPath: output,
    artifact: {
      version: "ctg/v1",
      generated_at: generatedAt,
      run_id: `test-plan-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
      repo: graph.repo,
      tool: { name: "code-to-gate", version: options.version, plugin_versions: [] },
      artifact: "test-plan",
      schema: "test-plan@v1",
      completeness: diff ? "complete" : "partial",
      status,
      ...plan,
      summary: {
        changedFiles: plan.changedFiles.length,
        affectedFiles: plan.affectedFiles.length,
        recommendedTests: plan.recommendedTests.length,
        oracleGaps: plan.oracleGaps.length,
      },
    },
  };
}

export function writeTestPlan(result: TestPlanResult): void {
  mkdirSync(path.dirname(result.outputPath), { recursive: true });
  writeFileSync(result.outputPath, JSON.stringify(result.artifact, null, 2) + "\n", "utf8");
}
