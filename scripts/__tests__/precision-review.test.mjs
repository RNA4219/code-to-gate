import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const script = join(process.cwd(), "scripts/precision-review.mjs");
const source = {
  version: "ctg/v1", generated_at: "2026-09-10T00:00:00Z", run_id: "run-cli",
  repo: { root: "/repo", revision: "unknown" },
  tool: { name: "code-to-gate", version: "1.5.1", plugin_versions: [] },
  artifact: "findings", schema: "findings@v1", completeness: "complete", unsupported_claims: [],
  findings: [
    { id: "f1", ruleId: "R1", category: "security", severity: "high", confidence: 1, title: "t", summary: "s", evidence: [] },
    { id: "f2", ruleId: "R2", category: "auth", severity: "low", confidence: 1, title: "t2", summary: "s2", evidence: [] },
  ],
};

function findBash() {
  const windowsBash = ["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files\\Git\\usr\\bin\\bash.exe"].find(existsSync);
  if (windowsBash) return windowsBash;
  const probe = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf8" });
  if (probe.error?.code === "ENOENT") return null;
  assert.equal(probe.error, undefined, probe.stderr);
  return "bash";
}

function psLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

test("create, update, and summarize round trip without overwriting", () => {
  const root = mkdtempSync(join(tmpdir(), "precision-review-"));
  const findings = join(root, "findings.json");
  const review = join(root, "review.json");
  const summary = join(root, "summary.json");
  const updates = join(root, "updates.json");
  writeFileSync(findings, JSON.stringify(source));
  writeFileSync(updates, JSON.stringify([
    { finding_id: "f1", classification: "FP", comment: "日本語" },
    { finding_id: "f2", classification: "TP", comment: "" },
  ]));
  try {
    let result = spawnSync(process.execPath, [script, "create", "--from", findings, "--out", review, "--reviewer", "model", "--reviewer-kind", "ai"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const originalHash = JSON.parse(readFileSync(review, "utf8")).findings_source.sha256;
    result = spawnSync(process.execPath, [script, "update", "--from", review, "--findings", findings, "--out", review, "--force", "--input", updates], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const reviewArtifact = JSON.parse(readFileSync(review, "utf8"));
    assert.equal(reviewArtifact.findings_source.sha256, originalHash);
    assert.deepEqual(reviewArtifact.findings.map((item) => item.classification), ["FP", "TP"]);
    assert.equal(reviewArtifact.findings[1].comment, "");
    result = spawnSync(process.execPath, [script, "summarize", "--from", findings, "--review", review, "--out", summary], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(summary, "utf8")).fp_rate, 50);
    result = spawnSync(process.execPath, [script, "create", "--from", findings, "--out", review, "--reviewer", "model", "--reviewer-kind", "ai"], { encoding: "utf8" });
    assert.equal(result.status, 2);
    result = spawnSync(process.execPath, [script, "create", "--from", findings, "--out", join(root, "invalid.json"), "--reviewer", "model", "--reviewer-kind", "ai", "--full-sha", "invalid"], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /fullSha/);
    result = spawnSync(process.execPath, [script, "summarize", "--from", findings, "--review", review, "--out", join(root, "second.json"), "--unknown", "x"], { encoding: "utf8" });
    assert.equal(result.status, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("protects command inputs even when force is set", () => {
  const root = mkdtempSync(join(tmpdir(), "precision-protection-"));
  const findings = join(root, "findings.json");
  const review = join(root, "review.json");
  const updates = join(root, "updates.json");
  const hardlink = join(root, "findings-hardlink.json");
  writeFileSync(findings, JSON.stringify(source));
  writeFileSync(updates, JSON.stringify([{ finding_id: "f1", classification: "FP" }]));
  try {
    let result = spawnSync(process.execPath, [script, "create", "--from", findings, "--out", review, "--reviewer", "model", "--reviewer-kind", "ai"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const beforeFindings = readFileSync(findings);
    const beforeReview = readFileSync(review);
    const beforeUpdates = readFileSync(updates);

    result = spawnSync(process.execPath, [script, "create", "--from", findings, "--out", join(root, ".", "findings.json"), "--force", "--reviewer", "model", "--reviewer-kind", "ai"], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /input file/);
    assert.deepEqual(readFileSync(findings), beforeFindings);

    result = spawnSync(process.execPath, [script, "summarize", "--from", findings, "--review", review, "--out", review, "--force"], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /input file/);
    assert.deepEqual(readFileSync(review), beforeReview);

    result = spawnSync(process.execPath, [script, "update", "--from", review, "--findings", findings, "--out", findings, "--force", "--finding-id", "f1", "--classification", "FP"], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /input file/);
    assert.deepEqual(readFileSync(findings), beforeFindings);

    result = spawnSync(process.execPath, [script, "update", "--from", review, "--findings", findings, "--input", updates, "--out", updates, "--force"], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /input file/);
    assert.deepEqual(readFileSync(updates), beforeUpdates);

    linkSync(findings, hardlink);
    result = spawnSync(process.execPath, [script, "create", "--from", findings, "--out", hardlink, "--force", "--reviewer", "model", "--reviewer-kind", "ai"], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /input file/);
    assert.deepEqual(readFileSync(findings), beforeFindings);
    assert.deepEqual(readFileSync(hardlink), beforeFindings);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("top-level help documents batch and force options", () => {
  const result = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /--input updates\.json/);
  assert.match(result.stderr, /--force/);
});

test("POSIX wrapper records piped classifications and empty comments", (t) => {
  const wrapperPath = join(process.cwd(), "scripts/fp-review.sh");
  const wrapper = readFileSync(wrapperPath, "utf8");
  assert.match(wrapper, /set -euo pipefail/);
  assert.match(wrapper, /node "\$PROJECT_ROOT\/dist\/cli\.js" analyze/);
  const bash = findBash();
  if (!bash) { t.skip("bash is unavailable in this runtime"); return; }
  const syntax = spawnSync(bash, ["-n", wrapperPath], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);
  const root = mkdtempSync(join(tmpdir(), "precision-wrapper-"));
  const out = join(root, "absolute-out");
  try {
    mkdirSync(join(root, ".qh"));
    writeFileSync(join(root, ".qh/findings.json"), JSON.stringify({ ...source, repo: { ...source.repo, root } }));
    const init = spawnSync("git", ["init", root], { encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    const result = spawnSync(bash, [wrapperPath, root, "--skip-analyze", "--interactive", "--evaluator", "tester", "--out", out], { input: "T\n日本語コメント\nF\n\n", encoding: "utf8" });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const review = JSON.parse(readFileSync(join(out, "review.json"), "utf8"));
    assert.deepEqual(review.findings.map((item) => item.classification), ["TP", "FP"]);
    assert.equal(review.findings[0].comment, "日本語コメント");
    assert.equal(review.findings[1].comment, "");
    const before = ["findings.json", "review.json", "summary.json"].map((file) => readFileSync(join(out, file)));
    writeFileSync(join(root, ".qh/findings.json"), JSON.stringify({ ...source, run_id: "changed", repo: { ...source.repo, root } }));
    const rerun = spawnSync(bash, [wrapperPath, root, "--skip-analyze", "--interactive", "--evaluator", "tester", "--out", out], { input: "T\n別コメント\nF\n\n", encoding: "utf8" });
    assert.equal(rerun.status, 2);
    ["findings.json", "review.json", "summary.json"].forEach((file, index) => assert.deepEqual(readFileSync(join(out, file)), before[index]));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("PowerShell wrapper records piped classifications when available", (t) => {
  const wrapper = readFileSync(join(process.cwd(), "scripts/fp-review.ps1"), "utf8");
  assert.match(wrapper, /\$LASTEXITCODE -ne 0/);
  const probe = spawnSync("pwsh", ["-NoProfile", "-Command", "exit 0"], { encoding: "utf8" });
  if (probe.status !== 0) { t.skip("PowerShell Core is unavailable in this runtime"); return; }
  const root = mkdtempSync(join(tmpdir(), "precision-wrapper-"));
  const out = join(root, "absolute-out");
  try {
    mkdirSync(join(root, ".qh"));
    writeFileSync(join(root, ".qh/findings.json"), JSON.stringify({ ...source, repo: { ...source.repo, root } }));
    const init = spawnSync("git", ["init", root], { encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    const command = `$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); [Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false); & ${psLiteral(join(process.cwd(), "scripts/fp-review.ps1"))} -Repo ${psLiteral(root)} -SkipAnalyze -Interactive -Evaluator 'tester' -OutDir ${psLiteral(out)}`;
    const result = spawnSync("pwsh", ["-NoProfile", "-Command", command], { input: "T\r\n日本語コメント\r\nF\r\n\r\n", encoding: "utf8" });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const review = JSON.parse(readFileSync(join(out, "review.json"), "utf8"));
    assert.deepEqual(review.findings.map((item) => item.classification), ["TP", "FP"]);
    assert.equal(review.findings[0].comment, "日本語コメント");
    assert.equal(review.findings[1].comment, "");
    const before = ["findings.json", "review.json", "summary.json"].map((file) => readFileSync(join(out, file)));
    writeFileSync(join(root, ".qh/findings.json"), JSON.stringify({ ...source, run_id: "changed", repo: { ...source.repo, root } }));
    const rerun = spawnSync("pwsh", ["-NoProfile", "-Command", command], { input: "T\r\n別コメント\r\nF\r\n\r\n", encoding: "utf8" });
    assert.notEqual(rerun.status, 0);
    ["findings.json", "review.json", "summary.json"].forEach((file, index) => assert.deepEqual(readFileSync(join(out, file)), before[index]));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
