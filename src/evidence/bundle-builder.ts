/**
 * Evidence Bundle Builder - Create workflow-cookbook Evidence format bundle
 *
 * Creates ZIP bundles containing all artifacts + metadata.json + signature (optional)
 * Based on docs/product-acceptance-v1.md Section 6 "Acceptance Evidence"
 */

import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  EVIDENCE_VERSION,
  EvidenceBundleMetadata,
  BundleArtifactManifest,
  BundleValidationResult,
  ArtifactValidationResult,
  ValidationError,
  ValidationWarning,
  BundleBuilderOptions,
  BundleValidatorOptions,
  ArtifactType,
  REQUIRED_ARTIFACTS,
  OPTIONAL_ARTIFACTS,
  ARTIFACT_FILENAME_MAP,
  EvidenceRunContext,
  BundleSignature,
} from "./evidence-types.js";

const VERSION = "0.2.0";

// === Simple ZIP Implementation (no external dependencies) ===

interface ZipEntry {
  name: string;
  data: Buffer;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
}

/**
 * Calculate CRC32 checksum for data
 */
function crc32(data: Buffer): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }

  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Create a simple ZIP file from entries
 * Note: This is a basic implementation without compression
 */
function createZipFile(entries: ZipEntry[]): Buffer {
  const localFileHeaders: Buffer[] = [];
  const centralDirectoryHeaders: Buffer[] = [];
  let offset = 0;

  // Build local file headers and data
  for (const entry of entries) {
    // Local file header (version 2.0, no compression)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4); // Version needed
    localHeader.writeUInt16LE(0, 6); // General purpose flag
    localHeader.writeUInt16LE(0, 8); // Compression method (stored)
    localHeader.writeUInt16LE(0, 10); // Last mod time
    localHeader.writeUInt16LE(0, 12); // Last mod date
    localHeader.writeUInt32LE(entry.crc32, 14); // CRC-32
    localHeader.writeUInt32LE(entry.compressedSize, 18); // Compressed size
    localHeader.writeUInt32LE(entry.uncompressedSize, 22); // Uncompressed size
    localHeader.writeUInt16LE(entry.name.length, 26); // Filename length
    localHeader.writeUInt16LE(0, 28); // Extra field length

    const filenameBuffer = Buffer.from(entry.name, "utf8");
    localFileHeaders.push(Buffer.concat([localHeader, filenameBuffer, entry.data]));

    // Central directory header
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed
    centralHeader.writeUInt16LE(0, 8); // General purpose flag
    centralHeader.writeUInt16LE(0, 10); // Compression method
    centralHeader.writeUInt16LE(0, 12); // Last mod time
    centralHeader.writeUInt16LE(0, 14); // Last mod date
    centralHeader.writeUInt32LE(entry.crc32, 16); // CRC-32
    centralHeader.writeUInt32LE(entry.compressedSize, 20); // Compressed size
    centralHeader.writeUInt32LE(entry.uncompressedSize, 24); // Uncompressed size
    centralHeader.writeUInt16LE(entry.name.length, 28); // Filename length
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // File comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0, 38); // External file attributes
    centralHeader.writeUInt32LE(offset, 42); // Relative offset of local header

    centralDirectoryHeaders.push(Buffer.concat([centralHeader, filenameBuffer]));

    offset += localHeader.length + filenameBuffer.length + entry.data.length;
  }

  // End of central directory
  const centralDirOffset = offset;
  const centralDirSize = centralDirectoryHeaders.reduce((sum, h) => sum + h.length, 0);

  const endOfCentralDir = Buffer.alloc(22);
  endOfCentralDir.writeUInt32LE(0x06054b50, 0); // Signature
  endOfCentralDir.writeUInt16LE(0, 4); // Disk number
  endOfCentralDir.writeUInt16LE(0, 6); // Disk with central directory
  endOfCentralDir.writeUInt16LE(entries.length, 8); // Entries on this disk
  endOfCentralDir.writeUInt16LE(entries.length, 10); // Total entries
  endOfCentralDir.writeUInt32LE(centralDirSize, 12); // Central directory size
  endOfCentralDir.writeUInt32LE(centralDirOffset, 16); // Central directory offset
  endOfCentralDir.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([
    ...localFileHeaders,
    ...centralDirectoryHeaders,
    endOfCentralDir,
  ]);
}

/**
 * Parse a simple ZIP file and extract entries
 */
