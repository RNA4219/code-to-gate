import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function option(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }
const tag = option("--tag") ?? process.env.RELEASE_TAG;
const commit = option("--commit") ?? process.env.GITHUB_SHA;
const tarball = option("--tarball");
const out = option("--out") ?? ".qh/release-manifest.json";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error("--tag must be a stable semver tag");
if (!commit || !/^[a-f0-9]{40}$/.test(commit)) throw new Error("--commit must be a 40-character commit SHA");
const assets = [];
if (tarball) {
  if (!existsSync(tarball)) throw new Error(`tarball not found: ${tarball}`);
  const bytes = readFileSync(tarball);
  assets.push({ name: path.basename(tarball), sha256: createHash("sha256").update(bytes).digest("hex"), sha512: createHash("sha512").update(bytes).digest("base64"), byte_length: statSync(tarball).size });
}
const manifest = { schema: "ctg-release-manifest@v1", tag, commit, package: { name: pkg.name, version: pkg.version }, assets, immutable: true, provenance: { workflow: process.env.GITHUB_WORKFLOW ?? null, run_id: process.env.GITHUB_RUN_ID ?? null } };
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest));