/**
 * Evidence Bundle Validator - Validate and extract evidence bundles
 *
 * Validates ZIP bundles containing artifacts + metadata.json + signature
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  EvidenceBundleMetadata,
  BundleValidationResult,
  ArtifactValidationResult,
  ValidationError,
  ValidationWarning,
  BundleValidatorOptions,
  REQUIRED_ARTIFACTS,
  ARTIFACT_FILENAME_MAP,
} from "./evidence-types.js";
import { parseZipFile } from "./zip-utils.js";
import { calculateContentHash } from "./bundle-builder.js";

/**
 * Validate evidence bundle
 */
export async function validateEvidenceBundle(options: BundleValidatorOptions): Promise<BundleValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const artifactResults: ArtifactValidationResult[] = [];

  // Check bundle file exists
  if (!existsSync(options.bundlePath)) {
    return {
      valid: false,
      errors: [{
        code: "BUNDLE_NOT_FOUND",
        message: `Bundle file not found: ${options.bundlePath}`,
      }],
      warnings: [],
      artifact_results: [],
      summary: {
        total_artifacts: 0,
        valid_artifacts: 0,
        invalid_artifacts: 0,
        missing_artifacts: 0,
      },
    };
  }

  // Read and parse ZIP
  const zipData = readFileSync(options.bundlePath);
  const entries = parseZipFile(zipData);

  // Check metadata.json exists
  const metadataEntry = entries.get("metadata.json");
  if (!metadataEntry) {
    errors.push({
      code: "MISSING_METADATA",
      message: "metadata.json not found in bundle",
    });
    return {
      valid: false,
      errors,
      warnings,
      artifact_results: [],
      summary: {
        total_artifacts: 0,
        valid_artifacts: 0,
        invalid_artifacts: 0,
        missing_artifacts: 0,
      },
    };
  }

  // Parse metadata
  let metadata: EvidenceBundleMetadata;
  try {
    metadata = JSON.parse(metadataEntry.toString("utf8"));
  } catch (e) {
    errors.push({
      code: "METADATA_PARSE_ERROR",
      message: `Failed to parse metadata.json: ${e instanceof Error ? e.message : String(e)}`,
    });
    return {
      valid: false,
      errors,
      warnings,
      artifact_results: [],
      summary: {
        total_artifacts: 0,
        valid_artifacts: 0,
        invalid_artifacts: 0,
        missing_artifacts: 0,
      },
    };
  }

  // Validate each artifact in manifest
  for (const manifest of metadata.contents) {
    const artifactResult: ArtifactValidationResult = {
      artifact_name: manifest.name,
      artifact_type: manifest.type,
      exists: entries.has(manifest.name),
      hash_valid: false,
      schema_valid: false,
      parseable: false,
      errors: [],
      warnings: [],
    };

    if (!artifactResult.exists) {
      artifactResult.errors.push({
        code: "ARTIFACT_NOT_IN_BUNDLE",
        message: `Artifact ${manifest.name} listed in manifest but not found in bundle`,
        artifact: manifest.name,
      });
    } else {
      const entryData = entries.get(manifest.name)!;

      // Verify hash
      const actualHash = calculateContentHash(entryData);
      if (actualHash !== manifest.hash_sha256) {
        artifactResult.hash_valid = false;
        artifactResult.errors.push({
          code: "HASH_MISMATCH",
          message: `Hash mismatch for ${manifest.name}: expected ${manifest.hash_sha256}, got ${actualHash}`,
          artifact: manifest.name,
          details: { expected: manifest.hash_sha256, actual: actualHash },
        });
      } else {
        artifactResult.hash_valid = true;
      }

      // Check parseable (JSON/YAML)
      if (manifest.name.endsWith(".json") || manifest.name.endsWith(".sarif")) {
        try {
          JSON.parse(entryData.toString("utf8"));
          artifactResult.parseable = true;

          // Basic schema validation
          if (options.validateSchemas) {
            const parsed = JSON.parse(entryData.toString("utf8"));
            if (!parsed.version || !parsed.artifact) {
              artifactResult.warnings.push({
                code: "SCHEMA_HEADER_MISSING",
                message: `${manifest.name} missing version or artifact field`,
                artifact: manifest.name,
              });
            } else {
              artifactResult.schema_valid = true;
            }
          } else {
            artifactResult.schema_valid = true; // Skip detailed schema validation
          }
        } catch (e) {
          artifactResult.parseable = false;
          artifactResult.errors.push({
            code: "PARSE_ERROR",
            message: `Failed to parse ${manifest.name}: ${e instanceof Error ? e.message : String(e)}`,
            artifact: manifest.name,
          });
        }
      } else if (manifest.name.endsWith(".yaml") || manifest.name.endsWith(".yml")) {
        // Basic YAML check - just verify it's not empty
        if (entryData.length > 0) {
          artifactResult.parseable = true;
          artifactResult.schema_valid = true;
        } else {
          artifactResult.parseable = false;
          artifactResult.errors.push({
            code: "EMPTY_YAML",
            message: `${manifest.name} is empty`,
            artifact: manifest.name,
          });
        }
      } else {
        artifactResult.parseable = true;
        artifactResult.schema_valid = true;
      }
    }

    artifactResults.push(artifactResult);
  }

  // Check for required artifacts
  for (const requiredType of REQUIRED_ARTIFACTS) {
    const filename = ARTIFACT_FILENAME_MAP[requiredType];
    const found = metadata.contents.some((m) => m.name === filename);

    if (!found) {
      const error: ValidationError = {
        code: "MISSING_REQUIRED_ARTIFACT",
        message: `Required artifact ${filename} not found in bundle`,
        artifact: requiredType,
      };
      errors.push(error);

      // Add to artifact results if not already there
      if (!artifactResults.some((r) => r.artifact_name === filename)) {
        artifactResults.push({
          artifact_name: filename,
          artifact_type: requiredType,
          exists: false,
          hash_valid: false,
          schema_valid: false,
          parseable: false,
          errors: [error],
          warnings: [],
        });
      }
    }
  }

  // Validate signature if present
  if (metadata.signature) {
    const signatureEntry = entries.get("signature.json");
    if (!signatureEntry) {
      warnings.push({
        code: "SIGNATURE_FILE_MISSING",
        message: "Signature referenced in metadata but signature.json not found in bundle",
      });
    } else {
      try {
        const signature = JSON.parse(signatureEntry.toString("utf8"));
        if (signature.algorithm !== metadata.signature.algorithm) {
          warnings.push({
            code: "SIGNATURE_ALGORITHM_MISMATCH",
            message: `Signature algorithm mismatch: metadata says ${metadata.signature.algorithm}, file says ${signature.algorithm}`,
          });
        }
      } catch {
        warnings.push({
          code: "SIGNATURE_PARSE_ERROR",
          message: "Failed to parse signature.json",
        });
      }
    }
  }

  // Calculate summary
  const totalArtifacts = metadata.contents.length + REQUIRED_ARTIFACTS.filter(
    (t) => !metadata.contents.some((m) => m.type === t)
  ).length;

  const validArtifacts = artifactResults.filter(
    (r) => r.exists && r.hash_valid && r.parseable && r.schema_valid && r.errors.length === 0
  ).length;

  const invalidArtifacts = artifactResults.filter(
    (r) => r.errors.length > 0
  ).length;

  const missingArtifacts = artifactResults.filter(
    (r) => !r.exists
  ).length;

  // Determine overall validity
  const hasErrors = errors.length > 0 || artifactResults.some((r) => r.errors.length > 0);
  const hasRequiredMissing = REQUIRED_ARTIFACTS.some(
    (t) => !artifactResults.some((r) => r.artifact_type === t && r.exists)
  );

  const valid = !hasErrors && !hasRequiredMissing;

  // Check strict mode
  if (options.strict && warnings.length > 0) {
    return {
      valid: false,
      errors: [...errors, ...warnings.map((w) => ({
        code: w.code,
        message: w.message,
        artifact: w.artifact,
      } as ValidationError))],
      warnings: [],
      artifact_results: artifactResults,
      summary: {
        total_artifacts: totalArtifacts,
        valid_artifacts: validArtifacts,
        invalid_artifacts: invalidArtifacts,
        missing_artifacts: missingArtifacts,
      },
    };
  }

  return {
    valid,
    errors,
    warnings,
    artifact_results: artifactResults,
    summary: {
      total_artifacts: totalArtifacts,
      valid_artifacts: validArtifacts,
      invalid_artifacts: invalidArtifacts,
      missing_artifacts: missingArtifacts,
    },
  };
}