function parseZipFile(zipData: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let offset = 0;

  while (offset < zipData.length - 22) {
    // Check for local file header signature
    const signature = zipData.readUInt32LE(offset);
    if (signature === 0x04034b50) {
      // Local file header
      const filenameLen = zipData.readUInt16LE(offset + 26);
      const extraLen = zipData.readUInt16LE(offset + 28);
      const compressedSize = zipData.readUInt32LE(offset + 18);
      const uncompressedSize = zipData.readUInt32LE(offset + 22);

      // Verify sizes match (stored, no compression)
      const dataSize = compressedSize === 0 ? uncompressedSize : compressedSize;

      const filenameStart = offset + 30;
      const filename = zipData.toString("utf8", filenameStart, filenameStart + filenameLen);
      const dataStart = filenameStart + filenameLen + extraLen;
      const data = zipData.subarray(dataStart, dataStart + dataSize);

      entries.set(filename, data);

      offset = dataStart + dataSize;
    } else if (signature === 0x02014b50) {
      // Central directory header - skip
      const filenameLen = zipData.readUInt16LE(offset + 28);
      const extraLen = zipData.readUInt16LE(offset + 30);
      const commentLen = zipData.readUInt16LE(offset + 32);
      offset += 46 + filenameLen + extraLen + commentLen;
    } else if (signature === 0x06054b50) {
      // End of central directory - done
      break;
    } else {
      // Unknown signature, move forward
      offset += 1;
    }
  }

  return entries;
}

// === Bundle Builder ===

/**
 * Generate a unique bundle ID
 */
export function generateBundleId(runId: string, timestamp: string): string {
  const hash = createHash("sha256")
    .update(`${runId}-${timestamp}`)
    .digest("hex")
    .slice(0, 16);
  return `ctg-bundle-${runId}-${hash}`;
}

/**
 * Calculate SHA256 hash of file content
 */
