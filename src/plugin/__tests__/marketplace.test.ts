import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPluginMarketplace } from "../marketplace.js";

let tempRoot: string;
let pluginsRoot: string;

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function validManifest(name: string, kind = "rule-plugin"): Record<string, unknown> {
  return {
    apiVersion: "ctg/v1",
    kind,
    name,
    version: "1.0.0",
    visibility: "public",
    description: "Sample plugin",
    homepage: "https://example.com/plugin",
    license: "MIT",
    entry: { command: ["node", "index.js"], timeout: 30 },
    capabilities: kind === "reporter-plugin" ? ["report"] : ["evaluate"],
    receives: ["normalized-repo-graph@v1"],
    returns: kind === "reporter-plugin" ? ["analysis-report@v1"] : ["findings@v1"],
    security: { network: false, filesystem: { read: ["${repoRoot}"], write: [] }, secrets: { allow: [] } },
    metadata: { package: `@example/${name}` },
  };
}

beforeEach(() => {
  tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-plugin-marketplace-"));
  pluginsRoot = path.join(tempRoot, "plugins");
  mkdirSync(pluginsRoot, { recursive: true });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("plugin marketplace", () => {
  it("builds a registry from local plugin manifests", async () => {
    writeJson(path.join(pluginsRoot, "rule-one", "plugin-manifest.json"), validManifest("rule-one"));
    writeJson(path.join(pluginsRoot, "reporter-one", "plugin-manifest.json"), validManifest("reporter-one", "reporter-plugin"));

    const result = await createPluginMarketplace({
      version: "test",
      pluginPaths: [pluginsRoot],
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result.artifact.status).toBe("ready");
    expect(result.artifact.summary).toMatchObject({
      plugins: 2,
      valid: 2,
      invalid: 0,
      public: 2,
      rulePlugins: 1,
      reporterPlugins: 1,
    });
    expect(result.artifact.entries.map((entry) => entry.id)).toEqual(["reporter-one@1.0.0", "rule-one@1.0.0"]);
    expect(result.artifact.entries[0].distribution.package).toBe("@example/reporter-one");
  });

  it("records invalid manifests as partial registry entries", async () => {
    writeJson(path.join(pluginsRoot, "rule-one", "plugin-manifest.json"), validManifest("rule-one"));
    writeJson(path.join(pluginsRoot, "broken", "plugin-manifest.json"), {
      apiVersion: "ctg/v1",
      kind: "rule-plugin",
      name: "broken",
    });

    const result = await createPluginMarketplace({ version: "test", pluginPaths: [pluginsRoot] });

    expect(result.artifact.status).toBe("partial");
    expect(result.artifact.completeness).toBe("partial");
    expect(result.artifact.summary).toMatchObject({ plugins: 2, valid: 1, invalid: 1 });
    expect(result.artifact.entries.find((entry) => entry.validation.status === "invalid")?.validation.errors.length).toBeGreaterThan(0);
  });
});
