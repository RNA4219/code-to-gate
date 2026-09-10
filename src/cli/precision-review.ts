import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { EXIT } from "./exit-codes.js";
import {
  readFindingsArtifact,
  summarizePrecisionReview,
  validatePrecisionReview,
  type PrecisionReviewArtifact,
} from "../evaluation/precision-review.js";
import { createPrecisionWorkbenchModel, renderPrecisionReviewHtml } from "../evaluation/precision-review-html.js";

interface PrecisionReviewOptions { EXIT: typeof EXIT }

function usage(): void {
  console.error("usage: code-to-gate precision-review --from findings.json --review review.json --out review.html [--repo path] [--force]");
}

function parseArgs(args: string[]): { from: string; review: string; out: string; repo?: string; force: boolean } {
  const values: Record<string, string | boolean> = {};
  const allowed = new Set(["from", "review", "out", "repo", "force"]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--force") {
      if (values.force !== undefined) throw new Error("duplicate option --force");
      values.force = true;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`unexpected positional argument: ${arg}`);
    const key = arg.slice(2);
    if (!allowed.has(key)) throw new Error(`unknown option: ${arg}`);
    if (values[key] !== undefined) throw new Error(`duplicate option: ${arg}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    values[key] = value;
    index += 1;
  }
  for (const key of ["from", "review", "out"]) if (typeof values[key] !== "string" || !values[key]) throw new Error(`--${key} is required`);
  return { from: values.from as string, review: values.review as string, out: values.out as string, repo: values.repo as string | undefined, force: values.force === true };
}

function comparablePath(filePath: string): string {
  let cursor = path.resolve(filePath);
  const suffix: string[] = [];
  while (!existsSync(cursor) && path.dirname(cursor) !== cursor) {
    suffix.unshift(path.basename(cursor));
    cursor = path.dirname(cursor);
  }
  return path.join(realpathSync(cursor), ...suffix).toLowerCase();
}

function sameFile(left: string, right: string): boolean {
  if (comparablePath(left) === comparablePath(right)) return true;
  if (!existsSync(left) || !existsSync(right)) return false;
  const leftStat = statSync(left);
  const rightStat = statSync(right);
  return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
}

function writeOutput(filePath: string, content: string, force: boolean): void {
  const absolute = path.resolve(filePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, { encoding: "utf8", flag: force ? "w" : "wx" });
}

export async function precisionReviewCommand(args: string[], options: PrecisionReviewOptions): Promise<number> {
  try {
    const parsed = parseArgs(args);
    const fromPath = path.resolve(parsed.from);
    const reviewPath = path.resolve(parsed.review);
    const outPath = path.resolve(parsed.out);
    if (!existsSync(fromPath) || !existsSync(reviewPath)) throw new Error("--from and --review files must exist");
    if (sameFile(outPath, fromPath) || sameFile(outPath, reviewPath)) throw new Error("--out must not overwrite an input file");
    const findingsInput = readFindingsArtifact(fromPath);
    let review: PrecisionReviewArtifact;
    try { review = JSON.parse(readFileSync(reviewPath, "utf8")) as PrecisionReviewArtifact; }
    catch { throw new Error(`invalid review JSON: ${reviewPath}`); }
    const validation = validatePrecisionReview(findingsInput.artifact, review, findingsInput.bytes);
    if (!validation.valid) throw new Error(`invalid precision review: ${validation.errors.join("; ")}`);
    const summary = summarizePrecisionReview(findingsInput.artifact, review, findingsInput.bytes);
    const model = createPrecisionWorkbenchModel(findingsInput.artifact, review, summary, parsed.repo);
    writeOutput(outPath, renderPrecisionReviewHtml(model), parsed.force);
    console.log(`precision review HTML: ${outPath}`);
    return options.EXIT.OK;
  } catch (error) {
    usage();
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.USAGE_ERROR;
  }
}