export function calculateFileHash(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Calculate SHA256 hash of content
 */
export function calculateContentHash(content: Buffer | string): string {
  const data = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Detect artifact type from filename
 */
export function detectArtifactType(filename: string): ArtifactType | null {
  for (const [type, name] of Object.entries(ARTIFACT_FILENAME_MAP)) {
    if (name === filename) {
      return type as ArtifactType;
    }
  }
  return null;
}

/**
 * Check if artifact is required
 */
export function isRequiredArtifact(type: ArtifactType): boolean {
  return REQUIRED_ARTIFACTS.includes(type);
}

/**
 * Check if artifact is optional
 */
export function isOptionalArtifact(type: ArtifactType): boolean {
  return OPTIONAL_ARTIFACTS.includes(type);
}

/**
 * Find available artifacts in a directory
 */
export function findAvailableArtifacts(sourceDir: string): Map<ArtifactType, string> {
  const artifacts = new Map<ArtifactType, string>();

  if (!existsSync(sourceDir)) {
    return artifacts;
  }

  const files = readdirSync(sourceDir);

  for (const file of files) {
    const type = detectArtifactType(file);
    if (type) {
      artifacts.set(type, path.join(sourceDir, file));
    }
  }

  return artifacts;
}

/**
 * Build artifact manifest from file
 */
export function buildArtifactManifest(filePath: string, type: ArtifactType): BundleArtifactManifest | null {
  if (!existsSync(filePath)) {
    return null;
  }

  const stats = statSync(filePath);
  const hash = calculateFileHash(filePath);
  const filename = path.basename(filePath);

  // Try to read generated_at from JSON artifacts
  let generatedAt: string | undefined;
  let schemaVersion: string | undefined;

  if (filename.endsWith(".json") || filename.endsWith(".sarif")) {
    try {
      const content = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content);
      generatedAt = parsed.generated_at;
      schemaVersion = parsed.schema;
    } catch {
      // Not parseable JSON, skip
    }
  }

  return {
    name: filename,
    path: filename,
    type,
    size_bytes: stats.size,
    hash_sha256: hash,
    schema_version: schemaVersion,
    generated_at: generatedAt,
  };
}

/**
 * Build bundle metadata
 */
export function buildBundleMetadata(
  context: EvidenceRunContext,
  manifests: BundleArtifactManifest[],
  signature?: BundleSignature
): EvidenceBundleMetadata {
  return {
    version: EVIDENCE_VERSION,
    generated_at: context.generatedAt,
    bundle_id: generateBundleId(context.runId, context.generatedAt),
    source: {
      repo_root: context.repoRoot,
      revision: context.revision,
      branch: context.branch,
      run_id: context.runId,
      tool_version: context.toolVersion,
      policy_id: context.policyId,
    },
    contents: manifests,
    signature,
    validation_status: "pending",
  };
}

/**
 * Generate bundle signature
 */
export function generateBundleSignature(
  metadata: EvidenceBundleMetadata,
  algorithm: "sha256" | "sha512" | "ed25519" = "sha256"
): BundleSignature {
  // Sign the metadata content hash
  const metadataHash = calculateContentHash(JSON.stringify(metadata, null, 2));

  // For ed25519, we would need actual key signing - for now use hash-based fallback
  const hashAlgorithm = algorithm === "ed25519" ? "sha256" : algorithm;
  const signatureValue = hashAlgorithm === "sha512"
    ? createHash("sha512").update(metadataHash).digest("hex")
    : metadataHash;

  return {
    algorithm,
    value: signatureValue,
    created_at: new Date().toISOString(),
  };
}

/**
 * Create evidence bundle from artifact directory
 */
export async function createEvidenceBundle(options: BundleBuilderOptions): Promise<{
  outputPath: string;
  metadata: EvidenceBundleMetadata;
  artifactsIncluded: ArtifactType[];
  artifactsExcluded: ArtifactType[];
  errors: ValidationError[];
}> {
  const errors: ValidationError[] = [];
  const artifactsIncluded: ArtifactType[] = [];
  const artifactsExcluded: ArtifactType[] = [];

  // Find available artifacts
  const availableArtifacts = findAvailableArtifacts(options.sourceDir);

  // Determine which artifacts to include
  const includeTypes = options.includeOptional
    ? [...REQUIRED_ARTIFACTS, ...OPTIONAL_ARTIFACTS]
    : REQUIRED_ARTIFACTS;

  // Filter out excluded artifacts
  const filteredTypes = includeTypes.filter(
    (t) => !options.excludeArtifacts?.includes(t)
  );

  // Add explicitly excluded artifacts to the excluded list
  if (options.excludeArtifacts) {
    for (const excludedType of options.excludeArtifacts) {
      if (includeTypes.includes(excludedType)) {
        artifactsExcluded.push(excludedType);
      }
    }
  }

  // Build manifests and entries
  const manifests: BundleArtifactManifest[] = [];
  const zipEntries: ZipEntry[] = [];

  for (const type of filteredTypes) {
    const filePath = availableArtifacts.get(type);

    if (!filePath) {
      if (isRequiredArtifact(type)) {
        errors.push({
          code: "MISSING_REQUIRED_ARTIFACT",
          message: `Required artifact not found: ${ARTIFACT_FILENAME_MAP[type]}`,
          artifact: type,
        });
      }
      artifactsExcluded.push(type);
      continue;
    }

    const manifest = buildArtifactManifest(filePath, type);
    if (manifest) {
      manifests.push(manifest);
      artifactsIncluded.push(type);

      // Add to ZIP
      const content = readFileSync(filePath);
      zipEntries.push({
        name: manifest.name,
        data: content,
        crc32: crc32(content),
        compressedSize: content.length,
        uncompressedSize: content.length,
      });
    }
  }

  // Try to read run_id from available artifacts
  let runId = options.runId;
  let repoRoot = process.cwd();
  let revision: string | undefined;
  let branch: string | undefined;
  let policyId: string | undefined;

  if (!runId) {
    // Try to extract from findings.json or audit.json
    for (const artifactType of ["findings", "audit", "repo-graph"] as ArtifactType[]) {
      const filePath = availableArtifacts.get(artifactType);
      if (filePath) {
        try {
          const content = readFileSync(filePath, "utf8");
          const parsed = JSON.parse(content);
          if (parsed.run_id) {
            runId = parsed.run_id;
          }
          if (parsed.repo?.root) {
            repoRoot = parsed.repo.root;
          }
          if (parsed.repo?.revision) {
            revision = parsed.repo.revision;
          }
          if (parsed.repo?.branch) {
            branch = parsed.repo.branch;
          }
          if (parsed.tool?.policy_id) {
            policyId = parsed.tool.policy_id;
          }
          break;
        } catch {
          // Skip if not parseable
        }
      }
    }

    if (!runId) {
      runId = `run-${Date.now()}`;
    }
  }

  // Build metadata
  const context: EvidenceRunContext = {
    runId,
    repoRoot,
    revision,
    branch,
    toolVersion: VERSION,
    policyId,
    generatedAt: new Date().toISOString(),
  };

  const signature = options.sign
    ? generateBundleSignature(buildBundleMetadata(context, manifests), (options.signerOptions?.algorithm === "ed25519" ? "sha256" : options.signerOptions?.algorithm) ?? "sha256")
    : undefined;

  const metadata = buildBundleMetadata(context, manifests, signature);

  // Add metadata.json to ZIP
  const metadataContent = Buffer.from(JSON.stringify(metadata, null, 2) + "\n", "utf8");
  zipEntries.push({
    name: "metadata.json",
    data: metadataContent,
    crc32: crc32(metadataContent),
    compressedSize: metadataContent.length,
    uncompressedSize: metadataContent.length,
  });

  // Add signature.json if signing
  if (signature) {
    const signatureContent = Buffer.from(JSON.stringify(signature, null, 2) + "\n", "utf8");
    zipEntries.push({
      name: "signature.json",
      data: signatureContent,
      crc32: crc32(signatureContent),
      compressedSize: signatureContent.length,
      uncompressedSize: signatureContent.length,
    });
  }

  // Create ZIP file
  const zipData = createZipFile(zipEntries);

  // Ensure output directory exists
  const outputDir = path.dirname(options.outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Write ZIP file
  writeFileSync(options.outputPath, zipData);

  return {
    outputPath: options.outputPath,
    metadata,
    artifactsIncluded,
    artifactsExcluded,
    errors,
  };
}

// === Bundle Validator ===

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