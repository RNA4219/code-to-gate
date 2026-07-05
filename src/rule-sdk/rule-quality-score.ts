import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import type {
  RuleQualityScoreArtifact,
  RuleQualityScoreGrade,
  RuleQualityScoreInputEvidence,
  RuleQualityScoreMetric,
} from "../types/artifacts.js";

export interface RuleQualityScoreOptions {
  target: string;
  version: string;
  now?: Date;
}

const WEIGHTS = {
  fixtureCoverage: 0.3,
  falsePositiveReview: 0.2,
  evidenceCompleteness: 0.2,
  schemaCompatibility: 0.2,
  runtimeCost: 0.1,
} as const;

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

function relativePath(filePath: string): string {
  return toPosix(path.relative(process.cwd(), filePath) || ".");
}

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function firstExisting(root: string, candidates: string[]): string | undefined {
  return candidates.map((candidate) => path.join(root, candidate)).find((candidate) => existsSync(candidate));
}

function evidence(root: string, relative: string, kind: RuleQualityScoreInputEvidence["kind"]): RuleQualityScoreInputEvidence | undefined {
  const filePath = path.join(root, relative);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return undefined;
  const stats = statSync(filePath);
  return {
    id: relative.replaceAll("\\", "/"),
    path: relativePath(filePath),
    hashSha256: sha256(filePath),
    kind,
    sizeBytes: stats.size,
  };
}

function sourceEvidence(root: string): RuleQualityScoreInputEvidence[] {
  const candidates = ["rule.ts", "rule.js", "index.ts", "index.js"];
  return candidates
    .map((candidate) => evidence(root, candidate, "source"))
    .filter((entry): entry is RuleQualityScoreInputEvidence => entry !== undefined);
}

function fixtureEvidence(root: string): RuleQualityScoreInputEvidence[] {
  const fixtureDir = path.join(root, "fixtures");
  if (!existsSync(fixtureDir) || !statSync(fixtureDir).isDirectory()) return [];
  return readdirSync(fixtureDir)
    .filter((file) => statSync(path.join(fixtureDir, file)).isFile())
    .sort()
    .map((file) => evidence(root, path.join("fixtures", file), "fixture"))
    .filter((entry): entry is RuleQualityScoreInputEvidence => entry !== undefined);
}

function metric(score: number, weight: number, evidenceIds: string[], notes: string[] = []): RuleQualityScoreMetric {
  return { score: Math.max(0, Math.min(100, Math.round(score))), weight, evidenceIds, notes };
}

function hasText(root: string, relative: string, pattern: RegExp): boolean {
  const filePath = path.join(root, relative);
  if (!existsSync(filePath)) return false;
  return pattern.test(readFileSync(filePath, "utf8"));
}

function grade(totalScore: number): RuleQualityScoreGrade {
  if (totalScore >= 90) return "A";
  if (totalScore >= 80) return "B";
  if (totalScore >= 70) return "C";
  if (totalScore >= 60) return "D";
  return "F";
}

function totalScore(scores: RuleQualityScoreArtifact["scores"]): number {
  return Math.round(
    scores.fixtureCoverage.score * scores.fixtureCoverage.weight +
    scores.falsePositiveReview.score * scores.falsePositiveReview.weight +
    scores.evidenceCompleteness.score * scores.evidenceCompleteness.weight +
    scores.schemaCompatibility.score * scores.schemaCompatibility.weight +
    scores.runtimeCost.score * scores.runtimeCost.weight
  );
}

function subjectFromManifest(root: string): RuleQualityScoreArtifact["subject"] {
  const ruleManifestPath = firstExisting(root, ["rule.manifest.json"]);
  const pluginManifestPath = firstExisting(root, ["plugin-manifest.json", "manifest.json", "ctg-plugin.json"]);
  const manifestPath = ruleManifestPath ?? pluginManifestPath;
  const manifest = manifestPath ? readJson(manifestPath) : null;
  const isRule = typeof manifest?.ruleId === "string" || manifest?.kind === "rule";
  return {
    type: isRule ? "rule" : "plugin",
    id: String(manifest?.ruleId ?? manifest?.id ?? manifest?.name ?? path.basename(root)),
    name: typeof manifest?.name === "string" ? manifest.name : undefined,
    version: typeof manifest?.version === "string" ? manifest.version : undefined,
    path: relativePath(root),
  };
}

