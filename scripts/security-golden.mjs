import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function fail(message) {
  process.stderr.write(`security golden failure: ${message}\n`);
  process.exit(1);
}

const [mode, ...args] = process.argv.slice(2);

if (mode === "prepare") {
  const target = path.resolve(args[0] ?? ".qh/security/golden");
  mkdirSync(target, { recursive: true });

  writeFileSync(
    path.join(target, "unsafe.js"),
    "export function run(value) { return eval(value); }\n",
    "utf8"
  );

  const syntheticToken = ["gh", "p", "_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("");
  writeFileSync(
    path.join(target, "secret.txt"),
    `github_token=${syntheticToken}\n`,
    "utf8"
  );

  process.stdout.write(`${target}\n`);
} else if (mode === "verify") {
  const semgrepPath = path.resolve(args[0] ?? "");
  const gitleaksPath = path.resolve(args[1] ?? "");
  let semgrep;
  let gitleaks;
  try {
    semgrep = JSON.parse(readFileSync(semgrepPath, "utf8"));
    gitleaks = JSON.parse(readFileSync(gitleaksPath, "utf8"));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const semgrepIds = new Set(
    Array.isArray(semgrep.results)
      ? semgrep.results.map((result) => result?.check_id).filter(Boolean)
      : []
  );
  const evalRuleIds = ["ctg.javascript.no-eval", "semgrep.ctg.javascript.no-eval"];
  if (!evalRuleIds.some((ruleId) => semgrepIds.has(ruleId))) {
    fail("Semgrep did not detect the eval() golden fixture");
  }

  if (
    !Array.isArray(gitleaks) ||
    !gitleaks.some((finding) => String(finding?.RuleID ?? "").toLowerCase().includes("github"))
  ) {
    fail("Gitleaks did not detect the synthetic GitHub token fixture");
  }

  process.stdout.write("security golden fixtures detected by Semgrep and Gitleaks\n");
} else {
  fail("usage: security-golden.mjs prepare <dir> | verify <semgrep.json> <gitleaks.json>");
}
