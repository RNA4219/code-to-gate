import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const docsDir = path.join(root, "docs");
const schemaDir = path.join(root, "schemas");
const packageName = "@quality-harness/code-to-gate";
const allowedPolicyPaths = new Set([
  ".ctg/policy.yaml",
  ".ctg/suppressions.yaml",
  ".ctg/suggestions.yaml",
  ".github/ctg-policy.yaml",
  ".github/policy.yaml",
  "fixtures/policies/strict.yaml",
  "fixtures/policies/relaxed.yaml",
  "fixtures/policies/with-suppressions.yaml",
]);
const schemaAliases = new Map([
  ["repo-graph.schema.json", "normalized-repo-graph.schema.json"],
]);

function listMarkdownFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      files.push(...listMarkdownFiles(full));
    } else if (entry.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

const failures = [];

for (const file of listMarkdownFiles(docsDir)) {
  const rel = path.relative(root, file).replaceAll("\\", "/");
  const content = readFileSync(file, "utf8");

  if (content.includes("quality-harness/code-to-gate") && !content.includes(packageName)) {
    failures.push(`${rel}: package name should use ${packageName}`);
  }

  for (const match of content.matchAll(/(?:^|[`"' (])((?:\.ctg\/(?:policy|suppressions|suggestions)|\.github\/(?:ctg-policy|policy)|fixtures\/policies\/[A-Za-z0-9._-]+)\.ya?ml)(?:[`"' )]|$)/gm)) {
    const policyPath = match[1];
    if (!allowedPolicyPaths.has(policyPath)) {
      failures.push(`${rel}: unexpected policy path ${policyPath}`);
    }
  }

  for (const match of content.matchAll(/schemas\/([A-Za-z0-9._-]+\.schema\.json)/g)) {
    const schemaFile = schemaAliases.get(match[1]) ?? match[1];
    const schemaPath = path.join(schemaDir, schemaFile);
    if (!existsSync(schemaPath)) {
      failures.push(`${rel}: missing schema path schemas/${match[1]}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Doc reference lint failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Doc reference lint passed");
