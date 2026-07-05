import { createHash } from "node:crypto";

import type { RepoFile } from "../types/artifacts.js";
import type { Finding, RuleContext, RulePlugin, SimpleGraph } from "../rules/index.js";

export interface RuleFixtureFile {
  path: string;
  content: string;
  language?: RepoFile["language"];
  role?: RepoFile["role"];
}

export interface RuleFixtureOptions {
  repoRoot?: string;
  runId?: string;
  generatedAt?: string;
  partial?: boolean;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function inferLanguage(filePath: string): RepoFile["language"] {
  if (filePath.endsWith(".tsx")) return "tsx";
  if (filePath.endsWith(".ts")) return "ts";
  if (filePath.endsWith(".jsx")) return "jsx";
  if (filePath.endsWith(".js")) return "js";
  if (filePath.endsWith(".py")) return "py";
  if (filePath.endsWith(".rb")) return "rb";
  if (filePath.endsWith(".go")) return "go";
  if (filePath.endsWith(".rs")) return "rs";
  if (filePath.endsWith(".java")) return "java";
  if (filePath.endsWith(".php")) return "php";
  if (filePath.endsWith(".cs")) return "cs";
  if (filePath.endsWith(".cpp") || filePath.endsWith(".cc") || filePath.endsWith(".cxx")) return "cpp";
  return "unknown";
}

function lineCount(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  return content.split(/\r?\n/).length;
}

function toRepoFile(file: RuleFixtureFile): RepoFile {
  return {
    id: `file:${sha256(file.path).slice(0, 12)}`,
    path: file.path,
    language: file.language ?? inferLanguage(file.path),
    role: file.role ?? "source",
    hash: sha256(file.content),
    sizeBytes: Buffer.byteLength(file.content, "utf8"),
    lineCount: lineCount(file.content),
    parser: {
      status: "text_fallback",
      adapter: "rule-fixture",
    },
  };
}

export function createFixtureRuleContext(
  files: RuleFixtureFile[],
  options: RuleFixtureOptions = {}
): RuleContext {
  const contentByPath = new Map(files.map((file) => [file.path, file.content]));
  const graph: SimpleGraph = {
    files: files.map(toRepoFile),
    run_id: options.runId ?? "rule-fixture",
    generated_at: options.generatedAt ?? "2026-01-01T00:00:00.000Z",
    repo: { root: options.repoRoot ?? "." },
    stats: { partial: options.partial ?? false },
  };

  return {
    graph,
    getFileContent: (filePath: string): string | null => contentByPath.get(filePath) ?? null,
  };
}

export function runRuleFixture(
  rule: RulePlugin,
  files: RuleFixtureFile[],
  options: RuleFixtureOptions = {}
): Finding[] {
  return rule.evaluate(createFixtureRuleContext(files, options));
}