export function createRuleQualityScore(options: RuleQualityScoreOptions): RuleQualityScoreArtifact {
  const root = path.resolve(process.cwd(), options.target);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`rule or plugin directory not found: ${options.target}`);
  }

  const manifest = firstExisting(root, ["rule.manifest.json", "plugin-manifest.json", "manifest.json", "ctg-plugin.json"]);
  const schema = firstExisting(root, ["schema/rule.manifest.schema.json", "schema/plugin-manifest.schema.json"]);
  const test = firstExisting(root, ["rule.test.ts", "rule.test.js", "test.ts", "test.js"]);
  const readme = firstExisting(root, ["README.md", "README.txt"]);
  const fixtures = fixtureEvidence(root);
  const sources = sourceEvidence(root);
  const inputEvidence = [
    ...(manifest ? [evidence(root, path.relative(root, manifest), "manifest")] : []),
    ...(schema ? [evidence(root, path.relative(root, schema), "schema")] : []),
    ...(test ? [evidence(root, path.relative(root, test), "test")] : []),
    ...(readme ? [evidence(root, path.relative(root, readme), "readme")] : []),
    ...fixtures,
    ...sources,
  ].filter((entry): entry is RuleQualityScoreInputEvidence => entry !== undefined);

  const positiveFixture = fixtures.some((entry) => /positive/i.test(entry.id));
  const negativeFixture = fixtures.some((entry) => /negative/i.test(entry.id));
  const testMentionsNegative = test ? hasText(root, path.relative(root, test), /negative|does not flag|no finding/i) : false;
  const hasSchema = !!schema;
  const hasManifest = !!manifest;
  const hasReadme = !!readme;
  const hasSource = sources.length > 0;
  const totalBytes = inputEvidence.reduce((sum, entry) => sum + entry.sizeBytes, 0);

  const scores: RuleQualityScoreArtifact["scores"] = {
    fixtureCoverage: metric(
      (positiveFixture ? 35 : 0) + (negativeFixture ? 35 : 0) + (test ? 30 : 0),
      WEIGHTS.fixtureCoverage,
      fixtures.map((entry) => entry.id).concat(test ? [path.relative(root, test).replaceAll("\\", "/")] : []),
      positiveFixture && negativeFixture && test ? [] : ["positive fixture, negative fixture, and test harness are all expected"]
    ),
    falsePositiveReview: metric(
      negativeFixture && testMentionsNegative ? 100 : negativeFixture ? 60 : 0,
      WEIGHTS.falsePositiveReview,
      fixtures.filter((entry) => /negative/i.test(entry.id)).map((entry) => entry.id).concat(test ? [path.relative(root, test).replaceAll("\\", "/")] : []),
      negativeFixture && testMentionsNegative ? [] : ["negative fixture should be explicitly asserted as no finding"]
    ),
    evidenceCompleteness: metric(
      (hasManifest ? 25 : 0) + (hasReadme ? 20 : 0) + (hasSource ? 25 : 0) + (fixtures.length >= 2 ? 30 : fixtures.length * 15),
      WEIGHTS.evidenceCompleteness,
      inputEvidence.map((entry) => entry.id),
      hasManifest && hasReadme && hasSource && fixtures.length >= 2 ? [] : ["manifest, README, source, and two fixtures improve evidence completeness"]
    ),
    schemaCompatibility: metric(
      (hasManifest ? 50 : 0) + (hasSchema ? 50 : 0),
      WEIGHTS.schemaCompatibility,
      [manifest, schema].filter((value): value is string => !!value).map((value) => path.relative(root, value).replaceAll("\\", "/")),
      hasManifest && hasSchema ? [] : ["manifest and local schema are required for full schema compatibility"]
    ),
    runtimeCost: metric(
      totalBytes <= 64_000 ? 100 : totalBytes <= 256_000 ? 80 : totalBytes <= 1_000_000 ? 60 : 30,
      WEIGHTS.runtimeCost,
      inputEvidence.map((entry) => entry.id),
      [`scored from ${totalBytes} input bytes`]
    ),
  };
  const total = totalScore(scores);
  const warnings = Object.values(scores).flatMap((score) => score.notes).filter(Boolean);
  const generatedAt = (options.now ?? new Date()).toISOString();

  return {
    version: "ctg/v1",
    generated_at: generatedAt,
    run_id: `rule-quality-score-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    repo: { root: process.cwd() },
    tool: { name: "code-to-gate", version: options.version, plugin_versions: [] },
    artifact: "rule-quality-score",
    schema: "rule-quality-score@v1",
    completeness: warnings.length > 0 ? "partial" : "complete",
    subject: subjectFromManifest(root),
    scores,
    formula: { version: "ctg-rule-quality-score-v1", weights: WEIGHTS },
    inputEvidence,
    summary: { totalScore: total, grade: grade(total), warnings },
    generated_by: "ctg-rule-quality-score-v1",
  };
}
