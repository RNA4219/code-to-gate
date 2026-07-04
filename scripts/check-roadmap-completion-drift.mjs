#!/usr/bin/env node
import { readFileSync } from "node:fs";

const roadmap = readFileSync("docs/product-roadmap.md", "utf8");
const completion = readFileSync("docs/completion-record.md", "utf8");
const completedRows = roadmap
  .split(/\r?\n/)
  .filter((line) => /\|\s*(Done|Completed|完了|✅|✓)/i.test(line));

let drift = 0;
for (const row of completedRows) {
  const cells = row.split("|").map((cell) => cell.trim()).filter(Boolean);
  const label = cells[0];
  if (label && !completion.includes(label)) {
    console.warn(`roadmap completion candidate lacks completion-record reference: ${label}`);
    drift++;
  }
}

console.log(`roadmap drift candidates: ${drift}`);
