import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const script = join(process.cwd(), "scripts/check-roadmap-completion-drift.mjs");

function fixture(roadmap, completion) {
  const root = mkdtempSync(join(tmpdir(), "roadmap-drift-"));
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "docs/product-roadmap.md"), roadmap);
  writeFileSync(join(root, "docs/completion-record.md"), completion);
  return root;
}

test("checks only completed action/task rows and uses exact completion IDs", () => {
  const root = fixture(
    [
      "| id | action | status |",
      "|---|---|---|",
      "| ACT-01 | ship | Done |",
      "| ACT-010 | ship | Done |",
      "| ACT-02 | ship | Done |",
      "| TASK-01 | task | ✓ |",
      "",
      "| id | task | status |",
      "|---|---|---|",
      "| TASK-02 | verify | Completed |",
      "",
      "| id | risk | status |",
      "|---|---|---|",
      "| RISK-01 | outage | Done |",
      "",
      "| id | question | status |",
      "|---|---|---|",
      "| Q-01 | decision | Decided |",
      "",
      "| id | history | status |",
      "|---|---|---|",
      "| H-01 | event | Done |",
    ].join("\n"),
    "Record for ACT-01 and TASK-01.\nRecord for ACT-01-extra and ACT-02-extra.\n",
  );
  try {
    const result = spawnSync(process.execPath, [script, root], { encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /roadmap drift candidates: 3/);
    assert.match(result.stderr, /ACT-010/);
    assert.match(result.stderr, /ACT-02/);
    assert.match(result.stderr, /TASK-02/);
    assert.doesNotMatch(result.stderr, /RISK-01|Q-01|H-01|ACT-01(?!0)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--fail returns non-zero only when candidates remain", () => {
  const root = fixture(
    "| id | action | status |\n|---|---|---|\n| ACT-01 | ship | Done |\n",
    "No matching completion ID.\n",
  );
  try {
    const failed = spawnSync(process.execPath, [script, "--fail", root], { encoding: "utf8" });
    assert.equal(failed.status, 1);
    writeFileSync(join(root, "docs/completion-record.md"), "ACT-01\n");
    const passed = spawnSync(process.execPath, [script, "--fail", root], { encoding: "utf8" });
    assert.equal(passed.status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("escapes punctuation in IDs and reads a non-final status column", () => {
  const root = fixture(
    "| id | status | action |\n|---|---|---|\n| PUNC.01 | Done | ship |\n| PUNC+02 | Done | ship |\n| PUNC(03) | Done | ship |\n",
    "PUNC.01 and PUNC+02-extra and PUNC(03)\n",
  );
  try {
    const result = spawnSync(process.execPath, [script, root], { encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /roadmap drift candidates: 1/);
    assert.match(result.stderr, /PUNC\+02/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects unknown options and multiple roots", () => {
  const unknown = spawnSync(process.execPath, [script, "--unknown"], { encoding: "utf8" });
  const extraRoot = spawnSync(process.execPath, [script, ".", "other"], { encoding: "utf8" });
  assert.equal(unknown.status, 2);
  assert.equal(extraRoot.status, 2);
});
