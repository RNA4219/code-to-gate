import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  PluginMarketplaceArtifact,
  PluginMarketplaceEntry,
  PluginMarketplaceKind,
} from "../types/artifacts.js";
import { createPluginLoader } from "./plugin-loader.js";
import type { PluginLoadResult, PluginManifest } from "./types.js";

const MANIFEST_FILES = [
  "plugin-manifest.yaml",
  "plugin-manifest.yml",
  "plugin-manifest.json",
  "manifest.yaml",
  "manifest.yml",
  "manifest.json",
  "ctg-plugin.yaml",
  "ctg-plugin.json",
];

export interface PluginMarketplaceOptions {
  version: string;
  pluginPaths: string[];
  out?: string;
  now?: Date;
}

export interface PluginMarketplaceResult {
  artifact: PluginMarketplaceArtifact;
  outputPath: string;
}

function outputPath(out: string | undefined): string {
  if (!out) {
    return path.resolve(process.cwd(), ".qh", "plugin-marketplace.json");
  }
  const absolute = path.resolve(process.cwd(), out);
  return out.endsWith(".json") ? absolute : path.join(absolute, "plugin-marketplace.json");
}

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

function relativePath(value: string): string {
  return toPosix(path.relative(process.cwd(), value) || ".");
}

function hasManifest(dir: string): boolean {
  return MANIFEST_FILES.some((file) => existsSync(path.join(dir, file)));
}

function isDirectory(value: string): boolean {
  try {
    return statSync(value).isDirectory();
  } catch {
    return false;
  }
}

function discoverPluginDirs(pluginPaths: string[]): string[] {
  const candidates = new Set<string>();
  for (const input of pluginPaths) {
    const absolute = path.resolve(process.cwd(), input);
    if (!isDirectory(absolute)) {
      candidates.add(absolute);
      continue;
    }
    if (hasManifest(absolute)) {
      candidates.add(absolute);
      continue;
    }

    const childPluginDirs = readdirSync(absolute)
      .map((child) => path.join(absolute, child))
      .filter((child) => isDirectory(child) && hasManifest(child));
    if (childPluginDirs.length === 0) {
      candidates.add(absolute);
      continue;
    }
    for (const child of childPluginDirs) {
      candidates.add(child);
    }
  }
  return [...candidates].sort((a, b) => a.localeCompare(b));
}

function stringMetadata(manifest: PluginManifest, key: string): string | undefined {
  const value = manifest.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function entryFromLoadResult(result: PluginLoadResult): PluginMarketplaceEntry {
  const manifest = result.manifest;
  const manifestId = manifest ? `${manifest.name}@${manifest.version}` : `invalid:${relativePath(result.path)}`;
  return {
    id: manifestId,
    name: manifest?.name,
    version: manifest?.version,
    kind: manifest?.kind as PluginMarketplaceKind | undefined,
    visibility: manifest?.visibility,
    description: manifest?.description,
    capabilities: manifest?.capabilities ?? [],
    receives: manifest?.receives ?? [],
    returns: manifest?.returns ?? [],
    source: {
      type: "local",
      path: relativePath(result.path),
    },
    distribution: {
      homepage: manifest ? manifest.homepage ?? stringMetadata(manifest, "homepage") : undefined,
      license: manifest ? manifest.license ?? stringMetadata(manifest, "license") : undefined,
      package: manifest ? stringMetadata(manifest, "package") ?? stringMetadata(manifest, "npmPackage") : undefined,
    },
    sandbox: {
      network: manifest?.security?.network ?? false,
      read: manifest?.security?.filesystem?.read ?? [],
      write: manifest?.security?.filesystem?.write ?? [],
      secrets: manifest?.security?.secrets?.allow ?? [],
    },
    validation: {
      status: result.status === "loaded" ? "valid" : "invalid",
      errors: result.errors ?? [],
    },
  };
}

function summarize(entries: PluginMarketplaceEntry[]): PluginMarketplaceArtifact["summary"] {
  return {
    plugins: entries.length,
    valid: entries.filter((entry) => entry.validation.status === "valid").length,
    invalid: entries.filter((entry) => entry.validation.status === "invalid").length,
    public: entries.filter((entry) => entry.visibility === "public").length,
    private: entries.filter((entry) => entry.visibility === "private").length,
    rulePlugins: entries.filter((entry) => entry.kind === "rule-plugin").length,
    reporterPlugins: entries.filter((entry) => entry.kind === "reporter-plugin").length,
    exporterPlugins: entries.filter((entry) => entry.kind === "exporter-plugin").length,
    importerPlugins: entries.filter((entry) => entry.kind === "importer-plugin").length,
    languagePlugins: entries.filter((entry) => entry.kind === "language-plugin").length,
  };
}

function statusFor(summary: PluginMarketplaceArtifact["summary"]): PluginMarketplaceArtifact["status"] {
  if (summary.plugins === 0) {
    return "empty";
  }
  if (summary.invalid > 0) {
    return "partial";
  }
  return "ready";
}

export async function createPluginMarketplace(options: PluginMarketplaceOptions): Promise<PluginMarketplaceResult> {
  const generatedAt = (options.now ?? new Date()).toISOString();
  const output = outputPath(options.out);
  const pluginDirs = discoverPluginDirs(options.pluginPaths);
  const loader = createPluginLoader();
  const loadResults: PluginLoadResult[] = [];
  for (const pluginDir of pluginDirs) {
    loadResults.push(await loader.loadManifest(pluginDir));
  }
  const entries = loadResults.map(entryFromLoadResult);
  const summary = summarize(entries);

  return {
    outputPath: output,
    artifact: {
      version: "ctg/v1",
      generated_at: generatedAt,
      run_id: `plugin-marketplace-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
      repo: { root: process.cwd() },
      tool: { name: "code-to-gate", version: options.version, plugin_versions: [] },
      artifact: "plugin-marketplace",
      schema: "plugin-marketplace@v1",
      completeness: summary.invalid > 0 ? "partial" : "complete",
      status: statusFor(summary),
      entries,
      summary,
    },
  };
}

export function writePluginMarketplace(result: PluginMarketplaceResult): void {
  mkdirSync(path.dirname(result.outputPath), { recursive: true });
  writeFileSync(result.outputPath, JSON.stringify(result.artifact, null, 2) + "\n", "utf8");
}
