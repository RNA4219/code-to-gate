#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const cli = path.join(root, "dist", "cli.js");
const output = path.join(root, ".qh", "agent-determinism.json");
const raw = execFileSync(process.execPath, [cli, "agent", "capabilities", "--profile", "compact"], { cwd: root, encoding: "utf8" });
const response = JSON.parse(raw);
if (response.status !== "succeeded" || response.exit?.code !== 0) throw new Error("capabilities command failed");
const data = response.data;
if (!data || data.schema !== "ctg-agent-capabilities@v1") throw new Error("invalid capabilities response");

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

const projection = {
  schema: data.schema,
  protocol: data.protocol,
  tool: data.tool,
  protocols: data.protocols,
  operations: data.operations,
  schemas: data.schemas,
};
const canonicalProjection = canonical(projection);
const digest = createHash("sha256").update(canonicalProjection).digest("hex");
const evidence = {
  schema: "ctg-agent-determinism@v1",
  capabilities_digest_sha256: digest,
  projection,
  toolchain: { node: process.version, package_manager: "npm@10.9.8" },
};
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ schema: evidence.schema, capabilities_digest_sha256: digest, output: path.relative(root, output).replaceAll(path.sep, "/") }));