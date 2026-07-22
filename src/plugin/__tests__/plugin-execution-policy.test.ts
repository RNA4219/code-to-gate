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
});
