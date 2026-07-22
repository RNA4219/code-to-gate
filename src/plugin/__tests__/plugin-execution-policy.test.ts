import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDefaultManifest } from "../plugin-schema.js";
import {
  loadPluginExecutionPolicy,
  locatePluginManifest,
  resolvePluginEntrypoint,
  validatePluginExecutionPolicy,
  verifyTrustedPlugin,
  type PluginExecutionPolicy,
} from "../plugin-execution-policy.js";

function digestFile(filePath: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(readFileSync(filePath)).digest("hex")}`;
}

describe("plugin execution policy", () => {
  let root: string;
  let pluginRoot: string;
  let manifestPath: string;
  let entrypointPath: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "ctg-plugin-policy-"));
    pluginRoot = path.join(root, "plugin");
    mkdirSync(pluginRoot, { recursive: true });
    entrypointPath = path.join(pluginRoot, "index.js");
    writeFileSync(entrypointPath, "process.stdout.write('{}');\n", "utf8");
    const manifest = createDefaultManifest("trusted-plugin");
    manifest.version = "1.2.3";
    manifest.entry.command = ["node", "index.js"];
    manifestPath = path.join(pluginRoot, "plugin-manifest.json");
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function policy(): PluginExecutionPolicy {
    return {
      schema: "ctg/plugin-execution-policy/v1",
      trusted_plugins: [{
        name: "trusted-plugin",
        version: "1.2.3",
        manifest_sha256: digestFile(manifestPath),
        entrypoint_sha256: digestFile(entrypointPath),
      }],
      process: {
        allowed_env_vars: ["CTG_PLUGIN_TEST"],
        timeout_seconds: 30,
        max_stdout_bytes: 1024,
        max_stderr_bytes: 512,
        max_findings: 10,
        max_evidence_per_finding: 2,
        node_permission_model: true,
      },
    };
  }

  it("loads and verifies exact manifest and entrypoint digests", () => {
    const policyPath = path.join(root, "policy.json");
    writeFileSync(policyPath, JSON.stringify(policy()), "utf8");

    const loaded = loadPluginExecutionPolicy(policyPath);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const verified = verifyTrustedPlugin(loaded, pluginRoot, manifest);

    expect(verified.manifestPath).toBe(manifestPath);
    expect(verified.entrypointPath).toBe(entrypointPath);
    expect(verified.process).toMatchObject({
      allowed_env_vars: ["CTG_PLUGIN_TEST"],
      timeout_seconds: 30,
      max_stdout_bytes: 1024,
      max_stderr_bytes: 512,
      max_findings: 10,
      max_evidence_per_finding: 2,
      node_permission_model: true,
    });
  });

  it("rejects unknown plugins and digest tampering", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const untrusted = policy();
    untrusted.trusted_plugins = [];
    expect(() => verifyTrustedPlugin(untrusted, pluginRoot, manifest)).toThrow(/Docker sandbox is required/);

    const trusted = policy();
    writeFileSync(entrypointPath, "tampered\n", "utf8");
    expect(() => verifyTrustedPlugin(trusted, pluginRoot, manifest)).toThrow(/entrypoint digest mismatch/);
  });

  it("rejects entrypoint symlink escapes", () => {
    const outside = path.join(root, "outside");
    mkdirSync(outside, { recursive: true });
    writeFileSync(path.join(outside, "index.js"), "outside\n", "utf8");
    symlinkSync(outside, path.join(pluginRoot, "linked"), process.platform === "win32" ? "junction" : "dir");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.entry.command = ["node", "linked/index.js"];

    expect(() => resolvePluginEntrypoint(pluginRoot, manifest)).toThrow(/escapes the plugin directory/);
  });

  it("rejects forbidden environment variables and limits above hard caps", () => {
    const invalid = {
      schema: "ctg/plugin-execution-policy/v1",
      trusted_plugins: [],
      process: {
        allowed_env_vars: ["NODE_OPTIONS"],
        timeout_seconds: 61,
        max_stdout_bytes: 10 * 1024 * 1024 + 1,
        max_stderr_bytes: 1024 * 1024 + 1,
        max_findings: 1001,
        max_evidence_per_finding: 11,
      },
    };
    const validation = validatePluginExecutionPolicy(invalid);

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("forbidden variable NODE_OPTIONS"),
      expect.stringContaining("timeout_seconds"),
      expect.stringContaining("max_stdout_bytes"),
      expect.stringContaining("max_stderr_bytes"),
      expect.stringContaining("max_findings"),
      expect.stringContaining("max_evidence_per_finding"),
    ]));
  });

  it("rejects malformed policy shapes and duplicate identities", () => {
    expect(validatePluginExecutionPolicy(null)).toEqual({
      valid: false,
      errors: ["policy must be an object"],
    });

    const wrongShape = validatePluginExecutionPolicy({
      schema: "wrong",
      trusted_plugins: "not-an-array",
      process: [],
    });
    expect(wrongShape.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("schema must be"),
      "trusted_plugins must be an array",
      "process must be an object",
    ]));

    const validDigest = `sha256:${"a".repeat(64)}`;
    const malformed = validatePluginExecutionPolicy({
      schema: "ctg/plugin-execution-policy/v1",
      trusted_plugins: [
        null,
        { name: "", version: "", manifest_sha256: "bad", entrypoint_sha256: "bad" },
        { name: "duplicate", version: "1.0.0", manifest_sha256: validDigest, entrypoint_sha256: validDigest },
        { name: "duplicate", version: "1.0.0", manifest_sha256: validDigest, entrypoint_sha256: validDigest },
      ],
      process: {
        allowed_env_vars: ["1INVALID", "NODE_PATH"],
        timeout_seconds: 0,
        max_stdout_bytes: 1.5,
        max_stderr_bytes: -1,
        max_findings: 1001,
        max_evidence_per_finding: null,
        node_permission_model: "yes",
      },
    });
    expect(malformed.valid).toBe(false);
    expect(malformed.errors).toEqual(expect.arrayContaining([
      "trusted_plugins[0] must be an object",
      "trusted plugin name is required",
      "trusted plugin version is required",
      "trusted plugin manifest_sha256 is invalid",
      "trusted plugin entrypoint_sha256 is invalid",
      "duplicate trusted plugin identity: duplicate@1.0.0",
      "allowed_env_vars contains an invalid name",
      "allowed_env_vars contains forbidden variable NODE_PATH",
      "node_permission_model must be boolean",
    ]));

    const envNotArray = validatePluginExecutionPolicy({
      schema: "ctg/plugin-execution-policy/v1",
      trusted_plugins: [],
      process: { allowed_env_vars: "PATH" },
    });
    expect(envNotArray.errors).toContain("allowed_env_vars must be an array");
    expect(validatePluginExecutionPolicy({
      schema: "ctg/plugin-execution-policy/v1",
      trusted_plugins: [],
    })).toEqual({ valid: true, errors: [] });
  });

  it("reports missing policy files and applies secure default limits", () => {
    expect(() => locatePluginManifest(path.join(root, "missing-plugin"))).toThrow(/manifest file is missing/);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.entry.command = [];
    expect(() => resolvePluginEntrypoint(pluginRoot, manifest)).toThrow(/entrypoint is missing/);
    manifest.entry.command = ["missing.js"];
    expect(() => resolvePluginEntrypoint(pluginRoot, manifest)).toThrow(/does not identify a file/);
    manifest.entry.command = ["index.js"];
    expect(resolvePluginEntrypoint(pluginRoot, manifest)).toBe(entrypointPath);

    const defaulted = policy();
    delete defaulted.process;
    const verified = verifyTrustedPlugin(defaulted, pluginRoot, manifest);
    expect(verified.process).toMatchObject({
      allowed_env_vars: [],
      timeout_seconds: 60,
      max_stdout_bytes: 10 * 1024 * 1024,
      max_stderr_bytes: 1024 * 1024,
      max_findings: 1000,
      max_evidence_per_finding: 10,
      node_permission_model: true,
    });

    const trusted = policy();
    writeFileSync(manifestPath, "{}\n", "utf8");
    expect(() => verifyTrustedPlugin(trusted, pluginRoot, manifest)).toThrow(/manifest digest mismatch/);

    const malformedPolicyPath = path.join(root, "malformed-policy.json");
    writeFileSync(malformedPolicyPath, "{", "utf8");
    expect(() => loadPluginExecutionPolicy(malformedPolicyPath)).toThrow(/cannot read plugin execution policy/);

    const invalidPolicyPath = path.join(root, "invalid-policy.json");
    writeFileSync(invalidPolicyPath, "{}", "utf8");
    expect(() => loadPluginExecutionPolicy(invalidPolicyPath)).toThrow(/invalid plugin execution policy/);
  });
});
