#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const SCHEMA = "birdseye/v1";
const REQUIRED_SEEDS = [
  ["README.md", "overview"],
  ["CLAUDE.md", "context"],
  ["GUARDRAILS.md", "policy"],
  ["CHECKLISTS.md", "checklist"],
  ["CHANGELOG.md", "history"],
  ["src/cli/scan.ts", "entrypoint"],
  ["src/cli/analyze.ts", "entrypoint"],
  ["src/cli/readiness.ts", "entrypoint"],
  ["src/rules/index.ts", "registry"],
  ["src/adapters/parser-registry.ts", "adapter"],
  ["src/config/policy-loader.ts", "config"],
  ["governance/policy.yaml", "governance"],
  [".ctg/policy.yaml", "policy"],
];
const OPTIONAL_SEEDS = [
  ["src/config/policy-evaluator.ts", "config"],
  ["src/config/severity-resolver.ts", "config"],
];
const EXCLUDED_PARTS = new Set(["node_modules", "dist", ".qh", ".git", "fixtures"]);
const EXCLUDED_PATHS = new Set(["docs/birdseye"]);
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".yaml", ".yml", ".md"];

function normalizeId(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSourceText(value) {
  return value.replace(/\r\n?/g, "\n");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isAllowedId(id) {
  const normalized = normalizeId(id);
  const parts = normalized.split("/");
  return !parts.includes("..") && !parts.some((part) => EXCLUDED_PARTS.has(part)) && ![...EXCLUDED_PATHS].some((excluded) => normalized === excluded || normalized.startsWith(`${excluded}/`));
}

function filePath(root, id) {
  const normalized = normalizeId(id);
  if (!isAllowedId(normalized)) return null;
  const result = path.resolve(root, ...normalized.split("/"));
  const relative = path.relative(root, result);
  return relative.startsWith("..") || path.isAbsolute(relative) ? null : result;
}

function readText(root, id) {
  const full = filePath(root, id);
  if (!full || !existsSync(full)) return null;
  return normalizeSourceText(readFileSync(full, "utf8"));
}

function capName(id) {
  const normalized = normalizeId(id);
  return `${normalized.replaceAll("/", ".")}.${sha256(normalized).slice(0, 8)}.json`;
}

function resolveLocalImport(root, sourceId, specifier, allowBare = false) {
  if (!specifier.startsWith(".") && !allowBare) return null;
  if (specifier.startsWith("/")) return null;
  const source = filePath(root, sourceId);
  if (!source) return null;
  const requested = path.resolve(path.dirname(source), specifier);
  const candidates = [];
  const requestedExtension = path.extname(requested);
  if (requestedExtension) candidates.push(requested);
  const requestedStem = requestedExtension ? requested.slice(0, -requestedExtension.length) : requested;
  for (const extension of SOURCE_EXTENSIONS) candidates.push(`${requestedStem}${extension}`);
  for (const extension of SOURCE_EXTENSIONS) candidates.push(path.join(requestedStem, `index${extension}`));
  for (const candidate of candidates) {
    const relative = normalizeId(path.relative(root, candidate));
    if (isAllowedId(relative) && existsSync(candidate)) return relative;
  }
  return null;
}

function localReferences(root, id, content) {
  const references = new Set();
  const importSpecifiers = [];
  if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/i.test(id)) {
    const scriptKind = /\.tsx$/i.test(id) ? ts.ScriptKind.TSX : /\.ts$/i.test(id) ? ts.ScriptKind.TS : /\.jsx$/i.test(id) ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
    const sourceFile = ts.createSourceFile(id, content, ts.ScriptTarget.Latest, true, scriptKind);
    const visit = (node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        importSpecifiers.push(node.moduleSpecifier.text);
      }
      if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
        const expression = node.expression;
        if (expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(expression) && expression.text === "require")) importSpecifiers.push(node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  for (const specifier of importSpecifiers) {
    const resolved = resolveLocalImport(root, id, specifier);
    if (resolved) references.add(resolved);
  }
  if (/\.(?:md|mdx)$/i.test(id)) {
    const linkPattern = /\[[^\]]*\]\(([^)\s#]+)(?:#[^)]*)?\)/g;
    for (const match of content.matchAll(linkPattern)) {
      const target = match[1];
      if (/^(?:[a-z]+:|\/)/i.test(target)) continue;
      const resolved = resolveLocalImport(root, id, target, true);
      if (resolved) references.add(resolved);
    }
  }
  return [...references].sort();
}

function roleFor(id, seedRoles) {
  return seedRoles.get(id) ?? "dependency";
}

function summaryFor(id, content) {
  const heading = content.split(/\r?\n/).map((value) => value.trim()).find((value) => /^#{1,3}\s+/.test(value));
  if (heading) return heading.replace(/^#{1,3}\s+/, "").replace(/\s+/g, " ").slice(0, 180);
  const publicApi = publicApiFor(id, content);
  if (publicApi.length > 0) return `${publicApi.slice(0, 4).join(", ")} の公開API`;
  const line = content.split(/\r?\n/).map((value) => value.trim()).find((value) => value && !value.startsWith("import ") && !value.startsWith("export ") && !value.startsWith("//") && !value.startsWith("#") && !value.startsWith("/*") && !value.startsWith("*") && !value.startsWith("---"));
  const chosen = line ?? id;
  return chosen.replace(/\s+/g, " ").slice(0, 180);
}

function publicApiFor(id, content) {
  const values = [];
  for (const match of content.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g)) values.push(match[1]);
  if (values.length === 0 && /\.ya?ml$|\.json$/.test(id)) values.push("configuration");
  return [...new Set(values)].sort().slice(0, 12);
}

function relatedTests(root, id) {
  const extension = path.extname(id);
  if (![".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(extension)) return [];
  const directory = path.dirname(filePath(root, id));
  const base = path.basename(id, extension);
  const directories = [path.join(directory, "__tests__"), directory];
  const result = [];
  for (const candidateDirectory of directories) {
    if (!existsSync(candidateDirectory)) continue;
    for (const entry of readdirSync(candidateDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.includes(base) || !/\.test\.[cm]?[jt]sx?$/.test(entry.name)) continue;
      result.push(normalizeId(path.relative(root, path.join(candidateDirectory, entry.name))));
    }
  }
  return [...new Set(result)].sort();
}

function seedList(root) {
  const missing = REQUIRED_SEEDS.filter(([id]) => !readText(root, id)).map(([id]) => id);
  const seeds = REQUIRED_SEEDS.filter(([id]) => readText(root, id)).map(([id, role]) => [id, role]);
  for (const [id, role] of OPTIONAL_SEEDS) if (readText(root, id)) seeds.push([id, role]);
  return { missing, seeds };
}

export function buildManifest(root) {
  const resolvedRoot = path.resolve(root);
  const { missing, seeds } = seedList(resolvedRoot);
  if (missing.length > 0) throw new Error(`必須seedが存在しません: ${missing.join(", ")}`);
  const seedRoles = new Map(seeds);
  const nodeIds = new Set(seeds.map(([id]) => id));
  const edges = new Set();
  for (const [id] of seeds) {
    const references = localReferences(resolvedRoot, id, readText(resolvedRoot, id));
    for (const reference of references) {
      if (reference === id) continue;
      nodeIds.add(reference);
      edges.add(`${id}\t${reference}`);
    }
  }
  const sortedNodes = [...nodeIds].sort();
  const nodes = {};
  for (const id of sortedNodes) {
    const content = readText(resolvedRoot, id);
    if (content === null) throw new Error(`参照されたsourceが存在しません: ${id}`);
    nodes[id] = {
      role: roleFor(id, seedRoles),
      caps: `docs/birdseye/caps/${capName(id)}`,
      sourceHash: sha256(content),
    };
  }
  const edgeList = [...edges].map((edge) => edge.split("\t")).sort((a, b) => `${a[0]}\t${a[1]}`.localeCompare(`${b[0]}\t${b[1]}`));
  const sourceManifest = sortedNodes.map((id) => [id, nodes[id].sourceHash]);
  const sourceHash = sha256(canonical({ nodes: sourceManifest, edges: edgeList }));
  const generationId = `birdseye-${sourceHash.slice(0, 16)}`;
  const caps = {};
  for (const id of sortedNodes) {
    const content = readText(resolvedRoot, id);
    const depsOut = edgeList.filter(([from]) => from === id).map(([, to]) => to);
    const depsIn = edgeList.filter(([, to]) => to === id).map(([from]) => from);
    caps[id] = {
      schema: "birdseye/cap/v1",
      id,
      role: nodes[id].role,
      summary: summaryFor(id, content),
      public_api: publicApiFor(id, content),
      deps_out: depsOut,
      deps_in: depsIn,
      tests: relatedTests(resolvedRoot, id),
      sourceHash: nodes[id].sourceHash,
      generation_id: generationId,
    };
  }
  const hotNodes = sortedNodes.filter((id) => ["entrypoint", "registry", "config", "policy"].includes(nodes[id].role)).sort();
  return {
    root: resolvedRoot,
    missing,
    generationId,
    sourceHash,
    scope: {
      kind: "seed+local-one-hop",
      required_seeds: REQUIRED_SEEDS.map(([id]) => id),
      optional_seeds: OPTIONAL_SEEDS.map(([id]) => id),
      excluded: [...EXCLUDED_PARTS].sort(),
      excluded_paths: [...EXCLUDED_PATHS].sort(),
    },
    nodes,
    edges: edgeList,
    caps,
    hotNodes,
  };
}

function renderIndex(manifest) {
  const nodes = {};
  for (const id of Object.keys(manifest.nodes).sort()) nodes[id] = { ...manifest.nodes[id], generation_id: manifest.generationId };
  return {
    schema: SCHEMA,
    generated_at: manifest.generationId,
    generation_id: manifest.generationId,
    sourceHash: manifest.sourceHash,
    scope: manifest.scope,
    nodes,
    edges: manifest.edges,
  };
}

function renderHot(manifest) {
  return {
    schema: "birdseye/hot/v1",
    generated_at: manifest.generationId,
    generation_id: manifest.generationId,
    sourceHash: manifest.sourceHash,
    hot_nodes: manifest.hotNodes,
    reason: "seedのentrypoint・registry・config・policyを優先表示",
  };
}

function renderDoc(manifest) {
  const nodes = Object.keys(manifest.nodes).sort();
  return `# Birdseye repository map\n\n生成ID: \`${manifest.generationId}\`\n\nこの資産はseedと、そのseedから直接参照される実在のローカルfileだけを対象にした小範囲の案内です。node_modules、dist、.qh、.git、fixtures、外部importは辿りません。\n\n- node: ${nodes.length}\n- edge: ${manifest.edges.length}\n- cap: ${nodes.length}\n- sourceHash: \`${manifest.sourceHash}\`\n\n## 使い方\n\n- 生成: \`node scripts/birdseye.mjs generate [--root path]\`\n- 検査: \`node scripts/birdseye.mjs check [--root path]\`\n\n`;
}

function outputPath(root, relative) {
  const outputRoot = path.resolve(root, "docs", "birdseye");
  const target = path.resolve(root, relative);
  const relativeToOutput = path.relative(outputRoot, target);
  if (relativeToOutput.startsWith("..") || path.isAbsolute(relativeToOutput)) throw new Error(`出力先がdocs/birdseye外です: ${relative}`);
  return target;
}

function writeJson(root, relative, value) {
  const target = outputPath(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function generate(root) {
  const manifest = buildManifest(root);
  writeJson(manifest.root, "docs/birdseye/index.json", renderIndex(manifest));
  writeJson(manifest.root, "docs/birdseye/hot.json", renderHot(manifest));
  for (const id of Object.keys(manifest.caps).sort()) writeJson(manifest.root, `docs/birdseye/caps/${capName(id)}`, manifest.caps[id]);
  const docPath = outputPath(manifest.root, "docs/birdseye/BIRDSEYE.md");
  mkdirSync(path.dirname(docPath), { recursive: true });
  writeFileSync(docPath, renderDoc(manifest).trimEnd() + "\n", "utf8");
  return manifest;
}

function readJson(root, relative, errors) {
  const full = outputPath(root, relative);
  if (!existsSync(full)) {
    errors.push(`欠落: ${relative}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(full, "utf8"));
  } catch (error) {
    errors.push(`JSON不正: ${relative} (${error.message})`);
    return null;
  }
}

export function check(root) {
  const resolvedRoot = path.resolve(root);
  const errors = [];
  let expected;
  try {
    expected = buildManifest(resolvedRoot);
  } catch (error) {
    errors.push(error.message);
  }
  const index = readJson(resolvedRoot, "docs/birdseye/index.json", errors);
  const hot = readJson(resolvedRoot, "docs/birdseye/hot.json", errors);
  const docPath = outputPath(resolvedRoot, "docs/birdseye/BIRDSEYE.md");
  const doc = existsSync(docPath) ? readFileSync(docPath, "utf8") : null;
  if (doc === null) errors.push("欠落: docs/birdseye/BIRDSEYE.md");
  if (expected && index) {
    const expectedIndex = renderIndex(expected);
    if (canonical(index) !== canonical(expectedIndex)) errors.push("indexが現行source/graphから生成された内容と一致しません");
    for (const [id, node] of Object.entries(index.nodes ?? {})) {
      if (!isAllowedId(id)) errors.push(`node pathがscope外です: ${id}`);
      if (!readText(resolvedRoot, id)) errors.push(`node sourceが存在しません: ${id}`);
      const cap = node.caps;
      if (typeof cap !== "string" || !cap.startsWith("docs/birdseye/caps/")) errors.push(`cap参照が不正です: ${id}`);
      else {
        const capValue = readJson(resolvedRoot, cap, errors);
        if (capValue && (!expected.caps[id] || canonical(capValue) !== canonical(expected.caps[id]))) errors.push(`cap内容が現行source/graphと不一致です: ${id}`);
      }
    }
    for (const edge of index.edges ?? []) {
      if (!Array.isArray(edge) || edge.length !== 2 || !index.nodes?.[edge[0]] || !index.nodes?.[edge[1]] || edge[0] === edge[1]) errors.push(`edgeが不正です: ${JSON.stringify(edge)}`);
    }
  }
  if (expected && hot) {
    const expectedHot = renderHot(expected);
    if (canonical(hot) !== canonical(expectedHot)) errors.push("hotが現行source/graphから生成された内容と一致しません");
  }
  if (expected && doc && doc !== renderDoc(expected).trimEnd() + "\n") errors.push("BIRDSEYE.mdが現行source/graphから生成された内容と一致しません");
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    return { ok: false, errors, manifest: expected };
  }
  console.log(`birdseye check passed: ${expected.generationId}`);
  return { ok: true, errors: [], manifest: expected };
}

function parseArgs(argv) {
  const command = argv[0] ?? "help";
  let root = process.cwd();
  for (let index = 1; index < argv.length; index++) {
    if (argv[index] === "--root" && argv[index + 1]) root = argv[++index];
    else throw new Error("usage: node scripts/birdseye.mjs generate|check [--root path]");
  }
  if (!["generate", "check", "help"].includes(command)) throw new Error("usage: node scripts/birdseye.mjs generate|check [--root path]");
  return { command, root };
}

export function main(argv = process.argv.slice(2)) {
  try {
    const { command, root } = parseArgs(argv);
    if (command === "help") {
      console.log("usage: node scripts/birdseye.mjs generate|check [--root path]");
      return 0;
    }
    if (command === "generate") {
      const manifest = generate(root);
      console.log(`birdseye generated: ${manifest.generationId} (${Object.keys(manifest.nodes).length} nodes)`);
      return 0;
    }
    return check(root).ok ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === pathToFileURL(thisFile).href) process.exitCode = main();
