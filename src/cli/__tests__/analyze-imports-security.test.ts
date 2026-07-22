import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeCommand } from "../analyze.js";
import { importCommand } from "../import.js";
import { EXIT, getOption, VERSION } from "../exit-codes.js";

describe("analyze import provenance integration", () => {
  let root: string;
  let outDir: string;
  const repoRoot = path.resolve(import.meta.dirname, "../../../fixtures/demo-ci-imports");
  const semgrepFile = path.join(repoRoot, "semgrep.json");

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "ctg-analyze-imports-"));
  });

  beforeEach(() => {
    outDir = path.join(root, "out");
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function importSemgrep(): Promise<void> {
    const result = await importCommand(
      ["semgrep", semgrepFile, "--out", outDir, "--repo-root", repoRoot],
      { VERSION, EXIT, getOption }
    );
    expect(result).toBe(EXIT.OK);
  }

  async function analyze(): Promise<number> {
    return analyzeCommand(
      [repoRoot, "--out", outDir, "--emit", "json", "--from-imports"],
      { VERSION, EXIT, getOption }
    );
  }

  it("merges a manifest-verified import without degrading completeness", async () => {
    await importSemgrep();

    expect(await analyze()).toBe(EXIT.OK);

    const findings = JSON.parse(readFileSync(path.join(outDir, "findings.json"), "utf8"));
    expect(findings.unsupported_claims).not.toContainEqual(expect.objectContaining({
      id: "imports-partial",
    }));
    expect(findings.findings).toContainEqual(expect.objectContaining({
      upstream: expect.objectContaining({ tool: "semgrep" }),
    }));
  });

  it("accepts a legacy import only as partial", async () => {
    await importSemgrep();
    unlinkSync(path.join(outDir, "imports", "semgrep-import-manifest.json"));

    expect(await analyze()).toBe(EXIT.OK);

    const findings = JSON.parse(readFileSync(path.join(outDir, "findings.json"), "utf8"));
    expect(findings.completeness).toBe("partial");
    expect(findings.unsupported_claims).toContainEqual(expect.objectContaining({
      id: "imports-partial",
    }));
  });

  it("fails the analysis when an imported findings file no longer matches its manifest", async () => {
    await importSemgrep();
    const findingsPath = path.join(outDir, "imports", "semgrep-findings.json");
    writeFileSync(findingsPath, readFileSync(findingsPath, "utf8") + " ", "utf8");

    expect(await analyze()).toBe(EXIT.SCAN_FAILED);
    expect(existsSync(path.join(outDir, "findings.json"))).toBe(false);
  });

  it("discovers npm-audit imports through --from-imports", async () => {
    const auditFile = path.join(root, "npm-audit.json");
    writeFileSync(auditFile, JSON.stringify({
      auditReportVersion: 2,
      vulnerabilities: {
        lodash: {
          name: "lodash",
          severity: "high",
          isDirect: true,
          via: [{ title: "Prototype pollution", severity: "high" }],
        },
      },
    }), "utf8");
    expect(await importCommand(
      ["npm-audit", auditFile, "--out", outDir, "--repo-root", repoRoot],
      { VERSION, EXIT, getOption }
    )).toBe(EXIT.OK);

    expect(await analyze()).toBe(EXIT.OK);

    const findings = JSON.parse(readFileSync(path.join(outDir, "findings.json"), "utf8"));
    expect(findings.findings).toContainEqual(expect.objectContaining({
      upstream: expect.objectContaining({ tool: "npm-audit" }),
    }));
  });
});
