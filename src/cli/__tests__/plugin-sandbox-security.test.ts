import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pluginSandboxCommand } from "../plugin-sandbox.js";
import { EXIT, getOption, VERSION } from "../exit-codes.js";

function digest(filePath: string): string {
  return "sha256:" + createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

describe("plugin-sandbox security policy", () => {
  let root: string;
  let pluginRoot: string;
  let manifestPath: string;
  let entrypointPath: string;
  let inputPath: string;
  let policyPath: string;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "ctg-plugin-cli-security-"));
  });

  beforeEach(() => {
    pluginRoot = path.join(root, "plugin");
    rmSync(pluginRoot, { recursive: true, force: true });
    mkdirSync(pluginRoot, { recursive: true });
    entrypointPath = path.join(pluginRoot, "plugin.mjs");
    writeFileSync(
      entrypointPath,
      'process.stdin.resume(); process.stdin.on("data", () => {}); process.stdin.on("end", () => process.stdout.write(JSON.stringify({version:"ctg.plugin-output/v1",findings:[]})));\n',
      "utf8"
    );
    manifestPath = path.join(pluginRoot, "plugin-manifest.json");
    writeFileSync(manifestPath, JSON.stringify({
      apiVersion: "ctg/v1",
      kind: "rule-plugin",
      name: "trusted-cli-plugin",
      version: "1.0.0",
      visibility: "private",
      entry: { command: ["node", "plugin.mjs"], timeout: 5, retry: 0 },
      capabilities: ["evaluate"],
      receives: ["normalized-repo-graph@v1"],
      returns: ["findings@v1"],
    }, null, 2) + "\n", "utf8");
    inputPath = path.join(root, "input.json");
    writeFileSync(inputPath, JSON.stringify({ version: "ctg.plugin-input/v1" }), "utf8");
    policyPath = path.join(root, "policy.json");
    writeFileSync(policyPath, JSON.stringify({
      schema: "ctg/plugin-execution-policy/v1",
      trusted_plugins: [{
        name: "trusted-cli-plugin",
        version: "1.0.0",
        manifest_sha256: digest(manifestPath),
        entrypoint_sha256: digest(entrypointPath),
      }],
      process: {
        timeout_seconds: 5,
        max_stdout_bytes: 4096,
        max_stderr_bytes: 1024,
        max_findings: 10,
        max_evidence_per_finding: 2,
        node_permission_model: false,
      },
    }), "utf8");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("uses Process by default only for a digest-pinned trusted plugin", async () => {
    await expect(pluginSandboxCommand([
      "run",
      pluginRoot,
      "--input",
      inputPath,
      "--execution-policy",
      policyPath,
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.OK);
  });

  it("requires Docker when Process trust is absent or tampered", async () => {
    await expect(pluginSandboxCommand([
      "run",
      pluginRoot,
      "--input",
      inputPath,
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.PLUGIN_FAILED);

    writeFileSync(entrypointPath, "tampered\n", "utf8");
    await expect(pluginSandboxCommand([
      "run",
      pluginRoot,
      "--input",
      inputPath,
      "--execution-policy",
      policyPath,
    ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.PLUGIN_FAILED);
  });

  it("forbids none in CI even with the unsafe acknowledgement", async () => {
    const previous = process.env.CI;
    process.env.CI = "true";
    try {
      await expect(pluginSandboxCommand([
        "run",
        pluginRoot,
        "--input",
        inputPath,
        "--sandbox",
        "none",
        "--unsafe-allow-none",
      ], { VERSION, EXIT, getOption })).resolves.toBe(EXIT.USAGE_ERROR);
    } finally {
      if (previous === undefined) delete process.env.CI;
      else process.env.CI = previous;
    }
  });
});