/**
 * Extract bundle contents to directory
 */
export async function extractBundleContents(
  bundlePath: string,
  extractDir: string
): Promise<{ extractedFiles: string[]; metadata: EvidenceBundleMetadata }> {
  if (!existsSync(bundlePath)) {
    throw new Error(`Bundle file not found: ${bundlePath}`);
  }

  // Create extract directory
  if (!existsSync(extractDir)) {
    mkdirSync(extractDir, { recursive: true });
  }

  // Read and parse ZIP
  const zipData = readFileSync(bundlePath);
  const entries = parseZipFile(zipData);

  // Extract all files
  const extractedFiles: string[] = [];

  for (const [name, data] of entries) {
    const outputPath = path.join(extractDir, name);
    writeFileSync(outputPath, data);
    extractedFiles.push(outputPath);
  }

  // Parse metadata
  const metadataData = entries.get("metadata.json");
  if (!metadataData) {
    throw new Error("metadata.json not found in bundle");
  }

  const metadata: EvidenceBundleMetadata = JSON.parse(metadataData.toString("utf8"));

  return { extractedFiles, metadata };
}

/**
 * List bundle contents without extracting
 */
export async function listBundleContents(bundlePath: string): Promise<{
  metadata: EvidenceBundleMetadata;
  entries: string[];
}> {
  if (!existsSync(bundlePath)) {
    throw new Error(`Bundle file not found: ${bundlePath}`);
  }

  const zipData = readFileSync(bundlePath);
  const entries = parseZipFile(zipData);

  // Parse metadata
  const metadataData = entries.get("metadata.json");
  if (!metadataData) {
    throw new Error("metadata.json not found in bundle");
  }

  const metadata: EvidenceBundleMetadata = JSON.parse(metadataData.toString("utf8"));

  return {
    metadata,
    entries: Array.from(entries.keys()),
  };
}