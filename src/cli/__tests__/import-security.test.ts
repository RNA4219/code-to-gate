import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { importCommand } from "../import.js";
import {
  normalizeEvidencePath,
  portableSourcePath,
} from "../import-provenance.js";
import { EXIT, getOption, VERSION } from "../exit-codes.js";

function digest(value: Buffer | string): string {
  return "sha256:" + createHash("sha256").update(value).digest("hex");
}

function semgrepResult(reportPath: string, checkId = "security.test") {
  return {
    check_id: checkId,
    path: reportPath,
    start: { line: 1, col: 1 },
    end: { line: 1, col: 2 },
    extra: { message: "security finding", severity: "ERROR" },
  };
}

describe("import security boundary", () => {
  let root: string;
  let caseDir: string;
  let outDir: string;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "ctg-import-security-"));
  });

  beforeEach(() => {
    caseDir = path.join(root, "case");
    rmSync(caseDir, { recursive: true, force: true });
    mkdirSync(caseDir, { recursive: true });
    outDir = path.join(caseDir, "out");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeJson(name: string, value: unknown): string {
    const filePath = path.join(caseDir, name);
    writeFileSync(filePath, JSON.stringify(value), "utf8");
    return filePath;
  }

  function artifact(tool: string, suffix: "findings" | "import-manifest"): Record<string, any> {
    return JSON.parse(readFileSync(path.join(outDir, "imports", tool + "-" + suffix + ".json"), "utf8"));
  }

  async function run(tool: string, inputFile: string, extra: string[] = []): Promise<number> {
    return importCommand(
      [tool, inputFile, "--out", outDir, ...extra],
      { VERSION, EXIT, getOption }
    );
  }

  it("records complete zero-result provenance with exact hashes and revision", async () => {
    const inputFile = writeJson("empty-semgrep.json", { version: "1.164.0", results: [], errors: [] });

    expect(await run("semgrep", inputFile)).toBe(EXIT.OK);

    const findingsPath = path.join(outDir, "imports", "semgrep-findings.json");
    const findings = artifact("semgrep", "findings");
    const manifest = artifact("semgrep", "import-manifest");
    expect(findings.completeness).toBe("complete");
    expect(findings.findings).toEqual([]);
    expect(manifest.completeness).toBe("complete");
    expect(manifest.source).toMatchObject({
      tool: "semgrep",
      producer: { name: "semgrep", version: "1.164.0" },
      sha256: digest(readFileSync(inputFile)),
      size_bytes: readFileSync(inputFile).byteLength,
      path_kind: "external_redacted",
    });
    expect(manifest.source.repository_revision).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.repo.revision).toBe(manifest.source.repository_revision);
    expect(manifest.normalized).toMatchObject({
      path: "imports/semgrep-findings.json",
      sha256: digest(readFileSync(findingsPath)),
      size_bytes: readFileSync(findingsPath).byteLength,
      schema: "findings@v1",
    });
    expect(manifest.summary).toEqual({ seen: 0, accepted: 0, dropped: 0, errors: 0 });
  });

  it("replaces an existing findings/manifest pair and keeps hashes synchronized", async () => {
    const inputFile = writeJson("repeat-semgrep.json", { version: "1.164.0", results: [], errors: [] });
    expect(await run("semgrep", inputFile)).toBe(EXIT.OK);
    const firstHash = artifact("semgrep", "import-manifest").normalized.sha256;

    writeFileSync(
      inputFile,
      JSON.stringify({ version: "1.164.0", results: [semgrepResult("src/security.ts")], errors: [] }),
      "utf8"
    );
    expect(await run("semgrep", inputFile)).toBe(EXIT.OK);

    const findingsPath = path.join(outDir, "imports", "semgrep-findings.json");
    const findings = artifact("semgrep", "findings");
    const manifest = artifact("semgrep", "import-manifest");
    expect(findings.findings).toHaveLength(1);
    expect(manifest.normalized.sha256).not.toBe(firstHash);
    expect(manifest.normalized.sha256).toBe(digest(readFileSync(findingsPath)));
  });

  it("returns partial and preserves scanner diagnostics", async () => {
    const inputFile = writeJson("partial-semgrep.json", {
      results: [semgrepResult("src/security.ts")],
      errors: [{ message: "one file could not be scanned" }],
    });

    expect(await run("semgrep", inputFile)).toBe(EXIT.PARTIAL_SUCCESS);

    const findings = artifact("semgrep", "findings");
    const manifest = artifact("semgrep", "import-manifest");
    expect(findings.completeness).toBe("partial");
    expect(findings.unsupported_claims).toHaveLength(1);
    expect(manifest.completeness).toBe("partial");
    expect(manifest.summary).toMatchObject({ seen: 1, accepted: 1, dropped: 0, errors: 1 });
    expect(manifest.diagnostics).toContainEqual(expect.objectContaining({ code: "SEMGREP_ERROR" }));
  });

  it("drops traversal, UNC, and duplicate evidence instead of trusting it", async () => {
    const inputFile = writeJson("unsafe-semgrep.json", {
      results: [
        semgrepResult("../escape.ts", "escape"),
        semgrepResult("\\\\server\\share\\file.ts", "unc"),
        semgrepResult("src/security.ts", "duplicate"),
        semgrepResult("src/security.ts", "duplicate"),
      ],
      errors: [],
    });

    expect(await run("semgrep", inputFile)).toBe(EXIT.PARTIAL_SUCCESS);

    const findings = artifact("semgrep", "findings");
    const manifest = artifact("semgrep", "import-manifest");
    expect(findings.findings).toHaveLength(1);
    expect(findings.findings[0].evidence[0].path).toBe("src/security.ts");
    expect(manifest.summary).toMatchObject({ seen: 4, accepted: 1, dropped: 3, errors: 0 });
    expect(manifest.diagnostics.map((item: { code: string }) => item.code)).toEqual(
      expect.arrayContaining(["EVIDENCE_PATH_REJECTED", "DUPLICATE_FINDING_ID"])
    );
  });

  it("drops SARIF records without a trustworthy location and never emits unknown:1", async () => {
    const inputFile = writeJson("missing-location.sarif", {
      version: "2.1.0",
      runs: [{
        tool: { driver: { name: "Generic SARIF", version: "1.0.0" } },
        results: [{ ruleId: "missing-location", level: "error", message: { text: "missing" } }],
      }],
    });

    expect(await run("sarif", inputFile)).toBe(EXIT.PARTIAL_SUCCESS);

    const findings = artifact("sarif", "findings");
    const manifest = artifact("sarif", "import-manifest");
    expect(findings.findings).toEqual([]);
    expect(JSON.stringify(findings)).not.toContain("unknown");
    expect(manifest.summary).toMatchObject({ seen: 1, accepted: 0, dropped: 1, errors: 0 });
    expect(manifest.diagnostics).toContainEqual(expect.objectContaining({ code: "SARIF_LOCATION_MISSING" }));
  });

  it("imports npm audit v7+ JSON as security findings", async () => {
    const inputFile = writeJson("npm-audit.json", {
      auditReportVersion: 2,
      vulnerabilities: {
        lodash: {
          name: "lodash",
          severity: "high",
          isDirect: true,
          via: [{
            title: "Prototype pollution",
            url: "https://example.invalid/advisory",
            severity: "high",
            cwe: ["CWE-1321"],
          }],
          range: "<4.17.21",
          nodes: ["node_modules/lodash"],
        },
      },
    });

    expect(await run("npm-audit", inputFile)).toBe(EXIT.OK);

    const findings = artifact("npm-audit", "findings");
    const manifest = artifact("npm-audit", "import-manifest");
    expect(findings.findings).toHaveLength(1);
    expect(findings.findings[0]).toMatchObject({
      ruleId: "NPM_AUDIT_LODASH",
      category: "security",
      severity: "high",
      upstream: { tool: "npm-audit", ruleId: "lodash" },
    });
    expect(manifest.source).toMatchObject({
      tool: "npm-audit",
      format: "npm-audit-json",
      format_version: "2",
    });
  });

  it("fails closed without artifacts for malformed, oversize, bad shape, and false CodeQL identity", async () => {
    const malformed = path.join(caseDir, "malformed.json");
    writeFileSync(malformed, "{", "utf8");
    expect(await run("semgrep", malformed)).toBe(EXIT.IMPORT_FAILED);
    expect(existsSync(path.join(outDir, "imports"))).toBe(false);

    const oversize = writeJson("oversize.json", { results: [], errors: [] });
    expect(await run("semgrep", oversize, ["--max-input-mb", "0.000001"])).toBe(EXIT.IMPORT_FAILED);
    expect(existsSync(path.join(outDir, "imports"))).toBe(false);

    const badShape = writeJson("bad-shape.json", { results: "not-an-array" });
    expect(await run("semgrep", badShape)).toBe(EXIT.IMPORT_FAILED);
    expect(existsSync(path.join(outDir, "imports"))).toBe(false);

    const falseCodeql = writeJson("false-codeql.sarif", {
      version: "2.1.0",
      runs: [{ tool: { driver: { name: "Other Scanner" } }, results: [] }],
    });
    expect(await run("codeql", falseCodeql)).toBe(EXIT.IMPORT_FAILED);
    expect(existsSync(path.join(outDir, "imports"))).toBe(false);
  });

  it("returns schema failure and writes nothing when producer metadata violates the companion schema", async () => {
    const inputFile = writeJson("bad-producer.sarif", {
      version: "2.1.0",
      runs: [{
        tool: { driver: { name: "x".repeat(129), version: "1" } },
        results: [{
          ruleId: "rule",
          level: "warning",
          message: { text: "finding" },
          locations: [{
            physicalLocation: {
              artifactLocation: { uri: "src/security.ts" },
              region: { startLine: 1 },
            },
          }],
        }],
      }],
    });

    expect(await run("sarif", inputFile)).toBe(EXIT.SCHEMA_FAILED);
    expect(existsSync(path.join(outDir, "imports"))).toBe(false);
  });
});

describe("import path provenance", () => {
  let root: string;
  let outside: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "ctg-import-root-"));
    outside = mkdtempSync(path.join(tmpdir(), "ctg-import-outside-"));
    mkdirSync(path.join(root, "src"), { recursive: true });
    writeFileSync(path.join(outside, "report.json"), "{}", "utf8");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it("rejects symlink escapes for evidence and redacts escaped source paths", () => {
    const link = path.join(root, "linked");
    symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");

    expect(normalizeEvidencePath("src/new.ts", root)).toBe("src/new.ts");
    expect(normalizeEvidencePath("../escape.ts", root)).toBeUndefined();
    expect(normalizeEvidencePath("\\\\server\\share\\file.ts", root)).toBeUndefined();
    expect(normalizeEvidencePath("linked/report.json", root)).toBeUndefined();

    const source = portableSourcePath(path.join(link, "report.json"), root, "sha256:" + "a".repeat(64));
    expect(source.kind).toBe("external_redacted");
    expect(source.path).toMatch(/^external\/[0-9a-f]{16}-report\.json$/);
  });
});
