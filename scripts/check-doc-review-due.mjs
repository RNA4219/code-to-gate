#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? "docs";
const failOnOverdue = process.argv.includes("--fail");
const today = new Date().toISOString().slice(0, 10);
const overdue = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
    } else if (entry.endsWith(".md")) {
      checkFile(full);
    }
  }
}

function checkFile(file) {
  const text = readFileSync(file, "utf8");
  const frontMatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontMatter) return;
  const due = frontMatter[1].match(/^next_review_due:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*$/m);
  if (due && due[1] < today) {
    overdue.push({ file, due: due[1] });
  }
}

walk(root);

if (overdue.length > 0) {
  console.error("Docs with overdue next_review_due:");
  for (const item of overdue) {
    console.error(`- ${item.file}: ${item.due}`);
  }
  process.exit(failOnOverdue ? 1 : 0);
}

console.log(`docs review check passed for ${root}`);
