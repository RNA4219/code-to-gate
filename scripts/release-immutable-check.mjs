import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const forbidden = [/git\s+tag\s+-f/i, /push\s+-f\s+.*tags/i, /--clobber/i, /force[- ]push/i];
const mutableActionRef = /^\s*uses:\s+(?!\.\/)([^\s#]+)@(?![0-9a-f]{40}(?:\s|#|$))/gim;
const scanRoots = [path.join(root, ".github", "workflows"), path.join(root, "scripts")];
const violations = [];
function visit(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.name === "release-immutable-check.mjs") continue;
    else if (/\.(ya?ml|mjs|ps1|sh)$/i.test(entry.name)) {
      const text = readFileSync(file, "utf8");
      if (/release|tag/i.test(text) && forbidden.some((pattern) => pattern.test(text))) violations.push(path.relative(root, file));
      if (/\.ya?ml$/i.test(entry.name) && mutableActionRef.test(text)) violations.push(`${path.relative(root, file)}:mutable-action-ref`);
      mutableActionRef.lastIndex = 0;
    }
  }
}
visit(scanRoots[0]);
visit(scanRoots[1]);
const releaseTag = process.env.RELEASE_TAG ?? "";
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
if (releaseTag.startsWith("v") && !/^v\d+\.\d+\.\d+$/.test(releaseTag)) violations.push("RELEASE_TAG");
if (releaseTag.startsWith("v") && releaseTag !== `v${packageJson.version}`) violations.push("package.json/version");
if (violations.length > 0) {
  console.error(JSON.stringify({ schema: "ctg-release-immutability-check@v1", status: "failed", violations }));
  process.exit(2);
}
mkdirSync(path.join(root, ".qh"), { recursive: true });
const evidence = { schema: "ctg-release-immutability-check@v1", status: "passed", release_tag: releaseTag || null, package_version: packageJson.version, immutable_release_required: true, force_update_allowed: false };
console.log(JSON.stringify(evidence));
writeFileSync(path.join(root, ".qh", "release-immutability.json"), `${JSON.stringify(evidence, null, 2)}\n`);
