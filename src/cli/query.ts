import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { EvidenceQueryArtifact, EvidenceQueryMatch } from "../types/artifacts.js";
import {
  createRedactionSummary,
  parseRedactionProfileOption,
  redactDetailValue,
} from "../redaction/redaction-profile.js";
import type { EXIT, getOption } from "./exit-codes.js";
import { emitCliError, emitCliSummary } from "./output.js";

export interface QueryCliOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

const VALUE_OPTIONS = new Set(["--from", "--out", "--redaction-profile"]);
const FLAG_OPTIONS = new Set(["--quiet"]);
const SEVERITY_RANK: Record<string, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function printQueryHelp(): void {
  console.log(`code-to-gate query <expression> --from <artifact-dir> [--out <file-or-dir>] [--redaction-profile <public|private|regulated>] [--quiet]

Examples:
  code-to-gate query "finding where severity >= high" --from .qh --out .qh
  code-to-gate query "artifact where schema = findings@v1" --from .qh
  code-to-gate query "baseline where expired = true" --from .qh`);
}

function validateArgs(args: string[]): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (VALUE_OPTIONS.has(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        return `${arg} requires a value`;
      }
      index += 1;
      continue;
    }
    if (FLAG_OPTIONS.has(arg) || arg === "--help" || arg === "-h") {
      continue;
    }
    if (arg.startsWith("--")) {
      return `unknown query option: ${arg}`;
    }
  }
  return null;
}

function expressionFromArgs(args: string[]): string {
  const parts: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (VALUE_OPTIONS.has(arg)) {
      index += 1;
      continue;
    }
    if (FLAG_OPTIONS.has(arg) || arg === "--help" || arg === "-h") {
      continue;
    }
    parts.push(arg);
  }
  return parts.join(" ").trim();
}

function outputPath(fromDir: string, out: string | undefined): string {
  if (!out) return path.join(fromDir, "evidence-query.json");
  const absolute = path.resolve(process.cwd(), out);
  return absolute.endsWith(".json") ? absolute : path.join(absolute, "evidence-query.json");
}

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hashFile(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function listJsonArtifacts(fromDir: string): Array<{ file: string; path: string; parsed: Record<string, unknown>; hash: string }> {
  if (!existsSync(fromDir) || !statSync(fromDir).isDirectory()) {
    throw new Error(`artifact directory not found: ${fromDir}`);
  }
  return readdirSync(fromDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const filePath = path.join(fromDir, file);
      const parsed = readJson(filePath);
      return parsed ? { file, path: filePath, parsed, hash: hashFile(filePath) } : null;
    })
    .filter((entry): entry is { file: string; path: string; parsed: Record<string, unknown>; hash: string } => entry !== null);
}

