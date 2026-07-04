#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outDir = join(root, ".qh", "package");
const cacheDir = join(root, ".qh", "npm-cache");
mkdirSync(outDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const packJson = execFileSync(npmCommand, ["pack", "--json", "--pack-destination", outDir], {
  cwd: root,
  encoding: "utf8",
  shell: process.platform === "win32",
  env: { ...process.env, npm_config_cache: cacheDir },
});
const [pack] = JSON.parse(packJson);
const tarballPath = join(outDir, pack.filename);
if (!existsSync(tarballPath)) {
  throw new Error(`package tarball not found: ${tarballPath}`);
}

const content = readFileSync(tarballPath);
const sha256 = createHash("sha256").update(content).digest("hex");
const integrity = {
  schema: "ctg.package-integrity@v1",
  package: pack.name,
  version: pack.version,
  filename: pack.filename,
  size: pack.size,
  unpackedSize: pack.unpackedSize,
  shasum: pack.shasum,
  integrity: pack.integrity,
  sha256,
};

writeFileSync(join(outDir, "package-integrity.json"), JSON.stringify(integrity, null, 2) + "\n");
rmSync(tarballPath, { force: true });
console.log(`package integrity written: ${join(outDir, "package-integrity.json")}`);
