/**
 * Evidence CLI Command - Bundle and validate evidence
 *
 * Commands:
 * - code-to-gate evidence bundle --from <dir> --out <bundle.zip>
 * - code-to-gate evidence validate <bundle.zip>
 * - code-to-gate evidence list <bundle.zip>
 * - code-to-gate evidence extract <bundle.zip> --out <dir>
 */

import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { EXIT, getOption, isVerbose } from "./exit-codes.js";
import {
  createEvidenceBundle,
  validateEvidenceBundle,
  listBundleContents,
  extractBundleContents,
} from "../evidence/bundle-builder.js";
import {
  BundleValidationResult,
  EvidenceBundleMetadata,
} from "../evidence/evidence-types.js";

export interface EvidenceCommandOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

/**
 * Format validation result for output
 */
function formatValidationResult(result: BundleValidationResult): string {
  const lines: string[] = [];

  lines.push(`Validation Result: ${result.valid ? "VALID" : "INVALID"}`);
  lines.push("");
  lines.push(`Summary:`);
  lines.push(`  Total artifacts: ${result.summary.total_artifacts}`);
  lines.push(`  Valid artifacts: ${result.summary.valid_artifacts}`);
  lines.push(`  Invalid artifacts: ${result.summary.invalid_artifacts}`);
  lines.push(`  Missing artifacts: ${result.summary.missing_artifacts}`);
  lines.push("");

  if (result.errors.length > 0) {
    lines.push("Errors:");
    for (const error of result.errors) {
      lines.push(`  - [${error.code}] ${error.message}`);
      if (error.artifact) {
        lines.push(`    Artifact: ${error.artifact}`);
      }
    }
    lines.push("");
  }

  if (result.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of result.warnings) {
      lines.push(`  - [${warning.code}] ${warning.message}`);
      if (warning.artifact) {
        lines.push(`    Artifact: ${warning.artifact}`);
      }
    }
    lines.push("");
  }

  lines.push("Artifact Results:");
  for (const artifactResult of result.artifact_results) {
    const status = artifactResult.exists && artifactResult.hash_valid && artifactResult.parseable
      ? "OK"
      : artifactResult.exists
        ? "INVALID"
        : "MISSING";

    lines.push(`  - ${artifactResult.artifact_name}: ${status}`);
    if (artifactResult.errors.length > 0) {
      for (const err of artifactResult.errors) {
        lines.push(`    Error: ${err.message}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Format bundle metadata for output
 */
function formatMetadata(metadata: EvidenceBundleMetadata): string {
  const lines: string[] = [];

  lines.push(`Bundle ID: ${metadata.bundle_id}`);
  lines.push(`Version: ${metadata.version}`);
  lines.push(`Generated: ${metadata.generated_at}`);
  lines.push("");
  lines.push(`Source:`);
  lines.push(`  Repo Root: ${metadata.source.repo_root}`);
  if (metadata.source.revision) {
    lines.push(`  Revision: ${metadata.source.revision}`);
  }
  if (metadata.source.branch) {
    lines.push(`  Branch: ${metadata.source.branch}`);
  }
  lines.push(`  Run ID: ${metadata.source.run_id}`);
  lines.push(`  Tool Version: ${metadata.source.tool_version}`);
  if (metadata.source.policy_id) {
    lines.push(`  Policy ID: ${metadata.source.policy_id}`);
  }
  lines.push("");
  lines.push(`Contents (${metadata.contents.length} artifacts):`);

  for (const artifact of metadata.contents) {
    lines.push(`  - ${artifact.name}`);
    lines.push(`    Type: ${artifact.type}`);
    lines.push(`    Size: ${artifact.size_bytes} bytes`);
    lines.push(`    Hash: ${artifact.hash_sha256.slice(0, 16)}...`);
  }

  if (metadata.signature) {
    lines.push("");
    lines.push(`Signature:`);
    lines.push(`  Algorithm: ${metadata.signature.algorithm}`);
    lines.push(`  Created: ${metadata.signature.created_at}`);
  }

  return lines.join("\n");
}

/**
 * Bundle command - create evidence bundle
 */
async function bundleCommand(
  args: string[],
  options: EvidenceCommandOptions
): Promise<number> {
  const fromDir = options.getOption(args, "--from");
  const outputPath = options.getOption(args, "--out");
  const runId = options.getOption(args, "--run-id");
  const includeOptional = args.includes("--include-optional");
  const sign = args.includes("--sign");

  if (!fromDir || !outputPath) {
    console.error("usage: code-to-gate evidence bundle --from <dir> --out <bundle.zip>");
    console.error("  --from <dir>         Directory containing artifacts");
    console.error("  --out <bundle.zip>   Output bundle path");
    console.error("  --include-optional   Include optional artifacts");
    console.error("  --run-id <id>        Override run ID");
    console.error("  --sign               Sign the bundle");
    return options.EXIT.USAGE_ERROR;
  }

  const cwd = process.cwd();
  const artifactDir = path.resolve(cwd, fromDir);
  const bundlePath = path.resolve(cwd, outputPath);

  // Validate source directory
  if (!existsSync(artifactDir)) {
    console.error(`artifact directory not found: ${fromDir}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!statSync(artifactDir).isDirectory()) {
    console.error(`artifact path is not a directory: ${fromDir}`);
    return options.EXIT.USAGE_ERROR;
  }

  try {
    const result = await createEvidenceBundle({
      sourceDir: artifactDir,
      outputPath: bundlePath,
      runId,
      includeOptional,
      sign,
    });

    // Output result
    if (isVerbose(args)) {
      console.log(formatMetadata(result.metadata));
      console.log("");
      console.log(`Bundle created: ${bundlePath}`);
      console.log(`Artifacts included: ${result.artifactsIncluded.length}`);
      console.log(`Artifacts excluded: ${result.artifactsExcluded.length}`);
    } else {
      console.log(JSON.stringify({
        tool: "code-to-gate",
        command: "evidence bundle",
        source: path.relative(cwd, artifactDir),
        output: path.relative(cwd, bundlePath),
        bundle_id: result.metadata.bundle_id,
        artifacts: {
          included: result.artifactsIncluded,
          excluded: result.artifactsExcluded,
        },
        errors: result.errors.length,
        status: result.errors.length === 0 ? "success" : "partial",
      }));
    }

    // Return appropriate exit code
    if (result.errors.length > 0) {
      for (const error of result.errors) {
        console.error(`Error: ${error.message}`);
      }
      return options.EXIT.SCHEMA_FAILED;
    }

    return options.EXIT.OK;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.INTERNAL_ERROR;
  }
}

/**
 * Validate command - validate evidence bundle
 */
async function validateCommand(
  args: string[],
  options: EvidenceCommandOptions
): Promise<number> {
  const bundlePath = args[1];
  const strict = args.includes("--strict");
  const validateSchemas = args.includes("--validate-schemas");

  if (!bundlePath) {
    console.error("usage: code-to-gate evidence validate <bundle.zip>");
    console.error("  --strict             Fail on warnings");
    console.error("  --validate-schemas   Validate artifact schemas");
    return options.EXIT.USAGE_ERROR;
  }

  const cwd = process.cwd();
  const resolvedBundlePath = path.resolve(cwd, bundlePath);

  if (!existsSync(resolvedBundlePath)) {
    console.error(`bundle file not found: ${bundlePath}`);
    return options.EXIT.USAGE_ERROR;
  }

  try {
    const result = await validateEvidenceBundle({
      bundlePath: resolvedBundlePath,
      strict,
      validateSchemas,
    });

    // Output result
    if (isVerbose(args)) {
      console.log(formatValidationResult(result));
    } else {
      console.log(JSON.stringify({
        tool: "code-to-gate",
        command: "evidence validate",
        bundle: path.relative(cwd, resolvedBundlePath),
        valid: result.valid,
        summary: result.summary,
        errors: result.errors.length,
        warnings: result.warnings.length,
      }));
    }

    return result.valid ? options.EXIT.OK : options.EXIT.SCHEMA_FAILED;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.INTERNAL_ERROR;
  }
}

/**
 * List command - list bundle contents
 */
async function listCommand(
  args: string[],
  options: EvidenceCommandOptions
): Promise<number> {
  const bundlePath = args[1];

  if (!bundlePath) {
    console.error("usage: code-to-gate evidence list <bundle.zip>");
    return options.EXIT.USAGE_ERROR;
  }

  const cwd = process.cwd();
  const resolvedBundlePath = path.resolve(cwd, bundlePath);

  if (!existsSync(resolvedBundlePath)) {
    console.error(`bundle file not found: ${bundlePath}`);
    return options.EXIT.USAGE_ERROR;
  }

  try {
    const result = await listBundleContents(resolvedBundlePath);

    if (isVerbose(args)) {
      console.log(formatMetadata(result.metadata));
      console.log("");
      console.log("Entries:");
      for (const entry of result.entries) {
        console.log(`  - ${entry}`);
      }
    } else {
      console.log(JSON.stringify({
        tool: "code-to-gate",
        command: "evidence list",
        bundle: path.relative(cwd, resolvedBundlePath),
        bundle_id: result.metadata.bundle_id,
        entries: result.entries,
      }));
    }

    return options.EXIT.OK;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.INTERNAL_ERROR;
  }
}

/**
 * Extract command - extract bundle contents
 */
async function extractCommand(
  args: string[],
  options: EvidenceCommandOptions
): Promise<number> {
  const bundlePath = args[1];
  const outDir = options.getOption(args, "--out");

  if (!bundlePath || !outDir) {
    console.error("usage: code-to-gate evidence extract <bundle.zip> --out <dir>");
    console.error("  --out <dir>          Output directory for extracted contents");
    return options.EXIT.USAGE_ERROR;
  }

  const cwd = process.cwd();
  const resolvedBundlePath = path.resolve(cwd, bundlePath);
  const resolvedOutDir = path.resolve(cwd, outDir);

  if (!existsSync(resolvedBundlePath)) {
    console.error(`bundle file not found: ${bundlePath}`);
    return options.EXIT.USAGE_ERROR;
  }

  try {
    const result = await extractBundleContents(resolvedBundlePath, resolvedOutDir);

    if (isVerbose(args)) {
      console.log(`Bundle ID: ${result.metadata.bundle_id}`);
      console.log(`Extracted to: ${resolvedOutDir}`);
      console.log("");
      console.log("Files:");
      for (const file of result.extractedFiles) {
        console.log(`  - ${path.basename(file)}`);
      }
    } else {
      console.log(JSON.stringify({
        tool: "code-to-gate",
        command: "evidence extract",
        bundle: path.relative(cwd, resolvedBundlePath),
        output: path.relative(cwd, resolvedOutDir),
        bundle_id: result.metadata.bundle_id,
        files_extracted: result.extractedFiles.length,
      }));
    }

    return options.EXIT.OK;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.INTERNAL_ERROR;
  }
}

/**
 * Main evidence command handler
 */
export async function evidenceCommand(
  args: string[],
  options: EvidenceCommandOptions
): Promise<number> {
  const subcommand = args[0];

  if (!subcommand) {
    console.error("usage: code-to-gate evidence <command>");
    console.error("");
    console.error("Commands:");
    console.error("  bundle    Create evidence bundle from artifact directory");
    console.error("  validate  Validate evidence bundle");
    console.error("  list      List bundle contents");
    console.error("  extract   Extract bundle contents to directory");
    console.error("");
    console.error("Run 'code-to-gate evidence <command> --help' for details");
    return options.EXIT.USAGE_ERROR;
  }

  switch (subcommand) {
    case "bundle":
      return bundleCommand(args, options);

    case "validate":
      return validateCommand(args, options);

    case "list":
      return listCommand(args, options);

    case "extract":
      return extractCommand(args, options);

    default:
      console.error(`unknown evidence subcommand: ${subcommand}`);
      console.error("Run 'code-to-gate evidence --help' for usage information");
      return options.EXIT.USAGE_ERROR;
  }
}