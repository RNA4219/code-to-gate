#!/usr/bin/env node
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const readme = readFileSync("README.md", "utf8");
const status = readFileSync("docs/distribution-status.md", "utf8");

const errors = [];

if (!readme.includes(`badge/package-${pkg.version}-blue`)) {
  errors.push(`README package badge does not match package.json version ${pkg.version}`);
}

if (!status.includes(`| \`package.json\` | \`${pkg.version}\``)) {
  errors.push(`distribution-status package.json row does not match ${pkg.version}`);
}

const releaseBadge = readme.match(/badge\/GitHub%20release-(v[0-9.]+)-/);
const statusRelease = status.match(/\| GitHub Release \| `(v[0-9.]+)`/);
if (releaseBadge && statusRelease && releaseBadge[1] !== statusRelease[1]) {
  errors.push(`README GitHub release badge ${releaseBadge[1]} does not match distribution-status ${statusRelease[1]}`);
}

const npmBadgeNotPublished = readme.includes("badge/npm-not%20published-lightgrey");
const statusNotPublished = status.includes("| npm registry | Not published |");
if (npmBadgeNotPublished !== statusNotPublished) {
  errors.push("README npm badge and distribution-status npm registry state disagree");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log("distribution status check passed");
