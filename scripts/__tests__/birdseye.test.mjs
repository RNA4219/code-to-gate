import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const generator = path.join(repoRoot, "scripts", "birdseye.mjs");

function fixture() {
  const root = mkdtempSync(path.join(repoRoot, ".tmp-birdseye-"));
  const files = {
    "README.md": "# Fixture\n\n[Context](CLAUDE.md)\n[entry](src/cli/scan.ts)\n[generated](docs/birdseye/index.json)\n[first](a/b.ts)\n[second](a.b.ts)\n",
    "CLAUDE.md": "# Context\n\n[Policy](GUARDRAILS.md)\n",
    "GUARDRAILS.md": "# Guardrails\n\n[Checklist](CHECKLISTS.md)\n",
    "CHECKLISTS.md": "# Checklist\n",
    "CHANGELOG.md": "# Changelog\n",
    "src/cli/scan.ts": "// import { fake } from '../unused.ts';\nconst text = \"require('../unused.ts')\";\nimport { registry } from '../adapters/parser-registry.js';\nexport function scan() { return registry; }\n",
    "src/cli/analyze.ts": "import { loadPolicy } from '../config/policy-loader.js';\nexport function analyze() { return loadPolicy; }\n",
    "src/cli/readiness.ts": "import { loadPolicy } from '../config/policy-loader.js';\nexport function readiness() { return loadPolicy; }\n",
    "src/rules/index.ts": "export const rules = [];\n",
    "src/adapters/parser-registry.ts": "export const registry = {};\n",
    "src/config/policy-loader.ts": "export function loadPolicy() { return {}; }\n",
    "governance/policy.yaml": "version: 1\n",
    ".ctg/policy.yaml": "version: 1\n",
    "a/b.ts": "export const nested = true;\n",
    "a.b.ts": "export const dotted = true;\n",
    "src/unused.ts": "export const fake = true;\n",
    "src/__tests__/scan.test.ts": "import { scan } from '../cli/scan.js';\ntest(scan);\n",
  };
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, ...relative.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }
  mkdirSync(path.join(root, "docs", "birdseye"), { recursive: true });
  writeFileSync(path.join(root, "docs", "birdseye", "index.json"), "{}\n", "utf8");
  return root;
}

function run(root, command) {
  return spawnSync(process.execPath, [generator, command, "--root", root], { cwd: repoRoot, encoding: "utf8" });
}

function generatedFiles(root) {
  const base = path.join(root, "docs", "birdseye");
  const files = [];
  function walk(directory) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push([path.relative(base, full), readFileSync(full, "utf8")]);
    }
  }
  walk(base);
  return files.sort((a, b) => a[0].localeCompare(b[0]));
}

