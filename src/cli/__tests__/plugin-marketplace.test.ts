import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pluginMarketplaceCommand } from "../plugin-marketplace.js";
import { EXIT, VERSION, getOption } from "../exit-codes.js";

let tempRoot: string;
let pluginsRoot: string;
let outDir: string;

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

beforeEach(() => {
  tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-plugin-marketplace-cli-"));
  pluginsRoot = path.join(tempRoot, "plugins");
  outDir = path.join(tempRoot, "out");
  mkdirSync(pluginsRoot, { recursive: true });
  writeJson(path.join(pluginsRoot, "exporter", "plugin-manifest.json"), {
    apiVersion: "ctg/v1",
    kind: "exporter-plugin",
    name: "exporter",
    version: "1.0.0",
    visibility: "public",
    entry: { command: ["node", "index.js"] },
    capabilities: ["export"],
    receives: ["findings@v1"],
    returns: ["diagnostics@v1"],
    security: { network: false },
  });
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("plugin-marketplace CLI", () => {
  it("writes plugin-marketplace.json", async () => {
    const exitCode = await pluginMarketplaceCommand([
      "--plugins",
      pluginsRoot,
      "--out",
      outDir,
      "--quiet",
    ], { VERSION, EXIT, getOption });
    const artifact = JSON.parse(readFileSync(path.join(outDir, "plugin-marketplace.json"), "utf8"));

    expect(exitCode).toBe(EXIT.OK);
    expect(artifact).toMatchObject({
      artifact: "plugin-marketplace",
      schema: "plugin-marketplace@v1",
      status: "ready",
      summary: {
        plugins: 1,
        valid: 1,
        exporterPlugins: 1,
      },
    });
  });

  it("requires plugin paths", async () => {
    const exitCode = await pluginMarketplaceCommand(["--quiet"], { VERSION, EXIT, getOption });
    expect(exitCode).toBe(EXIT.USAGE_ERROR);
  });
});
