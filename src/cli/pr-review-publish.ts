import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createGitHubClientFromEnv } from "../github/api-client.js";
import type { GitHubAppHealthArtifact } from "../types/artifacts.js";
import type { EXIT, getOption } from "./exit-codes.js";
import { emitCliError, emitCliSummary } from "./output.js";

export interface PrReviewPublishCliOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

const VALUE_OPTIONS = new Set(["--from", "--out", "--repo", "--pull"]);
const FLAG_OPTIONS = new Set(["--dry-run", "--quiet"]);

function printPrReviewPublishHelp(): void {
  console.log(`code-to-gate pr-review-publish --from <artifact-dir> --repo <owner/repo> --pull <number> [--out <file-or-dir>] [--dry-run] [--quiet]

Publishes pr-review.md as a GitHub PR comment using GITHUB_TOKEN or GitHub App credentials, then writes github-app-health.json.`);
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
    return `unknown pr-review-publish option: ${arg}`;
  }
  return null;
}

function splitRepo(value: string | undefined): { owner: string; repo: string } | null {
  if (!value) return null;
  const [owner, repo, extra] = value.split("/");
  if (!owner || !repo || extra) return null;
  return { owner, repo };
}

function parsePull(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function outputPath(fromDir: string, out: string | undefined): string {
  if (!out) {
    return path.join(fromDir, "github-app-health.json");
  }
  const absolute = path.resolve(process.cwd(), out);
  return absolute.endsWith(".json") ? absolute : path.join(absolute, "github-app-health.json");
}

function authMode(): GitHubAppHealthArtifact["authMode"] {
  if (process.env.GITHUB_TOKEN) return "github-token";
  if (process.env.GITHUB_APP_ID && process.env.GITHUB_APP_KEY) return "github-app";
  return "none";
}

function readOptionalReviewJson(fromDir: string): { path?: string; runId?: string } {
  const reviewPath = path.join(fromDir, "pr-review.json");
  if (!existsSync(reviewPath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(reviewPath, "utf8")) as { run_id?: unknown };
    return {
      path: reviewPath,
      runId: typeof parsed.run_id === "string" ? parsed.run_id : undefined,
    };
  } catch {
    return { path: reviewPath };
  }
}

function createHealthArtifact(params: {
  version: string;
  generatedAt: string;
  owner: string;
  repo: string;
  pullNumber: number;
  fromDir: string;
  markdownPath: string;
  markdownHash: string;
  prReviewPath?: string;
  runId?: string;
  status: GitHubAppHealthArtifact["status"];
  action: GitHubAppHealthArtifact["publish"]["action"];
  commentId?: number;
  error?: string;
}): GitHubAppHealthArtifact {
  return {
    version: "ctg/v1",
    generated_at: params.generatedAt,
    run_id: params.runId ?? `github-app-health-${params.generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    repo: { root: "." },
    tool: { name: "code-to-gate", version: params.version, plugin_versions: [] },
    artifact: "github-app-health",
    schema: "github-app-health@v1",
    completeness: params.status === "failed" ? "partial" : "complete",
    status: params.status,
    authMode: authMode(),
    repository: {
      owner: params.owner,
      repo: params.repo,
    },
    pullRequest: {
      number: params.pullNumber,
    },
    source: {
      artifactDir: params.fromDir,
      markdownPath: params.markdownPath,
      markdownHashSha256: params.markdownHash,
      prReviewPath: params.prReviewPath,
    },
    publish: {
      action: params.action,
      commentId: params.commentId,
      marker: "code-to-gate PR Review",
    },
    permissions: {
      required: ["pull-requests: write"],
      checked: false,
    },
    error: params.error,
    generated_by: "ctg-pr-review-publish-v1",
  };
}

function writeHealthArtifact(filePath: string, artifact: GitHubAppHealthArtifact): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

export async function prReviewPublishCommand(args: string[], options: PrReviewPublishCliOptions): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printPrReviewPublishHelp();
    return options.EXIT.OK;
  }

  const argError = validateArgs(args);
  if (argError) {
    emitCliError(argError, {
      code: "USAGE_ERROR",
      command: "pr-review-publish",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }

  const repoRef = splitRepo(options.getOption(args, "--repo"));
  const pullNumber = parsePull(options.getOption(args, "--pull"));
  if (!repoRef || !pullNumber) {
    emitCliError("pr-review-publish requires --repo <owner/repo> and --pull <number>", {
      code: "USAGE_ERROR",
      command: "pr-review-publish",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }

  const fromDir = path.resolve(process.cwd(), options.getOption(args, "--from") ?? ".qh");
  const markdownPath = path.join(fromDir, "pr-review.md");
  const healthPath = outputPath(fromDir, options.getOption(args, "--out"));
  if (!existsSync(markdownPath)) {
    emitCliError(`missing pr-review markdown: ${markdownPath}`, {
      code: "PR_REVIEW_PUBLISH_FAILED",
      command: "pr-review-publish",
      exitCode: options.EXIT.USAGE_ERROR,
    });
    return options.EXIT.USAGE_ERROR;
  }

  const markdown = readFileSync(markdownPath, "utf8");
  const markdownHash = createHash("sha256").update(markdown).digest("hex");
  const reviewJson = readOptionalReviewJson(fromDir);
  const generatedAt = new Date().toISOString();
  const dryRun = args.includes("--dry-run");

  if (dryRun) {
    const artifact = createHealthArtifact({
      version: options.VERSION,
      generatedAt,
      owner: repoRef.owner,
      repo: repoRef.repo,
      pullNumber,
      fromDir,
      markdownPath,
      markdownHash,
      prReviewPath: reviewJson.path,
      runId: reviewJson.runId,
      status: "dry_run",
      action: "skipped",
    });
    writeHealthArtifact(healthPath, artifact);
    emitCliSummary(args, {
      schema: "ctg.cli.summary@v1",
      tool: { name: "code-to-gate", version: options.VERSION },
      command: "pr-review-publish",
      status: artifact.status,
      exit_code: options.EXIT.OK,
      output: { artifact: healthPath },
      summary: { action: artifact.publish.action, authMode: artifact.authMode },
    });
    return options.EXIT.OK;
  }

  try {
    const client = await createGitHubClientFromEnv(repoRef.owner, repoRef.repo);
    if (!client) {
      throw new Error("missing GitHub authentication: set GITHUB_TOKEN or GITHUB_APP_ID and GITHUB_APP_KEY");
    }

    const existingCommentId = await client.findExistingComment(pullNumber);
    let commentId: number;
    let action: GitHubAppHealthArtifact["publish"]["action"];
    if (existingCommentId) {
      await client.updateComment(existingCommentId, markdown);
      commentId = existingCommentId;
      action = "updated";
    } else {
      commentId = await client.createComment(pullNumber, markdown);
      action = "created";
    }

    const artifact = createHealthArtifact({
      version: options.VERSION,
      generatedAt,
      owner: repoRef.owner,
      repo: repoRef.repo,
      pullNumber,
      fromDir,
      markdownPath,
      markdownHash,
      prReviewPath: reviewJson.path,
      runId: reviewJson.runId,
      status: "posted",
      action,
      commentId,
    });
    writeHealthArtifact(healthPath, artifact);
    emitCliSummary(args, {
      schema: "ctg.cli.summary@v1",
      tool: { name: "code-to-gate", version: options.VERSION },
      command: "pr-review-publish",
      status: artifact.status,
      exit_code: options.EXIT.OK,
      output: { artifact: healthPath, comment_id: commentId },
      summary: { action, authMode: artifact.authMode },
    });
    return options.EXIT.OK;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const artifact = createHealthArtifact({
      version: options.VERSION,
      generatedAt,
      owner: repoRef.owner,
      repo: repoRef.repo,
      pullNumber,
      fromDir,
      markdownPath,
      markdownHash,
      prReviewPath: reviewJson.path,
      runId: reviewJson.runId,
      status: "failed",
      action: "failed",
      error: message,
    });
    writeHealthArtifact(healthPath, artifact);
    emitCliError(message, {
      code: "PR_REVIEW_PUBLISH_FAILED",
      command: "pr-review-publish",
      exitCode: options.EXIT.INTEGRATION_EXPORT_FAILED,
    });
    return options.EXIT.INTEGRATION_EXPORT_FAILED;
  }
}
