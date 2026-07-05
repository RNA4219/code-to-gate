import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outRoot = path.join(root, ".qh", "acceptance", "harness");
const cli = path.join(root, "dist", "cli.js");

function run(name, args, expectExit) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
  const ok = Array.isArray(expectExit)
    ? expectExit.includes(result.status ?? 1)
    : result.status === expectExit;
  return {
    name,
    command: `node dist/cli.js ${args.join(" ")}`,
    expected_exit: expectExit,
    actual_exit: result.status,
    status: ok ? "pass" : "fail",
    stderr_tail: result.stderr.split(/\r?\n/).slice(-8).join("\n"),
  };
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

if (!existsSync(cli)) {
  console.error("dist/cli.js not found. Run npm run build first.");
  process.exit(1);
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

const results = [];
const fixtures = [
  { name: "demo-shop-ts", path: "fixtures/demo-shop-ts", expectAnalyze: [0, 1] },
  { name: "demo-auth-js", path: "fixtures/demo-auth-js", expectAnalyze: [0, 1] },
  { name: "demo-ci-imports", path: "fixtures/demo-ci-imports", expectAnalyze: 0 },
];

for (const fixture of fixtures) {
  const out = path.join(".qh", "acceptance", "harness", fixture.name);
  results.push(run(`${fixture.name}: analyze`, [
    "analyze",
    fixture.path,
    "--emit",
    "all",
    "--out",
    out,
    "--llm-provider",
    "deterministic",
  ], fixture.expectAnalyze));

  const findingsPath = path.join(root, out, "findings.json");
  if (existsSync(findingsPath)) {
    const findings = readJson(findingsPath);
    results.push({
      name: `${fixture.name}: findings artifact`,
      expected_exit: 0,
      actual_exit: 0,
      status: Array.isArray(findings.findings) ? "pass" : "fail",
      command: `read ${out}/findings.json`,
    });
  } else {
    results.push({
      name: `${fixture.name}: findings artifact`,
      expected_exit: 0,
      actual_exit: 1,
      status: "fail",
      command: `read ${out}/findings.json`,
    });
  }
}

results.push(run("schema validate demo-shop-ts findings", [
  "schema",
  "validate",
  path.join(".qh", "acceptance", "harness", "demo-shop-ts", "findings.json"),
], 0));

const failed = results.filter((result) => result.status !== "pass");
const summary = {
  schema: "ctg.acceptance-harness@v1",
  generated_at: new Date().toISOString(),
  output_dir: path.relative(root, outRoot).replaceAll("\\", "/"),
  pass: results.length - failed.length,
  fail: failed.length,
  results,
};

console.log(JSON.stringify(summary, null, 2));
process.exit(failed.length > 0 ? 1 : 0);
