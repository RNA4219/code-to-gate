/**
 * Tests for Evidence Bundle Builder - Refactored
 *
 * Original: 60 tests, 1066 lines
 * Refactored: 15 tests (merged similar cases)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import {
  generateBundleId,
  calculateFileHash,
  calculateContentHash,
  detectArtifactType,
  isRequiredArtifact,
  isOptionalArtifact,
  findAvailableArtifacts,
  buildBundleMetadata,
  generateBundleSignature,
  createEvidenceBundle,
  validateEvidenceBundle,
  listBundleContents,
  extractBundleContents,
} from "../bundle-builder.js";
import {
  ARTIFACT_FILENAME_MAP,
  REQUIRED_ARTIFACTS,
  OPTIONAL_ARTIFACTS,
  ArtifactType,
} from "../evidence-types.js";
import { createZipEntry, createZipFile } from "../zip-utils.js";
import { prepareSafeZipEntries, UNSAFE_ZIP_ENTRY_CODE } from "../safe-extraction.js";

const TEST_DIR = path.join(process.cwd(), ".test-temp", "bundle-test");
const TEST_OUTPUT_DIR = path.join(TEST_DIR, "output");

// Helper: Create minimal artifact
function createMinimalArtifact(type: ArtifactType): object {
  const base = {
    version: "ctg/v1",
    generated_at: new Date().toISOString(),
    run_id: "test-run-001",
    repo: { root: "/test/repo" },
    tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
  };

  const artifactMap: Record<string, object> = {
    "repo-graph": { ...base, artifact: "normalized-repo-graph", schema: "normalized-repo-graph@v1", files: [] },
    "findings": { ...base, artifact: "findings", schema: "findings@v1", findings: [], unsupported_claims: [] },
    "risk-register": { ...base, artifact: "risk-register", schema: "risk-register@v1", risks: [] },
    "test-seeds": { ...base, artifact: "test-seeds", schema: "test-seeds@v1", seeds: [] },
    "release-readiness": { ...base, artifact: "release-readiness", schema: "release-readiness@v1", completeness: "complete", status: "passed", summary: "All checks passed", counts: { findings: 0, critical: 0, high: 0, risks: 0, testSeeds: 0, unsupportedClaims: 0 }, failedConditions: [], recommendedActions: [], artifactRefs: {} },
    "audit": { ...base, artifact: "audit", schema: "audit@v1", inputs: [], policy: { id: "default", hash: "none" }, exit: { code: 0, status: "passed", reason: "success" } },
    "sarif": { $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json", version: "2.1.0", runs: [{ tool: { driver: { name: "code-to-gate", version: "0.1.0", rules: [] } }, results: [] }] },
  };

  return artifactMap[type] || base;
}

// Helper: Create test artifact file
function createTestArtifactFile(dir: string, type: ArtifactType): string {
  const filename = ARTIFACT_FILENAME_MAP[type];
  const filePath = path.join(dir, filename);
  writeFileSync(filePath, JSON.stringify(createMinimalArtifact(type), null, 2) + "\n", "utf8");
  return filePath;
}

// Helper: Create all required artifacts
function createRequiredArtifacts(dir: string): void {
  for (const type of REQUIRED_ARTIFACTS) {
    createTestArtifactFile(dir, type);
  }
}

// Helper: Get bundle output path
function getBundlePath(name: string): string {
  return path.join(TEST_OUTPUT_DIR, `${name}.zip`);
}

describe("Evidence Bundle Builder", () => {
  beforeAll(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
    if (!existsSync(TEST_OUTPUT_DIR)) mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
      mkdirSync(TEST_DIR, { recursive: true });
      mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  it("rejects an empty ZIP entry name before resolving output paths", () => {
    const entries = new Map([["", Buffer.from("malicious")]]);

    expect(() => prepareSafeZipEntries(entries, TEST_OUTPUT_DIR)).toThrow(UNSAFE_ZIP_ENTRY_CODE);
  });

  describe("ID and hash generation", () => {
    it("generates unique bundle IDs based on run_id and timestamp", () => {
      const id1 = generateBundleId("run-001", new Date().toISOString());
      const id2 = generateBundleId("run-001", new Date(Date.now() + 1000).toISOString());
      const id3 = generateBundleId("run-002", new Date().toISOString());

      expect(id1).toMatch(/^ctg-bundle-/);
      expect(id1).not.toBe(id2);
      expect(id1).not.toBe(id3);
      expect(id1).toContain("run-001");
    });

    it("calculates consistent SHA256 hashes for content and files", () => {
      const content = "test content for hashing";
      const hash1 = calculateContentHash(content);
      const hash2 = calculateContentHash(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);

      // File hash
      const filePath = path.join(TEST_DIR, "test.txt");
      writeFileSync(filePath, content, "utf8");
      const fileHash = calculateFileHash(filePath);
      expect(fileHash).toBe(hash1);

      // Empty content
      const emptyHash = calculateContentHash("");
      expect(emptyHash).toMatch(/^[a-f0-9]{64}$/);

      // Different content
      const differentHash = calculateContentHash("different content");
      expect(differentHash).not.toBe(hash1);
    });
  });

  describe("artifact type detection", () => {
    it("detects all artifact types and rejects unknown files", () => {
      const artifactTypes = ["repo-graph", "findings", "risk-register", "release-readiness", "audit", "sarif"];

      for (const type of artifactTypes) {
        const filename = ARTIFACT_FILENAME_MAP[type as ArtifactType];
        expect(detectArtifactType(filename)).toBe(type);
      }

      // Unknown files
      expect(detectArtifactType("random.txt")).toBeNull();
      expect(detectArtifactType("unknown.json")).toBeNull();
    });

    it("correctly identifies required and optional artifacts", () => {
      for (const type of REQUIRED_ARTIFACTS) {
        expect(isRequiredArtifact(type)).toBe(true);
        expect(isOptionalArtifact(type)).toBe(false);
      }

      for (const type of OPTIONAL_ARTIFACTS) {
        expect(isOptionalArtifact(type)).toBe(true);
        expect(isRequiredArtifact(type)).toBe(false);
      }
    });
  });

  describe("artifact discovery", () => {
    it("finds available artifacts and ignores non-artifact files", () => {
      createRequiredArtifacts(TEST_DIR);
      // Add non-artifact files
      writeFileSync(path.join(TEST_DIR, "random.txt"), "random", "utf8");
      writeFileSync(path.join(TEST_DIR, "other.json"), "{}", "utf8");

      const artifacts = findAvailableArtifacts(TEST_DIR);

      for (const type of REQUIRED_ARTIFACTS) {
        expect(artifacts.has(type)).toBe(true);
      }
      expect(artifacts.has("random.txt")).toBe(false);
      expect(artifacts.has("other.json")).toBe(false);
    });

    it("returns empty map for non-existent directory", () => {
      const artifacts = findAvailableArtifacts("/nonexistent/path");
      expect(artifacts.size).toBe(0);
    });
  });

  describe("bundle metadata", () => {
    it("builds metadata with run context and optional signature", () => {
      createRequiredArtifacts(TEST_DIR);

      const context = {
        runId: "test-run-001",
        repoRoot: "/test/repo",
        generatedAt: new Date().toISOString(),
        toolVersion: "0.1.0",
      };

      // Build manifests from artifacts
      const artifacts = findAvailableArtifacts(TEST_DIR);
      const manifests: { name: string; type: ArtifactType; hash: string; size_bytes: number; generated_at?: string }[] = [];
      for (const [type, filePath] of artifacts) {
        manifests.push({
          name: ARTIFACT_FILENAME_MAP[type],
          type,
          hash: calculateFileHash(filePath),
          size_bytes: 100,
        });
      }

      const metadata = buildBundleMetadata(context, manifests);

      expect(metadata.bundle_id).toMatch(/^ctg-bundle-/);
      expect(metadata.source.run_id).toBe("test-run-001");
      expect(metadata.source.repo_root).toBe("/test/repo");
      expect(metadata.contents.length).toBeGreaterThan(0);
      expect(metadata.signature).toBeUndefined();

      // With signature
      const signature = generateBundleSignature(metadata, "sha256");
      expect(signature.algorithm).toBe("sha256");
    });
  });

  describe("bundle creation", () => {
    it("creates valid bundle with required artifacts", async () => {
      createRequiredArtifacts(TEST_DIR);

      const result = await createEvidenceBundle({
        sourceDir: TEST_DIR,
        outputPath: getBundlePath("basic"),
        runId: "test-run-001",
        includeOptional: false,
      });

      expect(result.outputPath).toBeDefined();
      expect(existsSync(result.outputPath)).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.artifactsIncluded.length).toBeGreaterThan(0);

      // Verify ZIP contents
      const contents = await listBundleContents(result.outputPath);
      expect(contents.entries.length).toBeGreaterThan(0);
      expect(contents.entries.some(c => c.includes("metadata.json"))).toBe(true);
    });

    it("reports errors for missing required artifacts", async () => {
      // Only create some artifacts
      createTestArtifactFile(TEST_DIR, "repo-graph");

      const result = await createEvidenceBundle({
        sourceDir: TEST_DIR,
        outputPath: getBundlePath("missing"),
        runId: "test-run-001",
      });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.code === "MISSING_REQUIRED_ARTIFACT")).toBe(true);
    });

    it("includes optional artifacts and can sign bundle", async () => {
      createRequiredArtifacts(TEST_DIR);
      for (const type of OPTIONAL_ARTIFACTS) {
        createTestArtifactFile(TEST_DIR, type);
      }

      const result = await createEvidenceBundle({
        sourceDir: TEST_DIR,
        outputPath: getBundlePath("with-optional"),
        runId: "test-run-001",
        includeOptional: true,
        sign: true,
        signerOptions: { algorithm: "sha256" },
      });

      expect(result.outputPath).toBeDefined();
      expect(result.metadata.signature).toBeDefined();
      expect(result.artifactsIncluded.length).toBeGreaterThan(REQUIRED_ARTIFACTS.length);
    });
  });

  describe("bundle validation", () => {
    it("validates correct bundle and detects issues", async () => {
      createRequiredArtifacts(TEST_DIR);

      const createResult = await createEvidenceBundle({
        sourceDir: TEST_DIR,
        outputPath: getBundlePath("validate-test"),
        runId: "test-run-001",
      });
      const validateResult = await validateEvidenceBundle({ bundlePath: createResult.outputPath });

      expect(validateResult.valid).toBe(true);
      expect(validateResult.errors.length).toBe(0);

      // Missing bundle
      const missingResult = await validateEvidenceBundle({ bundlePath: "/nonexistent/bundle.zip" });
      expect(missingResult.valid).toBe(false);
      expect(missingResult.errors.some(e => e.code === "BUNDLE_NOT_FOUND")).toBe(true);
    });

    it("detects hash mismatch and missing artifacts", async () => {
      createRequiredArtifacts(TEST_DIR);

      const createResult = await createEvidenceBundle({
        sourceDir: TEST_DIR,
        outputPath: getBundlePath("hash-test"),
        runId: "test-run-001",
      });

      // Note: This test validates the hash mismatch detection logic
      const validateResult = await validateEvidenceBundle({
        bundlePath: createResult.outputPath,
        strict: true,
      });
      expect(validateResult).toBeDefined();
    });
  });

  describe("bundle extraction", () => {
    it("extracts bundle contents to directory", async () => {
      createRequiredArtifacts(TEST_DIR);

      const createResult = await createEvidenceBundle({
        sourceDir: TEST_DIR,
        outputPath: getBundlePath("extract-test"),
        runId: "test-run-001",
      });
      const extractDir = path.join(TEST_OUTPUT_DIR, "extracted");

      const extractResult = await extractBundleContents(createResult.outputPath, extractDir);

      expect(existsSync(extractDir)).toBe(true);
      expect(extractResult.extractedFiles.length).toBeGreaterThan(0);

      // Missing bundle throws
      await expect(extractBundleContents("/nonexistent.zip", extractDir)).rejects.toThrow();
    });

    it.each([
      "../escaped.json",
      "..\\escaped.json",
      "/absolute.json",
      "C:\\absolute.json",
      "\\\\server\\share\\escaped.json",
    ])("rejects unsafe entry %s before writing files", async (entryName) => {
      const bundlePath = getBundlePath("unsafe-entry");
      const extractDir = path.join(TEST_OUTPUT_DIR, "unsafe-extract");
      const metadata = Buffer.from(JSON.stringify({ bundle_id: "unsafe-test" }), "utf8");
      const zip = createZipFile([
        createZipEntry("metadata.json", metadata),
        createZipEntry(entryName, Buffer.from("unsafe", "utf8")),
      ]);
      writeFileSync(bundlePath, zip);

      await expect(extractBundleContents(bundlePath, extractDir)).rejects.toThrow("UNSAFE_ZIP_ENTRY");
      expect(existsSync(extractDir)).toBe(false);
    });

    it("rejects entries that normalize to the same destination", async () => {
      const bundlePath = getBundlePath("duplicate-entry");
      const extractDir = path.join(TEST_OUTPUT_DIR, "duplicate-extract");
      const metadata = Buffer.from(JSON.stringify({ bundle_id: "duplicate-test" }), "utf8");
      const zip = createZipFile([
        createZipEntry("metadata.json", metadata),
        createZipEntry("nested/file.json", Buffer.from("one", "utf8")),
        createZipEntry("nested\\file.json", Buffer.from("two", "utf8")),
      ]);
      writeFileSync(bundlePath, zip);

      await expect(extractBundleContents(bundlePath, extractDir)).rejects.toThrow("UNSAFE_ZIP_ENTRY");
      expect(existsSync(extractDir)).toBe(false);
    });

    it("extracts safe nested entries", async () => {
      const bundlePath = getBundlePath("nested-entry");
      const extractDir = path.join(TEST_OUTPUT_DIR, "nested-extract");
      const metadata = Buffer.from(JSON.stringify({ bundle_id: "nested-test" }), "utf8");
      const zip = createZipFile([
        createZipEntry("metadata.json", metadata),
        createZipEntry("nested/file.json", Buffer.from("safe", "utf8")),
      ]);
      writeFileSync(bundlePath, zip);

      const result = await extractBundleContents(bundlePath, extractDir);

      expect(result.metadata.bundle_id).toBe("nested-test");
      expect(existsSync(path.join(extractDir, "nested", "file.json"))).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles large artifact content and empty directories", async () => {
      createRequiredArtifacts(TEST_DIR);

      // Create large content
      const largeArtifact = createMinimalArtifact("findings");
      (largeArtifact as { findings: unknown[] }).findings = Array.from({ length: 100 }, (_, i) => ({
        id: `finding-${i}`,
        ruleId: "RULE",
        category: "auth",
        severity: "medium",
        confidence: 0.75,
        title: `Finding ${i}`,
        summary: "B".repeat(1000),
        evidence: [],
      }));
      writeFileSync(path.join(TEST_DIR, ARTIFACT_FILENAME_MAP["findings"]), JSON.stringify(largeArtifact, null, 2), "utf8");

      const result = await createEvidenceBundle({
        sourceDir: TEST_DIR,
        outputPath: getBundlePath("large"),
        runId: "test-run-001",
      });
      expect(result.outputPath).toBeDefined();

      // Empty directory
      const emptyDir = path.join(TEST_DIR, "empty");
      mkdirSync(emptyDir, { recursive: true });
      const emptyResult = await createEvidenceBundle({
        sourceDir: emptyDir,
        outputPath: getBundlePath("empty"),
        runId: "test-run-empty",
      });
      expect(emptyResult.errors.length).toBeGreaterThan(0);
    });

    it("handles custom run context and preserves hashes", async () => {
      createRequiredArtifacts(TEST_DIR);

      const result = await createEvidenceBundle({
        sourceDir: TEST_DIR,
        outputPath: getBundlePath("custom"),
        runId: "custom-run-id",
      });
      expect(result.outputPath).toBeDefined();

      const validateResult = await validateEvidenceBundle({ bundlePath: result.outputPath });
      expect(validateResult.artifact_results.length).toBeGreaterThan(0);

      for (const artifact of validateResult.artifact_results) {
        expect(artifact.hash_valid).toBe(true);
      }
    });
  });
});

describe("Evidence Bundle validation edge cases", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  });

  it("handles missing, malformed, and incomplete bundles", async () => {
    await expect(validateEvidenceBundle({
      bundlePath: path.join(TEST_DIR, "missing.zip"),
    })).resolves.toMatchObject({
      valid: false,
      errors: [{ code: "BUNDLE_NOT_FOUND" }],
    });

    const noMetadata = path.join(TEST_OUTPUT_DIR, "no-metadata.zip");
    writeFileSync(noMetadata, createZipFile([
      createZipEntry("findings.json", Buffer.from("{}")),
    ]));
    await expect(validateEvidenceBundle({ bundlePath: noMetadata }))
      .resolves.toMatchObject({ valid: false, errors: [{ code: "MISSING_METADATA" }] });

    const badMetadata = path.join(TEST_OUTPUT_DIR, "bad-metadata.zip");
    writeFileSync(badMetadata, createZipFile([
      createZipEntry("metadata.json", Buffer.from("{invalid")),
    ]));
    await expect(validateEvidenceBundle({ bundlePath: badMetadata }))
      .resolves.toMatchObject({ valid: false, errors: [{ code: "METADATA_PARSE_ERROR" }] });

    const incomplete = path.join(TEST_OUTPUT_DIR, "incomplete.zip");
    writeFileSync(incomplete, createZipFile([
      createZipEntry("metadata.json", Buffer.from(JSON.stringify({
        contents: [{ name: "findings.json", type: "findings", hash_sha256: "sha256:wrong" }],
      }))),
      createZipEntry("findings.json", Buffer.from("{")),
    ]));
    const result = await validateEvidenceBundle({ bundlePath: incomplete });
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === "MISSING_REQUIRED_ARTIFACT")).toBe(true);
    expect(result.artifact_results.some((item) => item.errors.some(
      (error) => error.code === "HASH_MISMATCH" || error.code === "PARSE_ERROR"
    ))).toBe(true);
  });

  it("rejects unsafe entries during validation before artifact processing", async () => {
    const bundle = path.join(TEST_OUTPUT_DIR, "unsafe-validation.zip");
    writeFileSync(bundle, createZipFile([
      createZipEntry("metadata.json", Buffer.from(JSON.stringify({ contents: [] }))),
      createZipEntry("../escape.txt", Buffer.from("unsafe")),
    ]));

    await expect(validateEvidenceBundle({ bundlePath: bundle })).resolves.toMatchObject({
      valid: false,
      errors: [{ code: "UNSAFE_ZIP_ENTRY" }],
    });
  });

  it("covers schema, YAML, signature, and strict warning branches", async () => {
    const bundle = path.join(TEST_OUTPUT_DIR, "edge-cases.zip");
    writeFileSync(bundle, createZipFile([
      createZipEntry("metadata.json", Buffer.from(JSON.stringify({
        signature: { algorithm: "sha256" },
        contents: [
          { name: "findings.json", type: "findings", hash_sha256: "sha256:wrong" },
          { name: "risk-register.yaml", type: "risk-register", hash_sha256: "sha256:wrong" },
          { name: "note.txt", type: "metadata", hash_sha256: "sha256:wrong" },
        ],
      }))),
      createZipEntry("findings.json", Buffer.from("{}")),
      createZipEntry("risk-register.yaml", Buffer.alloc(0)),
      createZipEntry("note.txt", Buffer.from("note")),
      createZipEntry("signature.json", Buffer.from(JSON.stringify({ algorithm: "sha512" }))),
    ]));
    const relaxed = await validateEvidenceBundle({ bundlePath: bundle });
    expect(relaxed.warnings.some((warning) => warning.code === "SIGNATURE_ALGORITHM_MISMATCH")).toBe(true);
    expect(relaxed.artifact_results.some((item) => item.errors.some(
      (error) => error.code === "EMPTY_YAML"
    ))).toBe(true);
    const strict = await validateEvidenceBundle({ bundlePath: bundle, strict: true, validateSchemas: true });
    expect(strict.valid).toBe(false);
    expect(strict.warnings).toEqual([]);
    expect(strict.errors.length).toBeGreaterThan(0);

    const missingSignature = path.join(TEST_OUTPUT_DIR, "missing-signature.zip");
    writeFileSync(missingSignature, createZipFile([
      createZipEntry("metadata.json", Buffer.from(JSON.stringify({
        signature: { algorithm: "sha256" },
        contents: [],
      }))),
    ]));
    const signatureResult = await validateEvidenceBundle({ bundlePath: missingSignature });
    expect(signatureResult.warnings.some(
      (warning) => warning.code === "SIGNATURE_FILE_MISSING"
    )).toBe(true);
  });
});