test("fixtureはgenerate後にcheckを通過し、旧adapterを保持しない", () => {
  const root = fixture();
  try {
    assert.equal(run(root, "generate").status, 0);
    const checked = run(root, "check");
    assert.equal(checked.status, 0, checked.stderr || checked.stdout);
    const index = JSON.parse(readFileSync(path.join(root, "docs/birdseye/index.json"), "utf8"));
    assert.ok(index.nodes["src/adapters/parser-registry.ts"]);
    assert.equal(index.nodes["src/adapters/typescript.ts"], undefined);
    assert.ok(index.edges.some(([from, to]) => from === "README.md" && to === "CLAUDE.md"));
    assert.ok(index.edges.some(([from, to]) => from === "README.md" && to === "src/cli/scan.ts"));
    assert.ok(index.edges.some(([from, to]) => from === "src/cli/scan.ts" && to === "src/adapters/parser-registry.ts"));
    assert.equal(index.nodes["src/unused.ts"], undefined);
    assert.notEqual(index.nodes["a/b.ts"].caps, index.nodes["a.b.ts"].caps);
    for (const node of Object.values(index.nodes)) assert.ok(existsSync(path.join(root, node.caps)));
    for (const [from, to] of index.edges) assert.ok(index.nodes[from] && index.nodes[to]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("同じfixtureの二度生成はbytes一致し、checkは書き込まない", () => {
  const root = fixture();
  try {
    assert.equal(run(root, "generate").status, 0);
    const first = generatedFiles(root);
    assert.equal(run(root, "generate").status, 0);
    assert.deepEqual(generatedFiles(root), first);
    const before = generatedFiles(root);
    const checked = run(root, "check");
    assert.equal(checked.status, 0, checked.stderr || checked.stdout);
    assert.deepEqual(generatedFiles(root), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("missing cap、source drift、invalid edge、generation mismatchはcheckを失敗させる", () => {
  const root = fixture();
  try {
    assert.equal(run(root, "generate").status, 0);
    const indexPath = path.join(root, "docs/birdseye/index.json");
    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    const capPath = path.join(root, index.nodes["README.md"].caps);
    rmSync(capPath);
    assert.notEqual(run(root, "check").status, 0);
    writeFileSync(capPath, JSON.stringify({}), "utf8");
    writeFileSync(path.join(root, "README.md"), "# changed\n", "utf8");
    assert.notEqual(run(root, "check").status, 0);
    assert.equal(run(root, "generate").status, 0);
    const repaired = JSON.parse(readFileSync(indexPath, "utf8"));
    repaired.edges.push(["missing.ts", "README.md"]);
    writeFileSync(indexPath, `${JSON.stringify(repaired, null, 2)}\n`, "utf8");
    assert.notEqual(run(root, "check").status, 0);
    assert.equal(run(root, "generate").status, 0);
    const docPath = path.join(root, "docs/birdseye/BIRDSEYE.md");
    writeFileSync(docPath, `${readFileSync(docPath, "utf8")}改変\n`, "utf8");
    assert.notEqual(run(root, "check").status, 0);
    assert.equal(run(root, "generate").status, 0);
    const hotPath = path.join(root, "docs/birdseye/hot.json");
    const hot = JSON.parse(readFileSync(hotPath, "utf8"));
    hot.generation_id = "birdseye-stale";
    writeFileSync(hotPath, `${JSON.stringify(hot, null, 2)}\n`, "utf8");
    assert.notEqual(run(root, "check").status, 0);
    assert.equal(run(root, "generate").status, 0);
    const cap = JSON.parse(readFileSync(path.join(root, JSON.parse(readFileSync(indexPath, "utf8")).nodes["README.md"].caps), "utf8"));
    cap.summary = "改変";
    writeFileSync(path.join(root, JSON.parse(readFileSync(indexPath, "utf8")).nodes["README.md"].caps), `${JSON.stringify(cap, null, 2)}\n`, "utf8");
    assert.notEqual(run(root, "check").status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("必須source欠落はgenerateとcheckを失敗させる", () => {
  const root = fixture();
  try {
    assert.equal(run(root, "generate").status, 0);
    rmSync(path.join(root, "src/adapters/parser-registry.ts"));
    assert.notEqual(run(root, "check").status, 0);
    assert.notEqual(run(root, "generate").status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("CRLFとLFで同じsourceを扱い、実内容の変更は検出する", () => {
  const root = fixture();
  const sourceFiles = [
    "README.md", "CLAUDE.md", "GUARDRAILS.md", "CHECKLISTS.md", "CHANGELOG.md",
    "src/cli/scan.ts", "src/cli/analyze.ts", "src/cli/readiness.ts",
    "src/rules/index.ts", "src/adapters/parser-registry.ts", "src/config/policy-loader.ts",
    "governance/policy.yaml", ".ctg/policy.yaml", "a/b.ts", "a.b.ts", "src/unused.ts",
    "src/__tests__/scan.test.ts",
  ];
  try {
    for (const relative of sourceFiles) {
      const file = path.join(root, ...relative.split("/"));
      const lf = readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
      writeFileSync(file, lf.replace(/\n/g, "\r\n"), "utf8");
    }
    assert.equal(run(root, "generate").status, 0);
    for (const relative of sourceFiles) {
      const file = path.join(root, ...relative.split("/"));
      writeFileSync(file, readFileSync(file, "utf8").replace(/\r\n?/g, "\n"), "utf8");
    }
    assert.equal(run(root, "check").status, 0);
    writeFileSync(path.join(root, "src/cli/scan.ts"), `${readFileSync(path.join(root, "src/cli/scan.ts"), "utf8")}\n// changed\n`, "utf8");
    assert.notEqual(run(root, "check").status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("root自身のsymlinkを扱い、root外へのリンクは解析対象に含めない", (t) => {
  const root = fixture();
  const linkedRoot = `${root}-link`;
  const outside = mkdtempSync(path.join(repoRoot, ".tmp-birdseye-outside-"));
  try {
    const linkType = process.platform === "win32" ? "junction" : "dir";
    try {
      symlinkSync(root, linkedRoot, linkType);
      assert.equal(run(linkedRoot, "generate").status, 0);
      assert.equal(run(linkedRoot, "check").status, 0);
    } catch (error) {
      if (error?.code === "EPERM" || error?.code === "EACCES") {
        t.skip("symlink作成権限がありません");
        return;
      }
      throw error;
    }

    mkdirSync(path.join(outside, "linked"), { recursive: true });
    writeFileSync(path.join(outside, "linked", "secret.ts"), "export const outside = true;\n", "utf8");
    const outsideLink = path.join(root, "linked");
    symlinkSync(path.join(outside, "linked"), outsideLink, linkType);
    mkdirSync(path.join(outside, "tests"), { recursive: true });
    writeFileSync(path.join(outside, "tests", "secret.test.ts"), "export const outsideTest = true;\n", "utf8");
    const outsideTestsLink = path.join(root, "src", "cli", "__tests__");
    symlinkSync(path.join(outside, "tests"), outsideTestsLink, linkType);
    const insideLink = path.join(root, "src", "config-link");
    symlinkSync(path.join(root, "src", "config"), insideLink, linkType);
    writeFileSync(path.join(root, "README.md"), `${readFileSync(path.join(root, "README.md"), "utf8")}\n[outside](linked/secret.ts)\n[inside](src/config-link/policy-loader.ts)\n`, "utf8");
    assert.equal(run(root, "generate").status, 0);
    const index = JSON.parse(readFileSync(path.join(root, "docs/birdseye/index.json"), "utf8"));
    assert.equal(index.nodes["linked/secret.ts"], undefined);
    assert.ok(index.nodes["src/config-link/policy-loader.ts"]);
    const scanCap = JSON.parse(readFileSync(path.join(root, index.nodes["src/cli/scan.ts"].caps), "utf8"));
    assert.equal(scanCap.tests.includes("src/cli/__tests__/secret.test.ts"), false);
  } finally {
    rmSync(path.join(root, "src", "cli", "__tests__"), { recursive: true, force: true });
    rmSync(path.join(root, "src", "config-link"), { recursive: true, force: true });
    rmSync(path.join(root, "linked"), { recursive: true, force: true });
    rmSync(linkedRoot, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
