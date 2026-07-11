import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { evidenceCommand } from "../evidence.js";
import { EXIT, VERSION, getOption } from "../exit-codes.js";
import { createZipEntry, createZipFile } from "../../evidence/zip-utils.js";

const TEST_DIR = path.join(process.cwd(), ".test-temp", "cli-evidence-test");

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("evidence extract CLI", () => {
  function createRequiredArtifacts(dir: string): void {
    mkdirSync(dir, { recursive: true });
    const base = {
      version: "ctg/v1",
      generated_at: new Date().toISOString(),
      run_id: "cli-evidence-run",
      repo: { root: "/test/repo" },
      tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
    };
    const artifacts = {
      "repo-graph.json": {
        ...base,
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        files: [],
      },
      "findings.json": {
        ...base,
        artifact: "findings",
        schema: "findings@v1",
        findings: [],
        unsupported_claims: [],
      },
      "risk-register.yaml": {
        ...base,
        artifact: "risk-register",
        schema: "risk-register@v1",
        risks: [],
      },
      "release-readiness.json": {
        ...base,
        artifact: "release-readiness",
        schema: "release-readiness@v1",
        completeness: "complete",
        status: "passed",
        summary: "ready",
        counts: {
          findings: 0,
          critical: 0,
          high: 0,
          risks: 0,
          testSeeds: 0,
          unsupportedClaims: 0,
        },
        failedConditions: [],
        recommendedActions: [],
        artifactRefs: {},
      },
      "audit.json": {
        ...base,
        artifact: "audit",
        schema: "audit@v1",
        inputs: [],
        policy: { id: "default", hash: "none" },
        exit: { code: 0, status: "passed", reason: "success" },
      },
    };
    for (const [name, content] of Object.entries(artifacts)) {
      writeFileSync(path.join(dir, name), JSON.stringify(content), "utf8");
    }
  }

  it("covers usage and missing path diagnostics", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(evidenceCommand([], { VERSION, EXIT, getOption }))
      .resolves.toBe(EXIT.USAGE_ERROR);
    await expect(evidenceCommand(["unknown"], { VERSION, EXIT, getOption }))
      .resolves.toBe(EXIT.USAGE_ERROR);
    await expect(evidenceCommand(["bundle"], { VERSION, EXIT, getOption }))
      .resolves.toBe(EXIT.USAGE_ERROR);
    await expect(evidenceCommand([
      "bundle",
      "--from",
      "missing",
      "--out",
      "bundle.zip",
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.USAGE_ERROR);
    await expect(evidenceCommand(["validate"], { VERSION, EXIT, getOption }))
      .resolves.toBe(EXIT.USAGE_ERROR);
    await expect(evidenceCommand(["validate", "missing.zip"], { VERSION, EXIT, getOption }))
      .resolves.toBe(EXIT.USAGE_ERROR);
    await expect(evidenceCommand(["list"], { VERSION, EXIT, getOption }))
      .resolves.toBe(EXIT.USAGE_ERROR);
    await expect(evidenceCommand(["list", "missing.zip"], { VERSION, EXIT, getOption }))
      .resolves.toBe(EXIT.USAGE_ERROR);
    await expect(evidenceCommand(["extract"], { VERSION, EXIT, getOption }))
      .resolves.toBe(EXIT.USAGE_ERROR);
    await expect(evidenceCommand([
      "extract",
      "missing.zip",
      "--out",
      "out",
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.USAGE_ERROR);

    mkdirSync(TEST_DIR, { recursive: true });
    const filePath = path.join(TEST_DIR, "not-a-directory.json");
    writeFileSync(filePath, "{}");
    await expect(evidenceCommand([
      "bundle",
      "--from",
      filePath,
      "--out",
      path.join(TEST_DIR, "bundle.zip"),
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.USAGE_ERROR);
  });

  it("creates, validates, lists, and extracts a safe bundle", async () => {
    const artifactsDir = path.join(TEST_DIR, "artifacts");
    const bundlePath = path.join(TEST_DIR, "evidence.zip");
    const extractDir = path.join(TEST_DIR, "extracted");
    createRequiredArtifacts(artifactsDir);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(evidenceCommand([
      "bundle",
      "--from",
      artifactsDir,
      "--out",
      bundlePath,
      "--run-id",
      "explicit-run",
      "--include-optional",
      "--sign",
      "--verbose",
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.OK);
    expect(existsSync(bundlePath)).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Bundle ID:"));

    await expect(evidenceCommand([
      "validate",
      bundlePath,
      "--strict",
      "--validate-schemas",
      "--verbose",
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.OK);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Validation Result: VALID"));

    await expect(evidenceCommand([
      "list",
      bundlePath,
      "--verbose",
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.OK);
    await expect(evidenceCommand([
      "extract",
      bundlePath,
      "--out",
      extractDir,
      "--verbose",
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.OK);
    expect(existsSync(path.join(extractDir, "metadata.json"))).toBe(true);
  });

  it("emits machine-readable output and handles malformed bundles", async () => {
    const artifactsDir = path.join(TEST_DIR, "machine-artifacts");
    const bundlePath = path.join(TEST_DIR, "machine.zip");
    createRequiredArtifacts(artifactsDir);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(evidenceCommand([
      "bundle",
      "--from",
      artifactsDir,
      "--out",
      bundlePath,
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.OK);
    await expect(evidenceCommand([
      "validate",
      bundlePath,
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.OK);
    await expect(evidenceCommand([
      "list",
      bundlePath,
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.OK);
    await expect(evidenceCommand([
      "extract",
      bundlePath,
      "--out",
      path.join(TEST_DIR, "machine-out"),
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.OK);
    expect(log.mock.calls.some(([value]) =>
      typeof value === "string" && value.includes('"command":"evidence validate"')
    )).toBe(true);

    const malformed = path.join(TEST_DIR, "malformed.zip");
    writeFileSync(malformed, "not a zip");
    await expect(evidenceCommand([
      "validate",
      malformed,
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.SCHEMA_FAILED);
    await expect(evidenceCommand([
      "list",
      malformed,
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.INTERNAL_ERROR);
    await expect(evidenceCommand([
      "extract",
      malformed,
      "--out",
      path.join(TEST_DIR, "bad-out"),
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.INTERNAL_ERROR);
  });

  it("returns SCHEMA_FAILED for an unsafe ZIP entry without writing output", async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const bundlePath = path.join(TEST_DIR, "unsafe.zip");
    const outDir = path.join(TEST_DIR, "out");
    const zip = createZipFile([
      createZipEntry(
        "metadata.json",
        Buffer.from(JSON.stringify({ bundle_id: "unsafe-cli-test" }), "utf8")
      ),
      createZipEntry("../escaped.json", Buffer.from("unsafe", "utf8")),
    ]);
    writeFileSync(bundlePath, zip);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const exitCode = await evidenceCommand(
      ["extract", bundlePath, "--out", outDir],
      { VERSION, EXIT, getOption }
    );

    expect(exitCode).toBe(EXIT.SCHEMA_FAILED);
    expect(existsSync(outDir)).toBe(false);

    await expect(evidenceCommand(
      ["validate", bundlePath],
      { VERSION, EXIT, getOption }
    )).resolves.toBe(EXIT.SCHEMA_FAILED);
    await expect(evidenceCommand(
      ["list", bundlePath],
      { VERSION, EXIT, getOption }
    )).resolves.toBe(EXIT.SCHEMA_FAILED);
  });
});
