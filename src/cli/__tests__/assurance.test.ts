import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { assuranceCommand } from "../assurance.js";
import { EXIT, getOption, VERSION } from "../exit-codes.js";

const dirs: string[] = [];

function createFixture(): { root: string; artifacts: string; findingsPath: string } {
  const root = mkdtempSync(path.join(tmpdir(), "ctg-assurance-cli-"));
  dirs.push(root);
  const artifacts = path.join(root, ".qh");
  mkdirSync(artifacts);
  const header = {
    version: "ctg/v1",
    generated_at: "2026-06-09T00:00:00.000Z",
    run_id: "source-run",
    repo: { root },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
  };
  const findingsPath = path.join(artifacts, "findings.json");
  writeFileSync(findingsPath, JSON.stringify({
    ...header,
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings: [],
    unsupported_claims: [],
  }));
  writeFileSync(path.join(artifacts, "repo-graph.json"), JSON.stringify({
    ...header,
    artifact: "normalized-repo-graph",
    schema: "normalized-repo-graph@v1",
    files: [],
    modules: [],
    symbols: [],
    relations: [],
    tests: [],
    configs: [],
    entrypoints: [],
    diagnostics: [],
    stats: { partial: false },
  }));
  return { root, artifacts, findingsPath };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("assurance inspect CLI", () => {
  it("writes a findings@v1 artifact without changing inputs", async () => {
    const fixture = createFixture();
    const before = readFileSync(fixture.findingsPath, "utf8");
    const code = await assuranceCommand(
      ["inspect", fixture.root, "--from", fixture.artifacts],
      { VERSION, EXIT, getOption }
    );
    const outputPath = path.join(fixture.artifacts, "assurance-findings.json");
    const output = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(code).toBe(EXIT.OK);
    expect(existsSync(outputPath)).toBe(true);
    expect(output.artifact).toBe("findings");
    expect(output.schema).toBe("findings@v1");
    expect(output).not.toHaveProperty("decision");
    expect(readFileSync(fixture.findingsPath, "utf8")).toBe(before);
  });

  it("returns schema failure for a missing required artifact", async () => {
    const fixture = createFixture();
    rmSync(fixture.findingsPath);
    const code = await assuranceCommand(
      ["inspect", fixture.root, "--from", fixture.artifacts],
      { VERSION, EXIT, getOption }
    );
    expect(code).toBe(EXIT.SCHEMA_FAILED);
  });

  it("returns usage error for invalid confidence", async () => {
    const fixture = createFixture();
    const code = await assuranceCommand(
      ["inspect", fixture.root, "--from", fixture.artifacts, "--min-confidence", "2"],
      { VERSION, EXIT, getOption }
    );
    expect(code).toBe(EXIT.USAGE_ERROR);
  });

  it("requires base and head together for diff inspection", async () => {
    const fixture = createFixture();
    const code = await assuranceCommand(
      ["inspect", fixture.root, "--from", fixture.artifacts, "--base", "main"],
      { VERSION, EXIT, getOption }
    );
    expect(code).toBe(EXIT.USAGE_ERROR);
  });
});