function parseExpression(expression: string): { domain: string; field: string; operator: string; value: string } {
  const match = expression.match(/^(\w+)\s+where\s+([\w.]+)\s*(=|!=|>=|<=|>|<)\s*(.+)$/i);
  if (!match) {
    throw new Error("unsupported query expression. expected: <finding|artifact|baseline> where <field> <op> <value>");
  }
  return {
    domain: match[1].toLowerCase(),
    field: match[2],
    operator: match[3],
    value: match[4].trim().replace(/^["']|["']$/g, ""),
  };
}

function getPathValue(value: unknown, field: string): unknown {
  return field.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, value);
}

function compare(actual: unknown, operator: string, expectedRaw: string): boolean {
  const expectedBoolean = expectedRaw === "true" ? true : expectedRaw === "false" ? false : undefined;
  if (typeof actual === "boolean" || expectedBoolean !== undefined) {
    return operator === "=" ? actual === expectedBoolean : operator === "!=" && actual !== expectedBoolean;
  }

  const actualSeverity = typeof actual === "string" ? SEVERITY_RANK[actual.toLowerCase()] : undefined;
  const expectedSeverity = SEVERITY_RANK[expectedRaw.toLowerCase()];
  if (actualSeverity !== undefined && expectedSeverity !== undefined) {
    return compareNumber(actualSeverity, operator, expectedSeverity);
  }

  const actualNumber = typeof actual === "number" ? actual : Number(actual);
  const expectedNumber = Number(expectedRaw);
  if (Number.isFinite(actualNumber) && Number.isFinite(expectedNumber)) {
    return compareNumber(actualNumber, operator, expectedNumber);
  }

  const actualString = String(actual ?? "");
  if (operator === "=") return actualString === expectedRaw;
  if (operator === "!=") return actualString !== expectedRaw;
  return false;
}

function compareNumber(actual: number, operator: string, expected: number): boolean {
  if (operator === "=") return actual === expected;
  if (operator === "!=") return actual !== expected;
  if (operator === ">=") return actual >= expected;
  if (operator === "<=") return actual <= expected;
  if (operator === ">") return actual > expected;
  if (operator === "<") return actual < expected;
  return false;
}

function createMatches(
  artifacts: Array<{ file: string; path: string; parsed: Record<string, unknown>; hash: string }>,
  parsedQuery: { domain: string; field: string; operator: string; value: string }
): EvidenceQueryMatch[] {
  if (parsedQuery.domain === "artifact") {
    return artifacts
      .filter((artifact) => compare(getPathValue(artifact.parsed, parsedQuery.field), parsedQuery.operator, parsedQuery.value))
      .map((artifact) => ({
        id: `artifact:${artifact.file}`,
        type: "artifact",
        sourceArtifact: artifact.file,
        sourceHashSha256: artifact.hash,
        locator: artifact.file,
        value: getPathValue(artifact.parsed, parsedQuery.field),
      }));
  }

  if (parsedQuery.domain === "finding") {
    return artifacts.flatMap((artifact) => {
      const findings = Array.isArray(artifact.parsed.findings) ? artifact.parsed.findings : [];
      return findings
        .filter((finding) => compare(getPathValue(finding, parsedQuery.field), parsedQuery.operator, parsedQuery.value))
        .map((finding, index) => {
          const findingRecord = finding as Record<string, unknown>;
          return {
            id: typeof findingRecord.id === "string" ? findingRecord.id : `finding:${index}`,
            type: "finding" as const,
            sourceArtifact: artifact.file,
            sourceHashSha256: artifact.hash,
            locator: `${artifact.file}#findings/${index}`,
            value: getPathValue(finding, parsedQuery.field),
          };
        });
    });
  }

  if (parsedQuery.domain === "baseline") {
    return artifacts.flatMap((artifact) => {
      const baseline = artifact.parsed.baseline;
      if (!baseline || typeof baseline !== "object") return [];
      if (!compare(getPathValue(baseline, parsedQuery.field), parsedQuery.operator, parsedQuery.value)) return [];
      return [{
        id: `baseline:${artifact.file}`,
        type: "baseline" as const,
        sourceArtifact: artifact.file,
        sourceHashSha256: artifact.hash,
        locator: `${artifact.file}#baseline`,
        value: getPathValue(baseline, parsedQuery.field),
      }];
    });
  }

  throw new Error(`unsupported query domain: ${parsedQuery.domain}`);
}

export async function queryCommand(args: string[], options: QueryCliOptions): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printQueryHelp();
    return options.EXIT.OK;
  }
  const argError = validateArgs(args);
  if (argError) {
    emitCliError(argError, { code: "USAGE_ERROR", command: "query", exitCode: options.EXIT.USAGE_ERROR });
    return options.EXIT.USAGE_ERROR;
  }

  try {
    const expression = expressionFromArgs(args);
    if (!expression) {
      throw new Error("usage: code-to-gate query <expression> --from <artifact-dir> [--out <file-or-dir>]");
    }
    const fromDir = path.resolve(process.cwd(), options.getOption(args, "--from") ?? ".qh");
    const redactionProfile = parseRedactionProfileOption(options.getOption(args, "--redaction-profile"));
    const redactionSummary = createRedactionSummary(redactionProfile);
    const parsedQuery = parseExpression(expression);
    const artifacts = listJsonArtifacts(fromDir);
    const matches = createMatches(artifacts, parsedQuery).map((match) => ({
      ...match,
      value: redactDetailValue(match.value, redactionProfile),
    }));
    const generatedAt = new Date().toISOString();
    const artifact: EvidenceQueryArtifact = {
      version: "ctg/v1",
      generated_at: generatedAt,
      run_id: `evidence-query-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
      repo: { root: "." },
      tool: { name: "code-to-gate", version: options.VERSION, plugin_versions: [] },
      artifact: "evidence-query",
      schema: "evidence-query@v1",
      completeness: "complete",
      redactionProfile,
      redactionSummary,
      query: {
        expression,
        domain: parsedQuery.domain as EvidenceQueryArtifact["query"]["domain"],
        field: parsedQuery.field,
        operator: parsedQuery.operator as EvidenceQueryArtifact["query"]["operator"],
        value: parsedQuery.value,
      },
      matches,
      sourceArtifacts: artifacts.map((artifactEntry) => ({
        file: artifactEntry.file,
        hashSha256: artifactEntry.hash,
        schema: typeof artifactEntry.parsed.schema === "string" ? artifactEntry.parsed.schema : undefined,
      })),
      summary: { resultCount: matches.length, sourceArtifacts: artifacts.length },
      generated_by: "ctg-evidence-query-v1",
    };
    const targetPath = outputPath(fromDir, options.getOption(args, "--out"));
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    emitCliSummary(args, {
      schema: "ctg.cli.summary@v1",
      tool: { name: "code-to-gate", version: options.VERSION },
      command: "query",
      status: "ok",
      exit_code: options.EXIT.OK,
      output: targetPath,
      summary: artifact.summary,
    });
    return options.EXIT.OK;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitCliError(message, { code: "QUERY_FAILED", command: "query", exitCode: options.EXIT.USAGE_ERROR });
    return options.EXIT.USAGE_ERROR;
  }
}
