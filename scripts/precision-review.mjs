#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createPrecisionReview, readFindingsArtifact, summarizePrecisionReview, updatePrecisionReview } from "../dist/evaluation/precision-review.js";

function usage() {
  console.error("Usage: precision-review.mjs create|update|summarize ...");
  console.error("  create --from findings.json --out review.json --reviewer id --reviewer-kind ai|human [--repo path] [--full-sha sha]");
  console.error("  update --from review.json --findings findings.json --out review.json --finding-id id --classification TP|FP|Uncertain|AcceptedDesign [--comment text]");
  console.error("          update --from review.json --findings findings.json --input updates.json --out review.json [--force]");
  console.error("  summarize --from findings.json --review review.json --out summary.json");
  console.error("  --force permits overwriting an existing output; --help shows this usage");
}

function parse(argv) {
  const command = argv[0];
  const values = { _: [] };
  if (!command || command === "--help" || command === "-h") return { command: command ?? "", values: { _: [], help: true } };
  const seen = new Set();
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--force") { if (seen.has("force")) throw new Error("Duplicate option --force"); seen.add("force"); values.force = true; continue; }
    if (arg === "--help" || arg === "-h") { if (seen.has("help")) throw new Error("Duplicate option --help"); seen.add("help"); values.help = true; continue; }
    if (!arg.startsWith("--")) { values._.push(arg); continue; }
    const key = arg.slice(2);
    if (seen.has(key)) throw new Error(`Duplicate option --${key}`);
    seen.add(key);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    values[key] = value;
    i += 1;
  }
  const allowed = {
    create: new Set(["from", "out", "reviewer", "reviewer-kind", "repo", "full-sha", "force"]),
    update: new Set(["from", "findings", "out", "finding-id", "classification", "comment", "input", "force"]),
    summarize: new Set(["from", "review", "out", "force"]),
  }[command];
  if (!allowed) throw new Error(`Unknown command: ${command}`);
  for (const key of Object.keys(values)) if (key !== "_" && key !== "help" && !allowed.has(key)) throw new Error(`Unknown option --${key}`);
  if (values._.length > 0) throw new Error("Unexpected positional argument");
  return { command, values };
}

function required(values, key) {
  if (!values[key]) throw new Error(`Missing required option --${key}`);
  return values[key];
}

function comparablePath(filePath) {
  let cursor = resolve(filePath);
  const suffix = [];
  while (!existsSync(cursor) && dirname(cursor) !== cursor) {
    suffix.unshift(basename(cursor));
    cursor = dirname(cursor);
  }
  return resolve(realpathSync(cursor), ...suffix).toLowerCase();
}

function sameFile(left, right) {
  if (comparablePath(left) === comparablePath(right)) return true;
  if (!existsSync(left) || !existsSync(right)) return false;
  try {
    const leftStat = statSync(left);
    const rightStat = statSync(right);
    return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    return false;
  }
}

function writeJson(path, value, force = false, protectedPaths = []) {
  const target = resolve(path);
  if (protectedPaths.some((protectedPath) => sameFile(target, protectedPath))) {
    throw new Error(`Refusing to overwrite input file: ${target}`);
  }
  if (existsSync(target) && !force) throw new Error(`Refusing to overwrite existing output: ${target} (use --force)`);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, target);
}

function loadJson(path) {
  try { return JSON.parse(readFileSync(resolve(path), "utf8")); } catch (error) { throw new Error(`Invalid JSON: ${path} (${error.message})`); }
}

function main() {
  const { command, values } = parse(process.argv.slice(2));
  if (!command || values.help) { usage(); return 0; }
  if (command === "create") {
    const findingsPath = required(values, "from");
    const { artifact, bytes } = readFindingsArtifact(findingsPath);
    const review = createPrecisionReview(artifact, {
      reviewer: { kind: required(values, "reviewer-kind"), id: required(values, "reviewer") },
      findingsBytes: bytes,
      findingsPath: resolve(findingsPath),
      repoPath: values.repo,
      fullSha: values["full-sha"],
    });
    writeJson(required(values, "out"), review, values.force, [findingsPath]);
    return 0;
  }
  if (command === "summarize") {
    const findingsPath = required(values, "from");
    const { artifact, bytes } = readFindingsArtifact(findingsPath);
    const review = loadJson(required(values, "review"));
    const summary = summarizePrecisionReview(artifact, review, bytes);
    writeJson(required(values, "out"), summary, values.force, [findingsPath, values.review]);
    return 0;
  }
  if (command === "update") {
    const findingsPath = required(values, "findings");
    const { artifact, bytes } = readFindingsArtifact(findingsPath);
    const review = loadJson(required(values, "from"));
    const updates = [];
    if (values["finding-id"] || values.classification) {
      updates.push({ finding_id: required(values, "finding-id"), classification: required(values, "classification"), ...(values.comment === undefined ? {} : { comment: values.comment }) });
    }
    if (values.input) {
      const batch = loadJson(values.input);
      if (!Array.isArray(batch)) throw new Error("--input must contain an array of updates");
      updates.push(...batch);
    }
    if (updates.length === 0) throw new Error("update requires --finding-id/--classification or --input");
    const updated = updatePrecisionReview(artifact, review, updates, bytes);
    writeJson(required(values, "out"), updated, values.force, [findingsPath, values.input].filter(Boolean));
    return 0;
  }
  usage();
  return 2;
}

try { process.exitCode = main(); } catch (error) { console.error(`[precision-review] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 2; }
