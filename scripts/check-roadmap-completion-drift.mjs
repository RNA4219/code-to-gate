#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const fail = args.includes("--fail");
const roots = args.filter((arg) => arg !== "--fail");
if (roots.length > 1 || roots.some((arg) => arg.startsWith("-"))) {
  console.error("usage: node check-roadmap-completion-drift.mjs [root] [--fail]");
  process.exit(2);
}
const root = resolve(roots[0] ?? ".");
const roadmap = readFileSync(join(root, "docs/product-roadmap.md"), "utf8");
const completion = readFileSync(join(root, "docs/completion-record.md"), "utf8");
const lines = roadmap.split(/\r?\n/);
const tableRow = /^\s*\|.*\|\s*$/;
const separator = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;

const cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
const token = (value) => new RegExp(`(?<![A-Za-z0-9_-])${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_-])`);
const done = (value) => /^(?:done|completed|完了|[✅✓])(?=\s|:|$)/i.test(value);
let drift = 0;

for (let index = 0; index < lines.length - 1; index++) {
  if (!tableRow.test(lines[index]) || !separator.test(lines[index + 1])) continue;
  const header = cells(lines[index]).map((cell) => cell.toLowerCase());
  const idIndex = header.indexOf("id");
  const actionIndex = Math.max(header.indexOf("action"), header.indexOf("task"));
  const statusIndex = header.indexOf("status");
  if (idIndex < 0 || actionIndex < 0 || statusIndex < 0) continue;
  for (index += 2; index < lines.length && tableRow.test(lines[index]); index++) {
    const row = cells(lines[index]);
    const id = row[idIndex];
    if (!id || !done(row[statusIndex])) continue;
    if (!token(id).test(completion)) {
      console.warn(`roadmap completion candidate lacks completion-record reference: ${id}`);
      drift++;
    }
  }
  index--;
}

console.log(`roadmap drift candidates: ${drift}`);
if (fail && drift > 0) process.exitCode = 1;
