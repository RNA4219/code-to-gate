import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import path from "node:path";
import {
  createPluginContext,
  createTestPluginContext,
  DefaultPluginLogger,
  PluginSchemaValidatorImpl,
  RestrictedPluginFileSystem,
} from "../plugin-context.js";
import { createDefaultManifest } from "../plugin-schema.js";

const TEST_DIR = path.join(process.cwd(), ".test-temp", "plugin-context");
const silentLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe("plugin context", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it("honors logger levels and structured data", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const debugLogger = new DefaultPluginLogger("debug", "debug");
    debugLogger.debug("debug");
    debugLogger.info("info", { value: 1 });
    debugLogger.warn("warn");
    debugLogger.error("error");
    expect(debug).toHaveBeenCalled();
    expect(info).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();

    const errorLogger = new DefaultPluginLogger("quiet", "error");
    errorLogger.debug("hidden");
    errorLogger.info("hidden");
    errorLogger.warn("hidden");
    expect(debug).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("restricts filesystem access by path segment, not string prefix", async () => {
    const allowed = path.join(TEST_DIR, "allowed");
    const sibling = path.join(TEST_DIR, "allowed-evil");
    const workDir = path.join(TEST_DIR, "work");
    await fs.mkdir(allowed, { recursive: true });
    await fs.mkdir(sibling, { recursive: true });
    await fs.writeFile(path.join(allowed, "read.txt"), "allowed");
    await fs.writeFile(path.join(sibling, "secret.txt"), "secret");
    const pluginFs = new RestrictedPluginFileSystem(
      workDir,
      [allowed],
      silentLogger
    );

    await expect(pluginFs.readFile(path.join(allowed, "read.txt")))
      .resolves.toBe("allowed");
    await expect(pluginFs.readFile(path.join(sibling, "secret.txt")))
      .rejects.toThrow("Path not allowed");
    await expect(pluginFs.exists(path.join(sibling, "secret.txt")))
      .resolves.toBe(false);
    await expect(pluginFs.exists(path.join(allowed, "missing.txt")))
      .resolves.toBe(false);

    const written = await pluginFs.writeWorkFile("nested.txt", "content");
    await expect(pluginFs.readWorkFile("nested.txt")).resolves.toBe("content");
    expect(pluginFs.isPathAllowed(written, "write")).toBe(true);
    expect(pluginFs.isPathAllowed(path.join(TEST_DIR, "work-evil", "x"), "write"))
      .toBe(false);
    expect(pluginFs.getAllowedReadPaths()).toHaveLength(1);
    expect(pluginFs.getAllowedWritePaths()).toHaveLength(1);
    await expect(pluginFs.listWorkFiles()).resolves.toContain("nested.txt");
    await pluginFs.deleteWorkFile("nested.txt");
    await expect(pluginFs.readWorkFile("nested.txt")).resolves.toBeNull();
    await pluginFs.deleteWorkFile("missing.txt");
    expect(silentLogger.warn).toHaveBeenCalled();
  });

  it("does not read or delete files outside the work directory", async () => {
    const workDir = path.join(TEST_DIR, "work");
    const pluginFs = new RestrictedPluginFileSystem(workDir, [], silentLogger);
    const outsidePath = path.join(TEST_DIR, "outside-work.txt");
    await fs.writeFile(outsidePath, "must remain", "utf8");

    await expect(pluginFs.readWorkFile("../outside-work.txt")).resolves.toBeNull();
    await pluginFs.deleteWorkFile("../outside-work.txt");
    await expect(fs.readFile(outsidePath, "utf8")).resolves.toBe("must remain");
  });

  it("validates manifest success and all primary failure branches", async () => {
    const validator = new PluginSchemaValidatorImpl(["secret"], silentLogger);
    await expect(validator.validateManifest(null)).resolves.toMatchObject({
      valid: false,
    });
    await expect(validator.validateManifest(createDefaultManifest("valid-plugin")))
      .resolves.toEqual({ valid: true, errors: undefined });

    const invalid = await validator.validateManifest({
      apiVersion: "wrong",
      kind: "wrong",
      name: "Bad_Name",
      version: "bad",
      visibility: "hidden",
      entry: { command: [], timeout: "slow" },
      capabilities: ["unknown"],
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors?.map((item) => item.path)).toEqual(
      expect.arrayContaining([
        "apiVersion",
        "kind",
        "name",
        "version",
        "visibility",
        "entry.command",
        "entry.timeout",
        "capabilities",
      ])
    );
    const missing = await validator.validateManifest({});
    expect(missing.errors?.length).toBeGreaterThan(5);
  });

  it("validates plugin output, findings, risks, diagnostics, and evidence", async () => {
    const validator = new PluginSchemaValidatorImpl(["secret"], silentLogger);
    await expect(validator.validateOutput(null, [])).resolves.toMatchObject({
      valid: false,
    });
    await expect(validator.validateOutput({
      version: "ctg.plugin-output/v1",
      findings: [{
        id: "f1",
        ruleId: "RULE",
        category: "security",
        severity: "high",
        confidence: 0.9,
        title: "title",
        summary: "summary",
        evidence: [],
      }],
      risk_seeds: [{ id: "r1", title: "risk", severity: "medium" }],
      invariant_seeds: [],
      test_seeds: [],
      diagnostics: [{ id: "d1", severity: "warning", code: "D", message: "ok" }],
      errors: [],
    }, [])).resolves.toEqual({ valid: true, errors: undefined });

    const invalid = await validator.validateOutput({
      version: "wrong",
      unexpected: true,
      findings: [null, {
        category: "wrong",
        severity: "wrong",
        confidence: 2,
      }],
      risk_seeds: [null, { severity: "wrong" }],
      invariant_seeds: {},
      test_seeds: "wrong",
      diagnostics: [{}],
      errors: {},
    }, []);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors?.length).toBeGreaterThan(15);

    await expect(validator.validateOutput({
      version: "ctg.plugin-output/v1",
      findings: {},
      risk_seeds: {},
      diagnostics: {},
    }, [])).resolves.toMatchObject({ valid: false });

    await expect(validator.validateEvidence(null)).resolves.toMatchObject({
      valid: false,
    });
    await expect(validator.validateEvidence({
      id: "e1",
      path: "src/file.ts",
      kind: "text",
    })).resolves.toEqual({ valid: true, errors: undefined });
    await expect(validator.validateEvidence({ kind: "wrong" }))
      .resolves.toMatchObject({ valid: false });
  });

  it("detects nested secret patterns and creates resolved contexts", async () => {
    const validator = new PluginSchemaValidatorImpl(
      ["token", "password"],
      silentLogger
    );
    await expect(validator.detectSecretLeak({
      nested: ["safe", { value: "PASSWORD=hidden" }],
      token: "a token value",
    })).resolves.toMatchObject({
      detected: true,
      patterns: expect.arrayContaining(["token", "password"]),
    });
    await expect(validator.detectSecretLeak({ safe: true })).resolves.toEqual({
      detected: false,
      patterns: undefined,
      locations: undefined,
    });

    const manifest = createDefaultManifest("context-plugin");
    manifest.security = {
      filesystem: {
        read: ["${repoRoot}/src", "${workDir}/cache"],
        write: [],
      },
    };
    const context = createPluginContext(
      manifest,
      {
        runId: "run",
        repoRoot: TEST_DIR,
        workDir: path.join(TEST_DIR, "work"),
        startTime: new Date(),
      },
      { enabled: true },
      { id: "policy" }
    );
    expect(context.fs.getAllowedReadPaths()).toEqual([
      path.join(TEST_DIR, "src").replace(/\\/g, "/"),
      path.join(TEST_DIR, "work", "cache").replace(/\\/g, "/"),
    ]);

    const fallback = createTestPluginContext(manifest, TEST_DIR, path.join(TEST_DIR, "work"));
    expect(fallback.manifest.name).toBe("context-plugin");
  });
});
